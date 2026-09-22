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
# Lemondás→újrafoglalás ugyanabban a sessionben: a 'törölt időpont' címke csak
# akkor törlődik újrafoglalásnál, ha UGYANEBBEN a sessionben került fel
# (történelmi lemondás-címkét az új foglalás NEM törölhet — user-szabály).
_session_cancel_tagged_var: contextvars.ContextVar[frozenset] = contextvars.ContextVar("eaisydesk_session_cancel_tagged", default=frozenset())


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

    # A SIP-ből ismert hívószám az ELSŐDLEGES (ellenőrzött, STT-hibamentes) —
    # a bemondott szám elírás/kamu is lehet (ld. 09-21: '06301234567' kamu szám
    # került az eseményre a hívó valós +36703200236 helyett). Ha a bemondott
    # szám ELTÉR a hívóétól, azt külön 'contact_phone'-ként őrizzük meg
    # (lehet szándékos alternatív elérhetőség, pl. rokon helyett foglal).
    _caller_phone_now = get_caller_phone()
    _spoken_phone_raw = attendee_phone.strip()
    if _caller_phone_now:
        attendee_phone = _caller_phone_now
    elif not _spoken_phone_raw:
        attendee_phone = "Nincs megadva"
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

        # ── Közös validátor: nyitvatartás (új, kódoldali!) + ütközés + javaslat ──
        _slot_err = _validate_slot(events, start_dt, duration_minutes, parsed_date)
        if _slot_err:
            return _slot_err

        # ── No conflict — book it in Calendar ───────────────────────────
        # Egységes cím-formátum: '<szolgáltatás> - <név>' (az LLM-től függetlenül)
        title = db.normalize_event_title(title, attendee)

        # {{munkatárs}}: MINDEN foglaláshoz tartozik ellátó (user-szabály 2026-09-21)
        # — explicit kérés → szolgáltatás-hozzárendelés → releváns munkatárs.
        # (Az agent a beszélgetésben továbbra sem nevezi meg; a név az
        # event.doctor-ban és a visszaigazoló emailben oldódik meg.)
        effective_doctor = email_processor.resolve_assigned_staff(title, assigned_to or "")
        # Szolgáltatás-egyezésnél a tábla időtartama az irányadó (a 30 perces
        # LLM-default ne nyomja felül — user-szabály 2026-09-21)
        duration_minutes = email_processor.resolve_service_duration(title or service_name, duration_minutes)
        end_dt = start_dt + timedelta(minutes=duration_minutes)
        event_id = db.add_calendar_event(
            title=title,
            start_dt=start_dt.isoformat(),
            end_dt=end_dt.isoformat(),
            duration_minutes=duration_minutes,
            attendee=attendee,
            attendee_email=attendee_email,
            attendee_phone=attendee_phone,
            assigned_to=effective_doctor,
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
        # Felelős CSIS akkor, ha az ügyfél kifejezetten kért munkatársat —
        # a korábbi default-assignee (Kis Béla / „első member") KIVEZETVE:
        # tenant-szűrés nélkül dolgozott (klinika-idegen nevet, pl. „Dentors
        # Member"t írt az ügyfélre), és a jogosultság-mátrix óta a member
        # amúgy is minden ügyfelet lát (a member-filter indoklás elavult).
        effective_assigned_to = assigned_to.strip() if assigned_to else ""

        custom_data = {
            "name": attendee,
            "email": attendee_email,
            "phone": attendee_phone,
            # Eltérő bemondott elérhetőség megőrzése (ha van) — pl. rokon helyett foglal
            **({"contact_phone": _spoken_phone_raw} if _spoken_phone_raw and _spoken_phone_raw != attendee_phone else {}),
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
        # Egységes identitás-feloldó (2026-09-21): erős kulcsok eltérésénél
        # duplikátum-gyanú jelölés + a primary (telefon > email) kapja a foglalást.
        # A név-védelem (upsert_client) így sem írja felül a meglévő valódi nevet.
        _spoken_phone = attendee_phone if attendee_phone and "Nincs megadva" not in attendee_phone else ""
        _primary, _conflict = db.resolve_client_identity(name=attendee, email=attendee_email, phone=_spoken_phone)
        # A hívó TÉNYLEGES száma (SIP) is erős kulcs — a bemondott szám elírás/
        # kamu is lehet (ld. 09-21: a kamu +36201234567 egy RÉGI tesztügyfélre,
        # a 175-ösre vitte a foglalást, mert az email is annak volt). Ha a
        # hívó száma MÁS ügyfelet talál → konfliktus + duplicate_suspect.
        _caller = get_caller_phone()
        if _caller and _caller != _spoken_phone:
            try:
                _caller_hit = db.find_client_by_contact(phone=_caller)
            except Exception:
                _caller_hit = None
            if _caller_hit:
                if _primary and _caller_hit["id"] != _primary["id"]:
                    _conflict = _caller_hit["id"]
                elif not _primary:
                    _primary = _caller_hit
        if _conflict and _primary:
            db.mark_duplicate_suspect(_primary["id"], _conflict, "voice foglalás: a bemondott email/név/telefon és a hívó valós száma eltérő ügyfélhez tartoznak")
            db.mark_duplicate_suspect(_conflict, _primary["id"], "voice foglalás: a bemondott email/név/telefon és a hívó valós száma eltérő ügyfélhez tartoznak")
        _cid = db.upsert_client(custom_data, additional_log=f"Hangasszisztens időpontot foglalt: {date} {time}", status=first_col_id, existing_id=_primary["id"] if _primary else None)
        # Sikeres foglalás = konverzió: a 'potenciális ügyfél' címke TÖRLŐDIK
        # (a címke jelentése: „érdeklődött, de NEM foglalt" — foglalásnál már hamis)
        try:
            if _cid:
                _c = db.get_clients_by_ids([_cid])
                if _c:
                    _cd = _c[0].get("custom_data") or {}
                    if isinstance(_cd, str):
                        _cd = json.loads(_cd)
                    _tags = _cd.get("tags") or []
                    _changed = False
                    if "potenciális ügyfél" in _tags:
                        _cd["tags"] = [t for t in _tags if t != "potenciális ügyfél"]
                        _changed = True
                    # Lemondás→újrafoglalás UGYANEBBEN a sessionben: a 'törölt időpont'
                    # címke lekerül (csak ha ebben a sessionben került fel — a
                    # történelmi lemondás-címke érintetlen marad).
                    if "törölt időpont" in _cd.get("tags", []) and _cid in _session_cancel_tagged_var.get():
                        _cd["tags"] = [t for t in _cd["tags"] if t != "törölt időpont"]
                        _session_cancel_tagged_var.set(_session_cancel_tagged_var.get() - {_cid})
                        _changed = True
                        logger.info(f"'törölt időpont' címke törölve (session-beli újrafoglalás, client {_cid})")
                    if _changed:
                        db.edit_client_details(_cid, _cd)
        except Exception as _te:
            logger.warning(f"potenciális ügyfél címke-törlés hiba: {_te}")

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


# ═══════════════════════════════════════════════════════════════════════════════
# KÖZÖS BIZTONSÁGI HELPEREK (2026-09-21 A–C javítási kör)
# ═══════════════════════════════════════════════════════════════════════════════

_DAY_KEYS_EN = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

def _opening_hours_for(dt: datetime) -> tuple:
    """Az adott nap nyitvatartása (open, close) vagy None, ha zárva. Hiba esetén engedékeny."""
    try:
        from prompt_utils import load_agent_settings
        bh = (load_agent_settings() or {}).get("business_hours") or {}
        day = bh.get(_DAY_KEYS_EN[dt.weekday()]) or {}
        if not day.get("enabled", False):
            return None
        return (str(day.get("open", "08:00")), str(day.get("close", "17:00")))
    except Exception:
        return ("08:00", "18:00")


def _validate_slot(events, start_dt, duration_minutes, parsed_date, exclude_event_id=None):
    """Közös időpont-validátor (book + modify): nyitvatartás + ütközés.
    None = rendben; egyébként ügyfélnek szóló hibaüzenet (javaslattal).
    Az exclude_event_id (a módosított saját esemény) kimarad az ütközésből."""
    end_dt = start_dt + timedelta(minutes=duration_minutes)
    hours = _opening_hours_for(start_dt)
    if hours is None:
        return "Ezen a napon zárva tartunk. Kérem válasszon egy nyitvatartási napot!"
    open_t, close_t = hours
    if start_dt.strftime("%H:%M") < open_t or end_dt.strftime("%H:%M") > close_t or end_dt.date() > start_dt.date():
        return f"Ez az időpont a nyitvatartáson kívül esik ({open_t}–{close_t}). Kérem válasszon nyitvatartási időn belüli időpontot!"
    for ev in events:
        try:
            if exclude_event_id and ev.get("id") == exclude_event_id:
                continue
            ev_start = _to_budapest_tz(ev["start_dt"])
            ev_end = ev_start + timedelta(minutes=ev.get("duration_minutes", 30))
            if start_dt < ev_end and end_dt > ev_start:
                ev_title = ev.get("title", "Névtelen esemény")
                ev_time = ev_start.strftime("%H:%M")
                suggestion = _find_next_slot(events, parsed_date, duration_minutes, start_dt, exclude_event_id=exclude_event_id)
                msg = f"Ütközés! {ev_time}-kor már van egy foglalás: \"{ev_title}\" ({ev.get('duration_minutes', 30)} perc)."
                if suggestion:
                    msg += f" Javaslat: {suggestion} lenne szabad. Foglaljam vagy módosítsam erre?"
                else:
                    msg += " Ezen a napon nincs több szabad hely. Válassz egy másik napot!"
                return msg
        except Exception as ev_err:
            logger.debug(f"Ütközés-ellenőrzés: esemény kihagyva parse-hiba miatt: {ev_err}")
            continue
    return None


def _resolve_ownership_email(attendee_email_param: str = "") -> str:
    """A modify/delete TULAJDON-ellenőrzésének email-kulcsa.
    Sorrend: explicit paraméter (amit az agent bekért) → a hívó (SIP) ügyfelének
    emailje. Üres string, ha egyik sem áll rendelkezésre."""
    p = (attendee_email_param or "").strip()
    if p:
        return p
    caller = get_caller_phone()
    if caller:
        try:
            hit = db.find_client_by_contact(phone=caller)
            if hit:
                cd = hit.get("custom_data") or {}
                if isinstance(cd, str):
                    cd = json.loads(cd)
                return (cd.get("email") or hit.get("email") or "").strip()
        except Exception:
            pass
    return ""


def _format_event_candidate(ev: dict) -> str:
    try:
        dt = _to_budapest_tz(ev["start_dt"]).strftime("%Y.%m.%d. %H:%M")
    except Exception:
        dt = str(ev.get("start_dt", "?"))[:16]
    doc = ev.get("doctor") or "nincs ellátó"
    return f"{ev.get('title', '?')} — {dt} ({doc}) [ID: {ev.get('id')}]"


def _find_event_secure(event_id: int, event_title: str, owner_email: str, original_start_dt: str = ""):
    """Biztonságos eseményazonosítás modify/delete-hez (2026-09-21, A pont).
    Visszatérés: ("ok", event) | ("not_found", None) | ("multiple_matches", [events]) | ("need_email", None)
    Szabályok:
      - event_id esetén TULAJDON-ellenőrzés (az esemény attendee_email-je = owner_email),
        máskülönben not_found (idegen ügyfél eseményének létezését sem fedjük fel);
      - cím-keresésnél az owner_email KÖTELEZŐ szűrő — nincs „bárki jövőbeli" fallback;
      - 1-nél több találat → multiple_matches; original_start_dt-vel pontosítható."""
    owner = (owner_email or "").strip()
    if not owner:
        return ("need_email", None)
    if event_id:
        try:
            res = db._tenant_eq(db.supabase.table("calendar_events").select("*")).eq("id", event_id).limit(1).execute()
            ev = res.data[0] if res.data else None
        except Exception:
            ev = None
        if not ev or (ev.get("attendee_email") or "").strip().lower() != owner.lower():
            return ("not_found", None)
        return ("ok", ev)
    frag = (event_title or "").strip()
    if not frag:
        return ("not_found", None)
    from datetime import timezone as _tzu
    def _q(future_only):
        q = db._tenant_eq(db.supabase.table("calendar_events").select("*")).ilike("title", f"%{frag}%").eq("attendee_email", owner)
        if future_only:
            q = q.gte("start_dt", datetime.now(_tzu.utc).isoformat())
        return q.order("start_dt", desc=False).limit(5).execute().data or []
    matches = _q(True) or _q(False)
    if len(matches) > 1 and original_start_dt:
        try:
            target = _to_budapest_tz(original_start_dt).isoformat()
            exact = [m for m in matches if _to_budapest_tz(m["start_dt"]).isoformat() == target]
            if len(exact) == 1:
                return ("ok", exact[0])
        except Exception:
            pass
    if not matches:
        return ("not_found", None)
    if len(matches) > 1:
        return ("multiple_matches", matches)
    return ("ok", matches[0])


def _log_calendar_action(client, action, event_title, detail, eredmeny):
    """Naplózás modify/delete után — CSAK sikeres naptárműveletnél hívandó.
    Interakció + ügyfél-napló. Új profilt SOHA nem hoz létre."""
    cid = client.get("id") if client else None
    db.log_interaction(
        type="telefon",
        topic=f"Időpont {action} (hangasszisztens)",
        summary=f"{event_title} — {detail}",
        result=detail,
        tool_name=None,
        session_id=get_session_id(),
        funnel_stage="relevant",
        direction="inbound",
        approval_status="approved",
        classification={
            "ugytipus": "Időpont",
            "eredmeny": eredmeny,
            "statusz": "Lezárt",
            "teendo": "Nincs további teendő",
        },
        client_id=cid,
    )
    if client:
        db.upsert_client(
            custom_data={},
            additional_log=f"Hangasszisztens {action}: {event_title} — {detail}",
            existing_id=client["id"],
        )


def _find_next_slot(events: list, date: str, duration: int, after: datetime, exclude_event_id=None) -> str | None:
    """Find the next available slot on the given date after the specified time."""
    day_events = []
    for ev in events:
        try:
            if exclude_event_id and ev.get("id") == exclude_event_id:
                continue
            ev_start = _to_budapest_tz(ev["start_dt"])
            if ev_start.strftime("%Y-%m-%d") == date:
                ev_end = ev_start + timedelta(minutes=ev.get("duration_minutes", 30))
                day_events.append((ev_start, ev_end))
        except Exception:
            continue

    day_events.sort(key=lambda x: x[0])

    # Try slots from after_time to napzárás (nyitvatartás szerint) 30 perces lépésközben
    _hours = _opening_hours_for(after)
    _close_h = int((_hours[1] if _hours else "18:00").split(":")[0])
    candidate = after.replace(second=0)
    end_of_day = after.replace(hour=_close_h, minute=0, second=0)

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

@function_tool(description=(
    "Naptári esemény módosítása. Használd, ha a felhasználó meg akarja változtatni egy meglévő "
    "találkozó időpontját, címét vagy időtartamát. FONTOS (biztonsági szabály): az eseményt az "
    "ügyfél EMAIL CÍMÉVEL azonosítod — ha nem ismered, előbb kérdezd meg! Ha több egyező időpont "
    "van, a tool jelölteket ad: olvasd fel őket, kérdezd rá melyiket módosítsa, majd hívj újra "
    "a kiválasztott event_id-vel."
))
async def modify_meeting(
    ctx: RunContext,
    event_title: Annotated[str, "A módosítandó esemény címe vagy töredéke (ha event_id-t adsz, lehet üres)"] = "",
    new_title: Annotated[str, "Az új cím (ha változik, különben hagyd üresen)"] = "",
    new_date: Annotated[str, "Az új dátum (pl. 2026-03-11, március 12, márc 12)"] = "",
    new_time: Annotated[str, "Az új időpont (pl. 10:00, 10 óra, 14:30)"] = "",
    new_duration_minutes: Annotated[int, "Az új időtartam percben (ha változik)"] = 0,
    event_id: Annotated[int, "A módosítandó esemény azonosítója (multiple_matches után, a kiválasztott jelölt ID-je)"] = 0,
    attendee_email: Annotated[str, "Az ügyfél email címe — a tulajdon-ellenőrzéshez (ha korábban megadta, add át)"] = "",
    original_start_dt: Annotated[str, "A módosítandó esemény EREDETI kezdőidőpontja ISO formában (pontosítás több találatnál)"] = "",
) -> str:
    """Naptári esemény módosítása — biztonságos azonosítással (2026-09-21 A–C kör)."""
    logger.info(f"Modifying meeting: title='{event_title}' id={event_id}")

    # ── EAISY-241 — Autonómia guard (változatlan) ─────────────────────────────
    if _session_has_complaint_or_request():
        logger.info("EAISY-241: modify blocked — complaint/request flagged in session")
        return _autonomy_blocked_message()
    if not _is_autonomous_allowed("Időpont", "Módosítás"):
        logger.info("EAISY-241: modify blocked — Módosítás not autonomous in triage config")
        return _autonomy_blocked_message()

    if not any([new_title, new_date, new_time, new_duration_minutes]):
        return "Nem kaptam módosítási adatot. Mit szeretnél változtatni? (új dátum, új időpont, új cím, vagy új időtartam)"

    # ── Tulajdon-kulcs feloldása (explicit → hívó ügyfele) ────────────────────
    owner_email = _resolve_ownership_email(attendee_email)
    if not owner_email:
        return (
            "A módosításhoz biztonsági okból szükségem van az ügyfél email címére. "
            "Kérdezd meg az email címét, majd hívj meg újra az attendee_email paraméterrel!"
        )

    # ── Biztonságos eseményazonosítás (id+ownership VAGY cím+email-szűrő) ─────
    status, payload = _find_event_secure(event_id, event_title, owner_email, original_start_dt)
    if status == "need_email":
        return "A módosításhoz szükségem van az ügyfél email címére — kérdezd meg, majd hívj újra!"
    if status == "not_found":
        return (
            "Nem találom ezt az időpontot az ügyfél email címéhez tartozó események között. "
            "Ellenőrizd a címet vagy az event_id-t! (Más ügyfél eseményét biztonsági okból nem módosíthatom.)"
        )
    if status == "multiple_matches":
        lines = "\n".join(f"- {_format_event_candidate(ev)}" for ev in payload)
        return (
            "Több egyező időpontot találtam ennél az ügyfélnél:\n" + lines +
            "\nOlvasd fel a jelölteket, kérdezd meg melyiket módosítsam, "
            "majd hívj újra a kiválasztott event_id paraméterrel!"
        )

    found = payload
    try:
        updates = {}
        if new_title:
            updates["title"] = db.normalize_event_title(new_title, found.get("attendee", ""))
        if new_date or new_time:
            old_dt = _to_budapest_tz(found["start_dt"])
            d = _parse_hungarian_date(new_date) if new_date else old_dt.strftime("%Y-%m-%d")
            t = _parse_hungarian_time(new_time) if new_time else old_dt.strftime("%H:%M")
            new_start = _to_budapest_tz(f"{d}T{t}:00")
            dur = new_duration_minutes or found.get("duration_minutes", 30)

            # Múltbeli időpont tiltása
            if new_start + timedelta(minutes=dur) <= datetime.now(BUDAPEST_TZ):
                return "Az új időpont már elmúlt. Kérem adj meg jövőbeli időpontot!"

            # ── C pont: ugyanaz a nyitvatartás+ütközés-validáció, mint a book_meeting,
            # a SAJÁT esemény kizárásával ──
            events = db.get_calendar_events()
            _slot_err = _validate_slot(events, new_start, dur, d, exclude_event_id=found["id"])
            if _slot_err:
                return _slot_err

            updates["start_dt"] = new_start.isoformat()
            updates["end_dt"] = (new_start + timedelta(minutes=dur)).isoformat()
            updates["duration_minutes"] = dur
        elif new_duration_minutes:
            start = _to_budapest_tz(found["start_dt"])
            updates["duration_minutes"] = new_duration_minutes
            updates["end_dt"] = (start + timedelta(minutes=new_duration_minutes)).isoformat()

        db.update_calendar_event(found["id"], **updates)

        # Emlékeztető-reset: az új időpontra fusson le újra a 24 órás emlékeztető
        try:
            db.supabase.table("calendar_events").update({"reminder_sent": False}).eq("id", found["id"]).execute()
        except Exception as _re:
            logger.warning(f"Emlékeztető-reset sikertelen: {_re}")

        changes = []
        if new_title: changes.append(f"cím: {updates['title']}")
        if new_date: changes.append(f"dátum: {new_date}")
        if new_time: changes.append(f"idő: {new_time}")
        if new_duration_minutes: changes.append(f"időtartam: {new_duration_minutes} perc")
        detail = "módosítva: " + ", ".join(changes)

        # ── B pont: napló + ügyfél-napló (csak sikeres módosítás után!) ──────
        _client = db.find_client_by_contact(email=owner_email)
        _log_calendar_action(_client, "módosította", found.get("title", ""), detail, "Módosított időpont")

        # Módosítás-visszaigazoló az ügyfélnek (beégetett sablon — VÁLTOZATLAN)
        att_email = found.get("attendee_email")
        if att_email and att_email != "-":
            _spawn(email_processor.send_modification_confirmation_email(
                attendee=found.get("attendee", "Ügyfél"),
                attendee_email=att_email,
                title=updates.get("title", found.get("title", "Konzultáció")),
                old_datetime=found["start_dt"],
                new_datetime=updates.get("start_dt", found["start_dt"]),
                event_id=found.get("id"),
                assigned_to=found.get("doctor", ""),
            ))

        return f"Esemény módosítva ({found['title']}): {', '.join(changes)}."
    except Exception as e:
        logger.error(f"Modify error: {e}")
        return f"Hiba a módosításkor: {str(e)}"


# ═══════════════════════════════════════════════════════════════════════════════
# 8. DELETE CALENDAR EVENT (voice command)
# ═══════════════════════════════════════════════════════════════════════════════

@function_tool(description=(
    "Naptári esemény törlése (időpont lemondása). FONTOS (biztonsági szabály): az eseményt az "
    "ügyfél EMAIL CÍMÉVEL azonosítod — ha nem ismered, előbb kérdezd meg! Ha több egyező időpont "
    "van, a tool jelölteket ad: olvasd fel őket, kérdezd rá melyiket mondja le, majd hívj újra "
    "a kiválasztott event_id-vel."
))
async def delete_meeting(
    ctx: RunContext,
    event_title: Annotated[str, "A törlendő esemény címe vagy töredéke (ha event_id-t adsz, lehet üres)"] = "",
    event_id: Annotated[int, "A törlendő esemény azonosítója (multiple_matches után, a kiválasztott jelölt ID-je)"] = 0,
    attendee_email: Annotated[str, "Az ügyfél email címe — a tulajdon-ellenőrzéshez (ha korábban megadta, add át)"] = "",
    original_start_dt: Annotated[str, "A törlendő esemény EREDETI kezdőidőpontja ISO formában (pontosítás több találatnál)"] = "",
) -> str:
    """Naptári esemény törlése — biztonságos azonosítással (2026-09-21 A–C kör)."""
    logger.info(f"Deleting meeting: title='{event_title}' id={event_id}")

    # ── EAISY-241 — Autonómia guard (változatlan) ─────────────────────────────
    if _session_has_complaint_or_request():
        logger.info("EAISY-241: delete blocked — complaint/request flagged in session")
        return _autonomy_blocked_message()
    if not _is_autonomous_allowed("Időpont", "Lemondás"):
        logger.info("EAISY-241: delete blocked — Lemondás not autonomous in triage config")
        return _autonomy_blocked_message()

    # ── Tulajdon-kulcs feloldása (explicit → hívó ügyfele) ────────────────────
    owner_email = _resolve_ownership_email(attendee_email)
    if not owner_email:
        return (
            "A lemondáshoz biztonsági okból szükségem van az ügyfél email címére. "
            "Kérdezd meg az email címét, majd hívj meg újra az attendee_email paraméterrel!"
        )

    # ── Biztonságos eseményazonosítás ─────────────────────────────────────────
    status, payload = _find_event_secure(event_id, event_title, owner_email, original_start_dt)
    if status == "need_email":
        return "A lemondáshoz szükségem van az ügyfél email címére — kérdezd meg, majd hívj újra!"
    if status == "not_found":
        return (
            "Nem találom ezt az időpontot az ügyfél email címéhez tartozó események között. "
            "Ellenőrizd a címet vagy az event_id-t! (Más ügyfél eseményét biztonsági okból nem törölhetem.)"
        )
    if status == "multiple_matches":
        lines = "\n".join(f"- {_format_event_candidate(ev)}" for ev in payload)
        return (
            "Több egyező időpontot találtam ennél az ügyfélnél:\n" + lines +
            "\nOlvasd fel a jelölteket, kérdezd meg melyiket mondja le, "
            "majd hívj újra a kiválasztott event_id paraméterrel!"
        )

    found = payload
    db.delete_calendar_event(found["id"])

    # Lemondás-visszaigazoló az ügyfélnek (beégetett sablon — VÁLTOZATLAN)
    att_email = found.get("attendee_email")
    if att_email and att_email != "-":
        _spawn(email_processor.send_cancellation_email(
            attendee=found.get("attendee", "Ügyfél"),
            attendee_email=att_email,
            title=found.get("title", "Konzultáció"),
            start_dt_iso=found.get("start_dt", ""),
            assigned_to=found.get("doctor", ""),
        ))

    # ── B pont: napló + ügyfél-napló + 'törölt időpont' címke + Utánkövetés ───
    # (a lemondási link-flow-val azonos üzleti logika; CSAK sikeres törlés után)
    _client = db.find_client_by_contact(email=owner_email)
    _log_calendar_action(_client, "lemondotta", found.get("title", ""), f"törölve ({found.get('start_dt', '')[:16]})", "Törölt időpont")
    if _client:
        try:
            _cd = _client.get("custom_data") or {}
            if isinstance(_cd, str):
                _cd = json.loads(_cd)
            _tags = _cd.get("tags") or []
            if "törölt időpont" not in _tags:
                _tags.append("törölt időpont")
                _cd["tags"] = _tags
            db.edit_client_details(_client["id"], _cd)
            db.update_client_status(_client["id"], db.resolve_utankovetes_column_id())
            # Session-flag: ha UGYANEBBEN a hívásban újrafoglal, a címke lekerül
            _session_cancel_tagged_var.set(_session_cancel_tagged_var.get() | {_client["id"]})
        except Exception as _te:
            logger.warning(f"'törölt időpont' címke/státusz hiba: {_te}")

    return f"Esemény törölve: {found.get('title', event_title)}."


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
# 9.5. FIND CLIENT (beszélgetés-közi ügyfél-azonosítás — 2026-09-22)
# ═══════════════════════════════════════════════════════════════════════════════

def _normalize_phone_digits(p: str) -> str:
    """Telefonszám normalizálás egyeztetéshez: csak számjegyek, 06→36.
    Visszatérés: az UTOLSÓ 9 számjegy (formátum-független egyezés)."""
    import re as _re
    d = _re.sub(r"\D", "", p or "")
    if d.startswith("06"):
        d = "36" + d[2:]
    return d[-9:] if len(d) >= 9 else d


def _mask_email(email: str) -> str:
    if not email or "@" not in email:
        return "nincs rögzítve"
    local, domain = email.split("@", 1)
    return f"{local[0]}***@{domain}"


@function_tool(description=(
    "Ügyfél keresése a nyilvántartásban — a hívás ELEJÉN használd (paraméter nélkül "
    "a hívó telefonszámára keres)! Visszatérés: a tárolt profil (név, email, telefon, "
    "címkék, közelgő időpontok). Visszatérő ügyfélnél üdvözöld néven, a tárolt adatokat "
    "NE kérd be újra — csak erősítsd meg. Érzékeny adatokat (korábbi időpontok) csak "
    "második azonosító UTÁN olvass vissza!"
))
async def find_client(
    ctx: RunContext,
    client_name: Annotated[str, "Az ügyfél neve (részleges is lehet)"] = "",
    client_email: Annotated[str, "Az ügyfél email címe"] = "",
    client_phone: Annotated[str, "Telefonszám — ha üres, a hívó számára keres"] = "",
) -> str:
    """Ügyfél-keresés telefon/email/név alapján (erős kulcsok előnyben)."""
    # A caller-fallback CSAK akkor, ha EGYETLEN explicit paramétert sem adott meg
    # (különben az agent által megadott email/név helyett mindig a hívó ügyfelére
    # találna rá — a hívás-eleji paraméter nélküli hívás marad a fő use-case)
    _explicit = bool((client_phone or "").strip() or (client_email or "").strip() or (client_name or "").strip())
    phone = (client_phone or "").strip() or ("" if _explicit else get_caller_phone())
    email = (client_email or "").strip().lower()
    name = (client_name or "").strip()

    def _upcoming(c):
        try:
            from datetime import timezone as _tzu
            now_iso = datetime.now(_tzu.utc).isoformat()
            em = (c.get("email") or "").strip()
            q = db._tenant_eq(db.supabase.table("calendar_events").select("id,title,start_dt,doctor")).gte("start_dt", now_iso)
            if em:
                q = q.eq("attendee_email", em)
            else:
                q = q.ilike("attendee", (c.get("name") or "").strip())
            rows = q.order("start_dt", desc=False).limit(3).execute().data or []
            if not rows:
                return "nincs közelgő időpont"
            nxt = rows[0]
            try:
                dt = _to_budapest_tz(nxt["start_dt"]).strftime("%Y.%m.%d. %H:%M")
            except Exception:
                dt = str(nxt.get("start_dt", ""))[:16]
            more = f" (+{len(rows) - 1} további)" if len(rows) > 1 else ""
            return f"{len(rows)} db — legközelebbi: {nxt.get('title', '?')} ({dt}, {nxt.get('doctor') or 'nincs ellátó'}){more}"
        except Exception:
            return "ismeretlen"

    def _fmt_single(c):
        cd0 = c.get("custom_data") or {}
        if isinstance(cd0, str):
            try: cd0 = json.loads(cd0)
            except Exception: cd0 = {}
        tags = ", ".join(cd0.get("tags") or []) or "nincs"
        return (
            f"ÜGYFÉL AZONOSÍTVA: {c.get('name', 'Névtelen')}\n"
            f"- Email: {c.get('email') or 'nincs rögzítve'}\n"
            f"- Telefon: {c.get('phone') or 'nincs rögzítve'}\n"
            f"- Címkék: {tags}\n"
            f"- Ügyfél {(c.get('created_at') or '')[:7]} óta\n"
            f"- Közelgő időpontok: {_upcoming(c)}\n"
            "Ez VISSZATÉRŐ ügyfél — üdvözöld néven, a tárolt adatokat NE kérd be újra, "
            "csak erősítsd meg! (Érzékeny adatok visszaolvasása csak második azonosító után.)"
        )

    hits = []

    # 1. Telefonszám (utolsó 9 számjegy — formátum-független)
    pdig = _normalize_phone_digits(phone)
    if pdig:
        try:
            res = db._tenant_eq(db.supabase.table("clients").select("*")).ilike("phone", f"%{pdig}%").execute().data or []
            seen = set()
            for c in res:
                if c["id"] not in seen and _normalize_phone_digits(c.get("phone") or "") == pdig:
                    seen.add(c["id"]); hits.append(c)
        except Exception as e:
            logger.warning(f"find_client phone hiba: {e}")

    # 2. Email
    if not hits and email:
        try:
            hit = db.find_client_by_contact(email=email)
            if hit: hits = [hit]
        except Exception:
            pass

    # 3. Név (pontos, aztán részleges >=5 kar)
    if not hits and name:
        try:
            res = db._tenant_eq(db.supabase.table("clients").select("*")).ilike("name", name).execute().data or []
            if not res and len(name) >= 5:
                res = db._tenant_eq(db.supabase.table("clients").select("*")).ilike("name", f"%{name}%").limit(5).execute().data or []
            hits = res
        except Exception:
            pass

    if len(hits) == 1:
        logger.info(f"find_client: azonosítva #{hits[0]['id']} ({hits[0].get('name')})")
        return _fmt_single(hits[0])
    if len(hits) > 1:
        lines = []
        for c in hits[:5]:
            cd = c.get("custom_data") or {}
            if isinstance(cd, str): cd = json.loads(cd)
            lines.append(
                f"- {c.get('name', 'Névtelen')} | email: {_mask_email(c.get('email') or (cd.get('email') or ''))} | "
                f"tel: ...{_normalize_phone_digits(c.get('phone') or '')[-4:]} | közelgő időpont: {_upcoming(c)}"
            )
        return (
            "TÖBB lehetséges ügyfél:\n" + "\n".join(lines) +
            "\nKérdezd rá a diszkriminációhoz (pl. email cím vagy születési év), "
            "és hívj újra pontosabb adattal!"
        )
    return "Nincs ügyfél ezekkel az adatokkal a nyilvántartásban — ÚJ ügyfélként kezeld."


# ═══════════════════════════════════════════════════════════════════════════════
# 10. TAG CLIENT (auto-tagging based on conversation topics)
# ═══════════════════════════════════════════════════════════════════════════════

# Kanonikus értékesítési címkekör (user-döntés 2026-09-13) + VIP attribútum-címke.
# A sales-címkék (VIP kivételével) az érdeklődőkezelés első oszlopába triggerelnek.
PREDEFINED_CLIENT_TAGS = ["árkérdés", "kampánylead", "potenciális ügyfél", "törölt időpont", "no-show", "VIP"]

@function_tool(description=(
    "Ügyfél címkézése a beszélgetés témája alapján. "
    "HASZNÁLD AUTOMATIKUSAN a háttérben, amikor a beszélgetés során felismered az alábbi témákat:\n"
    "- 'árkérdés': ha az ügyfél árakról, költségekről, díjakról érdeklődik\n"
    "- 'kampánylead': ha az ügyfél egy kampány/akció hatására keresi a rendelőt\n"
    "- 'potenciális ügyfél': ha az ügyfél érdeklődik a szolgáltatások iránt, de még nem foglalt\n"
    "- 'törölt időpont': ha az ügyfél időpontot mondott le vagy módosított\n"
    "- 'no-show': ha az ügyfél nem jelent meg egy foglalt időponton\n"
    "- 'VIP': ha az ügyfél rendszeres, fontos, vagy kiemelt ügyfél\n"
    "Egyéni címke is megadható, ha a fentiek nem illenek.\n"
    "FONTOS: Ehhez legalább az ügyfél nevét ismerni kell!"
))
async def tag_client(
    ctx: RunContext,
    client_name: Annotated[str, "Az ügyfél neve (kötelező)"],
    tags: Annotated[list[str], "A hozzáadandó címkék listája (pl. ['árkérdés'] vagy ['VIP', 'kampánylead'])"],
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
    # send_followup_email KIVEZETVE a registry-ből (2026-09-21): a foglalási
    # értesítések rendszer-sablonosak (confirmation/modification/cancellation),
    # az agent ne küldjön külön emailt — a függvény megmarad egyéb hívókra.
    find_client,
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

