"""
ThinkAI Voice Agent - LiveKit Agents Server
Powered by LiveKit + Google Gemini Multimodal Live API (gemini-3.1-flash-live-preview)
"""

import asyncio
import json
import os
import sys
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
    APIConnectOptions,
    cli,
)
from livekit.plugins import noise_cancellation, silero
from livekit.plugins.google import realtime

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


# ═══════════════════════════════════════════════════════════════════════════════
# AGENT CLASS
# ═══════════════════════════════════════════════════════════════════════════════

class ThinkAIAgent(Agent):
    def __init__(self, room_name: str = "", campaign_data: dict = None, instructions: str = ""):
        super().__init__(
            instructions=instructions,
            tools=ALL_TOOLS,
        )
        self.room_name = room_name
        self.campaign_data = campaign_data




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
        if p.identity.startswith(("phone-", "user-", "sip_")):
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

    campaign_data = None
    if is_outbound_call:
        raw_metadata = ctx.room.metadata or ""
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

    # Determine instructions / system prompt
    if campaign_data and campaign_data.get("script"):
        call_type = campaign_data.get("type", "campaign_call")
        client_name = campaign_data.get("client_name", "")
        campaign_name = campaign_data.get("campaign_name", "")
        script = campaign_data["script"]
        
        if call_type == "outbound_script_call":
            call_note = campaign_data.get("call_note", "")
            system_instruction = f"""Te egy kimenő telefonhívás AI asszisztense vagy.
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
            system_instruction = f"""Te egy kimenő telefonos kampány AI asszisztense vagy.
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
    else:
        system_instruction = get_system_prompt()

    # ── Language bias: default Hungarian, auto-switch if caller uses another language ──
    language_hint = (
        "Alapértelmezetten magyarul beszélj. "
        "Ha az ügyfél más nyelven szólal meg (pl. angolul), válts az ő nyelvére."
    )
    system_instruction = language_hint + "\n\n" + system_instruction

    # ── Greeting: inject into system instructions so the model speaks first ──
    # generate_reply() is not supported on gemini-3.1 models, so we tell the
    # model to greet the caller as its first action via the system prompt.
    if campaign_data and campaign_data.get("script"):
        call_type = campaign_data.get("type", "campaign_call")
        client_name = campaign_data.get("client_name", "")
        if call_type == "outbound_script_call":
            greeting_text = f"Szia {client_name}! Itt a rendelő virtuális asszisztense. Van egy pillanatod?" if client_name else "Szia! Itt a rendelő virtuális asszisztense. Van egy pillanatod?"
        else:
            greeting_text = f"Szia {client_name}! Itt a rendelő virtuális asszisztense. Van egy pillanatod? Szeretnék mesélni egy aktuális ajánlatunkról." if client_name else "Szia! Itt a rendelő virtuális asszisztense. Van egy pillanatod? Szeretnék mesélni egy aktuális ajánlatunkról."
    else:
        settings = load_agent_settings()
        greeting_text = settings.get("greeting", "Szia! Miben segíthetek?")

    system_instruction += f"\n\nFONTOS: Amikor a beszélgetés elindul, AZONNAL köszöntsd az ügyfelet a következő üdvözléssel (ne várj, amíg megszólal): \"{greeting_text}\""

    # ── Connection options for resilient API calls ────────────────────────
    conn_options = APIConnectOptions(max_retry=3, timeout=10.0)

    # ── Gemini Multimodal Live API ──
    logger.info("Initializing Gemini Multimodal Live API pipeline...")
    
    gemini_api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY or GOOGLE_API_KEY must be set in .env")
    from google.genai import types as genai_types

    live_model = realtime.RealtimeModel(
        model="gemini-3.1-flash-live-preview",
        api_key=gemini_api_key,
        voice="Puck",
        language="hu",
        temperature=0.8,
        instructions=system_instruction,
        input_audio_transcription=genai_types.AudioTranscriptionConfig(),
        output_audio_transcription=genai_types.AudioTranscriptionConfig(),
        conn_options=conn_options,
    )

    session = AgentSession(
        llm=live_model,
        vad=silero.VAD.load(
            activation_threshold=0.6,
            min_speech_duration=0.25,
            min_silence_duration=0.3,
        ),
        min_endpointing_delay=0.3,
        max_endpointing_delay=3.0,
        min_interruption_duration=0.5,
        min_interruption_words=1,
        max_tool_steps=5,
        user_away_timeout=20.0,
        preemptive_generation=True,
    )

    logger.info(
        "Session configured (Gemini Live API): model=gemini-3.1-flash-live-preview, "
        "voice=Puck, VAD threshold=0.6, preemptive=True"
    )

    # ── Wait for actual room disconnect before closing session ───────────────
    room_disconnected = asyncio.Event()

    @ctx.room.on("disconnected")
    def _on_room_disconnected(*args, **kwargs):
        room_disconnected.set()

    try:
        nc_option = noise_cancellation.BVC()
        if is_inbound_call:
            nc_option = None
        elif is_outbound_call:
            nc_option = noise_cancellation.BVCTelephony()

        room_input_opts = RoomInputOptions(noise_cancellation=nc_option) if nc_option else None

        await session.start(
            agent=ThinkAIAgent(room_name=ctx.room.name, campaign_data=campaign_data, instructions=system_instruction),
            room=ctx.room,
            room_input_options=room_input_opts,
        )

        # Trigger the greeting by sending a user turn directly to the Gemini
        # realtime session. generate_reply() is blocked for 3.1 models, but
        # the underlying mechanism still works — we replicate it here.
        async def _trigger_greeting():
            await asyncio.sleep(1.5)  # wait for the realtime WS to connect
            try:
                from google.genai import types as _gt
                # Access the underlying realtime session through the AgentSession
                llm_node = session._llm
                if hasattr(llm_node, '_sessions'):
                    for rt_session in llm_node._sessions:
                        rt_session._send_client_event(
                            _gt.LiveClientContent(
                                turns=[_gt.Content(parts=[_gt.Part(text=".")], role="user")],
                                turn_complete=True,
                            )
                        )
                        logger.info("Greeting trigger sent to Gemini realtime session")
                        break
            except Exception as e:
                logger.warning(f"Could not trigger greeting: {e}")

        asyncio.create_task(_trigger_greeting())

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
