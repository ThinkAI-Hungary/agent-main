"""
ThinkAI Voice Agent — Tool Implementations (LiveKit Agents v1.4)
Function tools using @function_tool decorator for the voice assistant.
"""

import os
import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Annotated
import re

import httpx
from livekit.agents import function_tool, RunContext
from loguru import logger
import asyncio

import database as db
import email_processor


# ── Paths ────────────────────────────────────────────────────────────────────
THIS_DIR = Path(__file__).resolve().parent

# Context var for current session_id (set by server.py entrypoint)
_current_session_id: str = ""

def set_session_id(sid: str):
    global _current_session_id
    _current_session_id = sid


# ── Hungarian date/time parsing ─────────────────────────────────────────────
_HU_MONTHS = {
    "január": 1, "jan": 1,
    "február": 2, "feb": 2,
    "március": 3, "márc": 3, "mar": 3,
    "április": 4, "ápr": 4,
    "május": 5, "máj": 5,
    "június": 6, "jún": 6,
    "július": 7, "júl": 7,
    "augusztus": 8, "aug": 8,
    "szeptember": 9, "szept": 9, "szep": 9,
    "október": 10, "okt": 10,
    "november": 11, "nov": 11,
    "december": 12, "dec": 12,
}


def _parse_hungarian_date(raw: str) -> str:
    """Parse various date formats into YYYY-MM-DD.

    Accepts: '2026-03-11', 'március 11', 'márc 11', '03/11', '03.11',
             'március 11-én', '11. március', etc.
    """
    raw = raw.strip().rstrip(".")

    # Already ISO format
    if re.match(r"^\d{4}-\d{2}-\d{2}$", raw):
        return raw

    year = datetime.utcnow().year

    # "március 11" / "márc 11" / "március 11-én" / "március 11."
    for name, month_num in _HU_MONTHS.items():
        if name in raw.lower():
            day_match = re.search(r"(\d{1,2})", raw)
            if day_match:
                day = int(day_match.group(1))
                return f"{year}-{month_num:02d}-{day:02d}"

    # "03/11" or "03.11" or "3/11"
    m = re.match(r"^(\d{1,2})[/\.](\d{1,2})$", raw)
    if m:
        return f"{year}-{int(m.group(1)):02d}-{int(m.group(2)):02d}"

    # "2026.03.11" or "2026/03/11"
    m = re.match(r"^(\d{4})[/\.](\d{1,2})[/\.](\d{1,2})$", raw)
    if m:
        return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"

    # Last resort: try fromisoformat
    try:
        return datetime.fromisoformat(raw).strftime("%Y-%m-%d")
    except Exception:
        pass

    raise ValueError(f"Nem értelmezhető dátum: '{raw}'")


def _parse_hungarian_time(raw: str) -> str:
    """Parse various time formats into HH:MM.

    Accepts: '10:00', '10 óra', '10h', 'délelőtt 10', '14:30', '10'
    """
    raw = raw.strip().lower()

    # Already HH:MM
    m = re.match(r"^(\d{1,2}):(\d{2})$", raw)
    if m:
        return f"{int(m.group(1)):02d}:{m.group(2)}"

    # "10 óra" / "10h" / "délelőtt 10" / "délután 3"
    m = re.search(r"(\d{1,2})", raw)
    if m:
        hour = int(m.group(1))
        if "délután" in raw or "du" in raw:
            if hour < 12:
                hour += 12
        return f"{hour:02d}:00"

    raise ValueError(f"Nem értelmezhető időpont: '{raw}'")




# ═══════════════════════════════════════════════════════════════════════════════
# 1. SEND FOLLOW-UP EMAIL (Brevo Transactional API) — also logs to emails.json
# ═══════════════════════════════════════════════════════════════════════════════

@function_tool(description="Follow-up email küldése egy érdeklődőnek vagy ügyfélnek. Használd, ha a felhasználó emailt szeretne küldeni valakinek.")
async def send_followup_email(
    ctx: RunContext,
    recipient_name: Annotated[str, "A címzett neve"],
    recipient_email: Annotated[str, "A címzett email címe"],
    message: Annotated[str, "Az email szövegtörzse (rövid, barátságos, szakmai)"],
    subject: Annotated[str, "Az email tárgya"] = "ThinkAI — Köszönjük érdeklődését!",
    funnel_stage: Annotated[str, "A beszélgetés állapota: 'irrelevant', 'relevant', 'valaszolt', 'ajanlat', 'foglalt'"] = "valaszolt",
) -> str:
    """Follow-up email küldése egy érdeklődőnek."""
    raw_key = os.getenv("BREVO_API_KEY", "")
    # Try raw key first. If it looks base64-encoded (no hyphens, starts with 'ey'), try decoding.
    api_key = raw_key
    if raw_key and not raw_key.startswith("xkeysib-"):
        try:
            import base64 as b64module
            decoded = b64module.b64decode(raw_key).decode()
            parsed = json.loads(decoded)
            api_key = parsed.get("api_key", raw_key)
            logger.info("Brevo key: decoded from base64/JSON")
        except Exception:
            api_key = raw_key
    logger.info(f"Brevo key starts with: {api_key[:12]}...")
    logger.info(f"Sending follow-up email to {recipient_name} <{recipient_email}>")

    # ── ÉLES MÓD: Brevo e-mail küldés ──────────────────────
    sent_ok = False
    error_msg = ""
    status_str = "sent"

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://api.brevo.com/v3/smtp/email",
                headers={"api-key": api_key, "Content-Type": "application/json"},
                json={
                    "sender": {"name": "Bégé Design Kft.", "email": "bege@thinkai.hu"},
                    "to": [{"email": recipient_email, "name": recipient_name}],
                    "subject": subject,
                    "htmlContent": f"""
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        {message}
                    </div>
                    """,
                },
                timeout=20,
            )
            resp.raise_for_status()
            sent_ok = True
    except Exception as e:
        logger.error(f"Email error: {e}")
        error_msg = str(e)
        status_str = f"failed ({error_msg})"

    # Log to DB
    db.add_email_log(
        to_name=recipient_name,
        to_email=recipient_email,
        subject=subject,
        message=message,
        status=status_str,
        error=error_msg,
        session_id=_current_session_id,
    )
    db.log_interaction(
        type="email",
        topic="Email küldés",
        summary=f"{recipient_name} ({recipient_email}) — {subject}",
        result=f"Küldés {'sikeres' if sent_ok else 'sikertelen'}",
        tool_name="send_followup_email",
        session_id=_current_session_id,
        funnel_stage=funnel_stage,
    )

    if sent_ok:
        return f"Email sikeresen elküldve {recipient_name} ({recipient_email}) részére."
    else:
        return f"Hiba az email küldésekor: {error_msg}"


# ═══════════════════════════════════════════════════════════════════════════════
# 2. CHECK CALENDAR (local JSON store)
# ═══════════════════════════════════════════════════════════════════════════════

@function_tool(description="Naptár ellenőrzése: megnézi, milyen események vannak a következő napokban. Használd, ha a felhasználó időpontot keres vagy tudni akarja, mikor szabad a naptár.")
async def check_calendar(
    ctx: RunContext,
    days_ahead: Annotated[int, "Hány napra előre nézze a naptárat (alapértelmezett: 7)"] = 7,
    funnel_stage: Annotated[str, "A beszélgetés állapota: 'irrelevant', 'relevant', 'valaszolt', 'ajanlat', 'foglalt'"] = "valaszolt",
) -> str:
    """Naptár ellenőrzése a következő napokra."""
    logger.info(f"Checking calendar for next {days_ahead} days")

    events = db.get_calendar_events()
    if not events:
        return f"A következő {days_ahead} napban nincsenek rögzített események — teljesen szabad a naptár!"

    now = datetime.utcnow()
    cutoff = now + timedelta(days=days_ahead)

    upcoming = []
    for ev in events:
        try:
            ev_dt = datetime.fromisoformat(ev["start_dt"])
            if now <= ev_dt <= cutoff:
                upcoming.append(ev)
        except Exception:
            continue

    upcoming.sort(key=lambda e: e["start_dt"])

    if not upcoming:
        return f"A következő {days_ahead} napban nincsenek rögzített események — teljesen szabad a naptár!"

    event_list = []
    for ev in upcoming[:10]:
        try:
            dt = datetime.fromisoformat(ev["start_dt"])
            formatted = dt.strftime("%m/%d %H:%M")
        except Exception:
            formatted = ev["start_dt"]
        title = ev.get("title", "Névtelen esemény")
        duration = ev.get("duration_minutes", 30)
        event_list.append(f"- {formatted}: {title} ({duration} perc)")

    result_text = f"A következő {days_ahead} napban {len(upcoming)} esemény van:\n" + "\n".join(event_list)
    db.log_interaction(
        type="kérdés",
        topic="Naptár ellenőrzés",
        summary=f"Következő {days_ahead} nap, {len(upcoming)} esemény",
        result=f"{len(upcoming)} esemény",
        tool_name="check_calendar",
        session_id=_current_session_id,
        funnel_stage=funnel_stage,
    )
    return result_text


# ═══════════════════════════════════════════════════════════════════════════════
# 3. BOOK A MEETING (local JSON store)
# ═══════════════════════════════════════════════════════════════════════════════

@function_tool(description="Találkozó/meeting foglalása a naptárba. Használd, ha a felhasználó időpontot szeretne foglalni. KÖTELEZŐ elkérni a felhasználó nevét, telefonszámát és email címét a foglalás előtt! A szolgáltatás és az orvos nevét is próbáld meg kideríteni!")
async def book_meeting(
    ctx: RunContext,
    title: Annotated[str, "A meeting címe/témája"],
    date: Annotated[str, "A meeting dátuma (pl. 2026-03-11, március 11, márc 11)"],
    time: Annotated[str, "A meeting kezdési időpontja (pl. 10:00, 10 óra, 14:30)"],
    attendee: Annotated[str, "A meghívott ügyfél teljes neve (kötelező bekérni)"],
    attendee_phone: Annotated[str, "A meghívott ügyfél telefonszáma (kötelező bekérni)"],
    attendee_email: Annotated[str, "A meghívott ügyfél email címe (kötelező bekérni)"],
    duration_minutes: Annotated[int, "A meeting hossza percben"] = 30,
    service_name: Annotated[str, "A kért szolgáltatás neve (ha megadta az ügyfél, különben 'Általános')"] = "Általános",
    doctor_name: Annotated[str, "A kért orvos neve (ha megadta az ügyfél, különben 'Bármelyik orvos')"] = "Bármelyik orvos",
    additional_info: Annotated[str, "Bármely egyéb kiegészítő adat JSON szövegként (pl. cégnév, lakcím). Hagyd üresen '{}' ha nincsen egyéb."] = "{}",
    funnel_stage: Annotated[str, "A beszélgetés állapota: 'irrelevant', 'relevant', 'valaszolt', 'ajanlat', 'foglalt'"] = "foglalt",
) -> str:
    """Találkozó foglalása a naptárba."""
    logger.info(f"Booking meeting: {title} on {date} at {time}, attendee={attendee}, email={attendee_email}, service={service_name}, doctor={doctor_name}")

    try:
        parsed_date = _parse_hungarian_date(date)
        parsed_time = _parse_hungarian_time(time)
        start_dt = datetime.fromisoformat(f"{parsed_date}T{parsed_time}:00")
        end_dt = start_dt + timedelta(minutes=duration_minutes)

        events = db.get_calendar_events()

        # ── Conflict detection ────────────────────────────────────────
        for ev in events:
            try:
                ev_start = datetime.fromisoformat(ev["start_dt"])
                ev_end = ev_start + timedelta(minutes=ev.get("duration_minutes", 30))
                if start_dt < ev_end and end_dt > ev_start:
                    ev_title = ev.get("title", "Névtelen esemény")
                    ev_time = ev_start.strftime("%H:%M")
                    suggestion = _find_next_slot(events, date, duration_minutes, start_dt)
                    msg = (
                        f"Ütközés! {ev_time}-kor már van egy foglalás: \"{ev_title}\" "
                        f"({ev.get('duration_minutes', 30)} perc)."
                    )
                    if suggestion:
                        msg += f" Javaslat: {suggestion} lenne szabad. Foglaljam erre?"
                    else:
                        msg += " Ezen a napon nincs több szabad hely. Válassz egy másik napot!"
                    return msg
            except Exception:
                continue

        # ── No conflict — book it in Calendar ───────────────────────────
        event_id = db.add_calendar_event(
            title=title,
            start_dt=start_dt.isoformat(),
            end_dt=end_dt.isoformat(),
            duration_minutes=duration_minutes,
            attendee=attendee,
            attendee_email=attendee_email,
        )

        # Trigger automated confirmation email in the background
        if attendee_email:
            asyncio.create_task(email_processor.send_booking_confirmation_email(
                event_id=event_id,
                title=title,
                date=parsed_date,
                time=parsed_time,
                attendee=attendee,
                attendee_email=attendee_email
            ))

        # ── Add to Kanban (Clients Database) ───────────────────────────
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
        custom_data = {
            "name": attendee,
            "email": attendee_email,
            "phone": attendee_phone,
            "forras_csatorna": "Voice Agent",
            "booked_datetime": f"{parsed_date} {parsed_time}",
            "service": service_name,
            "doctor": doctor_name,
            "reminder_sent_at": now_str  # Az azonnali visszaigazoló email ideje
        }
        
        # Merge additional info safely if provided
        try:
            extra = json.loads(additional_info)
            if isinstance(extra, dict):
                custom_data.update(extra)
        except Exception:
            pass
            
        columns = db.get_kanban_columns()
        first_col_id = columns[0]['id'] if columns else 'uj'
        db.upsert_client(custom_data, additional_log=f"Hangasszisztens időpontot foglalt: {date} {time}", status=first_col_id)

        # ── Log interaction ───────────────────────────────────────────
        db.log_interaction(
            type="foglalás",
            topic="Időpontfoglalás",
            summary=f"{title} — {date} {time} | {attendee} <{attendee_email}> ({attendee_phone})",
            result="Lefoglalva + Kanban kártya létrehozva",
            tool_name="book_meeting",
            session_id=_current_session_id,
            funnel_stage=funnel_stage,
        )

        result = f"Találkozó sikeresen lefoglalva: {title}, {date} {time}-kor, {duration_minutes} perces."
        if attendee:
            result += f" Résztvevő: {attendee}."
        if attendee_email:
            result += f" Email: {attendee_email}. A rendszer automatikusan kiküldte a professzionális visszaigazoló emailt a páciensnek a lemondási gombbal együtt. Neked már nem kell emailt küldened!"
        return result
    except Exception as e:
        logger.error(f"Booking error: {e}")
        return f"Hiba a találkozó foglalásakor: {str(e)}"


def _find_next_slot(events: list, date: str, duration: int, after: datetime) -> str | None:
    """Find the next available slot on the given date after the specified time."""
    day_events = []
    for ev in events:
        try:
            ev_start = datetime.fromisoformat(ev["start_dt"])
            if ev_start.strftime("%Y-%m-%d") == date:
                ev_end = ev_start + timedelta(minutes=ev.get("duration_minutes", 30))
                day_events.append((ev_start, ev_end))
        except Exception:
            continue

    day_events.sort(key=lambda x: x[0])

    # Try slots from after_time to 18:00 in 30-min increments
    candidate = after.replace(second=0)
    end_of_day = after.replace(hour=18, minute=0, second=0)

    while candidate + timedelta(minutes=duration) <= end_of_day:
        candidate_end = candidate + timedelta(minutes=duration)
        conflict = any(candidate < ev_end and candidate_end > ev_start for ev_start, ev_end in day_events)
        if not conflict:
            return candidate.strftime("%H:%M")
        candidate += timedelta(minutes=30)

    return None


# ═══════════════════════════════════════════════════════════════════════════════
# 4. WEATHER CHECK (Open-Meteo API — no API key needed!)
# ═══════════════════════════════════════════════════════════════════════════════

CITY_COORDS = {
    "budapest": (47.4979, 19.0402),
    "debrecen": (47.5316, 21.6273),
    "szeged": (46.253, 20.1414),
    "miskolc": (48.1035, 20.7784),
    "pécs": (46.0727, 18.2323),
    "győr": (47.6875, 17.6504),
    "nyíregyháza": (47.9553, 21.7174),
    "kecskemét": (46.8964, 19.6897),
    "székesfehérvár": (47.1860, 18.4221),
    "vienna": (48.2082, 16.3738),
    "bécs": (48.2082, 16.3738),
    "london": (51.5074, -0.1278),
    "new york": (40.7128, -74.0060),
    "paris": (48.8566, 2.3522),
    "párizs": (48.8566, 2.3522),
    "berlin": (52.5200, 13.4050),
}


@function_tool(description="Aktuális időjárás lekérdezése egy városban. Használd, ha a felhasználó az időjárásról kérdez.")
async def get_weather(
    ctx: RunContext,
    city: Annotated[str, "A város neve (pl. Budapest, Debrecen, Bécs)"],
    funnel_stage: Annotated[str, "A beszélgetés állapota: 'irrelevant', 'relevant', 'valaszolt', 'ajanlat', 'foglalt'"] = "irrelevant",
) -> str:
    """Időjárás lekérdezése."""
    city_lower = city.lower().strip()
    coords = CITY_COORDS.get(city_lower, CITY_COORDS["budapest"])
    if city_lower not in CITY_COORDS:
        city = "Budapest"
    lat, lon = coords

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://api.open-meteo.com/v1/forecast",
                params={"latitude": lat, "longitude": lon, "current_weather": "true", "timezone": "Europe/Budapest"},
                timeout=5,
            )
            resp.raise_for_status()
            data = resp.json()

        weather = data.get("current_weather", {})
        temp = weather.get("temperature", "?")
        wind = weather.get("windspeed", "?")
        code = weather.get("weathercode", 0)

        weather_desc = {
            0: "tiszta égbolt", 1: "enyhén felhős", 2: "részben felhős",
            3: "borult", 45: "ködös", 48: "zúzmarás köd",
            51: "enyhe szitálás", 53: "mérsékelt szitálás", 55: "sűrű szitálás",
            61: "enyhe eső", 63: "mérsékelt eső", 65: "erős eső",
            71: "enyhe havazás", 73: "mérsékelt havazás", 75: "erős havazás",
            80: "enyhe zápor", 81: "mérsékelt zápor", 82: "erős zápor",
            95: "zivatar", 96: "jégesős zivatar", 99: "erős jégesős zivatar",
        }.get(code, "ismeretlen")

        result_str = f"{city.title()}: {temp}°C, {weather_desc}, szél {wind} km/h."
        db.log_interaction(
            type="kérdés",
            topic="Időjárás",
            summary=f"{city} időjárás lekérdezve",
            result=f"{temp}°C, {weather_desc}",
            tool_name="get_weather",
            session_id=_current_session_id,
            funnel_stage=funnel_stage,
        )
        return result_str
    except Exception as e:
        logger.error(f"Weather error: {e}")
        return f"Hiba az időjárás lekérdezésekor: {str(e)}"


# ═══════════════════════════════════════════════════════════════════════════════
# 5. CREATE TASK/NOTE (local JSON store)
# ═══════════════════════════════════════════════════════════════════════════════

@function_tool(description="Feladat/teendő/jegyzet rögzítése. Használd, ha a felhasználó jegyezni akar valamit, vagy feladatot szeretne rögzíteni.")
async def create_task(
    ctx: RunContext,
    task: Annotated[str, "A feladat szövege"],
    priority: Annotated[str, "Prioritás: low/normal/high"] = "normal",
    due_date: Annotated[str, "Határidő YYYY-MM-DD formátumban (opcionális)"] = "",
    funnel_stage: Annotated[str, "A beszélgetés állapota: 'irrelevant', 'relevant', 'valaszolt', 'ajanlat', 'foglalt'"] = "valaszolt",
) -> str:
    """Feladat rögzítése."""
    logger.info(f"Creating task: {task}")

    try:
        db.add_task(text=task, priority=priority, due_date=due_date, session_id=_current_session_id)
        db.log_interaction(
            type="feladat",
            topic="Feladat rögzítés",
            summary=task,
            result="Rögzítve",
            tool_name="create_task",
            session_id=_current_session_id,
            funnel_stage=funnel_stage,
        )

        result = f'Feladat rögzítve: "{task}"'
        if due_date:
            result += f" — határidő: {due_date}"
        return result + "."
    except Exception as e:
        logger.error(f"Task error: {e}")
        return f"Hiba a feladat mentésekor: {str(e)}"


# ═══════════════════════════════════════════════════════════════════════════════
# 6. KNOWLEDGE LOOKUP (structured ThinkAI info)
# ═══════════════════════════════════════════════════════════════════════════════

# ── Knowledge base path ──────────────────────────────────────────────────────
KNOWLEDGE_FILE = THIS_DIR / "knowledge.json"


def _load_knowledge() -> dict:
    """Load knowledge base from JSON file."""
    if KNOWLEDGE_FILE.exists():
        try:
            return json.loads(KNOWLEDGE_FILE.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


_TOPIC_ALIASES = {
    # Hungarian terms → knowledge.json key
    "árazás": "pricing", "árak": "pricing", "ár": "pricing", "mennyibe": "pricing",
    "audit": "audit", "átvilágítás": "audit",
    "technológia": "tech_stack", "tech": "tech_stack", "eszközök": "tech_stack",
    "csapat": "team", "csapattagok": "team", "munkatársak": "team", "kik vagytok": "team",
    "eaisy": "eaisy",
    "garancia": "guarantee", "pénzvisszafizetés": "guarantee",
    "pillér": "pillerek", "pillérek": "pillerek", "szolgáltatások": "pillerek",
    "hogyan dolgoztok": "hogyan_dolgozunk", "módszer": "modszerunk", "módszertan": "modszerunk", "folyamat": "hogyan_dolgozunk",
    "szektor": "szektorok", "szektorok": "szektorok", "iparág": "szektorok",
    "sikertörténet": "sikertortenetek", "referencia": "sikertortenetek", "projekt": "sikertortenetek",
    "kapcsolat": "kapcsolat", "elérhetőség": "kapcsolat", "email cím": "kapcsolat",
    "pénzügy": "penzugy", "számvitel": "penzugy",
    "webshop": "ecommerce", "e-kereskedelem": "ecommerce", "ecommerce": "ecommerce",
    "marketing": "marketing", "sales": "marketing", "értékesítés": "marketing",
    "listamester": "listamester",
    "hungarorisk": "hungarorisk", "biztosítás": "hungarorisk",
    "könyvelés": "konyvelesai", "könyvelés ai": "konyvelesai",
    "pályázat": "palyazat", "dimop": "palyazat", "támogatás": "palyazat",
    "pályázati feltételek": "palyazat_feltetelek",
    "ügyfélszolgálat": "ai_ugyfelszolgalat", "ai ügyfélszolgálat": "ai_ugyfelszolgalat",
    "rólunk": "rolunk", "cég": "rolunk", "bemutatkozás": "rolunk",
}


@function_tool(description="ThinkAI belső tudásbázis lekérdezése. Használd, ha a felhasználó bármilyen részletes információt kér a cégről, árazásról, csapatról, szolgáltatásokról, pályázatokról, sikertörténetekről vagy bármi másról. Bármilyen témát megadhatsz szabadon, a rendszer megtalálja a megfelelő információt.")
async def lookup_info(
    ctx: RunContext,
    topic: Annotated[str, "A keresett téma szabadon megadva, pl: 'csapat', 'árazás', 'pályázat', 'garancia', 'ügyfélszolgálat', 'sikertörténetek'"],
    funnel_stage: Annotated[str, "A beszélgetés állapota: 'irrelevant', 'relevant', 'valaszolt', 'ajanlat', 'foglalt'"] = "valaszolt",
) -> str:
    """ThinkAI tudásbázis lekérdezése."""
    kb = _load_knowledge()
    topic_lower = topic.lower().strip()
    logger.info(f"Knowledge lookup: {topic_lower}")

    result = None

    # 1. Exact match
    if topic_lower in kb:
        result = kb[topic_lower]

    # 2. Hungarian aliases
    if not result:
        for alias, key in _TOPIC_ALIASES.items():
            if alias in topic_lower or topic_lower in alias:
                if key in kb:
                    result = kb[key]
                    break

    # 3. Fuzzy key match
    if not result:
        for key, value in kb.items():
            if key in topic_lower or topic_lower in key:
                result = value
                break

    # 4. Full-text value search
    if not result:
        for key, value in kb.items():
            if topic_lower in value.lower():
                result = value
                break

    # 5. Multi-word
    if not result:
        words = topic_lower.split()
        for word in words:
            if len(word) < 3:
                continue
            for alias, key in _TOPIC_ALIASES.items():
                if word in alias or alias in word:
                    if key in kb:
                        result = kb[key]
                        break
            if result:
                break
            for key, value in kb.items():
                if word in key or word in value.lower():
                    result = value
                    break
            if result:
                break

    if not result:
        result = (
            "Erről a témáról nincs részletes információm a tudásbázisban. "
            "Részletesebb információért keresd a csapatot a hello@thinkai.hu címen!"
        )

    db.log_interaction(
        type="kérdés",
        topic=f"Tudásbázis: {topic}",
        summary=topic,
        result=result[:100] + "..." if len(result) > 100 else result,
        tool_name="lookup_info",
        session_id=_current_session_id,
        funnel_stage=funnel_stage,
    )
    return result



# ═══════════════════════════════════════════════════════════════════════════════
# 7. MODIFY CALENDAR EVENT (voice command)
# ═══════════════════════════════════════════════════════════════════════════════

@function_tool(description="Naptári esemény módosítása. Használd, ha a felhasználó meg akarja változtatni egy meglévő találkozó időpontját, címét vagy időtartamát.")
async def modify_meeting(
    ctx: RunContext,
    event_title: Annotated[str, "A módosítandó esemény címe (vagy egy része, ami azonosítja)"],
    new_title: Annotated[str, "Az új cím (ha változik, különben hagyd üresen)"] = "",
    new_date: Annotated[str, "Az új dátum (pl. 2026-03-11, március 12, márc 12)"] = "",
    new_time: Annotated[str, "Az új időpont (pl. 10:00, 10 óra, 14:30)"] = "",
    new_duration_minutes: Annotated[int, "Az új időtartam percben (ha változik)"] = 0,
) -> str:
    """Naptári esemény módosítása."""
    logger.info(f"Modifying meeting: {event_title}")

    found = db.find_calendar_event_by_title(event_title)
    if not found:
        events = db.get_calendar_events()
        titles = ", ".join(e.get("title", "?") for e in events)
        return f"Nem találtam ilyen eseményt. A naptárban ezek vannak: {titles}"

    try:
        if not any([new_title, new_date, new_time, new_duration_minutes]):
            return "Nem kaptam módosítási adatot. Mit szeretnél változtatni? (új dátum, új időpont, új cím, vagy új időtartam)"

        updates = {}
        if new_title:
            updates["title"] = new_title
        if new_date or new_time:
            old_dt = datetime.fromisoformat(found["start_dt"])
            d = _parse_hungarian_date(new_date) if new_date else old_dt.strftime("%Y-%m-%d")
            t = _parse_hungarian_time(new_time) if new_time else old_dt.strftime("%H:%M")
            new_start = datetime.fromisoformat(f"{d}T{t}:00")
            dur = new_duration_minutes or found.get("duration_minutes", 30)
            updates["start_dt"] = new_start.isoformat()
            updates["end_dt"] = (new_start + timedelta(minutes=dur)).isoformat()
            updates["duration_minutes"] = dur
        elif new_duration_minutes:
            start = datetime.fromisoformat(found["start_dt"])
            updates["duration_minutes"] = new_duration_minutes
            updates["end_dt"] = (start + timedelta(minutes=new_duration_minutes)).isoformat()

        db.update_calendar_event(found["id"], **updates)

        changes = []
        if new_title: changes.append(f"cím: {new_title}")
        if new_date: changes.append(f"dátum: {new_date}")
        if new_time: changes.append(f"idő: {new_time}")
        if new_duration_minutes: changes.append(f"időtartam: {new_duration_minutes} perc")
        return f"Esemény módosítva ({found['title']}): {', '.join(changes)}."
    except Exception as e:
        logger.error(f"Modify error: {e}")
        return f"Hiba a módosításkor: {str(e)}"


# ═══════════════════════════════════════════════════════════════════════════════
# 8. DELETE CALENDAR EVENT (voice command)
# ═══════════════════════════════════════════════════════════════════════════════

@function_tool(description="Naptári esemény törlése. Használd, ha a felhasználó le akarja mondani vagy törölni akar egy találkozót.")
async def delete_meeting(
    ctx: RunContext,
    event_title: Annotated[str, "A törlendő esemény címe (vagy egy része, ami azonosítja)"],
) -> str:
    """Naptári esemény törlése."""
    logger.info(f"Deleting meeting: {event_title}")

    found = db.find_calendar_event_by_title(event_title)
    if not found:
        events = db.get_calendar_events()
        titles = ", ".join(e.get("title", "?") for e in events)
        return f"Nem találtam ilyen eseményt. A naptárban ezek vannak: {titles}"

    db.delete_calendar_event(found["id"])
    return f"Esemény törölve: {event_title}."


# ═══════════════════════════════════════════════════════════════════════════════
# 9. REPORT ALERT (voice command / background)
# ═══════════════════════════════════════════════════════════════════════════════

@function_tool(description="Operatív riasztás rögzítése. Használd AZONNAL a háttérben, ha az ügyfél panaszkodik (complaint), nagyon sürgős esetet jelez (urgent), visszahívást kér (callback), vagy egy gyakran ismétlődő hibát/kérdést vet fel (recurring).")
async def report_alert(
    ctx: RunContext,
    tags: Annotated[list[str], "A releváns címkék listája. Lehetséges értékek: 'urgent', 'complaint', 'callback', 'recurring'"],
    reason: Annotated[str, "Rövid indoklás, hogy miért kapta ezt a címkét a beszélgetés"] = "",
) -> str:
    """Riasztási címke rögzítése az adatbázisba."""
    logger.info(f"Reporting alert tags: {tags} - Reason: {reason}")
    valid_tags = [t for t in tags if t in ("urgent", "complaint", "callback", "recurring")]
    
    if valid_tags:
        db.log_interaction(
            type="voice_alert",
            topic="Riasztás (AI Automata)",
            summary=reason or "Automatikus címkézés a beszélgetés alapján",
            result=", ".join(valid_tags),
            tool_name="report_alert",
            session_id=_current_session_id,
            funnel_stage="relevant",
            alert_tags=valid_tags
        )
        
        if "urgent" in valid_tags:
            triage_rules = db.get_triage_rules()
            email_to_send = None
            for r in triage_rules:
                if r.get("priority") == "Kiemelt" and r.get("escalation_email"):
                    email_to_send = r["escalation_email"]
                    break
            
            if email_to_send:
                asyncio.create_task(email_processor.send_escalation_email_to_staff(
                    to_email=email_to_send,
                    patient_name="Ismeretlen (Hangasszisztens)",
                    patient_contact="Lásd a rendszerben",
                    problem_description=reason or "Sürgős eset bejelentése telefonon.",
                    priority="Kiemelt"
                ))

        return "Riasztás sikeresen rögzítve az adminisztrátorok felé a háttérben."
    return "Nem megfelelő címkék."

# All tools for easy import
ALL_TOOLS = [
    send_followup_email,
    check_calendar,
    book_meeting,
    modify_meeting,
    delete_meeting,
    create_task,
    get_weather,
    lookup_info,
    report_alert,
]
