"""
ThinkAI Voice Agent - LiveKit Agents Server
Real-time voice assistant powered by LiveKit + ElevenLabs Scribe v2 STT + Gemini 2.5 Flash + Cartesia TTS
Hungarian-only with ThinkAI brand pronunciation handling
"""

import asyncio
import inspect
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from loguru import logger

# ── Load env ──────────────────────────────────────────────────────────────────
THIS_DIR = Path(__file__).resolve().parent
load_dotenv(THIS_DIR / ".env")

from prompt_utils import load_agent_settings, get_system_prompt


# ── LiveKit Agents ────────────────────────────────────────────────────────────
from livekit.agents import (
    Agent,
    AgentSession,
    JobContext,
    RoomInputOptions,
    WorkerOptions,
    cli,
)
from livekit.agents.voice.agent_session import SessionConnectOptions
from livekit.agents.types import DEFAULT_API_CONNECT_OPTIONS, APIConnectOptions

from livekit.plugins import cartesia, elevenlabs, google, noise_cancellation, silero, soniox

# ── Import tools ──────────────────────────────────────────────────────────────
sys.path.insert(0, str(THIS_DIR))
from tools import ALL_TOOLS, set_session_id
import database as db

# ── Google credentials setup (still needed for Gemini LLM) ───────────────────
def _setup_google_credentials():
    """Write Google credentials from env var if present (for Railway/cloud)."""
    creds_json = os.getenv("GOOGLE_APPLICATION_CREDENTIALS_JSON")
    creds_path = Path("/tmp/google-credentials.json")
    if creds_json and not creds_path.exists():
        creds_path.write_text(creds_json)
    if creds_path.exists():
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(creds_path)

_setup_google_credentials()


# SYSTEM PROMPT logic moved to prompt_utils.py



# ── TTS pronunciation replacements (applied before Cartesia gets the text) ────
# Keys are case-sensitive. The LLM writes natural text; this map ensures
# Cartesia pronounces foreign/brand words correctly in Hungarian.
_TTS_REPLACEMENTS = {
    # Brand names
    "ThinkAI": "Tink-éj-áj",
    "thinkAI": "tink-éj-áj",
    "Thinkai": "Tink-éj-áj",
    "thinkai": "tink-éj-áj",
    "EAISY": "Ízí",
    "Eaisy": "Ízí",
    "eaisy": "ízí",
    # Domains & emails
    "thinkai.hu": "tink-éj-áj pont há ú",
    "hello@thinkai.hu": "helló kukac tink-éj-áj pont há ú",
    # Tech terms the Hungarian TTS mangles
    "AI": "éj-áj",
    "CRM": "szé-er-em",
    "ERP": "é-er-pé",
    # Email providers
    "Gmail": "dzsé-mél",
    "gmail": "dzsé-mél",
    "GMAIL": "dzsé-mél",
    "gmail.com": "dzsé-mél pont kom",
}


# ── Hungarian phonetic spelling for emails and phone numbers ──────────────────
_HU_LETTER_NAMES = {
    'a': 'á', 'á': 'á', 'b': 'bé', 'c': 'cé', 'd': 'dé',
    'e': 'e', 'é': 'é', 'f': 'ef', 'g': 'gé', 'h': 'há',
    'i': 'í', 'í': 'í', 'j': 'jé', 'k': 'ká', 'l': 'el',
    'm': 'em', 'n': 'en', 'o': 'ó', 'ó': 'ó', 'ö': 'ö',
    'ő': 'ő', 'p': 'pé', 'q': 'kú', 'r': 'er', 's': 'es',
    't': 'té', 'u': 'ú', 'ú': 'ú', 'ü': 'ü', 'ű': 'ű',
    'v': 'vé', 'w': 'dupla-vé', 'x': 'iksz', 'y': 'ipszilon',
    'z': 'zé',
    '0': 'nulla', '1': 'egy', '2': 'kettő', '3': 'három',
    '4': 'négy', '5': 'öt', '6': 'hat', '7': 'hét',
    '8': 'nyolc', '9': 'kilenc',
    '@': 'kukac', '.': 'pont', '-': 'kötőjel', '_': 'aláhúzás',
    '+': 'plusz',
}

_KNOWN_DOMAINS = {
    'gmail.com': 'dzsé-mél pont kom',
    'thinkai.hu': 'tink-éj-áj pont há ú',
    'outlook.com': 'autluk pont kom',
    'hotmail.com': 'hotmél pont kom',
    'yahoo.com': 'jahú pont kom',
    'freemail.hu': 'frímél pont há ú',
    'citromail.hu': 'citromél pont há ú',
}

_EMAIL_PATTERN = re.compile(r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}')
_PHONE_PATTERN = re.compile(r'(?:\+36|06)[\s\-]?\d{1,2}[\s\-]?\d{3}[\s\-]?\d{3,4}')


def _spell_hungarian(text: str) -> str:
    """Convert a string to Hungarian letter-by-letter pronunciation."""
    parts = []
    for c in text:
        name = _HU_LETTER_NAMES.get(c.lower())
        if name:
            parts.append(name)
        else:
            parts.append(c)
    return ', '.join(parts)


def _email_to_hungarian_phonetic(email: str) -> str:
    """Convert an email address to natural Hungarian pronunciation for TTS."""
    local_part, domain = email.split('@', 1)
    domain_lower = domain.lower()
    if domain_lower in _KNOWN_DOMAINS:
        spoken_domain = _KNOWN_DOMAINS[domain_lower]
    else:
        spoken_domain = domain.replace('.', ' pont ')
    return f"{local_part} kukac {spoken_domain}"


def _phone_to_hungarian(phone: str) -> str:
    """Convert a phone number to Hungarian digit-by-digit pronunciation."""
    parts = []
    for c in phone:
        if c.isdigit():
            parts.append(_HU_LETTER_NAMES.get(c, c))
        elif c == '+':
            parts.append('plusz')
    return ', '.join(parts)


def _apply_tts_replacements(text: str) -> str:
    """Replace brand/tech terms, spell emails and phones with Hungarian phonetics for TTS."""
    text = _EMAIL_PATTERN.sub(
        lambda m: _email_to_hungarian_phonetic(m.group(0)), text
    )
    text = _PHONE_PATTERN.sub(
        lambda m: _phone_to_hungarian(m.group(0)), text
    )
    for original, phonetic in _TTS_REPLACEMENTS.items():
        text = text.replace(original, phonetic)
    return text


# ── Phantom transcript filter ────────────────────────────────────────────────
# ElevenLabs Scribe v2 sometimes transcribes noise/breathing as gibberish.
# This regex catches consonant-only strings that are clearly not Hungarian words.
# NOTE: "Ja", "Na", "Hm" are valid Hungarian — we only filter consonant-only noise.
_NOISE_PATTERN = re.compile(r'^[bcdfghjklmnpqrstvwxyz]{2,}$', re.IGNORECASE)
_KNOWN_NOISE = {"ksznm", "kszn", "hm", "hmm", "mhm"}

def _is_phantom_transcript(text: str) -> bool:
    """Return True if the transcript looks like noise, not real speech."""
    cleaned = text.strip().lower()
    if not cleaned:
        return True
    if cleaned in _KNOWN_NOISE:
        return True
    if _NOISE_PATTERN.match(cleaned):
        return True
    return False


# ── STT post-processing corrections ──────────────────────────────────────────
# Soniox/ElevenLabs sometimes garbles Hungarian words, especially brand names
# and digraphs (cs, sz, gy, ny, zs, ly) at word boundaries. This map corrects
# known misrecognitions before the text reaches the LLM.
_STT_CORRECTIONS = {
    "tinkéjáj": "ThinkAI",
    "tink éj áj": "ThinkAI",
    "think áj": "ThinkAI",
    "tinkáj": "ThinkAI",
}

# Known email domains — when STT converts "kukac" to ".", we detect
# patterns like "word.gmail.com" and fix to "word@gmail.com"
_KNOWN_EMAIL_DOMAINS = [
    "gmail.com", "yahoo.com", "outlook.com", "hotmail.com",
    "freemail.hu", "citromail.hu", "thinkai.hu",
    "gmail.hu", "protonmail.com", "icloud.com", "live.com",
]

def _fix_email_at_sign(text: str) -> str:
    """Fix STT converting 'kukac' (@) to dot in email addresses."""
    for domain in _KNOWN_EMAIL_DOMAINS:
        pattern = re.compile(
            r'(\b\w+)\.' + re.escape(domain) + r'\b',
            re.IGNORECASE
        )
        text = pattern.sub(r'\1@' + domain, text)
    text = re.sub(r'\s+kukac\s+', '@', text, flags=re.IGNORECASE)
    return text

def _apply_stt_corrections(text: str) -> str:
    """Fix known STT misrecognitions in user transcripts."""
    text = _fix_email_at_sign(text)
    for wrong, correct in _STT_CORRECTIONS.items():
        text = re.sub(r'\b' + re.escape(wrong) + r'\b', correct, text, flags=re.IGNORECASE)
    return text


# ── Gemini thinking-token filter ──────────────────────────────────────────────
# Gemini 2.5 Flash can leak internal chain-of-thought reasoning as regular text.
# These must be stripped before reaching TTS or the user hears "thinking out loud".
_THINKING_PATTERNS = [
    re.compile(r'(?i)^\s*silently[,.]?\s'),
    re.compile(r"(?i)^\s*I'm thinking\b"),
    re.compile(r'(?i)^\s*I need to\b'),
    re.compile(r'(?i)^\s*Therefore,? my response\b'),
    re.compile(r'(?i)^\s*My response will be\b'),
    re.compile(r'(?i)^\s*Let me think\b'),
    re.compile(r'(?i)^\s*I should\b'),
    re.compile(r'(?i)^\s*The user\b'),
    re.compile(r"(?i)^\s*I\'ll\b"),
]

def _is_thinking_token(text: str) -> bool:
    """Return True if text looks like leaked Gemini reasoning."""
    for pat in _THINKING_PATTERNS:
        if pat.search(text):
            return True
    return False


# ═══════════════════════════════════════════════════════════════════════════════
# AGENT CLASS
# ═══════════════════════════════════════════════════════════════════════════════

class ThinkAIAgent(Agent):
    def __init__(self, room_name: str = "", campaign_data: dict = None):
        # Campaign calls and scripted outbound calls get a specialized system prompt
        if campaign_data and campaign_data.get("script"):
            call_type = campaign_data.get("type", "campaign_call")
            client_name = campaign_data.get("client_name", "")
            campaign_name = campaign_data.get("campaign_name", "")
            script = campaign_data["script"]
            
            if call_type == "outbound_script_call":
                # Sima kimenő hívás egyedi scripttel (nem kampány)
                call_note = campaign_data.get("call_note", "")
                campaign_instructions = f"""Te egy kimenő telefonhívás AI asszisztense vagy.
{f"Megjegyzés: {call_note}" if call_note else ""}
Az ügyfél neve: {client_name if client_name else "Ismeretlen"}

A FELADATOD:
Telefonon hívtad fel az ügyfelet. A következő üzenetet/információt kell elmondanod:

---
{script}
---

SZABÁLYOK:
- Köszönj és mutatkozz be röviden (a rendelő/cég asszisztense vagy)
- Mondd el az üzenetet természetesen, beszélgetős stílusban — NE olvasd fel szó szerint!
- Ha ismered az ügyfél nevét, használd ({client_name})
- Ha az ügyfél kérdez, válaszolj a hívás kontextusában
- Ha az ügyfél nem érdeklődik, köszönd meg az idejét és búcsúzz el udvariasan
- Legyél kedves, természetes és rövid (max 2-3 mondat egyszerre)
- Magyarul beszélj"""
            else:
                # Kampány hívás (eredeti logika)
                campaign_instructions = f"""Te egy kimenő telefonos kampány AI asszisztense vagy.
Kampány neve: {campaign_name}
Az ügyfél neve: {client_name}

A FELADATOD:
Telefonon hívtad fel az ügyfelet egy kampány keretében. A következő üzenetet/ajánlatot kell elmondanod:

---
{script}
---

SZABÁLYOK:
- Köszönj és mutatkozz be röviden (a cég asszisztense vagy)
- Mondd el az ajánlatot/üzenetet természetesen, beszélgetős stílusban — NE olvasd fel szó szerint!
- Személyre szabd: használd az ügyfél nevét ({client_name})
- Ha az ügyfél kérdez, válaszolj a kampány kontextusában
- Ha az ügyfél nem érdeklődik, köszönd meg az idejét és búcsúzz el udvariasan
- Legyél kedves, természetes és rövid (max 2-3 mondat egyszerre)
- Magyarul beszélj"""

            super().__init__(
                instructions=campaign_instructions,
                tools=ALL_TOOLS,
            )
        else:
            super().__init__(
                instructions=get_system_prompt(),
                tools=ALL_TOOLS,
            )
        self.room_name = room_name
        self.campaign_data = campaign_data

    async def on_enter(self):
        """Greet the caller — scripted calls get the script intro, others get normal greeting."""
        if self.campaign_data and self.campaign_data.get("script"):
            call_type = self.campaign_data.get("type", "campaign_call")
            client_name = self.campaign_data.get("client_name", "")
            
            if call_type == "outbound_script_call":
                # Sima kimenő hívás — egyszerűbb bemutatkozás
                if client_name:
                    self.session.say(f"Szia {client_name}! Itt a rendelő virtuális asszisztense. Van egy pillanatod?")
                else:
                    self.session.say("Szia! Itt a rendelő virtuális asszisztense. Van egy pillanatod?")
            else:
                # Kampány hívás — kampány specifikus bemutatkozás
                if client_name:
                    self.session.say(f"Szia {client_name}! Itt a rendelő virtuális asszisztense. Van egy pillanatod? Szeretnék mesélni egy aktuális ajánlatunkról.")
                else:
                    self.session.say("Szia! Itt a rendelő virtuális asszisztense. Van egy pillanatod? Szeretnék mesélni egy aktuális ajánlatunkról.")
        else:
            settings = load_agent_settings()
            greeting = settings.get("greeting", "")
            if greeting.strip():
                self.session.say(greeting)

    async def stt_node(self, audio, model_settings):
        """Override STT node: filter phantom transcripts from noise."""
        async for event in Agent.default.stt_node(self, audio, model_settings):
            # Filter out noise transcripts before they reach the LLM
            if hasattr(event, 'alternatives') and event.alternatives:
                text = event.alternatives[0].text
                if text and _is_phantom_transcript(text):
                    logger.warning(f"Filtered phantom transcript: '{text}'")
                    continue
            yield event

    async def on_user_turn_completed(self, turn_ctx, new_message):
        """Apply STT corrections to user message before it reaches the LLM."""
        text = new_message.text_content if isinstance(new_message.text_content, str) else str(new_message.content)
        if text:
            corrected = _apply_stt_corrections(text)
            if corrected != text:
                logger.info(f"STT correction: '{text}' → '{corrected}'")
                new_message.content = corrected

    async def llm_node(self, chat_ctx, tools, model_settings):
        """Override LLM node: context window + error fallback."""
        chat_ctx.truncate(max_items=20)

        try:
            stream = Agent.default.llm_node(self, chat_ctx, tools, model_settings)
            if inspect.isawaitable(stream):
                stream = await stream
            return stream
        except Exception as e:
            logger.error(f"LLM error: {e}")
            return "Hoppá, most egy pillanatra elakadtam. Kérlek, próbáld újra!"

    async def toolcall_node(self, tool_call, chat_ctx, model_settings):
        """Override toolcall node: catch unhandled exceptions so the agent never goes silent."""
        try:
            result = Agent.default.toolcall_node(self, tool_call, chat_ctx, model_settings)
            if inspect.isawaitable(result):
                result = await result
            return result
        except Exception as e:
            logger.error(f"Tool call error ({tool_call.function.name}): {e}")
            return f"Sajnos hiba történt a művelet során: {str(e)}. Kérlek, próbáld újra!"

    async def tts_node(self, text, model_settings):
        """Override TTS node: filter thinking tokens + apply brand pronunciation."""
        _buffer = ""
        _suppressing = False

        async def _cleaned_text():
            nonlocal _buffer, _suppressing
            async for chunk in text:
                if not chunk:
                    continue

                # Buffer the first ~80 chars to detect thinking patterns
                if len(_buffer) < 80:
                    _buffer += chunk
                    if len(_buffer) >= 80 or any(c in _buffer for c in '.!?\n'):
                        if _is_thinking_token(_buffer):
                            logger.warning(f"Filtered thinking token: '{_buffer[:60]}...'")
                            _suppressing = True
                            _buffer = ""
                            continue
                        else:
                            out = _apply_tts_replacements(_buffer)
                            _buffer = ""
                            yield out
                    continue

                if _suppressing:
                    # Keep suppressing until we hit what looks like actual speech
                    if chunk.strip().startswith('"') or (len(chunk.strip()) > 2 and chunk.strip()[0].isupper() and not _is_thinking_token(chunk)):
                        _suppressing = False
                        yield _apply_tts_replacements(chunk)
                    continue

                chunk = _apply_tts_replacements(chunk)
                yield chunk

            # Flush remaining buffer if not suppressed
            if _buffer and not _suppressing:
                yield _apply_tts_replacements(_buffer)

        async for frame in Agent.default.tts_node(self, _cleaned_text(), model_settings):
            yield frame


# ═══════════════════════════════════════════════════════════════════════════════
# ENTRYPOINT
# ═══════════════════════════════════════════════════════════════════════════════

async def entrypoint(ctx: JobContext):
    """LiveKit agent entrypoint — called when a user joins a room."""
    room_name = ctx.room.name
    session_id = room_name  # use room name as unique session ID
    logger.info(f"Agent connecting to room: {room_name}")

    await ctx.connect()

    # ── Kick phantom agents: remove any unexpected participants already in the room ─
    phantoms_removed = False
    my_identity = ctx.agent.identity if hasattr(ctx, 'agent') and ctx.agent else None
    for p in list(ctx.room.remote_participants.values()):
        # Keep phone callers and regular users, kick everything else (other agents)
        if p.identity.startswith("phone-") or p.identity.startswith("user-"):
            continue
        if my_identity and p.identity == my_identity:
            continue
        logger.warning(f"Removing phantom participant {p.identity} from room {room_name}")
        try:
            from livekit import api as lk_api
            admin = lk_api.LiveKitAPI()
            await admin.room.remove_participant(
                lk_api.RoomParticipantIdentity(room=room_name, identity=p.identity)
            )
            await admin.aclose()
            logger.info(f"Phantom participant {p.identity} removed.")
            phantoms_removed = True
        except Exception as e:
            logger.error(f"Failed to remove phantom participant: {e}")

    if phantoms_removed:
        await asyncio.sleep(1.5)  # Let room settle after phantom removal


    # Initialize DB + log session start
    db.init_db()
    db.create_session(session_id=session_id, room_name=room_name)
    set_session_id(session_id)

    # Log call type + detect campaign calls
    is_outbound_call = room_name.startswith("call-out-")
    is_campaign_call = room_name.startswith("call-out-camp-")
    is_inbound_call = room_name.startswith("call-") and not is_outbound_call

    # Parse script/campaign data from room metadata OR dispatch metadata
    # This covers both campaign calls (call-out-camp-) and scripted outbound calls (call-out-)
    campaign_data = None
    if is_outbound_call:
        # 1. Try room metadata first
        raw_metadata = ctx.room.metadata or ""
        
        # 2. Fallback: try dispatch metadata (agent_dispatch passes metadata separately)
        if not raw_metadata:
            try:
                if hasattr(ctx, 'agent') and ctx.agent and hasattr(ctx.agent, 'dispatch'):
                    dispatch = ctx.agent.dispatch
                    if dispatch and hasattr(dispatch, 'metadata') and dispatch.metadata:
                        raw_metadata = dispatch.metadata
                        logger.info(f"Using dispatch metadata (room metadata was empty)")
            except Exception as e:
                logger.warning(f"Failed to read dispatch metadata: {e}")
        
        if raw_metadata:
            try:
                parsed = json.loads(raw_metadata)
                call_type = parsed.get("type", "")
                if call_type in ("campaign_call", "outbound_script_call"):
                    campaign_data = parsed
                    logger.info(f"📢 Outbound call with script detected ({call_type}): "
                                f"{campaign_data.get('campaign_name', campaign_data.get('call_note', '?'))} "
                                f"→ {campaign_data.get('client_name', '?')}")
            except (json.JSONDecodeError, Exception) as e:
                logger.warning(f"Failed to parse room/dispatch metadata: {e}")

    if is_campaign_call:
        logger.info(f" Campaign outbound SIP call — room: {room_name}")
    elif is_outbound_call:
        logger.info(f" Outbound SIP call — room: {room_name}")
    elif is_inbound_call:
        logger.info(f" Inbound SIP call — room: {room_name}")
    else:
        logger.info(f"Session started: {session_id}")

    # NOTE: ElevenLabs keyterms only work in batch mode (not realtime streaming).
    # The scribe_v2_realtime model ignores keyterms in the WebSocket streaming path.
    # Hungarian name/brand recognition relies on Scribe v2's native 3.1% WER accuracy.

    # ── Soniox STT with Hungarian context terms ──────────────────────────
    # Load brand/doctor names for STT vocabulary boosting
    _soniox_terms = ["ThinkAI"]
    try:
        _doctors = db.get_doctors() if hasattr(db, 'get_doctors') else []
        _soniox_terms.extend([d.get("name", "") for d in _doctors if d.get("name")])
    except Exception:
        pass
    try:
        import json as _json
        _pi_file = THIS_DIR / "praxisinfo.json"
        if _pi_file.exists():
            _pi = _json.loads(_pi_file.read_text(encoding="utf-8"))
            if _pi.get("practice_name"): _soniox_terms.append(_pi["practice_name"])
            if _pi.get("markanev"): _soniox_terms.append(_pi["markanev"])
    except Exception:
        pass
    _soniox_terms = [t for t in _soniox_terms if t]  # filter empty

    soniox_context = soniox.stt.ContextObject(terms=_soniox_terms)
    soniox_opts = soniox.stt.STTOptions(
        model="stt-rt-v4",
        language_hints=["hu"],
        context=soniox_context,
    )

    # ── Connection options for resilient API calls ────────────────────────
    conn_options = SessionConnectOptions(
        stt_conn_options=APIConnectOptions(max_retry=3, timeout=10),
        llm_conn_options=APIConnectOptions(max_retry=3, timeout=30),
        tts_conn_options=APIConnectOptions(max_retry=3, timeout=10),
        max_unrecoverable_errors=5,
    )

    session = AgentSession(
        stt=soniox.STT(
            api_key=os.getenv("SONIOX_API_KEY"),
            params=soniox_opts,
        ),
        llm=google.LLM(
            model="gemini-2.5-flash",
        ),
        tts=cartesia.TTS(
            api_key=os.getenv("CARTESIA_API_KEY"),
            voice=load_agent_settings().get("voice_id") or os.getenv("CARTESIA_VOICE_ID", "93896c4f-aa00-4c17-a360-fec55579d7fa"),
            model="sonic-3",
            speed=1.0,
            language="hu",
            word_timestamps=False,
            emotion=["positivity:high", "curiosity"],
        ),
        vad=silero.VAD.load(
            activation_threshold=0.85,
            min_speech_duration=0.4,
            min_silence_duration=0.5,
        ),
        # ── Production tuning (snappy endpointing) ───────────────────────
        min_endpointing_delay=0.5,
        max_endpointing_delay=3.0,
        min_interruption_duration=0.5,
        min_interruption_words=1,
        max_tool_steps=5,
        user_away_timeout=20.0,
        preemptive_generation=True,
        conn_options=conn_options,
    )

    logger.info(
        f"Session configured: STT=Soniox stt-rt-v4 (hu), "
        f"LLM=gemini-2.5-flash, TTS=cartesia sonic-3, "
        f"VAD threshold=0.85, preemptive={True}"
    )

    # ── Wait for actual room disconnect before closing session ───────────────
    # session.start() is non-blocking — it returns immediately while the session
    # continues to run. We use an Event to stay in the entrypoint until the room
    # truly disconnects, so close_session() records the correct duration.
    room_disconnected = asyncio.Event()

    @ctx.room.on("disconnected")
    def _on_room_disconnected(*args, **kwargs):
        room_disconnected.set()

    try:
        await session.start(
            agent=ThinkAIAgent(room_name=ctx.room.name, campaign_data=campaign_data),
            room=ctx.room,
            # Server-side noise cancellation — filters breathing, background noise,
            # keyboard sounds before they reach VAD (requires LiveKit Cloud)
            room_input_options=RoomInputOptions(
                noise_cancellation=noise_cancellation.BVC(),
            ),
        )
        # Block here until the room disconnects
        await room_disconnected.wait()
    finally:
        # Record session end + duration
        db.close_session(session_id)
        logger.info(f"Session closed and duration saved: {session_id}")


# ═══════════════════════════════════════════════════════════════════════════════
# WORKER
# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            agent_name="dobozos-ai",
        ),
    )
