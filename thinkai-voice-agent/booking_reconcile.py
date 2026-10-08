# -*- coding: utf-8 -*-
"""Foglalás-egyeztetési harness (2026-10-09 — a 'foglaltam'-tool nélkül incidens).

Előfordult, hogy az agent szóban 'rögzítem az időpontot'-ot mondott a
book_meeting eszköz meghívása NÉLKÜL — naptárba semmi nem került, és a
foglalás-központú SMS/email-visszaigazolás nem tudott elindulni. A prompt-szabály
(5. szabály) szükséges, de nem elégséges — ez a harness determinisztikus:

1. TRIGGER (fillér): a klasszifikáció foglalást állít ('Új időpont', vagy
   Időpont + altípus Új), DE a hívásban nem regisztrálódott foglalás.
2. LLM-ELLENŐRZÉS (Gemini flash, temperature=0, a LEIRATBÓL): az agent valóban
   KONKRÉT (dátum + idő) időpontot erősített meg? Bizonytalan/nem → nincs javítás.
3. JAVÍTÁS: ugyanazon az üzleti lépeken (booking_mode kapu, nyitvatartás/
   ütközés, cím-normalizálás, ellátó + időtartam feloldás) létrejön az esemény,
   és a foglalás-lista visszaadódik → a futás további része (SMS/email) már
   rendes foglalásként fut.
4. ŐSZINTE ÚJRAOSZTÁLYOZÁS: ha az agent konkrét foglalást hazudott (nincs
   szabad hely / múltbeli idő / ütközés), a klasszifikáció 'Foglalási szándék
   rögzítve' / Nyitott / 'Időpont véglegesítése'-re javítódik — sosem marad
   hamis 'Új időpont / Lezárt'.

Kapcsoló: BOOKING_RECONCILE=0 → kikapcsolva. Egyetlen publikus függvény sem dob.
A tools/database importok LAZÁK (függvényen belül) — a teszt-venv livekit
nélkül is importálható.
"""
import os
import re
from datetime import datetime, timedelta

from loguru import logger

_CONFIRMED_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_CONFIRMED_TIME_RE = re.compile(r"^\d{2}:\d{2}$")


def reconcile_enabled() -> bool:
    """BOOKING_RECONCILE env (default BE)."""
    return (os.getenv("BOOKING_RECONCILE", "1") or "1").strip() != "0"


def booking_claimed(classification: dict | None) -> bool:
    """A klasszifikáció foglalást állít-e (determinisztikus trigger)."""
    if not isinstance(classification, dict):
        return False
    if classification.get("eredmeny") == "Új időpont":
        return True
    return (classification.get("ugytipus") == "Időpont"
            and classification.get("idopont_altipus") == "Új")


def parse_booking_extract(raw: str) -> dict | None:
    """Az LLM-válasz értelmezése. Érvényes, KONKRÉT megerősítés → dict
    {date, time, service, attendee, email}; egyéb → None (fail-open)."""
    if not raw:
        return None
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        data = __import__("json").loads(text)
    except (ValueError, TypeError):
        try:
            data = __import__("json").loads(re.sub(r'\\(?!["\\/bfnrtu])', "", text))
        except (ValueError, TypeError):
            return None
    if not isinstance(data, dict) or not data.get("confirmed"):
        return None
    date = str(data.get("date") or "").strip()
    time = str(data.get("time") or "").strip()
    if not _CONFIRMED_DATE_RE.match(date) or not _CONFIRMED_TIME_RE.match(time):
        return None
    return {
        "date": date,
        "time": time,
        "service": str(data.get("service") or "").strip(),
        "attendee": str(data.get("attendee") or "").strip(),
        "email": str(data.get("email") or "").strip().lower(),
    }


_EXTRACT_PROMPT = (
    "Egy magyar fogászati rendelő telefonhívásának leiratát látod (AI = az "
    "asszisztens, Felhasználó = a hívó). Kérdés: az ASSZISZTENS kifejezetten "
    "megerősített-e KONKRÉT időpontot a hívónak — azaz konkrét dátum ÉS konkrét "
    "óra elhangzott megerősítésként? A nap-preferencia ('kedden délelőtt') önmagában "
    "NEM megerősítés. Ha a leirat alapján bizonytalan, confirmed legyen false.\n"
    "Válasz KIZÁRÓLAG JSON:\n"
    '{"confirmed": bool, "date": "YYYY-MM-DD"|null, "time": "HH:MM"|null, '
    '"service": string|null, "attendee": string|null, "email": string|null}\n'
    "A date a megerősített nap (a mai dátumhoz viszonyítva oldd fel a relatív "
    "kifejezéseket), a time HH:MM (24 óra), a service a szolgáltatás neve, az "
    "attendee a hívó neve, az email a hívó által bemondott e-mail cím (vagy null)."
)


def _llm_confirm_extract(transcript_text: str) -> dict | None:
    """Gemini flash a leiratból: konkrét megerősített időpont? Sosem dob."""
    try:
        import json as _json
        from email_verify_harness import _new_genai_client, EMAIL_VERIFY_LLM_MODEL
        client = _new_genai_client(60_000)
        if client is None:
            return None
        response = client.models.generate_content(
            model=EMAIL_VERIFY_LLM_MODEL,
            config={"response_mime_type": "application/json", "temperature": 0},
            contents=[_EXTRACT_PROMPT
                      + f"\n\nMA (Budapest): {datetime.now().strftime('%Y-%m-%d')}\n\nLEIRAT:\n"
                      + transcript_text[-12000:]],
        )
        return parse_booking_extract(getattr(response, "text", "") or "")
    except Exception as exc:
        logger.warning(f"foglalás-egyeztetés LLM hiba (fail-open): {exc}")
        return None


def _honest_reclass(interaction_id, classification: dict) -> None:
    """Hamis 'Új időpont / Lezárt' javítása őszinte igényrögzítésre."""
    try:
        import database as db
        new_c = dict(classification or {})
        new_c["eredmeny"] = "Foglalási szándék rögzítve"
        new_c["statusz"] = "Nyitott"
        new_c["teendo"] = "Időpont véglegesítése"
        new_c["autonomous"] = False
        q = db.supabase.table("interactions").update({"classification": new_c})
        if interaction_id:
            q = q.eq("id", interaction_id)
        else:
            return  # interaction nélkül nincs hová írni
        q.execute()
        logger.warning("foglalás-egyeztetés: hamis 'Új időpont/Lezárt' javítva "
                       "igényrögzítésre (interaction #{})", interaction_id)
    except Exception as exc:
        logger.warning(f"őszinte újraklasszifikáció hiba (fail-open): {exc}")


def _transcript_text(turns) -> str:
    parts = []
    for t in turns or []:
        if isinstance(t, dict):
            role = "AI" if t.get("role") != "user" else "Felhasználó"
            parts.append(f"{role}: {t.get('text', '')}")
        elif isinstance(t, str):
            parts.append(t)
    return "\n".join(parts)


def reconcile_missing_booking(session_id: str, tenant_id, transcript_turns,
                              classification: dict, caller_number: str,
                              client_id=None, interaction_id=None,
                              booking_email: str = "") -> list | None:
    """A fenti 1-4 lépés. Vissza: foglalás-lista (sikeres javítás) vagy None.
    SOSEM dob."""
    if not (os.getenv("BOOKING_RECONCILE", "1") or "1").strip() != "0":
        return None
    if not booking_claimed(classification):
        return None

    try:
        import tools
        import database as db

        # üzemi kapuk — handoff/none módban NEM foglalunk helyette (az igény-
        # rögzítés ott jogos és a klasszifikáció is megfelelő)
        if tools._booking_mode_gate("book"):
            return None
        if not tools._is_autonomous_allowed("Időpont", "Új"):
            return None

        text = _transcript_text(transcript_turns)
        ext = _llm_confirm_extract(text)
        if not ext:
            return None

        try:
            start_dt = tools._to_budapest_tz(f"{ext['date']}T{ext['time']}:00")
        except Exception:
            return None
        if start_dt <= datetime.now(tools.BUDAPEST_TZ):
            logger.warning("foglalás-egyeztetés: a 'megerősített' időpont múltbeli — "
                           "őszinte újraklasszifikáció")
            _honest_reclass(interaction_id, classification)
            return None

        events = db.get_calendar_events()
        slot_err = tools._validate_slot(events, start_dt, 30, ext["date"])
        if slot_err:
            logger.warning("foglalás-egyeztetés: a 'megerősített' slot nem foglalható "
                           f"({slot_err[:80]}) — őszinte újraklasszifikáció")
            _honest_reclass(interaction_id, classification)
            return None

        attendee = ext.get("attendee") or "Ügyfél"
        service = ext.get("service") or "Konzultáció"
        email = (ext.get("email") or booking_email or "").strip()
        title = db.normalize_event_title(service, attendee)
        doctor = __import__("email_processor").resolve_assigned_staff(title, "")
        duration = __import__("email_processor").resolve_service_duration(
            title or service, 30)
        event_id = db.add_calendar_event(
            title=title,
            start_dt=start_dt.isoformat(),
            end_dt=(start_dt + timedelta(minutes=duration)).isoformat(),
            duration_minutes=duration,
            attendee=attendee,
            attendee_email=email,
            attendee_phone=caller_number or "",
            assigned_to=doctor,
        )
        if not event_id:
            logger.warning("foglalás-egyeztetés: az esemény-létrehozás sikertelen")
            return None

        booking = {"event_id": event_id, "title": title, "date": ext["date"],
                   "time": ext["time"], "attendee": attendee,
                   "attendee_email": email}
        try:
            tools.stash_session_booking(session_id, booking)
        except Exception:
            pass
        logger.warning(f"foglalás-egyeztetés: az agent tool nélkül 'foglalt' — "
                       f"pótolva az esemény (#{event_id}, {ext['date']} {ext['time']})")
        return [booking]
    except Exception as exc:
        logger.warning(f"foglalás-egyeztetés hiba (fail-open): {exc}")
        return None
