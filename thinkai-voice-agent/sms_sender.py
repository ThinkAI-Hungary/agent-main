# -*- coding: utf-8 -*-
"""WP-E3 MU-1: Twilio SMS-küldő modul (SMS-megerősítés a fogászati CRM-ben).

- Twilio REST API közvetlen `requests`-szel, NEM twilio SDK-val (a futtató
  környezetben az SDK nincs telepítve — ugyanaz a helyzet, mint a Brevo-hívás
  az email_processorban).
- SMS_DRY_RUN=1 esetén a Twilio-hívás HELYETT csak log + sms_logs sor
  status="dry_run"-nal keletkezik (az email_processor EMAIL_DRY_RUN /
  _dry_run_email mintájának mása: cél, hogy a teszthívások SMS-ei NE menjenek
  ki valósággal idegen számokra).
- FAIL-OPEN: egyetlen függvény sem dob kivételt — a hívó logika mindig
  {"ok": bool, ...} dictet kap; a DB-írások és a HTTP-hívás try/except-ben fut.
- DB-hozzáférés LAZÁN, függvényen belül `import database as db` — így a
  tesztek sys.modules-stubbal cserélhetik.

Konfiguráció (env):
  TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN        — fiók
  TWILIO_MESSAGING_SERVICE_SID                 — ha be van állítva, ezzel küld
  TWILIO_FROM                                  — különben ez (E.164 vagy alfanumerikus)
  SMS_DRY_RUN ("0")                            — "1": nincs HTTP-hívás
  PUBLIC_CONFIRM_BASE_URL (fallback APP_BASE_URL, aztán SERVER_URL)
                                               — status-callback URL bázisa
"""
import base64
import hashlib
import hmac
import os
import time
from datetime import datetime, timezone

import requests
from loguru import logger

from sms_text import count_segments

# ── Konfiguráció ─────────────────────────────────────────────────────────────
_TWILIO_URL = "https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json"
_STATUS_CALLBACK_PATH = "/api/public/twilio/status"
_SMS_TIMEOUT = 15        # mp — Twilio REST-hívás timeoutja
_SMS_RETRY_DELAY = 2     # mp — egyetlen retry 429/5xx válaszra
# A status-callbackből elfogadott végállapotok (update_sms_status)
_VALID_CALLBACK_STATUSES = ("sent", "delivered", "undelivered", "failed")


def _sms_dry_run_enabled() -> bool:
    """SMS_DRY_RUN=1 → nincs Twilio-hívás (EMAIL_DRY_RUN mintájára)."""
    return (os.getenv("SMS_DRY_RUN", "0") or "0").strip() == "1"


def _callback_base_url() -> str:
    """Status-callback bázis: PUBLIC_CONFIRM_BASE_URL → APP_BASE_URL →
    SERVER_URL. Üres, ha egyik sincs beállítva (akkor callback nem megy ki)."""
    return (os.getenv("PUBLIC_CONFIRM_BASE_URL")
            or os.getenv("APP_BASE_URL")
            or os.getenv("SERVER_URL")
            or "").rstrip("/")


def _now_iso() -> str:
    """UTC timestamp az sms_logs.updated_at oszlopnak."""
    return datetime.now(timezone.utc).isoformat()


def _as_int(value) -> int | None:
    """error_code → int (a Postgres-oszlop INT); nem konvertálható → None."""
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _log_row(to: str, body: str, session_id: str, tenant_id, purpose: str,
             segments: int, encoding: str, status: str,
             provider_sid=None, error_code=None, error_message=None) -> dict:
    """sms_logs insert-payload (a migrate_sms_confirm.sql oszlopai szerint)."""
    return {
        "session_id": session_id or "",
        "tenant_id": tenant_id,
        "purpose": purpose or "",
        "to_number": to or "",
        "body": body or "",
        "segments": segments,
        "encoding": encoding,
        "status": status,
        "provider_sid": provider_sid,
        "error_code": error_code,
        "error_message": error_message,
    }


# ── DB-segédek (lazán importált database modullal, fail-open) ────────────────

def _insert_sms_log(row: dict):
    """sms_logs sor beszúrása (_with_tenant-tal). Vissza: a sor id-je, ha a
    válasz szolgáltatja; hibánál None + warning — SOSEM dob."""
    try:
        import database as db
        res = db.supabase.table("sms_logs").insert(db._with_tenant(row)).execute()
        data = getattr(res, "data", None) or []
        if data and isinstance(data[0], dict):
            return data[0].get("id")
        return None
    except Exception as exc:
        logger.warning(f"sms_logs insert sikertelen (fail-open): {exc}")
        return None


def _update_sms_log(provider_sid: str = "", row_id=None,
                    payload: dict | None = None) -> bool:
    """sms_logs sor frissítése: sor-ID alapján, ha ismert (a beszúrt sorban a
    provider_sid még NULL — a 'provider_sid = X' szűrő 0 sort találna, l.
    élő teszt: sor queued maradt); callback-nél (nincs row_id) a provider_sid
    alapján. Fail-open: hibánál False, sosem dob."""
    if not payload:
        return False
    try:
        import database as db
        query = db.supabase.table("sms_logs").update(payload)
        if row_id is not None:
            query = query.eq("id", row_id)
        elif provider_sid:
            query = query.eq("provider_sid", provider_sid)
        else:
            return False
        query.execute()
        return True
    except Exception as exc:
        logger.warning(f"sms_logs update sikertelen (fail-open): {exc}")
        return False


# ── Twilio REST-hívás ────────────────────────────────────────────────────────

def _post_twilio(account_sid: str, auth_token: str, data: dict) -> tuple[int, dict, str]:
    """Egyetlen POST a Twilio Messages.json végpontra, EGY retry-val 429/5xx
    válaszra (_SMS_RETRY_DELAY sleep után; hálózati kivételre nincs retry).
    Vissza: (http_kód, json-válasz dict vagy {}, hibaüzenet). SOSEM dob."""
    code, body, last_err = 0, {}, ""
    for attempt in range(2):
        try:
            resp = requests.post(
                _TWILIO_URL.format(sid=account_sid),
                auth=(account_sid, auth_token),
                data=data,
                timeout=_SMS_TIMEOUT,
            )
            code = resp.status_code
            try:
                body = resp.json() or {}
            except ValueError:
                body = {}
            if not isinstance(body, dict):
                body = {}
            if code in (200, 201):
                return code, body, ""
            err = body.get("message") or f"HTTP {code}"
            if code == 429 or code >= 500:
                last_err = err  # újrapróbálható
                if attempt == 0:
                    time.sleep(_SMS_RETRY_DELAY)
                    continue
                break
            return code, body, err  # 4xx — nem újrapróbálható
        except requests.RequestException as exc:
            return 0, {}, type(exc).__name__
    return code, body, last_err or "ismeretlen Twilio-hiba"


# ── Publikus API ─────────────────────────────────────────────────────────────

def send_sms(to: str, body: str, *, session_id: str = "", tenant_id=None,
             purpose: str = "") -> dict:
    """Twilio SMS küldés (REST API, NEM SDK — nincs telepítve). Vissza:
    {"ok": bool, "sid": str|None, "status": str, "segments": int,
    "encoding": str, "error": str|None}. SOSEM dob.

    sms_logs sor MINDIG keletkezik:
      - dry-run            → status="dry_run" (nincs HTTP-hívás),
      - nincs konfiguráció → status="failed" (error_message: ok),
      - valódi küldés      → előbb "queued", a válasz után "sent"/"failed".
    """
    segments, encoding = count_segments(body)
    res: dict = {"ok": False, "sid": None, "status": "failed",
                 "segments": segments, "encoding": encoding, "error": None}
    try:
        # 1) Dry-run kapu: NINCS HTTP-hívás, csak log + sms_logs sor
        if _sms_dry_run_enabled():
            logger.info(f"[SMS_DRY_RUN] → {to} purpose={purpose or '-'} "
                        f"session={session_id or '-'} "
                        f"({segments} szegmens, {encoding}) body={body!r}")
            _insert_sms_log(_log_row(to, body, session_id, tenant_id, purpose,
                                     segments, encoding, status="dry_run"))
            res.update(ok=True, status="dry_run")
            return res

        account_sid = (os.getenv("TWILIO_ACCOUNT_SID") or "").strip()
        auth_token = (os.getenv("TWILIO_AUTH_TOKEN") or "").strip()
        msvc_sid = (os.getenv("TWILIO_MESSAGING_SERVICE_SID") or "").strip()
        from_number = (os.getenv("TWILIO_FROM") or "").strip()

        # 2) Nincs Twilio-konfiguráció → nem próbálkozunk, "failed" sor
        if not account_sid or not auth_token or not (msvc_sid or from_number):
            res["error"] = "nincs Twilio-konfiguráció"
            _insert_sms_log(_log_row(to, body, session_id, tenant_id, purpose,
                                     segments, encoding, status="failed",
                                     error_message=res["error"]))
            return res

        # 3) A sor MINDIG létezik, mielőtt a POST elindul ("queued")
        row_id = _insert_sms_log(_log_row(to, body, session_id, tenant_id,
                                          purpose, segments, encoding,
                                          status="queued"))

        # MessagingServiceSid-HAL küldünk, ha van; különben explicit From
        data = {"To": to, "Body": body}
        if msvc_sid:
            data["MessagingServiceSid"] = msvc_sid
        else:
            data["From"] = from_number
        base = _callback_base_url()
        if base:
            data["StatusCallback"] = f"{base}{_STATUS_CALLBACK_PATH}"

        code, resp_json, err = _post_twilio(account_sid, auth_token, data)

        if code in (200, 201):
            provider_sid = resp_json.get("sid")
            res.update(ok=True, sid=provider_sid, status="sent")
            logger.info(f"SMS elküldve: {to} sid={provider_sid} "
                        f"({segments} szegmens, {encoding}) "
                        f"purpose={purpose or '-'}")
            _update_sms_log(provider_sid=provider_sid or "", row_id=row_id,
                            payload={"status": "sent",
                                     "provider_sid": provider_sid,
                                     "error_code": None,
                                     "error_message": None,
                                     "updated_at": _now_iso()})
            return res

        # 4) Hiba (retry kimerült vagy nem újrapróbálható válasz)
        error_code = _as_int(resp_json.get("code"))
        res["error"] = err or f"HTTP {code}"
        logger.warning(f"SMS-küldés sikertelen ({to}): {res['error']} "
                       f"(code={error_code})")
        _update_sms_log(provider_sid="", row_id=row_id,
                        payload={"status": "failed",
                                 "error_code": error_code,
                                 "error_message": res["error"],
                                 "updated_at": _now_iso()})
        return res
    except Exception as exc:  # fail-open biztosítás: sosem dobunk
        logger.warning(f"send_sms váratlan hiba (fail-open): {exc}")
        res["error"] = res["error"] or (str(exc) or type(exc).__name__)
        return res


def update_sms_status(provider_sid: str, status: str, error_code=None) -> bool:
    """Status-callbackből (web_server /api/public/twilio/status): sms_logs sor
    frissítése provider_sid alapján. Status értékek:
    sent|delivered|undelivered|failed. Fail-open — hibánál False, sosem dob."""
    if not provider_sid:
        return False
    status = (status or "").strip().lower()
    if status not in _VALID_CALLBACK_STATUSES:
        logger.warning(f"update_sms_status: ismeretlen status {status!r} "
                       f"(sid={provider_sid})")
        return False
    payload = {"status": status, "updated_at": _now_iso()}
    code = _as_int(error_code)
    if code is not None:
        payload["error_code"] = code
    if status in ("undelivered", "failed"):
        payload["error_message"] = f"Twilio status-callback: {status}"
    return _update_sms_log(provider_sid=provider_sid, payload=payload)


def validate_twilio_signature(url: str, params: dict, signature: str,
                              auth_token: str) -> bool:
    """Twilio HMAC-SHA1 aláírás-ellenőrzés — az SDK RequestValidator
    algoritmusának kézi megfelelője (SDK nélkül):
      1. a paramétereket név szerint alfabetikusan rendezzük,
      2. az URL-hez sorban név+érték konkatenálódik,
      3. HMAC-SHA1 az auth_token kulccsal, majd base64-kódolás.
    Stdlib (hmac/hashlib/base64) — NEM twilio SDK. Sosem dob (hiba → False)."""
    try:
        data = url + "".join(f"{name}{params[name]}" for name in sorted(params or {}))
        mac = hmac.new((auth_token or "").encode("utf-8"),
                       data.encode("utf-8"), hashlib.sha1)
        expected = base64.b64encode(mac.digest()).decode("utf-8")
        return hmac.compare_digest(expected, signature or "")
    except Exception as exc:
        logger.warning(f"Twilio aláírás-ellenőrzési hiba (False): {exc}")
        return False
