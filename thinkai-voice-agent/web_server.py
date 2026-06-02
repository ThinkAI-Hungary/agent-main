from typing import Optional
"""
ThinkAI Voice Agent — Web Server
Serves the voice widget, generates LiveKit tokens,
and provides a JWT-protected admin API with analytics.
"""

import json
import os
import uuid
import csv
import io
from datetime import datetime, timedelta
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Depends, HTTPException, Request, status, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
import jwt as pyjwt

from livekit.api import AccessToken, VideoGrants, RoomConfiguration, RoomAgentDispatch
import livekit.api as lk_api_module
import asyncio

import database as db
import email_processor
from anthropic import AsyncAnthropic

THIS_DIR = Path(__file__).resolve().parent
load_dotenv(THIS_DIR / ".env")

# ── JWT config ────────────────────────────────────────────────────────────────
JWT_SECRET  = os.getenv("JWT_SECRET", "thinkai-admin-secret-change-me")
JWT_ALGO    = "HS256"
JWT_EXPIRES = 60 * 60 * 8  # 8 hours

# ── Init DB on startup ────────────────────────────────────────────────────────
db.init_db()
db.seed_admin_from_env()
db.migrate_from_json()   # one-time migration from legacy JSON files

app = FastAPI(title="ThinkAI Voice Agent")

background_tasks = set()

# ── Health check (Docker / monitoring) ────────────────────────────────────────
_start_time = datetime.utcnow()

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "uptime_seconds": int((datetime.utcnow() - _start_time).total_seconds())}


@app.on_event("startup")
async def startup_event():
    # Elindítjuk az email worker loopot a háttérben
    task = asyncio.create_task(email_processor.email_worker_loop())
    background_tasks.add(task)
    task.add_done_callback(background_tasks.discard)
    
    task2 = asyncio.create_task(email_processor.reminder_worker_loop())
    background_tasks.add(task2)
    task2.add_done_callback(background_tasks.discard)
    
    # Eseményvezérelt automatizációk worker
    task3 = asyncio.create_task(email_processor.automation_worker_loop())
    background_tasks.add(task3)
    task3.add_done_callback(background_tasks.discard)
    # Inbound SIP dispatch: Telnyx → LiveKit dispatch rule (SDR_KjoiKH4icXeX)
    # automatikusan kezeli, nem kell külön monitor vagy trigger.

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://thinkai.hu",
        "https://www.thinkai.hu",
        "http://localhost:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Auth helpers ──────────────────────────────────────────────────────────────
bearer_scheme = HTTPBearer(auto_error=False)


def create_jwt(username: str) -> str:
    payload = {
        "sub": username,
        "exp": datetime.utcnow() + timedelta(seconds=JWT_EXPIRES),
        "iat": datetime.utcnow(),
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def verify_jwt(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)):
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Nincs token")
    try:
        payload = pyjwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGO])
        return payload["sub"]
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token lejárt")
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Érvénytelen token")


# ═══════════════════════════════════════════════════════════════════════════════
# PUBLIC ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/")
async def index():
    return FileResponse(THIS_DIR / "voice-widget.html")

@app.get("/widget")
async def widget():
    return FileResponse(THIS_DIR / "voice-widget.html")

@app.get("/admin")
def admin_page():
    return FileResponse(THIS_DIR / "admin.html")

@app.get("/thinkai-logo.png")
async def logo():
    return FileResponse(THIS_DIR / "thinkai-logo.png", media_type="image/png")

@app.get("/login-bg.jpg")
async def bg():
    return FileResponse(THIS_DIR / "login-bg.jpg", media_type="image/jpeg")

@app.get("/api/token")
async def get_token():
    """Generate a LiveKit room token for a new user."""
    api_key    = os.getenv("LIVEKIT_API_KEY")
    api_secret = os.getenv("LIVEKIT_API_SECRET")
    if not api_key or not api_secret:
        return JSONResponse({"error": "LiveKit credentials not configured"}, status_code=500)

    room_name        = f"thinkai-{uuid.uuid4().hex[:8]}"
    participant_name = f"user-{uuid.uuid4().hex[:6]}"

    token = (
        AccessToken(api_key, api_secret)
        .with_identity(participant_name)
        .with_name("Visitor")
        .with_grants(VideoGrants(room_join=True, room=room_name))
        .with_room_config(
            RoomConfiguration(
                agents=[RoomAgentDispatch(agent_name="dobozos-ai")]
            )
        )
    )
    return JSONResponse({
        "token": token.to_jwt(),
        "url": os.getenv("LIVEKIT_URL"),
        "room": room_name,
    })


@app.post("/api/session/end")
async def session_end(request: Request):
    """Called by the widget on disconnect to record session duration."""
    try:
        body = await request.json()
        session_id = body.get("session_id", "")
        if session_id:
            db.close_session(session_id)
    except Exception:
        pass
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════════════════════
# META WEBHOOK
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/api/webhook/meta")
async def meta_webhook_verify(request: Request):
    """Meta Webhook verification challenge."""
    verify_token = os.getenv("META_VERIFY_TOKEN", "")
    mode = request.query_params.get("hub.mode")
    token = request.query_params.get("hub.verify_token")
    challenge = request.query_params.get("hub.challenge")

    if mode and token:
        if mode == "subscribe" and token == verify_token:
            print("META_WEBHOOK_VERIFIED")
            return PlainTextResponse(content=challenge)
        raise HTTPException(status_code=403, detail="Verification token mismatch")
    raise HTTPException(status_code=400, detail="Missing parameters")

async def analyze_alert_tags(message_text: str) -> list:
    """Gyors AI elemzés a bejövő üzenet címkézéséhez."""
    import os
    from google import genai
    from google.genai import types
    import json
    
    google_key = os.getenv("GOOGLE_API_KEY")
    if not google_key: return []
    
    prompt = """Elemezd a következő ügyfélüzenetet, és add vissza egy valid JSON listában az alábbi címkéket, ha relevánsak:
- "urgent": nagyon sürgős ügy
- "complaint": panasz, elégedetlenség
- "callback": telefonos visszahívást kér
- "recurring": gyakran ismétlődő probléma
Csak a címkéket tartalmazó JSON listát (pl. ["urgent", "complaint"]) add vissza, semmi mást, markdown nélkül! Ha egy sem illik, üres listát adj vissza: []."""

    try:
        client = genai.Client(api_key=google_key)
        resp = await client.aio.models.generate_content(
            model="gemini-2.5-flash",
            contents=f"Üzenet: {message_text}",
            config=types.GenerateContentConfig(system_instruction=prompt, temperature=0.1)
        )
        t = resp.text.strip()
        if t.startswith("```json"): t = t[7:-3]
        if t.startswith("```"): t = t[3:-3]
        return json.loads(t.strip())
    except Exception:
        return []

async def fetch_meta_user_profile(sender_id: str, source_channel: str) -> Optional[str]:
    """Fetch the user's name from Meta Graph API using their PSID/IGSID."""
    if source_channel not in ("Messenger", "Instagram"):
        return None
        
    # Instagram DM uses Page Access Token (Messenger platform), not IG API token
    token = os.getenv("META_PAGE_ACCESS_TOKEN")
    if not token:
        return None
    
    # Instagram IGSID supports 'name' field directly.
    # Messenger PSID only supports 'first_name', 'last_name', 'profile_pic' — NOT 'name'.
    # Requesting 'name' on a PSID causes a 400 error, breaking the entire request.
    if source_channel == "Instagram":
        fields = "name,profile_pic"
    else:
        fields = "first_name,last_name,profile_pic"
        
    url = f"https://graph.facebook.com/v25.0/{sender_id}?fields={fields}&access_token={token}"
    try:
        import httpx
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, timeout=5.0)
            if resp.status_code == 200:
                data = resp.json()
                name = data.get("name")
                if not name:
                    first = data.get("first_name", "")
                    last = data.get("last_name", "")
                    name = f"{first} {last}".strip()
                return name if name else None
            else:
                print(f"[Meta API] Error fetching profile for {sender_id} ({source_channel}): {resp.text}")
                return None
    except Exception as e:
        print(f"[Meta API] Exception fetching profile: {e}")
        return None

async def process_meta_message(sender_id: str, message_text: str, source_channel: str = "Messenger", phone_number_id: str = None):
    """Aszinkron háttérfeladat a Meta Messenger / Instagram üzenetek feldolgozására."""
    import asyncio
    import json
    from datetime import datetime, timedelta
    from google import genai
    from google.genai import types
    from prompt_utils import get_system_prompt
    import database as db
    import email_processor

    alert_tags_task = asyncio.create_task(analyze_alert_tags(message_text))

    try:
        # 1. Beolvassuk a rendszer promptot
        system_prompt = get_system_prompt()
        today = datetime.now().strftime("%Y-%m-%d (%A)")
        
        # Először is elmentjük a bejövő üzenetet a Kanbanba
        client_data = {"messenger_id": sender_id, "forras_csatorna": source_channel}
        meta_name = await fetch_meta_user_profile(sender_id, source_channel)
        if meta_name:
            client_data["name"] = meta_name
        else:
            # Fallback: keressük az adatbázisban a nevet
            print(f"[Meta API] Név feloldás sikertelen ({source_channel} {sender_id}), DB fallback...")
            existing = db.find_client_by_contact(messenger_id=sender_id)
            if existing:
                cd_fb = existing.get("custom_data")
                if isinstance(cd_fb, str):
                    try: cd_fb = json.loads(cd_fb)
                    except: cd_fb = {}
                if isinstance(cd_fb, dict):
                    db_name = cd_fb.get("nev") or cd_fb.get("name") or existing.get("name")
                    if db_name and db_name not in ("Névtelen", "-", ""):
                        meta_name = db_name
                        print(f"[Meta API] DB fallback név: {meta_name}")
            
        db.upsert_client(client_data, additional_log=f"Ügyfél ({source_channel}): {message_text}")

        # Előzmények beolvasása
        client_record = db.find_client_by_contact(messenger_id=sender_id)
        if client_record:
            try:
                cd = client_record.get("custom_data")
                if isinstance(cd, str):
                    c_data = json.loads(cd or "{}")
                elif isinstance(cd, dict):
                    c_data = cd
                else:
                    c_data = {}
                
                chat_history = c_data.get("beszelgetes_naplo", "")
                if chat_history:
                    if len(chat_history) > 3000:
                        chat_history = "... " + chat_history[-3000:]
                    system_prompt += f"\n\n--- Eddigi beszélgetés előzménye a felhasználóval ---\n{chat_history}\n----------------------------------------------------"
            except Exception as e:
                print(f"[Meta AI Process] Hiba a napló beolvasásakor: {e}")

        # Szabályok
        triage_rules = db.get_triage_rules()
        if triage_rules:
            rules_text = "\n".join([f"- Szabály ID: {r['id']}, Helyzet: {r['situation']}, Prioritás: {r['priority']}" for r in triage_rules])
            system_prompt += f"\n\n--- TRIÁZS SZABÁLYOK ---\nKérlek értékeld a páciens problémáját az alábbi szabályok alapján is. Ha egyezik egy 'Sürgős' prioritású szabállyal, KÖTELEZŐ felvenned az 'urgent' tag-et az alert_tags listába. Ha 'Kiemelt', akkor a 'kiemelt' tag-et!\n{rules_text}\n----------------------------------------------------"

        # (A telephelyeket a prompt_utils.py már beletette a system_prompt-ba!)

        # JSON UTASÍTÁS
        json_instruction = f"""
FONTOS INSTRUKCIÓ: A mai dátum: {today}. Minden dátumot ehhez a dátumhoz viszonyíts!
TE FELADATOD:
Értékeld a beérkezett üzenetet és a beszélgetés előzményeit. Formázz röviden, mint egy Messenger üzenetet. Válaszolj közvetlenül az ügyfélnek.
A kimeneted KIZÁRÓLAG egyetlen valid JSON objektum legyen, minden további markdown formázás (pl. ```json) NÉLKÜL.

JSON STRUKTÚRA:
{{
    "reply_text": "A válaszüzenet szövege. Ez fog kimenni a Messengerre.",
    "kanban_data": {{
        "name": "Ügyfél neve (ha megadta vagy tudod)",
        "email": "Ügyfél e-mailje (ha megadta)",
        "phone": "Telefonszám (ha megadta)",
        "clinic_id": 0, // A telephely ID-ja, ha kiválasztotta, különben 0
        "priority": "Normál" // vagy 'Sürgős', 'Kiemelt' stb. a triázs alapján
    }},
    "meeting": {{
        "title": "Találkozó címe (ha VÉGLEGESÍTVE időpontot foglal, különben null)",
        "date": "YYYY-MM-DD",
        "time": "HH:MM",
        "duration_minutes": 30
    }},
    "action_modify_meeting": {{
        "event_title_to_modify": "A módosítandó esemény címe vagy része (csak ha kéri)",
        "new_date": "YYYY-MM-DD",
        "new_time": "HH:MM"
    }},
    "action_delete_meeting": {{
        "event_title_to_delete": "A törlendő esemény címe vagy része (csak ha lemondja)"
    }},
    "alert_tags": ["urgent", "callback", "kiemelt"] // Válaszd ki, ha releváns, különben üres lista []
}}
FIGYELEM: Ha az eset Sürgős vagy Kiemelt prioritású, VAGY a kérés szerepel a Kivételek (Exceptions) listájában, a "meeting" értéke KÖTELEZŐEN null kell legyen (SZIGORÚAN TILOS időpontot foglalni!).
KIVÉTEL A TILTÁS ALÓL: Ha az ügyfél egyértelműen időpontot kér, de NEM adja meg a panaszát, AKKOR IS FOGLALD LE az időpontot!
"""
        system_prompt += f"\n\n--- JSON UTASÍTÁS ---\n{json_instruction}"

        # 3. Gemini hívás
        client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))
        user_content = f"Ügyfél neve: {meta_name if meta_name else 'Ismeretlen'}\nÚj üzenet: {message_text}"

        try:
            response = await client.aio.models.generate_content(
                model="gemini-2.5-flash",
                contents=user_content,
                config=types.GenerateContentConfig(
                    system_instruction=system_prompt,
                    temperature=0.2,
                    response_mime_type="application/json"
                )
            )
            ai_text = response.text.strip()
        except Exception as e:
            print(f"[Meta AI Process] Kritikus Gemini API Hiba: {e}")
            db.upsert_client({"messenger_id": sender_id}, additional_log=f"[Rendszer] Gemini API hiba: {e}")
            return

        if ai_text.startswith("```json"): ai_text = ai_text[7:]
        if ai_text.startswith("```"): ai_text = ai_text[3:]
        if ai_text.endswith("```"): ai_text = ai_text[:-3]
        ai_text = ai_text.strip()

        try:
            data = json.loads(ai_text)
            print("AI JSON Output:", json.dumps(data, indent=2))
        except json.JSONDecodeError as e:
            print(f"[Meta AI Process] Hibás JSON válasz: {e}")
            db.upsert_client({"messenger_id": sender_id}, additional_log=f"[Rendszer] Hibás JSON válasz az AI-tól: {e}")
            return

        final_text = data.get("reply_text", "")
        kanban = data.get("kanban_data") or {}
        meeting = data.get("meeting")
        modify_action = data.get("action_modify_meeting")
        delete_action = data.get("action_delete_meeting")
        alert_tags = data.get("alert_tags", [])
        
        booked_meeting = False
        chosen_clinic_id = None

        # --- ACTION: KANBAN ADATOK MENTÉSE ---
        if kanban:
            custom_data = {
                "messenger_id": sender_id,
                "forras_csatorna": source_channel
            }
            kanban_name = kanban.get("name", "").strip()
            # Don't accept placeholder names from AI — prefer the real name from Meta API
            if kanban_name and kanban_name not in ("Ismeretlen", "Névtelen", "-", "ismeretlen", "névtelen"):
                custom_data["name"] = kanban_name
            elif meta_name:
                custom_data["name"] = meta_name
            if kanban.get("email"): custom_data["email"] = kanban["email"]
            if kanban.get("phone"): custom_data["phone"] = kanban["phone"]
            if kanban.get("clinic_id"):
                try:
                    custom_data["clinic_id"] = int(kanban["clinic_id"])
                    chosen_clinic_id = int(kanban["clinic_id"])
                except:
                    pass
                    
            if kanban.get("priority"):
                custom_data["prioritas"] = kanban["priority"]
            if "urgent" in alert_tags and custom_data.get("prioritas") != "Sürgős":
                custom_data["prioritas"] = "Sürgős"
            elif "kiemelt" in alert_tags and custom_data.get("prioritas") != "Kiemelt":
                custom_data["prioritas"] = "Kiemelt"

            custom_data = {k: v for k, v in custom_data.items() if v}
            
            # Fetch existing client to keep current status, or default to "uj"
            existing_client = db.find_client_by_contact(messenger_id=sender_id)
            current_status = existing_client.get("status", "uj") if existing_client else "uj"
            
            client_id = db.upsert_client(custom_data, status=current_status)
            
            # Kiemelt eszkaláció
            priority = custom_data.get("prioritas", "Normál")
            if priority == "Kiemelt" or "kiemelt" in alert_tags:
                email_to_send = None
                t_rules = db.get_triage_rules()
                for r in t_rules:
                    if r.get("priority") == "Kiemelt" and r.get("escalation_email"):
                        email_to_send = r["escalation_email"]
                        break
                if email_to_send:
                    name_val = kanban.get("name") or meta_name or "Ismeretlen"
                    contact_val = f"Email: {kanban.get('email', '-')} | Telefon: {kanban.get('phone', '-')}"
                    asyncio.create_task(email_processor.send_escalation_email_to_staff(
                        to_email=email_to_send,
                        patient_name=name_val,
                        patient_contact=contact_val,
                        problem_description=message_text,
                        priority="Kiemelt"
                    ))

        # --- ACTION: NAPTÁR FOGLALÁS ---
        if meeting and meeting.get("title") and meeting.get("date") and meeting.get("time"):
            start_dt_val = f"{meeting['date']}T{meeting['time']}:00"
            dur = int(meeting.get("duration_minutes", 30))
            try:
                import zoneinfo
                tz = zoneinfo.ZoneInfo("Europe/Budapest")
                start_dt_obj = datetime.fromisoformat(start_dt_val).replace(tzinfo=tz)
                start_dt_val = start_dt_obj.isoformat()
                end_dt_val = (start_dt_obj + timedelta(minutes=dur)).isoformat()
            except:
                end_dt_val = None
                
            existing = db.get_calendar_events()
            if any(ev.get("start_dt") == start_dt_val for ev in existing):
                db.upsert_client({"messenger_id": sender_id}, additional_log="[Rendszer] Figyelmeztetés: Ebbe az időpontba már van foglalás, nem rögzítve.")
            else:
                created_event_id = db.add_calendar_event(
                    title=meeting.get("title", "Konzultáció"),
                    start_dt=start_dt_val,
                    end_dt=end_dt_val,
                    duration_minutes=dur,
                    attendee=kanban.get("name") or meta_name or "Ismeretlen Ügyfél",
                    attendee_email=kanban.get("email", "-")
                )
                
                # Visszaállítjuk a státuszt "uj"-ra, hogy kikerüljön a "lemondott" oszlopból
                client_to_reset = db.find_client_by_contact(messenger_id=sender_id)
                if client_to_reset:
                    c_data = client_to_reset.get("custom_data", {})
                    if "cancelled_viewed" in c_data:
                        del c_data["cancelled_viewed"]
                    db.edit_client_details(client_to_reset["id"], c_data)
                    db.update_client_status(client_to_reset["id"], "uj")
                    
                db.upsert_client({"messenger_id": sender_id}, additional_log=f"[Rendszer] Naptár bejegyzés létrehozva: {start_dt_val}")
                booked_meeting = True
                
                attendee_email = kanban.get("email")
                if attendee_email and created_event_id:
                    asyncio.create_task(
                        email_processor.send_booking_confirmation_email(
                            event_id=created_event_id,
                            title=meeting.get("title", "Konzultáció"),
                            date=meeting.get("date"),
                            time=meeting.get("time"),
                            attendee=kanban.get("name") or meta_name or "Ismeretlen Ügyfél",
                            attendee_email=attendee_email
                        )
                    )

        # --- ACTION: NAPTÁR MÓDOSÍTÁS ---
        if modify_action and modify_action.get("event_title_to_modify"):
            ev_title = modify_action["event_title_to_modify"]
            found = db.find_calendar_event_by_title(ev_title)
            if found:
                updates = {}
                old_dt = datetime.fromisoformat(found["start_dt"].replace("Z", "+00:00"))
                d = modify_action.get("new_date") or old_dt.strftime("%Y-%m-%d")
                t = modify_action.get("new_time") or old_dt.strftime("%H:%M")
                try:
                    import zoneinfo
                    tz = zoneinfo.ZoneInfo("Europe/Budapest")
                    new_start = datetime.fromisoformat(f"{d}T{t}:00").replace(tzinfo=tz)
                except:
                    new_start = datetime.fromisoformat(f"{d}T{t}:00")
                dur = found.get("duration_minutes", 30)
                updates["start_dt"] = new_start.isoformat()
                updates["end_dt"] = (new_start + timedelta(minutes=dur)).isoformat()
                db.update_calendar_event(found["id"], **updates)
                db.upsert_client({"messenger_id": sender_id}, additional_log=f"[Rendszer] Naptár bejegyzés módosítva: {found['title']}")
                # Módosítás visszaigazolás email küldése
                attendee_email = found.get("attendee_email")
                if attendee_email and attendee_email != "-":
                    asyncio.create_task(
                        email_processor.send_modification_confirmation_email(
                            attendee=found.get("attendee", "Ügyfél"),
                            attendee_email=attendee_email,
                            title=found.get("title", "Konzultáció"),
                            old_datetime=found["start_dt"],
                            new_datetime=updates.get("start_dt", found["start_dt"])
                        )
                    )
            else:
                db.upsert_client({"messenger_id": sender_id}, additional_log=f"[Rendszer] Módosítás sikertelen, nem található: {ev_title}")

        # --- ACTION: NAPTÁR TÖRLÉS ---
        if delete_action:
            found = None
            client_to_cancel = db.find_client_by_contact(messenger_id=sender_id)
            if client_to_cancel:
                c_email = client_to_cancel.get("custom_data", {}).get("email")
                c_name = client_to_cancel.get("name")
                if c_email and c_email != "-":
                    found = db.find_upcoming_event_by_attendee(email=c_email)
                if not found and c_name and c_name != "-":
                    found = db.find_upcoming_event_by_attendee(name=c_name)
                    
            if found:
                db.delete_calendar_event(found["id"])
                if client_to_cancel:
                    c_data = client_to_cancel.get("custom_data", {})
                    if isinstance(c_data, str):
                        try: c_data = json.loads(c_data)
                        except: c_data = {}
                    if not isinstance(c_data, dict): c_data = {}
                    
                    c_data["cancelled_viewed"] = False
                    # Automatikus 'törölt időpont' tag hozzáadása
                    existing_tags = c_data.get("tags", [])
                    if "törölt időpont" not in existing_tags:
                        existing_tags.append("törölt időpont")
                        c_data["tags"] = existing_tags
                    db.edit_client_details(client_to_cancel["id"], c_data)
                    db.update_client_status(client_to_cancel["id"], "lemondott")
                
                db.upsert_client({"messenger_id": sender_id}, additional_log=f"[Rendszer] Naptár bejegyzés törölve: {found['title']}")
            else:
                db.upsert_client({"messenger_id": sender_id}, additional_log="[Rendszer] Törlés sikertelen, nem található az ügyfélhez tartozó esemény a naptárban.")

        # 4. Válasz rögzítése a Kanbanba
        if final_text:
            existing_client = db.find_client_by_contact(messenger_id=sender_id)
            # Név feloldás: meta API → DB → sender_id
            display_name = meta_name
            if not display_name and existing_client:
                cd_for_name = existing_client.get("custom_data")
                if isinstance(cd_for_name, str):
                    try: cd_for_name = json.loads(cd_for_name)
                    except: cd_for_name = {}
                if isinstance(cd_for_name, dict):
                    display_name = cd_for_name.get("nev") or cd_for_name.get("name") or existing_client.get("name")
            if not display_name or display_name in ("Névtelen", "Ismeretlen", "-", ""):
                display_name = None

            current_status = existing_client.get("status", "uj") if existing_client else "uj"
            db.upsert_client({"messenger_id": sender_id, "forras_csatorna": source_channel}, additional_log=f"AI Válasz: {final_text}", status=current_status)
            
            f_stage = "foglalt" if booked_meeting else "valaszolt"
            
            # Piszkozat készítése
            draft_payload = {
                "channel": source_channel,
                "sender_id": sender_id,
                "to_name": display_name if display_name else sender_id,
                "phone_number_id": phone_number_id,
                "body": final_text
            }
            draft_json = json.dumps(draft_payload)
            
            session_id = f"{source_channel.lower()}_{sender_id}"
            db.create_session(session_id=session_id, room_name=f"{source_channel} Chat", participant=display_name if display_name else "Ismeretlen")
            
            # alert tags beolvasása az aszinkron feladatból, ha az AI nem adott
            tags_from_ai = alert_tags if isinstance(alert_tags, list) else []
            try:
                tags_from_task = await alert_tags_task
                if not tags_from_task: tags_from_task = []
            except:
                tags_from_task = []
                
            combined_tags = list(set(tags_from_ai + tags_from_task))
            
            # Logolás az interactions táblába + approval
            db.log_interaction(
                type=source_channel.lower(),
                topic=f"{source_channel} AI válasz",
                summary=final_text[:100],
                result="Várakozik jóváhagyásra",
                tool_name="process_meta_message",
                session_id=session_id,
                direction="inbound",
                funnel_stage=f_stage,
                alert_tags=combined_tags,
                handover_reason=None,
                approval_status="pending",
                ai_draft_response=draft_json,
                clinic_id=str(chosen_clinic_id) if chosen_clinic_id else None
            )

    except Exception as e:
        print(f"[Meta AI Process] Hiba: {e}")


@app.post("/api/webhook/meta")
async def meta_webhook_receive(request: Request):
    """Receive messages from Meta Messenger, Instagram, and WhatsApp."""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    
    obj_type = body.get("object")
    
    # 1) Messenger / Instagram
    if obj_type in ("page", "instagram"):
        is_instagram = (obj_type == "instagram")
        
        for entry in body.get("entry", []):
            for webhook_event in entry.get("messaging", []):
                sender_id = webhook_event.get("sender", {}).get("id")
                
                if "message" in webhook_event and "text" in webhook_event["message"]:
                    message_text = webhook_event["message"]["text"]
                    source_channel = "Instagram" if is_instagram else "Messenger"
                    print(f"[Meta Webhook] Új üzenet feladótól (ID: {sender_id}, Csatorna: {source_channel}): {message_text}")
                    
                    # AI aszinkron feldolgozás
                    task = asyncio.create_task(process_meta_message(sender_id, message_text, source_channel))
                    background_tasks.add(task)
                    task.add_done_callback(background_tasks.discard)
                    
        return PlainTextResponse(content="EVENT_RECEIVED", status_code=200)

    # 2) WhatsApp
    elif obj_type == "whatsapp_business_account":
        for entry in body.get("entry", []):
            for change in entry.get("changes", []):
                value = change.get("value", {})
                
                # Check if it's a message event
                if "messages" in value:
                    phone_number_id = value.get("metadata", {}).get("phone_number_id")
                    for message in value.get("messages", []):
                        sender_id = message.get("from")
                        
                        if message.get("type") == "text" and "text" in message:
                            message_text = message["text"].get("body", "")
                            print(f"[Meta Webhook] Új üzenet feladótól (ID: {sender_id}, Csatorna: WhatsApp): {message_text}")
                            
                            task = asyncio.create_task(process_meta_message(sender_id, message_text, "WhatsApp", phone_number_id))
                            background_tasks.add(task)
                            task.add_done_callback(background_tasks.discard)
                            
        return PlainTextResponse(content="EVENT_RECEIVED", status_code=200)
    
    raise HTTPException(status_code=404, detail="Not Found")


# ═══════════════════════════════════════════════════════════════════════════════
# ADMIN AUTH
# ═══════════════════════════════════════════════════════════════════════════════

class LoginRequest(BaseModel):
    username: str
    password: str


@app.post("/admin/login")
def admin_login(req: LoginRequest):
    """Admin login — returns JWT token + role."""
    user = db.verify_admin_user(req.username, req.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Hibás felhasználónév vagy jelszó"
        )
    token = create_jwt(user["username"])
    return {"token": token, "username": user["username"], "role": user.get("role", "admin"), "full_name": user.get("full_name", "")}


def require_admin(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)):
    """Dependency: only admin role can access."""
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Nincs token")
    try:
        payload = pyjwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGO])
        username = payload["sub"]
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token lejárt")
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Érvénytelen token")
    
    user = db.get_admin_user_by_username(username)
    if not user or user.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Csak admin jogosultsággal elérhető")
    return user


# ═══════════════════════════════════════════════════════════════════════════════
# ADMIN USER MANAGEMENT — admin role required
# ═══════════════════════════════════════════════════════════════════════════════

class CreateUserRequest(BaseModel):
    username: str
    password: str
    email: str = ""
    role: str = "member"
    full_name: str = ""

class RoleUpdateRequest(BaseModel):
    role: str

class ChangePasswordRequest(BaseModel):
    current_password: str = ""
    new_password: str
    user_id: Optional[int] = None

@app.get("/admin/api/users")
def api_get_users(admin: dict = Depends(require_admin)):
    """List all admin users (admin only)."""
    return {"status": "success", "data": db.get_admin_users()}

@app.post("/admin/api/users")
def api_create_user(req: CreateUserRequest, admin: dict = Depends(require_admin)):
    """Create a new admin user (admin only)."""
    if req.role not in ("admin", "member"):
        raise HTTPException(400, "Érvénytelen szerepkör. Lehetséges: admin, member")
    success = db.create_admin_user(req.username, req.password, req.email, req.role, admin["username"], req.full_name)
    if not success:
        raise HTTPException(400, "A felhasználónév már foglalt")
    return {"status": "success", "message": f"Felhasználó létrehozva: {req.username}"}

@app.put("/admin/api/users/{user_id}/role")
def api_update_user_role(user_id: int, req: RoleUpdateRequest, admin: dict = Depends(require_admin)):
    """Update user role (admin only). Cannot demote self."""
    if admin["id"] == user_id and req.role != "admin":
        raise HTTPException(400, "Nem módosíthatod a saját szerepkörödet")
    success = db.update_admin_role(user_id, req.role)
    if not success:
        raise HTTPException(400, "Szerepkör módosítása sikertelen")
    return {"status": "success"}

@app.delete("/admin/api/users/{user_id}")
def api_delete_user(user_id: int, admin: dict = Depends(require_admin)):
    """Delete an admin user (admin only). Cannot delete self."""
    if admin["id"] == user_id:
        raise HTTPException(400, "Nem törölheted saját magadat")
    success = db.delete_admin_user(user_id)
    if not success:
        raise HTTPException(400, "Törlés sikertelen")
    return {"status": "success"}

@app.post("/admin/api/users/change-password")
def api_change_password(req: ChangePasswordRequest, username: str = Depends(verify_jwt)):
    """Change password. Admins can change any user's password; members only their own."""
    caller = db.get_admin_user_by_username(username)
    if not caller:
        raise HTTPException(401, "Felhasználó nem található")
    
    if req.user_id and req.user_id != caller["id"]:
        # Changing someone else's password — admin only
        if caller.get("role") != "admin":
            raise HTTPException(403, "Csak admin módosíthat más felhasználó jelszavát")
        success = db.update_admin_password(req.user_id, req.new_password)
    else:
        # Changing own password — verify current password
        user = db.verify_admin_user(username, req.current_password)
        if not user:
            raise HTTPException(400, "A jelenlegi jelszó helytelen")
        success = db.update_admin_password(caller["id"], req.new_password)
    
    if not success:
        raise HTTPException(400, "Jelszó módosítása sikertelen")
    return {"status": "success", "message": "Jelszó sikeresen módosítva"}


@app.get("/admin/api/members")
def api_get_members(username: str = Depends(verify_jwt)):
    """List all member users (for Felelős dropdown). Any logged-in user can access."""
    users = db.get_admin_users()
    members = [{"id": u["id"], "username": u["username"], "full_name": u.get("full_name", "")} for u in users if u.get("role") == "member"]
    return {"status": "success", "data": members}


# ═══════════════════════════════════════════════════════════════════════════════
# ADMIN API — protected routes
# ═══════════════════════════════════════════════════════════════════════════════


@app.get("/admin/api/stats")
def admin_stats(period: str = "month", channel: str = "mind", username: str = Depends(verify_jwt)):
    """Analytics summary stats."""
    return db.get_stats(period=period, channel=channel)

@app.get("/admin/api/analytics/funnel")
def admin_funnel(period: str = "month", channel: str = "mind", username: str = Depends(verify_jwt)):
    """Funnel stats based on interaction stages."""
    return db.get_funnel_stats(period=period, channel=channel)

@app.get("/admin/api/analytics/alerts")
def admin_alerts(period: str = "month", channel: str = "mind", username: str = Depends(verify_jwt)):
    """Operational alerts and tasks stats."""
    return db.get_alerts_stats(period=period, channel=channel)

@app.get("/admin/api/analytics/alerts/details")
def admin_alerts_details(type: str, username: str = Depends(verify_jwt)):
    """Get specific alert details."""
    details = db.get_alert_details(type)
    return {"status": "success", "data": details}

@app.get("/admin/api/analytics/insights")
def admin_get_insights(username: str = Depends(verify_jwt)):
    """Get latest AI insights."""
    insights = db.get_latest_ai_insights()
    if not insights:
        insights = [
            "Az árkérdések aránya 28%-kal nőtt – érdemes bővíteni az árakkal kapcsolatos tudásbázist.",
            "Az angol nyelvű megkeresések aránya nő – megfontolható az angol nyelvű válaszok fejlesztése.",
            "A 16:00–18:00 közti sávban emelkedett az átadási arány – érdemes vizsgálni az okot.",
            "Az időpontmódosítási kérdésekre érdemes új szabályt rögzíteni a Szabályok menüben."
        ]
    return {"status": "success", "insights": insights}

@app.post("/admin/api/analytics/insights/generate")
async def admin_generate_insights(username: str = Depends(verify_jwt)):
    """Generate new AI insights based on stats."""
    stats = db.get_stats(period="month")
    google_key = os.getenv("GEMINI_API_KEY")
    insights = []
    
    if google_key:
        try:
            from google import genai
            from google.genai import types
            import json
            
            client = genai.Client(api_key=google_key)
            prompt = f"""
Te egy ügyfélszolgálati adatelemző AI vagy. Itt vannak az elmúlt időszak statisztikái:
- Összes megkeresés: {stats.get('total_interactions', 0)}
- Elakadt (nyitott) feladatok: {stats.get('open_tasks', 0)}
- Csatornák: {json.dumps(stats.get('interactions_by_type', []))}
- Témák: {json.dumps(stats.get('interactions_by_topic', []))}

Adj 4 darab, egy-egy mondatos, releváns finomhangolási javaslatot a folyamatok javítására ezen adatok alapján.
A válaszod kizárólag egy valid JSON lista legyen (pl. ["javaslat 1", "javaslat 2", ...]), markdown nélkül!
"""
            resp = await client.aio.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
                config=types.GenerateContentConfig(temperature=0.7)
            )
            t = resp.text.strip()
            if t.startswith("```json"): t = t[7:-3]
            if t.startswith("```"): t = t[3:-3]
            insights = json.loads(t.strip())
        except Exception as e:
            print(f"[Insights Generation Error] {e}")
            insights = []
            
    if not insights or len(insights) < 4:
        insights = [
            "Az árkérdések aránya 28%-kal nőtt – érdemes bővíteni az árakkal kapcsolatos tudásbázist.",
            "A telefonos csatorna továbbra is a legaktívabb, érdemes optimalizálni a hangasszisztenst.",
            "Sok a megválaszolatlan ügy, javasolt a belső értesítési rendszer felülvizsgálata.",
            "A 16:00–18:00 közti sávban emelkedett az átadási arány – érdemes vizsgálni az okot."
        ]
        
    db.save_ai_insights(insights)
    return {"status": "success", "insights": insights}

@app.get("/admin/api/analytics/outbound/summary")
def admin_outbound_summary(period: str = "month", channel: str = "mind", clinic_id: str = "mind", username: str = Depends(verify_jwt)):
    """Get outbound summary metrics."""
    return db.get_outbound_stats(period, channel, clinic_id)


@app.get("/admin/api/interactions")
def admin_interactions(
    limit: int = 100,
    type: str = "",
    username: str = Depends(verify_jwt)
):
    """Interaction list, newest first."""
    return {"interactions": db.get_interactions(limit=limit, type_filter=type)}


@app.get("/admin/api/calendar")
def admin_calendar(username: str = Depends(verify_jwt)):
    """Calendar events, sorted by start time."""
    return {"events": db.get_calendar_events()}


class ManualEventRequest(BaseModel):
    title: str
    attendee: str
    attendee_email: str = ""
    attendee_phone: str = ""
    start_dt: str  # ISO format datetime
    duration_minutes: int = 30

@app.post("/admin/api/calendar")
def admin_create_event(req: ManualEventRequest, username: str = Depends(verify_jwt)):
    """Create a manual calendar event and auto-create client if needed."""
    from datetime import datetime, timedelta
    try:
        start = datetime.fromisoformat(req.start_dt.replace("Z", "+00:00"))
    except Exception:
        raise HTTPException(400, "Érvénytelen dátum formátum")
    
    end = start + timedelta(minutes=req.duration_minutes)
    
    event_id = db.add_calendar_event(
        title=req.title,
        start_dt=start.isoformat(),
        end_dt=end.isoformat(),
        duration_minutes=req.duration_minutes,
        attendee=req.attendee,
        attendee_email=req.attendee_email
    )
    
    # Auto-create client if not exists
    if req.attendee:
        existing = db.get_clients()
        found = False
        for c in existing:
            cd = c.get("custom_data")
            if isinstance(cd, str):
                try:
                    import json
                    cd = json.loads(cd)
                except:
                    cd = {}
            elif cd is None:
                cd = {}
            c_name = (cd.get("nev") or cd.get("name") or c.get("name") or "").lower().strip()
            c_email = (cd.get("email") or c.get("email") or "").lower().strip()
            if (req.attendee.lower().strip() == c_name) or (req.attendee_email and req.attendee_email.lower().strip() == c_email):
                found = True
                break
        
        if not found:
            # Get user's full_name for felelos
            user_info = db.get_admin_user_by_username(username)
            felelos = (user_info or {}).get("full_name", "") or username
            
            custom_data = {
                "name": req.attendee,
                "nev": req.attendee,
                "email": req.attendee_email,
                "phone": req.attendee_phone,
                "telefonszam": req.attendee_phone,
                "felelos": felelos
            }
            db.add_client(custom_data, "uj")
    
    return {"status": "success", "event_id": event_id, "message": "Időpont sikeresen létrehozva"}


@app.get("/admin/api/emails")
def admin_emails(limit: int = 100, username: str = Depends(verify_jwt)):
    """Email logs, newest first."""
    return {"emails": db.get_email_logs(limit=limit)}


@app.get("/admin/api/tasks")
def admin_tasks(completed: str = "all", username: str = Depends(verify_jwt)):
    """Task list."""
    comp = None if completed == "all" else (completed == "true")
    return {"tasks": db.get_tasks(completed=comp)}


@app.patch("/admin/api/tasks/{task_id}/complete")
def admin_task_complete(task_id: int, username: str = Depends(verify_jwt)):
    """Toggle task completed status."""
    res = db.update_task_complete(task_id)
    if not res.get("ok"):
        raise HTTPException(status_code=404, detail="Task not found or update failed")
    return {"ok": True, "completed": res.get("completed", False)}


@app.delete("/admin/api/tasks/{task_id}")
def admin_task_delete(task_id: int, username: str = Depends(verify_jwt)):
    """Delete a task."""
    res = db.delete_task(task_id)
    if not res:
        raise HTTPException(status_code=404, detail="Delete failed")
    return {"ok": True}


@app.get("/admin/api/sessions")
def admin_sessions(limit: int = 50, username: str = Depends(verify_jwt)):
    """Recent sessions."""
    return {"sessions": db.get_sessions(limit=limit)}


@app.get("/admin/api/sessions/summary")
def admin_sessions_summary(limit: int = 50, username: str = Depends(verify_jwt)):
    """Sessions enriched with interaction summaries."""
    return {"sessions": db.get_sessions_with_summary(limit=limit)}


class BulkDeleteInteractionsRequest(BaseModel):
    interaction_ids: list[int] = []
    session_ids: list[str] = []

@app.post("/admin/api/interactions/delete")
def admin_delete_interactions(req: BulkDeleteInteractionsRequest, username: str = Depends(verify_jwt)):
    """Delete interactions and/or sessions by ID."""
    deleted_interactions = 0
    deleted_sessions = 0
    try:
        if req.interaction_ids and db.supabase:
            db.supabase.table("interactions").delete().in_("id", req.interaction_ids).execute()
            deleted_interactions = len(req.interaction_ids)
        if req.session_ids and db.supabase:
            # Also delete interactions belonging to these sessions
            db.supabase.table("interactions").delete().in_("session_id", req.session_ids).execute()
            db.supabase.table("sessions").delete().in_("session_id", req.session_ids).execute()
            deleted_sessions = len(req.session_ids)
    except Exception as e:
        logger.error(f"Delete interactions error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    return {"deleted_interactions": deleted_interactions, "deleted_sessions": deleted_sessions}


# ═══════════════════════════════════════════════════════════════════════════════
# CLIENTS (KANBAN) API
# ═══════════════════════════════════════════════════════════════════════════════

class ClientCreateRequest(BaseModel):
    custom_data: dict

class ClientStatusUpdateRequest(BaseModel):
    status: str

@app.get("/admin/api/alerts/urgent")
def admin_alerts_urgent(username: str = Depends(verify_jwt)):
    """Fetch unhandled urgent alerts for notification."""
    clients = db.get_clients()
    urgent_clients = []
    
    for c in clients:
        status = c.get("status", "uj")
        if status in ["szerzodott", "siker", "sikeres", "lezart", "sikertelen"]:
            continue
            
        custom_data = c.get("custom_data")
        if isinstance(custom_data, str):
            try:
                import json
                custom_data = json.loads(custom_data)
            except:
                custom_data = {}
        if not isinstance(custom_data, dict):
            custom_data = {}
            
        if (custom_data.get("prioritas") == "Sürgős" or custom_data.get("priority") == "Sürgős") and not custom_data.get("urgent_viewed"):
            # Extract basic info for the toast
            name = custom_data.get("nev") or custom_data.get("name") or custom_data.get("név") or c.get("name", "Ismeretlen")
            channel = custom_data.get("forras_csatorna") or ("Messenger" if custom_data.get("messenger_id") else "Manuális")
            problem = custom_data.get("problem_description") or "Sürgős megkeresés beérkezett."
            
            urgent_clients.append({
                "id": c.get("id"),
                "name": name,
                "channel": channel,
                "problem": problem,
                "created_at": c.get("created_at")
            })
            
    return {"urgent_clients": urgent_clients}

@app.post("/admin/api/alerts/urgent/{client_id}/view")
def mark_urgent_alert_viewed(client_id: int, username: str = Depends(verify_jwt)):
    """Mark an urgent alert as viewed so it disappears from the notification bell."""
    clients = db.get_clients()
    for c in clients:
        if c.get("id") == client_id:
            custom_data = c.get("custom_data")
            if isinstance(custom_data, str):
                try:
                    import json
                    custom_data = json.loads(custom_data)
                except:
                    custom_data = {}
            if not isinstance(custom_data, dict):
                custom_data = {}
            
            custom_data["urgent_viewed"] = True
            db.edit_client_details(client_id, custom_data)
            return {"status": "success"}
    
    raise HTTPException(status_code=404, detail="Client not found")

@app.get("/admin/api/alerts/cancelled")
def admin_alerts_cancelled(username: str = Depends(verify_jwt)):
    """Fetch unhandled cancellation alerts for notification."""
    clients = db.get_clients()
    cancelled_clients = []
    
    for c in clients:
        status = c.get("status", "uj")
        if status != "lemondott":
            continue
            
        custom_data = c.get("custom_data")
        if isinstance(custom_data, str):
            try:
                import json
                custom_data = json.loads(custom_data)
            except:
                custom_data = {}
        if not isinstance(custom_data, dict):
            custom_data = {}
            
        if not custom_data.get("cancelled_viewed"):
            name = custom_data.get("nev") or custom_data.get("name") or custom_data.get("név") or c.get("name", "Ismeretlen")
            channel = custom_data.get("forras_csatorna") or ("Messenger" if custom_data.get("messenger_id") else "Manuális")
            email = custom_data.get("email") or c.get("email", "")
            phone = custom_data.get("phone") or c.get("phone", "")
            
            cancelled_clients.append({
                "id": c.get("id"),
                "name": name,
                "email": email,
                "phone": phone,
                "channel": channel,
                "created_at": c.get("created_at")
            })
            
    return {"cancelled_clients": cancelled_clients}

@app.post("/admin/api/alerts/cancelled/{client_id}/view")
def mark_cancelled_alert_viewed(client_id: int, username: str = Depends(verify_jwt)):
    """Mark a cancelled alert as viewed."""
    clients = db.get_clients()
    for c in clients:
        if c.get("id") == client_id:
            custom_data = c.get("custom_data")
            if isinstance(custom_data, str):
                try:
                    import json
                    custom_data = json.loads(custom_data)
                except:
                    custom_data = {}
            if not isinstance(custom_data, dict):
                custom_data = {}
            
            custom_data["cancelled_viewed"] = True
            db.edit_client_details(client_id, custom_data)
            return {"status": "success"}
    
    raise HTTPException(status_code=404, detail="Client not found")

@app.get("/admin/api/clients")
def admin_clients(username: str = Depends(verify_jwt)):
    """List all clients for Kanban."""
    clients = db.get_clients()
    for c in clients:
        if "custom_data" in c and isinstance(c["custom_data"], dict):
            c["custom_data"] = json.dumps(c["custom_data"])
    return {"clients": clients}

@app.post("/admin/api/clients")
def admin_add_client(req: ClientCreateRequest, username: str = Depends(verify_jwt)):
    """Add a new client."""
    client_id = db.add_client(req.custom_data, "uj")
    return {"ok": True, "id": client_id}

@app.patch("/admin/api/clients/{client_id}/status")
def admin_update_client_status(client_id: int, req: ClientStatusUpdateRequest, username: str = Depends(verify_jwt)):
    """Update client status (drag & drop)."""
    db.update_client_status(client_id, req.status)
    return {"ok": True}

@app.delete("/admin/api/clients/{client_id}")
def admin_delete_client(client_id: int, username: str = Depends(verify_jwt)):
    """Delete client."""
    db.delete_client(client_id)
    return {"ok": True}

class BulkDeleteClientsRequest(BaseModel):
    client_ids: list[int]

@app.post("/admin/api/clients/bulk_delete")
def admin_bulk_delete_clients(req: BulkDeleteClientsRequest, username: str = Depends(verify_jwt)):
    """Delete multiple clients."""
    for cid in req.client_ids:
        db.delete_client(cid)
    return {"ok": True}

@app.put("/admin/api/clients/{client_id}")
def admin_update_client_details(client_id: int, req: ClientCreateRequest, username: str = Depends(verify_jwt)):
    """Update client basic details."""
    db.edit_client_details(client_id, req.custom_data)
    return {"ok": True}

class ClientFieldCreateRequest(BaseModel):
    id: str
    name: str
    order_index: int

class ClientFieldUpdateRequest(BaseModel):
    name: str

@app.get("/admin/api/client_fields")
def admin_get_client_fields(username: str = Depends(verify_jwt)):
    return {"fields": db.get_client_fields()}

@app.post("/admin/api/client_fields")
def admin_add_client_field(req: ClientFieldCreateRequest, username: str = Depends(verify_jwt)):
    success = db.add_client_field(req.id, req.name, req.order_index)
    if not success:
        raise HTTPException(status_code=400, detail="Field ID already exists")
    return {"ok": True}

@app.put("/admin/api/client_fields/{field_id}")
def admin_update_client_field(field_id: str, req: ClientFieldUpdateRequest, username: str = Depends(verify_jwt)):
    db.update_client_field(field_id, req.name)
    return {"ok": True}

@app.delete("/admin/api/client_fields/{field_id}")
def admin_delete_client_field(field_id: str, username: str = Depends(verify_jwt)):
    db.delete_client_field(field_id)
    return {"ok": True}

class KanbanColumnCreateRequest(BaseModel):
    id: str
    name: str
    order_index: int

class KanbanColumnUpdateRequest(BaseModel):
    name: str

@app.get("/admin/api/kanban_columns")
def admin_get_kanban_columns(username: str = Depends(verify_jwt)):
    return {"columns": db.get_kanban_columns()}

@app.post("/admin/api/kanban_columns")
def admin_add_kanban_column(req: KanbanColumnCreateRequest, username: str = Depends(verify_jwt)):
    success = db.add_kanban_column(req.id, req.name, req.order_index)
    if not success:
        raise HTTPException(status_code=400, detail="Column ID already exists")
    return {"ok": True}

@app.put("/admin/api/kanban_columns/{col_id}")
def admin_update_kanban_column(col_id: str, req: KanbanColumnUpdateRequest, username: str = Depends(verify_jwt)):
    db.update_kanban_column(col_id, req.name)
    return {"ok": True}

@app.delete("/admin/api/kanban_columns/{col_id}")
def admin_delete_kanban_column(col_id: str, username: str = Depends(verify_jwt)):
    try:
        db.delete_kanban_column(col_id)
        return {"ok": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Legacy public API (for backward compat with voice-widget.html) ────────────
@app.get("/api/calendar")
def get_calendar():
    events = db.get_calendar_events()
    return JSONResponse({"events": events})

@app.get("/api/emails")
def get_emails():
    return JSONResponse({"emails": db.get_email_logs()})


# ═══════════════════════════════════════════════════════════════════════════════
SETTINGS_FILE  = THIS_DIR / "agent_settings.json"
KNOWLEDGE_JSON = THIS_DIR / "knowledge.json"
KNOWLEDGE_MD   = THIS_DIR / "knowledge.md"
SYSTEM_PROMPT_FILE = THIS_DIR / "system_prompt.md"
WORKFLOW_FILE      = THIS_DIR / "workflow.md"

DEFAULT_SETTINGS = {
    "voice_id": os.getenv("CARTESIA_VOICE_ID", "93896c4f-aa00-4c17-a360-fec55579d7fa"),
    "tone": "professional_friendly",
    "tone_custom": "",
    "knowledge_format": "json",
    "business_hours": {
        "monday":    {"open": "09:00", "close": "18:00", "enabled": True},
        "tuesday":   {"open": "09:00", "close": "18:00", "enabled": True},
        "wednesday": {"open": "09:00", "close": "18:00", "enabled": True},
        "thursday":  {"open": "09:00", "close": "18:00", "enabled": True},
        "friday":    {"open": "09:00", "close": "16:00", "enabled": True},
        "saturday":  {"open": None,    "close": None,    "enabled": False},
        "sunday":    {"open": None,    "close": None,    "enabled": False},
    },
}


def _read_settings() -> dict:
    if SETTINGS_FILE.exists():
        try:
            return json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return dict(DEFAULT_SETTINGS)


def _read_knowledge() -> dict:
    """Read knowledge content and format from disk."""
    settings = _read_settings()
    fmt = settings.get("knowledge_format", "json")
    if fmt == "md":
        content = KNOWLEDGE_MD.read_text(encoding="utf-8") if KNOWLEDGE_MD.exists() else ""
    else:
        content = KNOWLEDGE_JSON.read_text(encoding="utf-8") if KNOWLEDGE_JSON.exists() else "{}"
    return {"format": fmt, "content": content}


@app.get("/admin/api/settings")
async def get_settings(username: str = Depends(verify_jwt)):
    """Return current agent settings + knowledge base content."""
    s = _read_settings()
    k = _read_knowledge()
    return {**s, "knowledge_content": k["content"]}


class SettingsSaveRequest(BaseModel):
    voice_id: str = ""
    tone: str = "professional_friendly"
    tone_custom: str = ""
    knowledge_format: str = "json"
    knowledge_content: str = ""
    greeting: str = ""
    business_hours: dict = {}


class TextFileRequest(BaseModel):
    content: str = ""


@app.post("/admin/api/settings")
async def save_settings(payload: SettingsSaveRequest, username: str = Depends(verify_jwt)):
    """Save agent settings and knowledge base to disk."""
    # Save settings (without knowledge content)
    settings = {
        "voice_id":        payload.voice_id,
        "tone":            payload.tone,
        "tone_custom":     payload.tone_custom,
        "knowledge_format": payload.knowledge_format,
        "greeting":        payload.greeting,
        "business_hours":  payload.business_hours,
    }
    SETTINGS_FILE.write_text(json.dumps(settings, ensure_ascii=False, indent=2), encoding="utf-8")

    # Save knowledge to appropriate file
    if payload.knowledge_format == "md":
        KNOWLEDGE_MD.write_text(payload.knowledge_content, encoding="utf-8")
    else:
        try:
            parsed = json.loads(payload.knowledge_content)
            KNOWLEDGE_JSON.write_text(json.dumps(parsed, ensure_ascii=False, indent=2), encoding="utf-8")
        except json.JSONDecodeError as e:
            raise HTTPException(status_code=400, detail=f"Hibás JSON formátum: {e}")

    return {"ok": True, "message": "Beállítások elmentve. Az agent újraindítása szükséges a változtatások érvényesítéséhez."}


# ── System Prompt ─────────────────────────────────────────────────────────────

@app.get("/admin/api/system-prompt")
async def get_system_prompt(username: str = Depends(verify_jwt)):
    """Return the current system prompt (system_prompt.md)."""
    content = SYSTEM_PROMPT_FILE.read_text(encoding="utf-8") if SYSTEM_PROMPT_FILE.exists() else ""
    return {"content": content}


@app.post("/admin/api/system-prompt")
async def save_system_prompt(payload: TextFileRequest, username: str = Depends(verify_jwt)):
    """Overwrite system_prompt.md."""
    SYSTEM_PROMPT_FILE.write_text(payload.content, encoding="utf-8")
    return {"ok": True, "message": "System prompt elmentve."}


# ── Workflow ───────────────────────────────────────────────────────────────────

@app.get("/admin/api/workflow")
async def get_workflow(username: str = Depends(verify_jwt)):
    """Return the current workflow definition (workflow.md)."""
    content = WORKFLOW_FILE.read_text(encoding="utf-8") if WORKFLOW_FILE.exists() else ""
    return {"content": content}


@app.post("/admin/api/workflow")
async def save_workflow(payload: TextFileRequest, username: str = Depends(verify_jwt)):
    """Overwrite workflow.md."""
    WORKFLOW_FILE.write_text(payload.content, encoding="utf-8")
    return {"ok": True, "message": "Workflow elmentve."}



# ── Praxisinfó ────────────────────────────────────────────────────────────────
PRAXISINFO_FILE = THIS_DIR / "praxisinfo.json"

_HU_TO_EN = {
    "hetfo": "monday", "kedd": "tuesday", "szerda": "wednesday",
    "csutortok": "thursday", "pentek": "friday",
    "szombat": "saturday", "vasarnap": "sunday",
}

class PraxisinfoSaveRequest(BaseModel):
    practice_name: str = ""
    description:   str = ""
    address:       str = ""
    markanev:      str = ""
    szakterulet:   str = ""
    kulcsszavak:   str = ""
    megkozelites:  str = ""
    price_list:    str = ""
    price_list_file_meta: dict = {}
    doctors:  list = []
    campaigns: list = []
    exceptions: list = []
    faq: list = []
    modositas_eng: str = "igen"
    lemondas_24h: str = "figyelmeztetoSzoveggel"
    figyelmezteto_szoveg: str = ""
    pacient_id_question: str = "Korábban járt már a rendelőnkben?"
    new_patient_required: str = "Születési dátum, teljes név"
    new_patient_auto_visit: bool = True
    returning_patient_required: str = "Páciens azonosító vagy telefonszám"

@app.get("/admin/api/triage_rules")
def api_get_triage_rules(admin: dict = Depends(verify_jwt)):
    return db.get_triage_rules()

class TriageRuleCreate(BaseModel):
    situation: str
    priority: str
    escalation_email: str = ""

@app.post("/admin/api/triage_rules")
def api_post_triage_rules(rule: TriageRuleCreate, admin: dict = Depends(verify_jwt)):
    new_id = db.add_triage_rule(rule.situation, rule.priority, rule.escalation_email)
    if new_id:
        return {"ok": True, "id": new_id}
    raise HTTPException(status_code=500, detail="Hiba a létrehozáskor")

@app.put("/admin/api/triage_rules/{rule_id}")
def api_put_triage_rules(rule_id: int, rule: TriageRuleCreate, admin: dict = Depends(verify_jwt)):
    if db.update_triage_rule(rule_id, rule.situation, rule.priority, rule.escalation_email):
        return {"ok": True}
    raise HTTPException(status_code=400, detail="Hiba a frissítéskor")

@app.delete("/admin/api/triage_rules/{rule_id}")
def api_delete_triage_rules(rule_id: int, admin: dict = Depends(verify_jwt)):
    if db.delete_triage_rule(rule_id):
        return {"ok": True}
    raise HTTPException(status_code=400, detail="Hiba a törléskor")

# ── Orvosok ───────────────────────────────────────────────────────────────────

class DoctorCreate(BaseModel):
    name: str
    specialty: str = ""
    related_services: str = ""

@app.get("/admin/api/doctors")
def api_get_doctors(admin: dict = Depends(verify_jwt)):
    return db.get_doctors()

@app.post("/admin/api/doctors")
def api_post_doctors(doc: DoctorCreate, admin: dict = Depends(verify_jwt)):
    new_id = db.add_doctor(doc.name, doc.specialty, doc.related_services)
    if new_id:
        return {"ok": True, "id": new_id}
    raise HTTPException(status_code=500, detail="Hiba a létrehozáskor")

@app.put("/admin/api/doctors/{doc_id}")
def api_put_doctors(doc_id: int, doc: DoctorCreate, admin: dict = Depends(verify_jwt)):
    if db.update_doctor(doc_id, doc.name, doc.specialty, doc.related_services):
        return {"ok": True}
    raise HTTPException(status_code=400, detail="Hiba a frissítéskor")

@app.delete("/admin/api/doctors/{doc_id}")
def api_delete_doctors(doc_id: int, admin: dict = Depends(verify_jwt)):
    if db.delete_doctor(doc_id):
        return {"ok": True}
    raise HTTPException(status_code=400, detail="Hiba a törléskor")

# ── Szolgáltatások ────────────────────────────────────────────────────────────

class ServiceCreate(BaseModel):
    service_name: str
    duration_minutes: int
    doctor_id: Optional[int] = None
    note: str = ""

@app.get("/admin/api/services")
def api_get_services(admin: dict = Depends(verify_jwt)):
    return db.get_services()

@app.post("/admin/api/services")
def api_post_services(svc: ServiceCreate, admin: dict = Depends(verify_jwt)):
    new_id = db.add_service(svc.service_name, svc.duration_minutes, svc.doctor_id, svc.note)
    if new_id:
        return {"ok": True, "id": new_id}
    raise HTTPException(status_code=500, detail="Hiba a létrehozáskor")

@app.put("/admin/api/services/{srv_id}")
def api_put_services(srv_id: int, svc: ServiceCreate, admin: dict = Depends(verify_jwt)):
    if db.update_service(srv_id, svc.service_name, svc.duration_minutes, svc.doctor_id, svc.note):
        return {"ok": True}
    raise HTTPException(status_code=400, detail="Hiba a frissítéskor")

@app.delete("/admin/api/services/{srv_id}")
def api_delete_services(srv_id: int, admin: dict = Depends(verify_jwt)):
    if db.delete_service(srv_id):
        return {"ok": True}
    raise HTTPException(status_code=400, detail="Hiba a törléskor")


@app.get("/admin/api/praxisinfo")
async def get_praxisinfo(username: str = Depends(verify_jwt)):
    """Return saved practice info."""
    if PRAXISINFO_FILE.exists():
        try:
            return json.loads(PRAXISINFO_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}

@app.post("/admin/api/praxisinfo")
async def save_praxisinfo(payload: PraxisinfoSaveRequest, username: str = Depends(verify_jwt)):
    """Save practice info. Business hours are managed separately via /admin/api/settings."""
    data = {
        "practice_name": payload.practice_name,
        "description":   payload.description,
        "address":       payload.address,
        "markanev":      payload.markanev,
        "szakterulet":   payload.szakterulet,
        "kulcsszavak":   payload.kulcsszavak,
        "megkozelites":  payload.megkozelites,
        "price_list":    payload.price_list,
        "price_list_file_meta": payload.price_list_file_meta,
        "doctors":       payload.doctors,
        "campaigns":     payload.campaigns,
        "exceptions":    payload.exceptions,
        "faq":           payload.faq,
        "modositas_eng": payload.modositas_eng,
        "lemondas_24h":  payload.lemondas_24h,
        "figyelmezteto_szoveg": payload.figyelmezteto_szoveg,
        "pacient_id_question": payload.pacient_id_question,
        "new_patient_required": payload.new_patient_required,
        "new_patient_auto_visit": payload.new_patient_auto_visit,
        "returning_patient_required": payload.returning_patient_required,
        "last_updated":  datetime.utcnow().isoformat(),
    }
    PRAXISINFO_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"ok": True, "message": "Praxisinformáció elmentve."}

@app.get("/admin/api/prices/template/download")
async def download_price_template(username: str = Depends(verify_jwt)):
    """Generate and return an Excel template for price list upload."""
    import openpyxl
    import io
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Árlista Minta"
    
    # Headers
    headers = ["Kategória", "Szolgáltatás megnevezése", "Ár", "Pénznem", "Megjegyzés / Extra infó"]
    ws.append(headers)
    
    # Premium Sample data
    sample_data = [
        ["Konzultáció", "Szakorvosi állapotfelmérés és kezelési terv", 15000, "HUF", "Tartalmazza a szájüregi szűrővizsgálatot."],
        ["Diagnosztika", "Digitális Panoráma röntgen (OPG)", 12000, "HUF", "Kiadható digitális formátumban (CD / E-mail)."],
        ["Szájhigiénia", "Ultrahangos fogkőeltávolítás (Air-Flow)", 28000, "HUF", "Mindkét állcsontra, polírozással együtt."],
        ["Konzerváló fogászat", "Esztétikus kompozit tömés (1 felszínű)", 25000, "HUF", "Fényre kötő prémium tömőanyag."],
        ["Szájsebészet", "Bölcsességfog műtéti eltávolítása", 45000, "HUF", "A bonyolultságtól függően az ár változhat."],
        ["Implantológia", "Prémium implantátum beültetése", 250000, "HUF", "Az ár a felépítményt és koronát nem tartalmazza."]
    ]
    
    for row in sample_data:
        ws.append(row)
    
    # Styling
    from openpyxl.styles import PatternFill, Font
    header_fill = PatternFill(start_color="14B8A6", end_color="14B8A6", fill_type="solid")
    header_font = Font(bold=True, color="FFFFFF")
    
    for cell in ws[1]:
        cell.fill = header_fill
        cell.font = header_font
        
    # Freeze panes
    ws.freeze_panes = "A2"
    
    # Column widths
    ws.column_dimensions['A'].width = 25
    ws.column_dimensions['B'].width = 45
    ws.column_dimensions['C'].width = 15
    ws.column_dimensions['D'].width = 15
    ws.column_dimensions['E'].width = 60
        
    stream = io.BytesIO()
    wb.save(stream)
    stream.seek(0)
    
    return Response(
        content=stream.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="arlista_minta.xlsx"'}
    )

@app.post("/admin/api/upload_prices")
async def upload_prices(file: UploadFile = File(...), username: str = Depends(verify_jwt)):
    content = await file.read()
    prices_text = ""
    
    if file.filename.endswith(".csv"):
        try:
            text = content.decode("utf-8")
        except UnicodeDecodeError:
            text = content.decode("iso-8859-2", errors="replace")
        
        reader = csv.reader(io.StringIO(text))
        lines = []
        for row in reader:
            if any(row):
                lines.append(" - ".join(str(item).strip() for item in row if str(item).strip()))
        prices_text = "\n".join(lines)
        
    elif file.filename.endswith(".xlsx"):
        try:
            import pandas as pd
            df = pd.read_excel(io.BytesIO(content))
            lines = []
            for _, row in df.iterrows():
                row_items = [str(item).strip() for item in row if pd.notna(item) and str(item).strip()]
                if row_items:
                    lines.append(" - ".join(row_items))
            prices_text = "\n".join(lines)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Nem sikerült beolvasni az Excel fájlt: {e}")
    else:
        raise HTTPException(status_code=400, detail="Kizárólag .csv vagy .xlsx fájl tölthető fel!")
        
    if not prices_text.strip():
        raise HTTPException(status_code=400, detail="A fájl üres vagy nem tartalmaz értelmezhető adatot.")
        
    data = {}
    if PRAXISINFO_FILE.exists():
        try:
            data = json.loads(PRAXISINFO_FILE.read_text(encoding="utf-8"))
        except:
            pass
            
    data["price_list"] = prices_text
    data["price_list_file_meta"] = {
        "filename": file.filename,
        "uploaded_at": datetime.now().strftime("%Y. %m. %d.")
    }
    
    PRAXISINFO_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    
    return {
        "ok": True, 
        "message": "Árlista sikeresen feltöltve és feldolgozva.", 
        "price_list": prices_text,
        "price_list_file_meta": data["price_list_file_meta"]
    }



@app.get("/admin/api/cartesia/voices")
async def cartesia_voices(username: str = Depends(verify_jwt)):
    """Proxy: list available Cartesia voices."""
    api_key = os.getenv("CARTESIA_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=503, detail="CARTESIA_API_KEY nincs beállítva")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://api.cartesia.ai/voices",
                headers={"X-API-Key": api_key, "Cartesia-Version": "2024-06-10"}
            )
        return resp.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Cartesia API hiba: {e}")


# ═══════════════════════════════════════════════════════════════════════════════
# SIP OUTBOUND CALL API
# ═══════════════════════════════════════════════════════════════════════════════

class SipCallRequest(BaseModel):
    phone_number: str   # E.164 format pl. +36301234567
    note: str = ""      # Megjegyzés
    script: str = ""    # Szöveg amit az AI-nak el kell mondania a hívás során
    client_name: str = ""  # Ügyfél neve (személyre szabáshoz)

@app.post("/admin/api/sip/call")
async def sip_outbound_call(req: SipCallRequest, username: str = Depends(verify_jwt)):
    """Kimenő SIP hívás indítása az AI agenttel — opcionális scripttel."""
    from livekit import api as lk_api_module

    lk_url    = os.getenv("LIVEKIT_URL")
    lk_key    = os.getenv("LIVEKIT_API_KEY")
    lk_secret = os.getenv("LIVEKIT_API_SECRET")
    trunk_id  = os.getenv("SIP_OUTBOUND_TRUNK_ID", "ST_jgPctgJYZcAf")  # Telnyx HD Voice outbound

    phone = req.phone_number.strip()
    if not phone.startswith("+"):
        phone = "+" + phone

    # Egyedi szoba a híváshoz
    room_name = f"call-out-{uuid.uuid4().hex[:8]}"

    # Ha van script, metadata-ba tesszük hogy az agent megkapja
    call_metadata = None
    if req.script and req.script.strip():
        call_metadata = json.dumps({
            "type": "outbound_script_call",
            "script": req.script.strip(),
            "client_name": req.client_name.strip() if req.client_name else "",
            "call_note": req.note.strip() if req.note else ""
        })

    try:
        lk = lk_api_module.LiveKitAPI(url=lk_url, api_key=lk_key, api_secret=lk_secret)

        # 1. Szoba létrehozása (metadata-val ha van script)
        await lk.room.create_room(
            lk_api_module.CreateRoomRequest(
                name=room_name,
                empty_timeout=120,
                metadata=call_metadata or "",
            )
        )

        # 2. Először SIP hívás -- megvárjuk amíg felveszik
        participant = await lk.sip.create_sip_participant(
            lk_api_module.CreateSIPParticipantRequest(
                sip_trunk_id=trunk_id,
                sip_call_to=phone,
                room_name=room_name,
                participant_identity="phone-caller",
                participant_name=phone,
                wait_until_answered=True,
                krisp_enabled=True,
            )
        )

        # 3. Csak ha felvették: agent dispatch (metadata-val ha van script)
        await lk.agent_dispatch.create_dispatch(
            lk_api_module.CreateAgentDispatchRequest(
                agent_name="dobozos-ai",
                room=room_name,
                metadata=call_metadata or "outbound_call",
            )
        )

        await lk.aclose()

        return {
            "ok": True,
            "room": room_name,
            "phone": phone,
            "participant": participant.participant_identity,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Hívás sikertelen: {str(e)}")




# ═══════════════════════════════════════════════════════════════════════════════
# JÓVÁHAGYÓ RENDSZER (HUMAN-IN-THE-LOOP) API
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/admin/api/approvals")
def get_approvals_api(status: str = "pending", username: str = Depends(verify_jwt)):
    approvals = db.get_approvals(status)
    return {"approvals": approvals}

@app.post("/admin/api/approvals/{id}/reject")
def reject_approval_api(id: int, username: str = Depends(verify_jwt)):
    success = db.update_approval_status(id, "rejected")
    if success: return {"status": "success"}
    raise HTTPException(status_code=500, detail="Hiba az elutasítás során")

class DeleteApprovalsRequest(BaseModel):
    ids: list[int]

@app.delete("/admin/api/approvals")
def delete_approvals_api(req: DeleteApprovalsRequest, username: str = Depends(verify_jwt)):
    success = db.delete_approvals(req.ids)
    if success: return {"status": "success"}
    raise HTTPException(status_code=500, detail="Hiba a törlés során")

class ApproveRequest(BaseModel):
    modified_draft: str

@app.post("/admin/api/approvals/{id}/approve")
async def approve_approval_api(id: int, req: ApproveRequest, username: str = Depends(verify_jwt)):
    import json
    import httpx
    import base64 as b64module
    
    # 1. Keresés a pending és rejected listában (hátha egy rejected-et hagynak jóvá utólag)
    approvals = db.get_approvals("pending") + db.get_approvals("rejected")
    target = next((a for a in approvals if a.get("id") == id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Piszkozat nem található")
        
    draft_json = target.get("ai_draft_response")
    if not draft_json:
        raise HTTPException(status_code=400, detail="Nincs érvényes piszkozat")
        
    try:
        draft = json.loads(draft_json)
    except:
        raise HTTPException(status_code=400, detail="Érvénytelen JSON piszkozat")
        
    channel = draft.get("channel", "").lower()
    final_text = req.modified_draft
    
    # Multi-channel kampány piszkozat kezelése
    drafts_to_send = []
    if draft.get("multi_channel") and draft.get("drafts"):
        for sub_draft in draft["drafts"]:
            drafts_to_send.append(sub_draft)
    else:
        drafts_to_send.append(draft)
    
    try:
        async with httpx.AsyncClient() as http_client:
            for send_draft in drafts_to_send:
                ch = send_draft.get("channel", "").lower()
                # A szöveget a fő draft-ból vesszük (amit az admin szerkesztett), de
                # multi_channel esetén minden csatornának a saját szövegét használjuk
                send_text = send_draft.get("body", final_text) if draft.get("multi_channel") else final_text

                if ch == "email":
                    brevo_key = os.getenv("BREVO_API_KEY", "")
                    api_key = brevo_key
                    if brevo_key and not brevo_key.startswith("xkeysib-"):
                        try:
                            decoded = b64module.b64decode(brevo_key).decode()
                            parsed = json.loads(decoded)
                            api_key = parsed.get("api_key", brevo_key)
                        except: pass
                    
                    html_body = f'<div style="font-family: Arial, sans-serif;">{send_text.replace(chr(10), "<br>")}</div>'
                    if send_draft.get("event_id"):
                        import email_processor
                        html_body += email_processor.get_cancellation_html(send_draft.get("event_id"))

                    resp = await http_client.post(
                        "https://api.brevo.com/v3/smtp/email",
                        headers={"api-key": api_key, "Content-Type": "application/json"},
                        json={
                            "sender": {"name": "Bégé Design Kft.", "email": "bege@thinkai.hu"},
                            "to": [{"email": send_draft.get("to_email"), "name": send_draft.get("to_name", "")}],
                            "subject": send_draft.get("subject", "Re:"),
                            "htmlContent": html_body,
                        },
                        timeout=20,
                    )
                    resp.raise_for_status()
                    print(f"[Approval] Email elküldve: {send_draft.get('to_email')}")
                    
                elif ch == "whatsapp":
                    wa_token = os.getenv("WHATSAPP_TOKEN", os.getenv("META_PAGE_ACCESS_TOKEN", ""))
                    wa_phone_id = send_draft.get("phone_number_id") or os.getenv("WHATSAPP_PHONE_ID", "")
                    if not wa_token or not wa_phone_id:
                        raise Exception("Hiányzó WhatsApp token vagy Phone ID")
                    
                    resp = await http_client.post(
                        f"https://graph.facebook.com/v25.0/{wa_phone_id}/messages",
                        headers={"Authorization": f"Bearer {wa_token}"},
                        json={
                            "messaging_product": "whatsapp",
                            "to": send_draft.get("sender_id"),
                            "type": "text",
                            "text": {"body": send_text}
                        }
                    )
                    resp.raise_for_status()
                    
                elif ch in ["messenger", "instagram"]:
                    page_access_token = os.getenv("META_PAGE_ACCESS_TOKEN", "")
                    if not page_access_token:
                        raise Exception("Hiányzó Meta oldal token")
                        
                    resp = await http_client.post(
                        "https://graph.facebook.com/v25.0/me/messages",
                        headers={"Authorization": f"Bearer {page_access_token}"},
                        json={
                            "recipient": {"id": send_draft.get("sender_id")},
                            "message": {"text": send_text}
                        }
                    )
                    resp.raise_for_status()
                    print(f"[Approval] {ch.capitalize()} elküldve: {send_draft.get('sender_id', '')[:10]}...")

                elif ch == "telefon":
                    # Telefonhívás indítása a jóváhagyott szöveggel mint AI script
                    from livekit import api as lk_api_module

                    lk_url    = os.getenv("LIVEKIT_URL")
                    lk_key    = os.getenv("LIVEKIT_API_KEY")
                    lk_secret = os.getenv("LIVEKIT_API_SECRET")
                    trunk_id  = os.getenv("SIP_OUTBOUND_TRUNK_ID", "ST_jgPctgJYZcAf")  # Telnyx HD Voice outbound

                    call_phone = send_draft.get("phone_number", "")
                    if not call_phone:
                        raise Exception("Hiányzó telefonszám a piszkozatban")
                    if not call_phone.startswith("+"):
                        call_phone = "+" + call_phone

                    call_room = f"call-out-{uuid.uuid4().hex[:8]}"
                    client_name = send_draft.get("to_name", "")
                    call_metadata = json.dumps({
                        "type": "outbound_script_call",
                        "script": send_text,
                        "client_name": client_name,
                        "call_note": send_draft.get("campaign_name", "Jóváhagyott kimenő hívás")
                    })

                    lk = lk_api_module.LiveKitAPI(url=lk_url, api_key=lk_key, api_secret=lk_secret)
                    await lk.room.create_room(
                        lk_api_module.CreateRoomRequest(
                            name=call_room,
                            empty_timeout=120,
                            metadata=call_metadata,
                        )
                    )
                    await lk.sip.create_sip_participant(
                        lk_api_module.CreateSIPParticipantRequest(
                            sip_trunk_id=trunk_id,
                            sip_call_to=call_phone,
                            room_name=call_room,
                            participant_identity="phone-caller",
                            participant_name=call_phone,
                            wait_until_answered=True,
                            krisp_enabled=True,
                        )
                    )
                    await lk.agent_dispatch.create_dispatch(
                        lk_api_module.CreateAgentDispatchRequest(
                            agent_name="dobozos-ai",
                            room=call_room,
                            metadata=call_metadata,
                        )
                    )
                    await lk.aclose()
                    print(f"[Approval] Telefon hívás indítva: {call_phone} (script: {send_text[:50]}...)")
                
    except Exception as e:
        print(f"[Approval Error] Hiba a kiküldéskor: {e}")
        raise HTTPException(status_code=500, detail=str(e))
        
    # 2. Adatbázis frissítése
    draft["body"] = final_text
    new_draft_json = json.dumps(draft)
    success = db.update_approval_status(id, "approved", new_draft=new_draft_json)
    
    if success: return {"status": "success"}
    raise HTTPException(status_code=500, detail="Sikeres küldés, de adatbázis frissítés hibás")


@app.get("/admin/api/clinics")
def get_clinics_api(admin: dict = Depends(verify_jwt)):
    return db.get_clinics()

@app.post("/admin/api/clinics")
def save_clinics_api(clinics: list[dict], admin: dict = Depends(verify_jwt)):
    success = db.save_clinics(clinics)
    if success: return {"status": "ok"}
    raise HTTPException(status_code=500, detail="Failed to save clinics")

class ReminderSettingsRequest(BaseModel):
    reminder_enabled: bool
    reminder_hours: int
    reminder_template: str

@app.get('/admin/api/settings/reminder')
async def get_reminder_settings_endpoint(username: str = Depends(verify_jwt)):
    import database as db
    return db.get_reminder_settings()

@app.post('/admin/api/settings/reminder')
async def save_reminder_settings_endpoint(payload: ReminderSettingsRequest, username: str = Depends(verify_jwt)):
    import database as db
    success = db.update_reminder_settings(payload.reminder_enabled, payload.reminder_hours, payload.reminder_template)
    if success:
        return {'ok': True, 'message': 'Emlékeztető beállítások mentve.'}
    raise HTTPException(status_code=500, detail='Adatbázis hiba mentéskor')


# ═══════════════════════════════════════════════════════════════════════════════
# ESEMÉNYVEZÉRELT AUTOMATIZÁCIÓK API
# ═══════════════════════════════════════════════════════════════════════════════

@app.get('/admin/api/outbound_automations')
async def get_outbound_automations_endpoint(username: str = Depends(verify_jwt)):
    import database as db
    return db.get_outbound_automations()

@app.put('/admin/api/outbound_automations/{automation_id}')
async def update_outbound_automation_endpoint(automation_id: int, request: Request, username: str = Depends(verify_jwt)):
    import database as db
    data = await request.json()
    success = db.update_outbound_automation(automation_id, data)
    if success:
        return {'ok': True, 'message': 'Automatizáció frissítve.'}
    raise HTTPException(status_code=500, detail='Hiba az automatizáció mentésekor.')


# ═══════════════════════════════════════════════════════════════════════════════
# KIMENŐ KOMMUNIKÁCIÓ – KAMPÁNY API
# ═══════════════════════════════════════════════════════════════════════════════

class CampaignCreateRequest(BaseModel):
    name: str
    channels: list[str] = ["email"]
    client_ids: list[int]
    ai_instructions: str = ""

@app.get("/admin/api/campaigns")
def get_campaigns_api(username: str = Depends(verify_jwt)):
    campaigns = db.get_campaigns()
    return {"campaigns": campaigns}

@app.post("/admin/api/campaigns")
def create_campaign_api(req: CampaignCreateRequest, username: str = Depends(verify_jwt)):
    campaign_id = db.create_campaign(
        name=req.name,
        channels=req.channels,
        client_ids=req.client_ids,
        ai_instructions=req.ai_instructions
    )
    if campaign_id:
        return {"status": "success", "id": campaign_id}
    raise HTTPException(status_code=500, detail="Kampány létrehozása sikertelen")

@app.post("/admin/api/campaigns/{campaign_id}/start")
async def start_campaign_api(campaign_id: int, username: str = Depends(verify_jwt)):
    campaign = db.get_campaign(campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Kampány nem található")
    channels = campaign.get("channels", [campaign.get("channel", "email")])
    supported = {"email", "messenger", "telefon"}
    active_channels = [ch for ch in channels if ch in supported]
    if not active_channels:
        raise HTTPException(status_code=400, detail="Jelenleg csak email, messenger és telefon kampányok támogatottak")

    db.update_campaign_status(campaign_id, "Aktív")

    # Text-based channels (email, messenger) → draft generation
    text_channels = [ch for ch in active_channels if ch in {"email", "messenger"}]
    if text_channels:
        task = asyncio.create_task(_run_campaign(campaign, text_channels))
        background_tasks.add(task)
        task.add_done_callback(background_tasks.discard)

    # Phone channel → outbound SIP calls with campaign script
    if "telefon" in active_channels:
        phone_task = asyncio.create_task(_run_phone_campaign(campaign))
        background_tasks.add(phone_task)
        phone_task.add_done_callback(background_tasks.discard)

    channel_names = {"email": "Email", "messenger": "Messenger", "telefon": "Telefon (AI hívás)"}
    ch_str = ", ".join(channel_names.get(c, c) for c in active_channels)
    msg_parts = []
    if text_channels:
        msg_parts.append("piszkozatok hamarosan megjelennek a Jóváhagyó rendszerben")
    if "telefon" in active_channels:
        msg_parts.append("AI telefonhívások indulnak")
    return {"status": "success", "message": f"Kampány elindítva ({ch_str}) — {', '.join(msg_parts)}."}

@app.post("/admin/api/campaigns/{campaign_id}/stop")
def stop_campaign_api(campaign_id: int, username: str = Depends(verify_jwt)):
    campaign = db.get_campaign(campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Kampány nem található")
    db.update_campaign_status(campaign_id, "Megállítva")
    return {"status": "success"}

@app.delete("/admin/api/campaigns/{campaign_id}")
def delete_campaign_api(campaign_id: int, username: str = Depends(verify_jwt)):
    success = db.delete_campaign(campaign_id)
    if success:
        return {"status": "success"}
    raise HTTPException(status_code=500, detail="Törlés sikertelen")

@app.post("/admin/api/campaigns/generate_message")
async def generate_campaign_message(request: Request, username: str = Depends(verify_jwt)):
    """AI kampány varázsló — üzenet generálás Gemini-vel."""
    data = await request.json()
    brief = data.get("brief", "")
    style = data.get("style", "barátságos")
    channel = data.get("channel", "email")
    
    if not brief:
        raise HTTPException(status_code=400, detail="A kampány brief megadása kötelező.")
    
    max_lengths = {"email": "1500 karakter", "whatsapp": "500 karakter", "sms": "160 karakter", "instagram": "300 karakter", "telefon": "500 karakter (beszélt szöveg)"}
    max_len = max_lengths.get(channel, "1000 karakter")
    
    style_instructions = {
        "hivatalos": "Hivatalos, professzionális hangvétel. Magázódás, formális stílus.",
        "barátságos": "Barátságos, közvetlen hangvétel. Tegezés, meleg tónus.",
        "akciós": "Figyelemfelkeltő, akciós hangvétel. Sürgős, limitált ajánlat érzés. Emojik használata.",
        "személyes": "Személyes, intim hangvétel. Mintha egy barát írna. Közvetlen, egyedi."
    }
    style_desc = style_instructions.get(style, style_instructions["barátságos"])
    
    google_key = os.getenv("GOOGLE_API_KEY")
    if not google_key:
        raise HTTPException(status_code=500, detail="Nincs GOOGLE_API_KEY beállítva.")
    
    try:
        from google import genai
        from google.genai import types
        client = genai.Client(api_key=google_key)
        
        if channel == "telefon":
            prompt = f"""Írj egy telefonos hívás scriptet az alábbi paraméterek alapján:

KAMPÁNY BRIEF: {brief}

STÍLUS: {style_desc}

SZABÁLYOK:
- Ez egy AI telefonhívás scriptje — az AI agent ezt fogja ELMONDANI az ügyfélnek
- Természetes, beszélgetős stílusú legyen (NE legyen olvasott szöveg érzése)
- Kezdd köszönéssel és bemutatkozással
- Mondd el az ajánlatot/üzenetet röviden és érthetően (max 2-3 mondat egyszerre)
- Legyen benne reakció lehetőség (pl. "Mit gondol erről?" / "Érdekli?")
- Ha az ügyfél nem érdeklődik, udvariasan búcsúzz el
- Maximum {max_len}
- Magyarul

Csak a kész scriptet add vissza, semmi mást."""
        else:
            prompt = f"""Írj egy kampány üzenetet az alábbi paraméterek alapján:

KAMPÁNY BRIEF: {brief}

STÍLUS: {style_desc}

CSATORNA: {channel} (maximum {max_len})

SZABÁLYOK:
- Az üzenet legyen célratörő és hatásos
- NE használj HTML tageket, csak sima szöveget
- Listákhoz kötőjelet használj
- Az üzenet végén legyen egy call-to-action
- Ha {channel} == "sms", nagyon rövid legyen (max 160 karakter)
- Nem kell aláírás sor

Csak a kész üzenet szöveget add vissza, semmi mást."""

        response = await client.aio.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(temperature=0.7)
        )
        generated = response.text.strip()
        return {"message": generated, "style": style, "channel": channel}
    except Exception as e:
        logger.error(f"Campaign message generation error: {e}")
        raise HTTPException(status_code=500, detail=f"AI generálási hiba: {str(e)}")

@app.get("/admin/api/campaigns/{campaign_id}/clients")
def get_campaign_clients_api(campaign_id: int, username: str = Depends(verify_jwt)):
    campaign = db.get_campaign(campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Kampány nem található")
    client_ids = campaign.get("client_ids", [])
    clients = db.get_clients_by_ids(client_ids)
    result = []
    for c in clients:
        custom = c.get("custom_data", {})
        if isinstance(custom, str):
            try:
                custom = json.loads(custom)
            except:
                custom = {}
        result.append({
            "id": c.get("id"),
            "name": custom.get("name") or c.get("name", "Névtelen"),
            "email": custom.get("email") or c.get("email", "-"),
            "phone": custom.get("phone") or c.get("phone", "-"),
            "status": c.get("status", "-")
        })
    return {"clients": result, "campaign_name": campaign.get("name", "")}


async def _run_campaign(campaign: dict, active_channels: list[str]):
    """Háttérfolyamat: végigmegy a kampány ügyfelein, AI-val generál piszkozatokat az aktív csatornákra."""
    from google import genai
    from google.genai import types
    from prompt_utils import get_system_prompt

    campaign_id = campaign["id"]
    campaign_name = campaign["name"]
    ai_instructions = campaign.get("ai_instructions", "")
    client_ids = campaign.get("client_ids", [])

    google_key = os.getenv("GOOGLE_API_KEY")
    if not google_key:
        print(f"[Campaign] GOOGLE_API_KEY hiányzik, kampány megszakítva: {campaign_name}")
        db.update_campaign_status(campaign_id, "Megállítva")
        return

    clients = db.get_clients_by_ids(client_ids)
    if not clients:
        print(f"[Campaign] Nem találhatók ügyfelek, kampány lezárva: {campaign_name}")
        db.update_campaign_status(campaign_id, "Befejezett", processed_count=0)
        return

    base_system_prompt = get_system_prompt()
    gemini_client = genai.Client(api_key=google_key)
    processed = 0

    for client in clients:
        current = db.get_campaign(campaign_id)
        if not current or current.get("status") == "Megállítva":
            print(f"[Campaign] Kampány megállítva: {campaign_name}")
            return

        custom_data = client.get("custom_data", {})
        if isinstance(custom_data, str):
            try:
                custom_data = json.loads(custom_data)
            except:
                custom_data = {}

        client_email = custom_data.get("email") or client.get("email", "")
        client_name = custom_data.get("name") or client.get("name", "Névtelen")
        client_messenger_id = custom_data.get("messenger_id", "")
        client_phone = custom_data.get("phone", "")

        interaction_log = client.get("interaction_log", "")
        if not interaction_log:
            interaction_log = custom_data.get("beszelgetes_naplo", "")

        user_context = f"Ügyfél neve: {client_name}\n"
        if client_email and client_email != "-":
            user_context += f"Ügyfél email: {client_email}\n"
        if client_phone:
            user_context += f"Telefon: {client_phone}\n"
        if interaction_log:
            log_snippet = interaction_log[-1500:] if len(interaction_log) > 1500 else interaction_log
            user_context += f"\nKorábbi előzmények:\n{log_snippet}\n"

        # === Piszkozatok generálása minden aktív csatornára ===
        drafts = []

        if "email" in active_channels and client_email and client_email != "-":
            email_prompt = f"""{base_system_prompt}

--- KIMENŐ KAMPÁNY UTASÍTÁS (EMAIL) ---
Te most egy kimenő email kampány részeként írsz személyre szabott üzenetet.
A kampány neve: {campaign_name}

Az admin utasítása:
{ai_instructions if ai_instructions else "Nincs külön utasítás – írj egy kedves, releváns megkeresést."}

FELADATOD:
Írj egy rövid, személyre szabott email üzenetet az ügyfélnek.
- Kedves, de célratörő megszólítás
- Ha van korábbi előzmény, hivatkozz rá
- NE használj HTML tag-eket
- A válaszod KIZÁRÓLAG az email szövege legyen
"""
            try:
                response = await gemini_client.aio.models.generate_content(
                    model="gemini-2.5-flash",
                    contents=user_context,
                    config=types.GenerateContentConfig(system_instruction=email_prompt, temperature=0.4)
                )
                drafts.append({
                    "channel": "Email",
                    "to_email": client_email,
                    "to_name": client_name,
                    "subject": campaign_name,
                    "body": response.text.strip()
                })
                print(f"[Campaign] Email piszkozat generálva: {client_name} <{client_email}>")
            except Exception as e:
                print(f"[Campaign] Gemini email hiba ({client_name}): {e}")

        if "messenger" in active_channels and client_messenger_id:
            messenger_prompt = f"""{base_system_prompt}

--- KIMENŐ KAMPÁNY UTASÍTÁS (MESSENGER) ---
Te most egy kimenő Messenger kampány részeként írsz személyre szabott üzenetet.
A kampány neve: {campaign_name}

Az admin utasítása:
{ai_instructions if ai_instructions else "Nincs külön utasítás – írj egy kedves, releváns megkeresést."}

FELADATOD:
Írj egy rövid, személyre szabott Messenger üzenetet az ügyfélnek.
- Legyen rövid és közvetlen (max 3-4 mondat)
- Messenger stílusú: barátságos, informális
- NE használj semmilyen formázást, csak sima szöveg
- A válaszod KIZÁRÓLAG az üzenet szövege legyen
"""
            try:
                response = await gemini_client.aio.models.generate_content(
                    model="gemini-2.5-flash",
                    contents=user_context,
                    config=types.GenerateContentConfig(system_instruction=messenger_prompt, temperature=0.5)
                )
                drafts.append({
                    "channel": "Messenger",
                    "sender_id": client_messenger_id,
                    "to_name": client_name,
                    "body": response.text.strip()
                })
                print(f"[Campaign] Messenger piszkozat generálva: {client_name}")
            except Exception as e:
                print(f"[Campaign] Gemini messenger hiba ({client_name}): {e}")

        if not drafts:
            continue

        # Egy összevont piszkozat az összes csatornával
        if len(drafts) == 1:
            combined_payload = drafts[0]
            combined_payload["campaign_name"] = campaign_name
        else:
            combined_payload = {
                "multi_channel": True,
                "campaign_name": campaign_name,
                "to_name": client_name,
                "body": drafts[0].get("body", ""),
                "drafts": drafts
            }

        channel_names_list = [d["channel"] for d in drafts]
        ch_display = " + ".join(channel_names_list)
        session_id = f"campaign_{campaign_id}_{client['id']}"
        db.create_session(session_id=session_id, room_name=f"Kampány: {campaign_name}", participant=client_name)
        db.log_interaction(
            type=ch_display,
            topic=f"Kampány: {campaign_name}",
            summary=f"Kimenő kampány ({ch_display}) – {client_name}",
            result="Várakozik jóváhagyásra",
            tool_name="campaign_worker",
            session_id=session_id,
            direction="outbound",
            funnel_stage="relevans",
            alert_tags=[],
            handover_reason=None,
            approval_status="pending",
            ai_draft_response=json.dumps(combined_payload)
        )

        processed += 1
        db.update_campaign_status(campaign_id, "Aktív", processed_count=processed)
        print(f"[Campaign] Piszkozat kész ({processed}/{len(clients)}): {client_name} [{ch_display}]")
        await asyncio.sleep(1)

    db.update_campaign_status(campaign_id, "Befejezett", processed_count=processed)
    ch_str = ", ".join(active_channels)
    print(f"[Campaign] Kampány befejezve: {campaign_name} ({ch_str}) – {processed} piszkozat generálva")


async def _run_phone_campaign(campaign: dict):
    """Háttérfolyamat: végigmegy a kampány ügyfelein és AI telefonhívást indít mindegyiknek."""
    from livekit import api as lk_api_module

    campaign_id = campaign["id"]
    campaign_name = campaign["name"]
    ai_instructions = campaign.get("ai_instructions", "")
    client_ids = campaign.get("client_ids", [])

    lk_url    = os.getenv("LIVEKIT_URL")
    lk_key    = os.getenv("LIVEKIT_API_KEY")
    lk_secret = os.getenv("LIVEKIT_API_SECRET")
    trunk_id  = os.getenv("SIP_OUTBOUND_TRUNK_ID", "ST_jgPctgJYZcAf")  # Telnyx HD Voice outbound

    if not all([lk_url, lk_key, lk_secret]):
        print(f"[PhoneCampaign] LiveKit credentials hiányzik, kampány megszakítva: {campaign_name}")
        db.update_campaign_status(campaign_id, "Megállítva")
        return

    clients = db.get_clients_by_ids(client_ids)
    if not clients:
        print(f"[PhoneCampaign] Nem találhatók ügyfelek, kampány lezárva: {campaign_name}")
        db.update_campaign_status(campaign_id, "Befejezett", processed_count=0)
        return

    processed = 0
    failed = 0

    for client in clients:
        # Check if campaign was stopped
        current = db.get_campaign(campaign_id)
        if not current or current.get("status") == "Megállítva":
            print(f"[PhoneCampaign] Kampány megállítva: {campaign_name}")
            return

        custom_data = client.get("custom_data", {})
        if isinstance(custom_data, str):
            try:
                custom_data = json.loads(custom_data)
            except:
                custom_data = {}

        client_name = custom_data.get("name") or client.get("name", "Névtelen")
        client_phone = custom_data.get("phone") or client.get("phone", "")

        if not client_phone or client_phone == "-":
            print(f"[PhoneCampaign] Nincs telefonszám: {client_name}, kihagyva")
            continue

        # Normalize phone number
        phone = client_phone.strip()
        if not phone.startswith("+"):
            phone = "+" + phone

        # Build campaign metadata for the agent
        campaign_metadata = json.dumps({
            "type": "campaign_call",
            "campaign_id": campaign_id,
            "campaign_name": campaign_name,
            "client_name": client_name,
            "script": ai_instructions
        })

        room_name = f"call-out-camp-{campaign_id}-{uuid.uuid4().hex[:6]}"

        try:
            lk = lk_api_module.LiveKitAPI(url=lk_url, api_key=lk_key, api_secret=lk_secret)

            # 1. Create room with campaign metadata
            await lk.room.create_room(
                lk_api_module.CreateRoomRequest(
                    name=room_name,
                    empty_timeout=120,
                    metadata=campaign_metadata,
                )
            )

            # 2. SIP call — wait for answer
            participant = await lk.sip.create_sip_participant(
                lk_api_module.CreateSIPParticipantRequest(
                    sip_trunk_id=trunk_id,
                    sip_call_to=phone,
                    room_name=room_name,
                    participant_identity="phone-caller",
                    participant_name=phone,
                    wait_until_answered=True,
                    krisp_enabled=True,
                )
            )

            # 3. Dispatch agent with campaign metadata
            await lk.agent_dispatch.create_dispatch(
                lk_api_module.CreateAgentDispatchRequest(
                    agent_name="dobozos-ai",
                    room=room_name,
                    metadata=campaign_metadata,
                )
            )

            await lk.aclose()

            # Log the interaction
            session_id = f"campaign_phone_{campaign_id}_{client['id']}"
            db.create_session(session_id=session_id, room_name=f"Kampány hívás: {campaign_name}", participant=client_name)
            db.log_interaction(
                type="Telefon",
                topic=f"Kampány: {campaign_name}",
                summary=f"Kimenő AI telefonhívás – {client_name} ({phone})",
                result="Hívás indítva",
                tool_name="phone_campaign_worker",
                session_id=session_id,
                direction="outbound",
                funnel_stage="relevans",
                alert_tags=[],
                handover_reason=None,
            )

            processed += 1
            db.update_campaign_status(campaign_id, "Aktív", processed_count=processed)
            print(f"[PhoneCampaign] Hivas inditva ({processed}/{len(clients)}): {client_name} -> {phone}")

            # Wait between calls (15 sec) to avoid overwhelming + let calls finish
            await asyncio.sleep(15)

        except Exception as e:
            failed += 1
            print(f"[PhoneCampaign] Hivas sikertelen ({client_name} -> {phone}): {e}")
            await asyncio.sleep(3)

    db.update_campaign_status(campaign_id, "Befejezett", processed_count=processed)
    print(f"[PhoneCampaign] Kampany befejezve: {campaign_name} - {processed} hivas, {failed} sikertelen")


@app.get('/api/public/cancel')
async def public_cancel_appointment(token: str):
    from fastapi.responses import HTMLResponse
    import jwt as pyjwt
    import database as db
    try:
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        event_id = payload.get("event_id")
        if not event_id:
            raise ValueError("No event_id in token")
        
        # Mark client as cancelled if found
        event = db.get_calendar_event(event_id)
        if event:
            client = None
            email = event.get("attendee_email")
            if email and email != "-":
                client = db.find_client_by_contact(email=email)
            
            # Fallback to search by name
            if not client:
                name = event.get("attendee")
                if name and name != "-":
                    res = db.supabase.table("clients").select("*").ilike("name", f"%{name}%").order("id", desc=True).limit(1).execute()
                    if res.data:
                        client = res.data[0]

            # If still no client found, CREATE ONE to ensure Kanban and Toast work!
            if not client:
                name = event.get("attendee") or "Ismeretlen"
                email = event.get("attendee_email") or ""
                if name != "-" or email != "-":
                    new_client_id = db.add_client({
                        "name": name,
                        "email": email,
                        "phone": "",
                        "forras_csatorna": "Rendszer (Lemondás)"
                    }, status="lemondott")
                    if new_client_id:
                        client = {"id": new_client_id, "custom_data": {}}

            if client:
                custom_data = client.get("custom_data")
                if isinstance(custom_data, str):
                    try:
                        custom_data = json.loads(custom_data)
                    except:
                        custom_data = {}
                if not isinstance(custom_data, dict):
                    custom_data = {}
                
                custom_data["cancelled_viewed"] = False
                db.edit_client_details(client["id"], custom_data)
                db.update_client_status(client["id"], "lemondott")

        # Delete from calendar
        success = db.delete_calendar_event(event_id)
        
        if success:
            html = """
            <html>
            <head><title>Sikeres lemondás</title><meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                body { font-family: 'Segoe UI', Arial, sans-serif; background: #f9fafb; text-align: center; padding: 50px 20px; color: #333; }
                .box { background: white; max-width: 500px; margin: 0 auto; padding: 40px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
                h1 { color: #10b981; margin-bottom: 20px; }
                p { font-size: 16px; line-height: 1.5; color: #6b7280; }
                .icon { font-size: 48px; margin-bottom: 20px; }
            </style>
            </head>
            <body>
                <div class="box">
                    <div class="icon">✅</div>
                    <h1>Időpont sikeresen lemondva!</h1>
                    <p>Köszönjük, hogy jelezte felénk. Az időpont törlésre került a naptárunkból.</p>
                </div>
            </body>
            </html>
            """
        else:
            html = """
            <html>
            <head><title>Hiba a lemondásnál</title><meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                body { font-family: 'Segoe UI', Arial, sans-serif; background: #f9fafb; text-align: center; padding: 50px 20px; color: #333; }
                .box { background: white; max-width: 500px; margin: 0 auto; padding: 40px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
                h1 { color: #ef4444; margin-bottom: 20px; }
                p { font-size: 16px; line-height: 1.5; color: #6b7280; }
            </style>
            </head>
            <body>
                <div class="box">
                    <h1>Sikertelen lemondás</h1>
                    <p>Ezt az időpontot már korábban lemondták, vagy a hivatkozás érvénytelen.</p>
                </div>
            </body>
            </html>
            """
        return HTMLResponse(content=html, status_code=200)
    except Exception as e:
        html = f"""
        <html>
        <head><title>Érvénytelen link</title><meta charset="utf-8">
        <style>body {{ font-family: sans-serif; text-align: center; padding: 50px; color: #333; }}</style>
        </head>
        <body>
            <h1>Érvénytelen vagy lejárt link</h1>
            <p>Kérjük, vegye fel a kapcsolatot ügyfélszolgálatunkkal.</p>
        </body>
        </html>
        """
        return HTMLResponse(content=html, status_code=400)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
