# -*- coding: utf-8 -*-
"""WP-E3 MU-3: SMS-es e-mail-megerősítő tokenek.

Foglalás után SMS-ben rövid linket küldünk (benne egy 12 karakteres token),
amivel a páciens megerősíti / kijavítja / megadja az e-mail címét. A token a
Postgres `email_confirm_tokens` táblába kerül (lásd migrate_sms_confirm.sql).

Filozófia (fail-open): egyetlen nyilvános függvény sem dob — a DB-hibák
loggolva elnyelődnek, hogy a hívás-rögzítési folyamat soha ne döbbenjen el
egy megerősítő token miatt. A `database` modult LAZÁN, függvényen belül
importáljuk, hogy a tesztek stubolhassák.
"""
import secrets
import string
from datetime import datetime, timedelta, timezone

from loguru import logger

# A sablon-validáció a közös sms_text modulra delegál (NE írjuk újra!)
from sms_text import validate_template

# ── SMS-sablonok (szándékosan ékezet nélkül — GSM-7-barát, max. 2 szegmens) ──
DEFAULT_SMS_TEMPLATE = (
    "{rendelo}: idopontja rogzitve ({datum} {ido}). Kerjuk, erositse meg "
    "e-mail cimet a visszaigazolashoz: {link}"
)
# Nincs-email jelölt változata: "adja meg" a "erositse meg" helyett.
DEFAULT_SMS_TEMPLATE_NO_EMAIL = (
    "{rendelo}: idopontja rogzitve ({datum} {ido}). Kerjuk, adja meg "
    "e-mail cimet a visszaigazolashoz: {link}"
)

# ── Token-paraméterek ────────────────────────────────────────────────────────
_TOKEN_ALPHABET = string.ascii_letters + string.digits   # base62
_TOKEN_LEN = 12
_TOKEN_ATTEMPTS = 4                  # 1 próbálkozás + max. 3 újrapróbálás ütközésnél
_TOKEN_TTL = timedelta(hours=72)     # alap lejárat: most + 72 óra
_TOKEN_MIN_TTL = timedelta(hours=1)  # minimum-clamp: soha ne legyen már lejárt
_TABLE = "email_confirm_tokens"
_VALID_ACTIONS = ("confirmed", "corrected", "provided")


def _now_utc() -> datetime:
    """Aktuális idő UTC-ben (timezone-aware)."""
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    """ISO UTC string (a Postgres TIMESTAMPTZ-nak ez megy az insertbe)."""
    try:
        return dt.astimezone(timezone.utc).isoformat()
    except Exception:
        return str(dt)


def _parse_dt(value) -> datetime | None:
    """ISO-string / datetime → timezone-aware datetime. Hiba / None → None."""
    if value is None:
        return None
    try:
        if isinstance(value, datetime):
            dt = value
        else:
            dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


def _generate_token() -> str:
    """12 karakteres véletlen base62 token (kriptó-erős RNG)."""
    return "".join(secrets.choice(_TOKEN_ALPHABET) for _ in range(_TOKEN_LEN))


def create_confirm_token(session_id: str, tenant_id=None, event_ids=None,
                         phone: str = "", candidate_email=None,
                         first_booking_start=None, client_id=None) -> dict:
    """Token létrehozása + insert az email_confirm_tokens táblába.

    - Token: 12 karakteres véletlen base62, ütközés esetén max. 3 újrapróbálás.
    - Lejárat: min(now + 72 óra, first_booking_start), de minimum now + 1 óra
      (a token soha ne legyen már lejárt a kiküldéskor).
    Vissza: {"ok": True, "token": ..., "expires_at": iso-str} vagy
    {"ok": False, "error": ...}. SOSEM dob.
    """
    try:
        now = _now_utc()
        expires = now + _TOKEN_TTL
        booking = _parse_dt(first_booking_start)
        if booking is not None:
            expires = min(expires, booking)
        # minimum-clamp: ha a foglalás 1 órán belül van, a lejárat min. 1 óra
        expires = max(expires, now + _TOKEN_MIN_TTL)
        expires_iso = _iso(expires)

        if isinstance(event_ids, (list, tuple)):
            ev_ids = list(event_ids)
        elif event_ids:
            ev_ids = [event_ids]
        else:
            ev_ids = []

        last_err = None
        for attempt in range(_TOKEN_ATTEMPTS):
            token = _generate_token()
            try:
                import database as db  # LAZÁN — a tesztek stubolják
                payload = {
                    "token": token,
                    "session_id": session_id,
                    "tenant_id": tenant_id,
                    "event_ids": ev_ids,
                    "phone": phone or "",
                    "candidate_email": candidate_email,
        "client_id": client_id,
                    "created_at": _iso(now),
                    "expires_at": expires_iso,
                }
                db.supabase.table(_TABLE).insert(db._with_tenant(payload)).execute()
                logger.info("e-mail-megerősítő token létrehozva (session={}, attempt={})",
                            session_id, attempt + 1)
                return {"ok": True, "token": token, "expires_at": expires_iso}
            except Exception as exc:
                # tipikusan PK-ütközés — új token, újra (max. 3 újrapróbálás)
                last_err = exc
                logger.warning("token-insert sikertelen (attempt={}): {}",
                               attempt + 1, exc)
        return {"ok": False, "error": f"token-insert sikertelen: {last_err}"}
    except Exception as exc:
        logger.exception("create_confirm_token váratlan hiba")
        return {"ok": False, "error": str(exc)}


def get_confirm_token(token: str) -> dict | None:
    """A token-sor vagy None. Fail-open: DB-hiba → None (sosem dob)."""
    if not token:
        return None
    try:
        import database as db
        res = (db.supabase.table(_TABLE).select("*")
               .eq("token", token).limit(1).execute())
        rows = getattr(res, "data", None) or []
        return rows[0] if rows else None
    except Exception as exc:
        logger.warning("get_confirm_token hiba (token=…{}): {}", str(token)[:4], exc)
        return None


def token_is_confirmed(row: dict) -> bool:
    """Megerősítve-e: confirmed_at nem-null ÉS confirmed_email nem-üres."""
    try:
        if not row:
            return False
        return bool(row.get("confirmed_at")) and bool(
            (row.get("confirmed_email") or "").strip())
    except Exception:
        return False


def mark_confirmed(token: str, email: str, action: str) -> bool:
    """Megerősítés rögzítése — 'az első megerősítés nyer': az update CSAK akkor
    fut le, ha a sor még nincs megerősítve (where confirmed_at is null).
    action: confirmed|corrected|provided. True, ha az update érintett sort."""
    try:
        if not token or not (email or "").strip():
            return False
        if action not in _VALID_ACTIONS:
            logger.warning("ismeretlen action={:?} — 'confirmed'-re esik vissza", action)
            action = "confirmed"
        import database as db
        payload = {
            "confirmed_email": (email or "").strip(),
            "confirmed_at": _iso(_now_utc()),
            "action": action,
        }
        res = (db.supabase.table(_TABLE).update(payload)
               .eq("token", token)
               .is_("confirmed_at", "null")
               .execute())
        updated = getattr(res, "data", None) or []
        if not updated:
            # a where-klauzula nem talált sort → már meg van erősítve
            logger.info("token már meg van erősítve — az első megerősítés nyer, "
                        "későbbi update kihagyva")
            return False
        return True
    except Exception as exc:
        logger.warning("mark_confirmed hiba: {}", exc)
        return False


def build_sms_text(link: str, rendelo: str = "", datum: str = "", ido: str = "",
                   has_candidate: bool = True) -> str:
    """A default SMS-sablon kitöltése. has_candidate=False → az 'adja meg'
    (nincs-email) változat. Sosem dob."""
    try:
        template = DEFAULT_SMS_TEMPLATE if has_candidate else DEFAULT_SMS_TEMPLATE_NO_EMAIL
        try:
            return template.format(rendelo=rendelo or "", datum=datum or "",
                                   ido=ido or "", link=link or "")
        except Exception:
            # fail-open: kézi behelyettesítés
            out = template
            for key, val in (("rendelo", rendelo), ("datum", datum),
                             ("ido", ido), ("link", link)):
                out = out.replace("{" + key + "}", val or "")
            return out
    except Exception:
        return link or ""


def validate_sms_template(template: str, max_segments: int = 2) -> tuple[bool, int, str]:
    """Sablon-konfig validáció — delegál az sms_text.validate_template-nek.
    Vissza: (ok, szegmensszám, ok-ok)."""
    try:
        return validate_template(template, max_segments)
    except Exception as exc:
        return False, 0, f"sablon-validációs hiba: {exc}"


DEFAULT_SMS_TEMPLATE_REMINDER = (
    "{rendelo}: Emlékezteto — idopontja {datum} {ido}. Ha meg nem "
    "erositette e-mail cimet, itt teheti meg: {link}"
)


def build_reminder_sms_text(link: str, rendelo: str = "", datum: str = "",
                            ido: str = "") -> str:
    """Emlékeztető-SMS szöveg (megerősítetlen foglaláshoz, ugyanazzal a
    linkkel — a token a foglalás kezdetéig él)."""
    return DEFAULT_SMS_TEMPLATE_REMINDER.format(
        rendelo=rendelo or "Rendelo", datum=datum or "-", ido=ido or "-", link=link)
