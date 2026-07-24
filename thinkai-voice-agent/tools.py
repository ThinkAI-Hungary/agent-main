"""
ThinkAI Voice Agent — Tool Implementations (LiveKit Agents v1.4)
Function tools using @function_tool decorator for the voice assistant.
"""

import os
import json
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

BUDAPEST_TZ = ZoneInfo("Europe/Budapest")

def _to_budapest_tz(dt_str: str) -> datetime:
    dt = datetime.fromisoformat(dt_str)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=BUDAPEST_TZ)
    return dt.astimezone(BUDAPEST_TZ)
from pathlib import Path
from typing import Annotated
import re

import httpx
from livekit.agents import function_tool, RunContext
from loguru import logger
import asyncio
import contextvars

import database as db
import email_processor


# ── Paths ────────────────────────────────────────────────────────────────────
THIS_DIR = Path(__file__).resolve().parent

# ── Session-állapot: contextvars (task-scoped) ───────────────────────────────
# Korábban modul-globálisok voltak — egy worker több roomot is kiszolgálhat
# párhuzamosan ugyanazon az event loop-on, így a hívások egymásnak írták felül
# a session_id-t / caller phone-t / alert-flageket. A ContextVar coroutine-scoped,
# így párhuzamos hívásoknál nincs keresztszennyezés.
_session_id_var: contextvars.ContextVar[str] = contextvars.ContextVar("eaisydesk_session_id", default="")
_caller_phone_var: contextvars.ContextVar[str] = contextvars.ContextVar("eaisydesk_caller_phone", default="")
_session_alerts_var: contextvars.ContextVar[frozenset] = contextvars.ContextVar("eaisydesk_session_alerts", default=frozenset())


def set_session_id(sid: str):
    _session_id_var.set(sid or "")


def get_session_id() -> str:
    return _session_id_var.get()


# EAISY-241 §6: Hívó telefonszáma (SIP attribute-ból kinyerve, l. server.py).
# A book_meeting ezt használja alapértelmezett attendee_phone-ként, ha a hívó
# nem mond mást; a hívás végén a client upsert is ebből dolgozik.
def set_caller_phone(phone: str):
    _caller_phone_var.set(phone or "")


def get_caller_phone() -> str:
    return _caller_phone_var.get()


# ── Háttér-task registry — a fire-and-forget taskok kivételei ne vesszenek el ──
_background_tasks: set = set()


def _spawn(coro, name: str = "") -> asyncio.Task:
    """Háttér-task indítása referencia-megőrzéssel és hiba-naplózással."""
    task = asyncio.create_task(coro, name=name or None)
    _background_tasks.add(task)

    def _done(t: asyncio.Task):
        _background_tasks.discard(t)
        if not t.cancelled() and t.exception():
            logger.error(f"Háttér-task '{t.get_name()}' hibával állt le: {t.exception()}")

    task.add_done_callback(_done)
    return task


# ── EAISY-241: Voice-agent gating helpers ────────────────────────────────────
# Ezek a függvények biztosítják, hogy a hang-agent NE cselekedjen önállóan olyan
# ügytípusoknál, amelyeknél a brief (EAISY-241 §1.1.1/§2) szerint emberi beavatkozás
# szükséges.
#
# Kontextus-flag-ek: a beszélgetés során (pl. report_alert tool) beállítható, hogy
# az ügyfél panaszt tett / kérést intézett. Ezek megakadályozzák az autonóm
# foglalást / intézkedést.


def flag_session_alert(alert_type: str):
    """Jelzi, hogy a beszélgetés során panasz/kérés/urgent hangzott el.
    A book_meeting és más autonóm tool-ok ezt ellenőrzik."""
    _session_alerts_var.set(_session_alerts_var.get() | {alert_type})


def reset_session_alerts():
    """Új session / új beszélgetés elején törli a kontextus-flag-eket."""
    _session_alerts_var.set(frozenset())


def _is_autonomous_allowed(ugytipus: str, idopont_altipus: str = None) -> bool:
    """
    Ellenőrzi a triage_rules.routing rules-list alapján, hogy az adott ügytípus
    autonóm módon kezelhető-e a hang-agent által.

    SINGLE SOURCE OF TRUTH: a classifier döntési fáját használja (voice csatorna,
    restriction=none alapon) — ha a kialakuló automation 'auto_*', az akció autonóm.
    Korábban egy elavult 'autonomous_allowed' routing-kulcsot olvasott, amit az új
    rules-list séma nem is definiál → a kapu gyakorlatilag holt volt.

    DB-hiba esetén fail-closed (nem autonóm) — konzervatív viselkedés.
    """
    try:
        import classifier
        rules = classifier._get_triage_rules_cached()
        if not rules:
            # Nincs konfig (DB-hiba) — fail-closed
            logger.warning("_is_autonomous_allowed: nincs triage konfig (fail-closed)")
            return False
        decision = classifier._apply_decision_tree(
            ugytipus=ugytipus,
            idopont_altipus=idopont_altipus,
            restriction="none",  # voice default — a korlátozásokat a session-flag kezeli
            kb_answered=True,
            channel="telefon",
            triage_rules=rules,
        )
        return decision.get("automation", "") in classifier.AUTONOMOUS_AUTOMATIONS
    except Exception as e:
        logger.warning(f"_is_autonomous_allowed hiba (fail-closed): {e}")
        return False


def _session_has_complaint_or_request() -> bool:
    """Visszaadja, hogy a jelenlegi beszélgetés során panasz/kérés hangzott-e el.
    Ezek blokkolják az autonóm cselekvést (brief §1.1.1)."""
    return bool(_session_alerts_var.get() & {"complaint", "request", "urgent"})


def session_has_complaint_or_request() -> bool:
    """Publikus wrapper — a server.py hívásvégi klasszifikációja is ezt kérdezi le
    (handover_reason származtatásához)."""
    return _session_has_complaint_or_request()


def _autonomy_blocked_message() -> str:
    """Egységes válasz, ha az autonómia-guard blokkolja az akciót."""
    return (
        "Köszönöm, rögzítettem a kérését! Ezt az ügyet egy kollégának kell "
        "véglegesítenie — hamarosan felveszik Önnel a kapcsolatot. "
        "Van még esetleg más, amiben segíthetek?"
    )


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

    year = datetime.now(BUDAPEST_TZ).year

    # 4 jegyű explicit évszám levágása (különben a nap-keresés az év első két
    # számjegyét találná meg: „2026. március 11" → nap=20 lenne)
    explicit_year = None
    m_year = re.search(r"\b((?:19|20)\d{2})\b", raw)
    raw_no_year = raw
    if m_year:
        explicit_year = int(m_year.group(1))
        raw_no_year = (raw[:m_year.start()] + raw[m_year.end():])

    def _roll_forward(y: int, mo: int, d: int) -> str:
        """Évszám nélküli dátum: ha idén már elmúlt, jövő évre görgetjük
        (decemberben a „január 15" nem múltbeli foglalás lesz)."""
        if explicit_year is None:
            try:
                if datetime(y, mo, d, tzinfo=BUDAPEST_TZ).date() < datetime.now(BUDAPEST_TZ).date():
                    y += 1
            except ValueError:
                pass
        return f"{y}-{mo:02d}-{d:02d}"

    # "március 11" / "márc 11" / "március 11-én" / "március 11."
    for name, month_num in _HU_MONTHS.items():
        if name in raw.lower():
            day_match = re.search(r"(\d{1,2})", raw_no_year)
            if day_match:
                day = int(day_match.group(1))
                if explicit_year is not None:
                    return f"{explicit_year}-{month_num:02d}-{day:02d}"
                return _roll_forward(year, month_num, day)

    # "03/11" or "03.11" or "3/11"
    m = re.match(r"^(\d{1,2})[/\.](\d{1,2})$", raw_no_year.strip().rstrip("."))
    if m:
        return _roll_forward(year, int(m.group(1)), int(m.group(2)))

    # "2026.03.11" or "2026/03/11"
    m = re.match(r"^(\d{4})[/\.](\d{1,2})[/\.](\d{1,2})$", raw)
    if m:
        return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"

    # Last resort: try fromisoformat
    try:
        return _to_budapest_tz(raw).strftime("%Y-%m-%d")
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
# 1. SEND FOLLOW-UP EMAIL (Brevo Transactional API)
# ═══════════════════════════════════════════════════════════════════════════════

@function_tool(description="Follow-up email küldése egy érdeklődőnek vagy ügyfélnek. Használd, ha a felhasználó emailt szeretne küldeni valakinek.")
async def send_followup_email(
    ctx: RunContext,
    recipient_name: Annotated[str, "A címzett neve"],
    recipient_email: Annotated[str, "A címzett email címe"],
    message: Annotated[str, "Az email szövegtörzse (rövid, barátságos, szakmai)"],
    subject: Annotated[str, "Az email tárgya"] = "",
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
    logger.info(f"Brevo key loaded: {api_key[:4]}…")
    logger.info(f"Sending follow-up email to {recipient_name} <{recipient_email}>")

    # ── Sender from DB ──
    bi = db.get_business_info()
    sender_name = bi.get("sender_name") or bi.get("practice_name", "Virtuális Asszisztens")
    sender_email = bi.get("sender_email") or os.getenv("BREVO_SENDER_EMAIL", "noreply@example.com")
    if not subject:
        subject = f"{bi.get('practice_name', 'Értesítés')} — Köszönjük érdeklődését!"

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
                    "sender": {"name": sender_name, "email": sender_email},
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
        session_id=get_session_id(),
    )
    db.log_interaction(
        type="email",
        topic="Email küldés",
        summary=f"{recipient_name} ({recipient_email}) — {subject}",
        result=f"Küldés {'sikeres' if sent_ok else 'sikertelen'}",
        tool_name="send_followup_email",
        session_id=get_session_id(),
        funnel_stage=funnel_stage,
        classification={
            "ugytipus": "Egyéb",
            "eredmeny": "Igény rögzítve",
            "statusz": "Lezárt" if sent_ok else "Nyitott",
            "teendo": "Nincs további teendő" if sent_ok else "Intézkedés szükséges"
        }
    )

    if recipient_name and get_session_id():
        db.update_session_participant(get_session_id(), recipient_name)

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

    now = datetime.now(BUDAPEST_TZ)
    cutoff = now + timedelta(days=days_ahead)

    upcoming = []
    for ev in events:
        try:
            ev_dt = _to_budapest_tz(ev["start_dt"])
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
            dt = _to_budapest_tz(ev["start_dt"])
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
        session_id=get_session_id(),
        funnel_stage=funnel_stage,
        classification={
            "ugytipus": "Időpont",
            "eredmeny": "Időpont előkészítve",
            "statusz": "Nyitott",
            "teendo": "Időpont véglegesítése"
        }
    )
    return result_text


# ═══════════════════════════════════════════════════════════════════════════════
# 3. BOOK A MEETING (local JSON store)
# ═══════════════════════════════════════════════════════════════════════════════

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _normalize_email(raw: str) -> str:
    """EAISY-241 §5: email-normalizáció — a beszédben kimondott "kukac" → "@",
    szóközök eltávolítása, kisbetűsítés. A LLM gyakran hibásan írja át a
    hallott email-t; ez a normalizáció + záró regex-validáció segít.
    Érvénytelen eredmény esetén üres string (→ nem megy ki csendben elbukó
    visszaigazoló email)."""
    if not raw:
        return ""
    e = raw.strip().lower()
    # A specifikusabb formák ELŐBB (a sima "kukac"→"@" replace a "(kukac)"-ból
    # "(@)"-t csinálna, és a zárójelek bent maradnának)
    e = e.replace("(kukac)", "@").replace("kukac", "@")
    e = e.replace(" [at] ", "@").replace(" at ", "@")
    e = e.replace(" pont ", ".").replace(" pont.", ".").replace(" ", "")
    # Ha több @ van, csak az első marad
    if e.count("@") > 1:
        parts = e.split("@")
        e = parts[0] + "@" + "".join(parts[1:])
    if e and not _EMAIL_RE.match(e):
        logger.warning(f"Érvénytelen email a normalizáció után: '{raw}' → '{e}' — eldobva")
        return ""
    return e


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
    assigned_to: Annotated[str, "A felelős munkatárs neve (ha megadta az ügyfél, különben üres string)"] = "",
    additional_info: Annotated[str, "Bármér egyéb kiegészítő adat JSON szövegként (pl. cégnév, lakcím). Hagyd üresen '{}' ha nincsen egyéb."] = "{}",
    funnel_stage: Annotated[str, "A beszélgetés állapota: 'irrelevant', 'relevant', 'valaszolt', 'ajanlat', 'foglalt'"] = "foglalt",
) -> str:
    """Találkozó foglalása a naptárba."""
    attendee_email = _normalize_email(attendee_email)

    # EAISY-241 §6: ha a hívó nem mondott telefonszámot (üres), de a rendszer
    # kinyerte a SIP-ből (sip.phoneNumber), azt használjuk alapértelmezettként.
    if not attendee_phone.strip():
        attendee_phone = get_caller_phone() or "Nincs megadva"
    logger.info(f"Booking meeting: {title} on {date} at {time}, attendee={attendee}, email={attendee_email}, service={service_name}, assigned_to={assigned_to}")

    # ── EAISY-241 §1.1.1 / §2 — Autonómia guard ───────────────────────────────
    # Ha a beszélgetés során panasz/kérés hangzott el (report_alert flag), vagy
    # az Időpont eljárása nem enged autonóm foglalást, akkor az AI NEM foglal
    # önállóan — kéri az ügyfelet, hogy vegye fel a kapcsolatot munkatárssal,
    # és az interakciót embernek továbbítja.
    if _session_has_complaint_or_request():
        logger.info("EAISY-241: booking blocked — complaint/request flagged in session")
        return _autonomy_blocked_message()
    if not _is_autonomous_allowed("Időpont", "Új"):
        logger.info("EAISY-241: booking blocked — Időpont not autonomous in triage config")
        return _autonomy_blocked_message()

    try:
        parsed_date = _parse_hungarian_date(date)
        parsed_time = _parse_hungarian_time(time)
        start_dt = _to_budapest_tz(f"{parsed_date}T{parsed_time}:00")
        end_dt = start_dt + timedelta(minutes=duration_minutes)

        # Múltbeli időpont elutasítása (az évszám-görgetés ellenére explicit
        # múltbeli dátumot is megadhat a hívó)
        if end_dt <= datetime.now(BUDAPEST_TZ):
            return (
                "Ez az időpont sajnos már elmúlt. Kérem adjon meg egy jövőbeli "
                "dátumot és időpontot!"
            )

        events = db.get_calendar_events()

        # ── Conflict detection ────────────────────────────────────────
        for ev in events:
            try:
                ev_start = _to_budapest_tz(ev["start_dt"])
                ev_end = ev_start + timedelta(minutes=ev.get("duration_minutes", 30))
                if start_dt < ev_end and end_dt > ev_start:
                    ev_title = ev.get("title", "Névtelen esemény")
                    ev_time = ev_start.strftime("%H:%M")
                    # A PARSE-OLT ISO dátumot adjuk át (a nyers „március 11"-hez
                    # a strftime-összevetés sosem találna aznapi eseményt)
                    suggestion = _find_next_slot(events, parsed_date, duration_minutes, start_dt)
                    msg = (
                        f"Ütközés! {ev_time}-kor már van egy foglalás: \"{ev_title}\" "
                        f"({ev.get('duration_minutes', 30)} perc)."
                    )
                    if suggestion:
                        msg += f" Javaslat: {suggestion} lenne szabad. Foglaljam erre?"
                    else:
                        msg += " Ezen a napon nincs több szabad hely. Válassz egy másik napot!"
                    return msg
            except Exception as ev_err:
                # Egy rossz formátumú meglévő esemény ne akadályozza az ütközés-
                # ellenőrzést a többinél — de naplózzuk, mert ilyenkor az adott
                # eseménnyel nem detektálunk ütközést.
                logger.debug(f"Ütközés-ellenőrzés: esemény kihagyva parse-hiba miatt: {ev_err}")
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
            _spawn(email_processor.send_booking_confirmation_email(
                event_id=event_id,
                title=title,
                date=parsed_date,
                time=parsed_time,
                attendee=attendee,
                attendee_email=attendee_email
            ), name="booking-confirmation-email")

        # ── Add to Kanban (Clients Database) ───────────────────────────
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
        # EAISY-241 §1.5.1: ha nincs megadva felelős, beállítunk egy defaultot,
        # hogy a naptár member-filter megtalálja a foglalást (különben a tagok
        # nem látják a voice-agent foglalásokat). Először „Kis Béla"-t keresünk.
        effective_assigned_to = assigned_to.strip() if assigned_to else ""
        if not effective_assigned_to:
            try:
                members = db.supabase.table("admin_users").select("username,full_name,role").execute()
                for m in (members.data or []):
                    full = (m.get("full_name") or m.get("username") or "").lower()
                    if "kis bél" in full or "kis bel" in full:
                        effective_assigned_to = m.get("full_name") or m.get("username")
                        break
                if not effective_assigned_to and members.data:
                    # fallback: első member
                    for m in members.data:
                        if (m.get("role") or "") in ("member", "manager"):
                            effective_assigned_to = m.get("full_name") or m.get("username")
                            break
            except Exception as e:
                logger.warning(f"Default assignee lookup failed: {e}")

        custom_data = {
            "name": attendee,
            "email": attendee_email,
            "phone": attendee_phone,
            "forras_csatorna": "Voice Agent",
            "booked_datetime": f"{parsed_date} {parsed_time}",
            "service": service_name,
            "assigned_to": effective_assigned_to,
            "felelos": effective_assigned_to,
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

        if attendee and get_session_id():
            db.update_session_participant(get_session_id(), attendee)

        # ── Log interaction ───────────────────────────────────────────
        db.log_interaction(
            type="foglalás",
            topic="Időpontfoglalás",
            summary=f"{title} — {date} {time} | {attendee} <{attendee_email}> ({attendee_phone})",
            result="Lefoglalva + Kanban kártya létrehozva",
            tool_name="book_meeting",
            session_id=get_session_id(),
            funnel_stage=funnel_stage,
            classification={
                "ugytipus": "Időpont",
                "eredmeny": "Új időpont",
                "statusz": "Lezárt",
                "teendo": "Nincs további teendő"
            }
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
            ev_start = _to_budapest_tz(ev["start_dt"])
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
            session_id=get_session_id(),
            funnel_stage=funnel_stage,
            classification={
                "ugytipus": "Kérdés",
                "eredmeny": "Megválaszolt kérdés",
                "statusz": "Lezárt",
                "teendo": "Nincs további teendő"
            }
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
        db.add_task(text=task, priority=priority, due_date=due_date, session_id=get_session_id())
        db.log_interaction(
            type="feladat",
            topic="Feladat rögzítés",
            summary=task,
            result="Rögzítve",
            tool_name="create_task",
            session_id=get_session_id(),
            funnel_stage=funnel_stage,
            classification={
                "ugytipus": "Kérés",
                "eredmeny": "Igény rögzítve",
                "statusz": "Nyitott",
                "teendo": "Intézkedés szükséges"
            }
        )

        result = f'Feladat rögzítve: "{task}"'
        if due_date:
            result += f" — határidő: {due_date}"
        return result + "."
    except Exception as e:
        logger.error(f"Task error: {e}")
        return f"Hiba a feladat mentésekor: {str(e)}"


# ═══════════════════════════════════════════════════════════════════════════════
# 6. KNOWLEDGE LOOKUP
# ═══════════════════════════════════════════════════════════════════════════════

# ── Knowledge base ────────────────────────────────────────────────────────


def _load_knowledge() -> dict:
    """Load knowledge base from Supabase."""
    try:
        k = db.get_knowledge_base()
        content = k.get("content", "{}")
        if isinstance(content, str):
            return json.loads(content) if content.strip() else {}
        return content if isinstance(content, dict) else {}
    except Exception:
        return {}


@function_tool(description="Belső tudásbázis lekérdezése. Használd, ha a felhasználó bármilyen részletes információt kér a cégről, szolgáltatásokról, árazásról, csapatról, vagy bármi másról, ami a tudásbázisban lehet. Bármilyen témát megadhatsz szabadon.")
async def lookup_info(
    ctx: RunContext,
    topic: Annotated[str, "A keresett téma szabadon megadva, pl: 'szolgáltatások', 'árazás', 'nyitvatartás', 'csapat'"],
    funnel_stage: Annotated[str, "A beszélgetés állapota: 'irrelevant', 'relevant', 'valaszolt', 'ajanlat', 'foglalt'"] = "valaszolt",
) -> str:
    """Tudásbázis lekérdezése."""
    kb = _load_knowledge()
    topic_lower = topic.lower().strip()
    logger.info(f"Knowledge lookup: {topic_lower}")

    result = None

    # 1. Exact match
    if topic_lower in kb:
        result = kb[topic_lower]

    # 2. Fuzzy key match
    if not result:
        for key, value in kb.items():
            if key in topic_lower or topic_lower in key:
                result = value
                break

    # 3. Full-text value search
    if not result:
        for key, value in kb.items():
            if isinstance(value, str) and topic_lower in value.lower():
                result = value
                break

    # 4. Multi-word fuzzy
    if not result:
        words = topic_lower.split()
        for word in words:
            if len(word) < 3:
                continue
            for key, value in kb.items():
                if word in key or (isinstance(value, str) and word in value.lower()):
                    result = value
                    break
            if result:
                break

    if not result:
        result = (
            "Erről a témáról nincs részletes információm a tudásbázisban. "
            "Kérlek kérdezz valami mást, vagy ajánlom, hogy vedd fel velünk a kapcsolatot közvetlenül!"
        )

    db.log_interaction(
        type="kérdés",
        topic=f"Tudásbázis: {topic}",
        summary=topic,
        result=result[:100] + "..." if len(result) > 100 else result,
        tool_name="lookup_info",
        session_id=get_session_id(),
        funnel_stage=funnel_stage,
        classification={
            "ugytipus": "Kérdés",
            "eredmeny": "Megválaszolt kérdés",
            "statusz": "Lezárt",
            "teendo": "Nincs további teendő"
        }
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

    # ── EAISY-241 — Autonómia guard (ugyanaz, mint book_meeting-nél) ─────────
    # Panasz/kérés esetén, vagy ha a triage konfig nem engedi az autonóm
    # módosítást, az AI nem módosít önállóan.
    if _session_has_complaint_or_request():
        logger.info("EAISY-241: modify blocked — complaint/request flagged in session")
        return _autonomy_blocked_message()
    if not _is_autonomous_allowed("Időpont", "Módosítás"):
        logger.info("EAISY-241: modify blocked — Módosítás not autonomous in triage config")
        return _autonomy_blocked_message()

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
            old_dt = _to_budapest_tz(found["start_dt"])
            d = _parse_hungarian_date(new_date) if new_date else old_dt.strftime("%Y-%m-%d")
            t = _parse_hungarian_time(new_time) if new_time else old_dt.strftime("%H:%M")
            new_start = _to_budapest_tz(f"{d}T{t}:00")
            dur = new_duration_minutes or found.get("duration_minutes", 30)
            updates["start_dt"] = new_start.isoformat()
            updates["end_dt"] = (new_start + timedelta(minutes=dur)).isoformat()
            updates["duration_minutes"] = dur
        elif new_duration_minutes:
            start = _to_budapest_tz(found["start_dt"])
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

    # ── EAISY-241 — Autonómia guard (ugyanaz, mint book_meeting-nél) ─────────
    if _session_has_complaint_or_request():
        logger.info("EAISY-241: delete blocked — complaint/request flagged in session")
        return _autonomy_blocked_message()
    if not _is_autonomous_allowed("Időpont", "Lemondás"):
        logger.info("EAISY-241: delete blocked — Lemondás not autonomous in triage config")
        return _autonomy_blocked_message()

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

@function_tool(description="Operatív riasztás rögzítése. Használd AZONNAL a háttérben, ha az ügyfél panaszkodik (complaint), nagyon sürgős esetet jelez (urgent), visszahívást vagy egyéb kérést intéz (callback/request), vagy egy gyakran ismétlődő hibát/kérdést vet fel (recurring).")
async def report_alert(
    ctx: RunContext,
    tags: Annotated[list[str], "A releváns címkék listája. Lehetséges értékek: 'urgent', 'complaint', 'callback', 'request', 'recurring'"],
    reason: Annotated[str, "Rövid indoklás, hogy miért kapta ezt a címkét a beszélgetés"] = "",
) -> str:
    """Riasztási címke rögzítése az adatbázisba."""
    logger.info(f"Reporting alert tags: {tags} - Reason: {reason}")
    valid_tags = [t for t in tags if t in ("urgent", "complaint", "callback", "request", "recurring")]

    # EAISY-241 — kontextus-flag beállítása, hogy a későbbi autonóm tool-ok
    # (pl. book_meeting, modify_meeting, delete_meeting) tudják: panasz/kérés
    # hangzott el → nem cselekszenek önállóan.
    if valid_tags:
        for t in valid_tags:
            flag_session_alert(t)
        # A visszahívás-kérés (callback) klasszikus „Kérés" — az is blokkolja az
        # autonóm cselekvést (a Kérés a brief szerint sosem autonóm)
        if "callback" in valid_tags:
            flag_session_alert("request")

    if valid_tags:
        db.log_interaction(
            type="voice_alert",
            topic="Riasztás (AI Automata)",
            summary=reason or "Automatikus címkézés a beszélgetés alapján",
            result=", ".join(valid_tags),
            tool_name="report_alert",
            session_id=get_session_id(),
            funnel_stage="relevant",
            alert_tags=valid_tags,
            classification={
                "ugytipus": "Panasz" if "complaint" in valid_tags or "urgent" in valid_tags else "Kérés",
                "eredmeny": "Panasz rögzítve" if "complaint" in valid_tags or "urgent" in valid_tags else "Igény rögzítve",
                "statusz": "Sürgős",
                "teendo": "Azonnali beavatkozás szükséges"
            }
        )

        if "urgent" in valid_tags:
            triage_rules = db.get_triage_rules()
            email_to_send = None
            for r in triage_rules:
                # A priority-k normalizálva vannak ('surgos'), de a régi formátumot
                # is elfogadjuk back-compat okból
                if (r.get("priority") or "").lower() in ("surgos", "sürgős", "kiemelt", "urgent") and r.get("escalation_email"):
                    email_to_send = r["escalation_email"]
                    break

            if email_to_send:
                _spawn(email_processor.send_escalation_email_to_staff(
                    to_email=email_to_send,
                    patient_name="Ismeretlen (Hangasszisztens)",
                    patient_contact="Lásd a rendszerben",
                    problem_description=reason or "Sürgős eset bejelentése telefonon.",
                    priority="Kiemelt"
                ), name="escalation-email")

        return "Riasztás sikeresen rögzítve az adminisztrátorok felé a háttérben."
    return "Nem megfelelő címkék."


# ═══════════════════════════════════════════════════════════════════════════════
# 10. TAG CLIENT (auto-tagging based on conversation topics)
# ═══════════════════════════════════════════════════════════════════════════════

PREDEFINED_CLIENT_TAGS = ["árkérdés", "kampány lead", "ajánlatkérés", "törölt időpont", "no-show", "VIP"]

@function_tool(description=(
    "Ügyfél címkézése a beszélgetés témája alapján. "
    "HASZNÁLD AUTOMATIKUSAN a háttérben, amikor a beszélgetés során felismered az alábbi témákat:\n"
    "- 'árkérdés': ha az ügyfél árakról, költségekről, díjakról érdeklődik\n"
    "- 'ajánlatkérés': ha az ügyfél konkrét ajánlatot, árajánlatot kér\n"
    "- 'kampány lead': ha az ügyfél egy kampány/akció hatására keresi a rendelőt\n"
    "- 'törölt időpont': ha az ügyfél időpontot mondott le vagy módosított\n"
    "- 'no-show': ha az ügyfél nem jelent meg egy foglalt időponton\n"
    "- 'VIP': ha az ügyfél rendszeres, fontos, vagy kiemelt ügyfél\n"
    "Egyéni címke is megadható, ha a fentiek nem illenek.\n"
    "FONTOS: Ehhez legalább az ügyfél nevét ismerni kell!"
))
async def tag_client(
    ctx: RunContext,
    client_name: Annotated[str, "Az ügyfél neve (kötelező)"],
    tags: Annotated[list[str], "A hozzáadandó címkék listája (pl. ['árkérdés'] vagy ['VIP', 'ajánlatkérés'])"],
    client_email: Annotated[str, "Az ügyfél email címe (ha ismert)"] = "",
    client_phone: Annotated[str, "Az ügyfél telefonszáma (ha ismert)"] = "",
) -> str:
    """Ügyfél automatikus címkézése a beszélgetés alapján."""
    logger.info(f"Auto-tagging client '{client_name}' with tags: {tags}")

    if not tags:
        return "Nem adtál meg címkét."

    if not client_name.strip():
        return "Az ügyfél neve szükséges a címkézéshez."

    # Find existing client
    existing = db.find_client_by_contact(
        email=client_email.strip(),
        phone=client_phone.strip(),
    )

    # If not found by contact, try name-based search
    if not existing:
        try:
            all_clients = db.get_clients(limit=500)
            name_lower = client_name.strip().lower()
            for c in all_clients:
                if c.get("name", "").strip().lower() == name_lower:
                    existing = c
                    break
        except Exception as nc_err:
            logger.debug(f"tag_client név-keresés sikertelen: {nc_err}")

    if not existing:
        # Create a new client with the tags
        custom_data = {
            "name": client_name.strip(),
            "email": client_email.strip(),
            "phone": client_phone.strip(),
            "tags": tags,
            "forras_csatorna": "Voice Agent (auto-tag)",
        }
        client_id = db.add_client(custom_data, status="uj")
        if client_id:
            logger.info(f"Created new client '{client_name}' (ID: {client_id}) with tags: {tags}")
            return f"Új ügyfél létrehozva ({client_name}) a következő címkékkel: {', '.join(tags)}."
        return "Hiba az ügyfél létrehozásakor."

    # Add tags to existing client
    success, added = db.add_client_tags(existing["id"], tags)
    if success:
        if added:
            logger.info(f"Tagged client '{client_name}' (ID: {existing['id']}) with: {added}")
            return f"Címkék hozzáadva ({client_name}): {', '.join(added)}."
        return f"Az ügyfélnek ({client_name}) már megvannak ezek a címkék."
    return "Hiba a címkézéskor."


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
    tag_client,
]

