"""
ThinkAI Voice Agent - LiveKit Agents Server
Powered by LiveKit + Google Gemini Multimodal Live API (gemini-3.1-flash-live-preview)
"""

import asyncio
import json
import os
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
    APIConnectOptions,
    cli,
)
from livekit.plugins import noise_cancellation, silero
from livekit.plugins.google import realtime
from classifier import classify_interaction

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

    # ── Load agent settings (voice, greeting, etc.) ─────────────────────────
    settings = load_agent_settings()

    # ── Greeting: inject into system instructions so the model speaks first ──
    # generate_reply() is not supported on gemini-3.1 models, so we tell the
    # model to greet the caller as its first action via the system prompt.
    if campaign_data and campaign_data.get("script"):
        call_type = campaign_data.get("type", "campaign_call")
        client_name = campaign_data.get("client_name", "")
        practice = db.get_business_info().get("practice_name", "a rendelő")
        if call_type == "outbound_script_call":
            greeting_text = f"Szia {client_name}! Itt a {practice} virtuális asszisztense. Van egy pillanatod?" if client_name else f"Szia! Itt a {practice} virtuális asszisztense. Van egy pillanatod?"
        else:
            greeting_text = f"Szia {client_name}! Itt a {practice} virtuális asszisztense. Van egy pillanatod? Szeretnék mesélni egy aktuális ajánlatunkról." if client_name else f"Szia! Itt a {practice} virtuális asszisztense. Van egy pillanatod? Szeretnék mesélni egy aktuális ajánlatunkról."
    else:
        greeting_text = settings.get("greeting", "Szia! Miben segíthetek?")

    system_instruction += f"\n\nFONTOS: Amikor a beszélgetés elindul, AZONNAL köszöntsd az ügyfelet a következő üdvözléssel (ne várj, amíg megszólal): \"{greeting_text}\""

    # ── Connection options for resilient API calls ────────────────────────
    conn_options = APIConnectOptions(max_retry=3, timeout=10.0)

    # ── Gemini Multimodal Live API ──
    # Voice selection: read from admin settings (Puck / Kore / Charon)
    VALID_VOICES = {"Puck", "Kore", "Charon", "Fenrir", "Aoede", "Leda", "Orus", "Zephyr"}
    selected_voice = settings.get("voice_id", "Puck")
    if selected_voice not in VALID_VOICES:
        logger.warning(f"Invalid voice_id '{selected_voice}' in settings, falling back to Puck")
        selected_voice = "Puck"
    logger.info(f"Initializing Gemini Multimodal Live API pipeline (voice={selected_voice})...")
    
    gemini_api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY or GOOGLE_API_KEY must be set in .env")
    from google.genai import types as genai_types

    live_model = realtime.RealtimeModel(
        model="gemini-3.1-flash-live-preview",
        api_key=gemini_api_key,
        voice=selected_voice,
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

        transcript_list = []

        @session.on("user_input_transcribed")
        def _on_user_transcript(event):
            try:
                transcript = getattr(event, "transcript", "")
                is_final = getattr(event, "is_final", True)
                if is_final and transcript.strip():
                    text = transcript.strip()
                    if text and text != ".":
                        entry = f"Felhasználó: {text}"
                        # Check last 3 entries to de-duplicate
                        if not any(text in item for item in transcript_list[-3:]):
                            transcript_list.append(entry)
                            logger.info(f"🎤 User (STT): {text}")
            except Exception as e:
                logger.warning(f"Error in user_input_transcribed: {e}")

        @session.on("conversation_item_added")
        def _on_item_added(event):
            try:
                # event is ConversationItemAddedEvent, message details inside event.item
                item = getattr(event, "item", None)
                if not item:
                    item = event  # fallback if it's the raw item
                
                role = getattr(item, "role", "")
                # Extract text content safely
                text = ""
                if hasattr(item, "text_content") and item.text_content:
                    text = item.text_content
                elif hasattr(item, "content") and item.content:
                    if isinstance(item.content, str):
                        text = item.content
                    elif isinstance(item.content, list):
                        parts = []
                        for p in item.content:
                            if isinstance(p, str):
                                parts.append(p)
                            elif hasattr(p, "text") and p.text:
                                parts.append(p.text)
                            elif isinstance(p, dict) and p.get("text"):
                                parts.append(p["text"])
                        text = " ".join(parts)
                
                text = text.strip()
                if text and text != ".":
                    role_name = "Felhasználó" if role == "user" else "AI Válasz"
                    entry = f"{role_name}: {text}"
                    # Check last 3 entries to de-duplicate
                    if not any(text in x for x in transcript_list[-3:]):
                        transcript_list.append(entry)
                        logger.info(f"💬 Chat item: {role_name}: {text}")
            except Exception as ex:
                logger.warning(f"Error in conversation_item_added event handler: {ex}")

        @session.on("agent_speech_committed")
        @session.on("agent_speech_interrupted")
        def _on_agent_speech(msg):
            try:
                content = getattr(msg, "content", "")
                if content and isinstance(content, str):
                    text = content.strip()
                    if text and text != ".":
                        entry = f"AI Válasz: {text}"
                        # Check last 3 entries to de-duplicate
                        if not any(text in item for item in transcript_list[-3:]):
                            transcript_list.append(entry)
                            logger.info(f"🤖 Agent (Speech): {text}")
            except Exception as e:
                logger.warning(f"Error in agent speech event: {e}")

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
                                # sync_transcription is configured on the model level
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
        
        # ── Start Session Classification (Async Background Task) ──
        async def _run_classification():
            try:
                # 1. Build full transcript from session chat history (tries internal context first, then events)
                final_turns = []
                chat_context = None
                llm_node = getattr(session, "_llm", None)
                if llm_node:
                    if hasattr(llm_node, "chat_ctx"):
                        chat_context = llm_node.chat_ctx
                    elif hasattr(llm_node, "_chat_ctx"):
                        chat_context = llm_node._chat_ctx
                
                if chat_context:
                    try:
                        msgs = chat_context.messages() if callable(getattr(chat_context, "messages", None)) else getattr(chat_context, "messages", [])
                        for msg in msgs:
                            if msg.role in ("user", "assistant"):
                                role = "Felhasználó" if msg.role == "user" else "AI Válasz"
                                text = ""
                                if isinstance(msg.content, str):
                                    text = msg.content
                                elif isinstance(msg.content, list):
                                    parts = []
                                    for p in msg.content:
                                        if isinstance(p, str):
                                            parts.append(p)
                                        elif hasattr(p, "text") and p.text:
                                            parts.append(p.text)
                                        elif isinstance(p, dict) and p.get("text"):
                                            parts.append(p["text"])
                                    text = " ".join(parts)
                                text = text.strip()
                                if text and text != ".":
                                    final_turns.append(f"{role}: {text}")
                    except Exception as ex:
                        logger.warning(f"Failed to read from Gemini internal chat context: {ex}")
                
                # Fallback to event-populated transcript_list if internal context was empty
                if not final_turns:
                    logger.info("Gemini internal context transcript was empty, falling back to event-based transcript_list")
                    final_turns = transcript_list
                else:
                    logger.info("Successfully loaded transcript from Gemini internal context")
                    
                # Format each turn with a timestamp block so the frontend parser can split them into bubbles
                now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
                formatted_turns = []
                for turn in final_turns:
                    formatted_turns.append(f"[{now_str}]\n{turn}")
                
                transcript = "\n\n".join(formatted_turns)
                logger.info(f"Final transcript built ({len(final_turns)} turns) for session {session_id}")
                
                # Get interactions to build fallback transcript if needed
                res = db.supabase.table("interactions").select("topic, tool_name").eq("session_id", session_id).execute()
                full_text = " ".join([r.get("topic") or "" for r in res.data])
                tools = [r.get("tool_name") for r in res.data if r.get("tool_name")]
                
                classification_text = transcript if transcript.strip() else full_text
                
                classification = {}
                summary_text = "Néma/rövid hívás, nem történt érdemi beszélgetés."
                
                if classification_text.strip():
                    classification = await classify_interaction(
                        message_text=classification_text,
                        channel="telefon",
                        tool_calls=tools
                    )
                    summary_text = classification.get("osszefoglalas") or "AI telefonos beszélgetés"
                    
                # 2. Extract phone number from participants or room name to associate with client details
                phone_number = ""
                # Check remote participants first (SIP caller identity is usually the phone number or phone-...)
                if hasattr(ctx, "room") and ctx.room and hasattr(ctx.room, "remote_participants"):
                    for p in list(ctx.room.remote_participants.values()):
                        identity = p.identity or ""
                        # Clean prefix mapping
                        clean_id = identity.replace("phone-", "").replace("user-", "").replace("sip_", "").strip()
                        # If it starts with + or is a long numeric, it's our caller's phone number
                        if clean_id.startswith("+") or (clean_id.isdigit() and len(clean_id) >= 9):
                            phone_number = clean_id
                            break
                            
                # Fallback to room name if participants check yielded nothing
                if not phone_number:
                    parts = room_name.split("-")
                    if parts:
                        last_part = parts[-1]
                        if last_part.isdigit() and len(last_part) >= 9:
                            phone_number = last_part
                        
                # 3. Log a MAIN interaction with the transcript in the result field
                client_id = None
                if phone_number:
                    try:
                        # Save to client details (appends transcript to their history log in custom_data)
                        client_id = db.upsert_client_by_contact(
                            custom_data={
                                "phone": phone_number,
                                "problem_description": summary_text
                            },
                            additional_log=transcript if transcript.strip() else "Hívás történt.",
                            status="aktiv"
                        )
                    except Exception as ce:
                        logger.error(f"Failed to upsert client by contact: {ce}")
                        
                db.log_interaction(
                    type="telefon",
                    topic=f"Telefonhívás leirata - {room_name}",
                    summary=summary_text,
                    result=transcript if transcript.strip() else "Nincs rögzített hanganyag.",
                    session_id=session_id,
                    funnel_stage="relevant",
                    direction="outbound" if is_outbound_call else "inbound",
                    approval_status="approved", # calls don't need approval
                    classification=classification,
                    client_id=client_id
                )
                
                # Update all tool call interactions of this session with the classification
                if classification:
                    db.supabase.table("interactions").update({"classification": classification}).eq("session_id", session_id).neq("topic", f"Telefonhívás leirata - {room_name}").execute()
                logger.info(f"✅ Voice session {session_id} classified and transcript logged.")
            except Exception as e:
                logger.error(f"Failed to classify voice session {session_id}: {e}")

        asyncio.create_task(_run_classification())
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
