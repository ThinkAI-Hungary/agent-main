"""
ThinkAI Voice Agent â Supabase Database Layer
All persistent data: calendar, emails, tasks, sessions, interactions, admin users.
"""

import os
import hashlib
import secrets
import contextvars
from datetime import datetime, timedelta, timezone
from pathlib import Path

from loguru import logger
from supabase import create_client, Client
from dotenv import load_dotenv

THIS_DIR = Path(__file__).resolve().parent
load_dotenv(THIS_DIR / ".env")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    logger.warning("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing from .env!")
    supabase: Client = None
else:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ═══════════════════════════════════════════════════════════════════════════
# MULTI-TENANCY (FÁZIS 2) — tenant-kontextus + credential store
# ═══════════════════════════════════════════════════════════════════════════
#
# A tenant egy contextvars.ContextVar-ban van — ugyanaz a minta, mint a tools.py
# session-state (coroutine-scoped, így párhuzamos requestek/workerek nem zavarják
# egymást). A DEFAULT_TENANT_SLUG ('rivergate') fallback biztosítja, hogy a még
# nem scope-olt hívások (pl. régi worker-ek, tesztek) a meglévő tenantre essenek
# vissza — így a live Rivergate nem áll le az átállás alatt.

DEFAULT_TENANT_SLUG = os.getenv("DEFAULT_TENANT_SLUG", "rivergate")

_tenant_ctx: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "eaisydesk_tenant_id", default=None
)

_tenant_id_cache: dict = {}  # slug → uuid (a tenants tábla ritkán változik)


def _resolve_tenant_id(slug: str) -> str | None:
    """slug → tenant uuid feloldása (cache-elve)."""
    if not slug:
        return None
    if slug in _tenant_id_cache:
        return _tenant_id_cache[slug]
    if not supabase:
        return None
    try:
        res = supabase.table("tenants").select("id").eq("slug", slug).limit(1).execute()
        tid = res.data[0]["id"] if res.data else None
        _tenant_id_cache[slug] = tid
        return tid
    except Exception as e:
        logger.error(f"_resolve_tenant_id({slug}) hiba: {e}")
        return None


def set_current_tenant(tenant_id: str | None):
    """Beállítja a jelenlegi coroutine tenantját (uuid). Request-middleware és
    worker-iteráció hívja."""
    _tenant_ctx.set(tenant_id)


def get_current_tenant() -> str | None:
    """Visszaadja a jelenlegi coroutine tenantját. Ha nincs beállítva (pl. régi
    worker, teszt), a DEFAULT_TENANT_SLUG-hoz tartozó uuid-t adja — így a
    backfill-elt Rivergate-adatok továbbra is elérhetők maradnak."""
    tid = _tenant_ctx.get()
    if tid:
        return tid
    return _resolve_tenant_id(DEFAULT_TENANT_SLUG)


def require_tenant() -> str:
    """Tenant uuid vagy RuntimeError — csak akkor használd, ha biztosan kell
    tenant (pl. insert-nél). Olvasásnál a get_current_tenant() fallback-je oké."""
    tid = get_current_tenant()
    if not tid:
        raise RuntimeError("Tenant context not set and no DEFAULT_TENANT_SLUG resolvable")
    return tid


def _tenant_eq(query, tid: str | None = None):
    """Hozzáadja a .eq("tenant_id", tid)-t egy supabase query-hez. Ha tid None,
    a get_current_tenant()-et használja (ami a default tenantre esik vissza)."""
    effective = tid if tid is not None else get_current_tenant()
    if effective:
        return query.eq("tenant_id", effective)
    return query


def _with_tenant(payload: dict, tid: str | None = None) -> dict:
    """Insert payload kiegészítése tenant_id-vel (ha nincs már benne)."""
    if "tenant_id" not in payload or not payload.get("tenant_id"):
        effective = tid if tid is not None else get_current_tenant()
        if effective:
            payload = {**payload, "tenant_id": effective}
    return payload


def get_active_tenants() -> list[dict]:
    """Összes aktív tenant (worker-iterációhoz, super-admin UI-hoz)."""
    if not supabase:
        return []
    try:
        res = supabase.table("tenants").select("id,slug,name,plan,active").eq("active", True).execute()
        return res.data or []
    except Exception as e:
        logger.error(f"get_active_tenants hiba: {e}")
        return []


# ── Credential store (titkosított, per-tenant) ───────────────────────────────

_CREDENTIALS_KEY = os.getenv("CREDENTIALS_ENCRYPTION_KEY", "")
_fernet = None


def _get_fernet():
    """Fernet a CREDENTIALS_ENCRYPTION_KEY-ből (urlsafe base64 32 byte).
    Ha nincs kulcs, None — ilyenkor a get_credential csak a .env fallback-re támaszkodik."""
    global _fernet
    if _fernet is not None:
        return _fernet
    if not _CREDENTIALS_KEY:
        return None
    try:
        from cryptography.fernet import Fernet
        key = _CREDENTIALS_KEY.encode()
        # Ha nem valid 32-byte base64 kulcs, deriváljuk belőle
        try:
            _fernet = Fernet(key)
        except Exception:
            import base64
            derived = base64.urlsafe_b64encode(hashlib.sha256(key).digest())
            _fernet = Fernet(derived)
        return _fernet
    except Exception as e:
        logger.error(f"Fernet init hiba: {e}")
        return None


def set_credential(tenant_id: str, key: str, value: str) -> bool:
    """Per-tenant credential titkosított tárolása (upsert)."""
    if not supabase:
        return False
    f = _get_fernet()
    if not f:
        logger.error("set_credential: CREDENTIALS_ENCRYPTION_KEY nincs beállítva")
        return False
    try:
        enc = f.encrypt(value.encode()).decode()
        supabase.table("tenant_credentials").upsert(
            {"tenant_id": tenant_id, "key": key, "value_encrypted": enc},
            on_conflict="tenant_id,key"
        ).execute()
        return True
    except Exception as e:
        logger.error(f"set_credential hiba ({key}): {e}")
        return False


def get_credential(tenant_id: str | None, key: str, default: str | None = None) -> str | None:
    """Per-tenant credential kiolvasása (dekódolva). Ha nincs a táblában,
    a `default`-ot adja (általában a megfelelő .env érték — platform-globális fallback)."""
    if tenant_id:
        try:
            res = supabase.table("tenant_credentials").select("value_encrypted").eq("tenant_id", tenant_id).eq("key", key).limit(1).execute()
            if res.data:
                f = _get_fernet()
                if f:
                    return f.decrypt(res.data[0]["value_encrypted"].encode()).decode()
        except Exception as e:
            logger.warning(f"get_credential({key}) dekódolási hiba (fallback default-ra): {e}")
    return default


def delete_credential(tenant_id: str, key: str) -> bool:
    """Per-tenant credential törlése. Ha sikeres, a credential visszaáll a
    globális .env fallback-re (get_credential default argumentuma)."""
    if not supabase or not tenant_id:
        return False
    try:
        supabase.table("tenant_credentials").delete().eq(
            "tenant_id", tenant_id
        ).eq("key", key).execute()
        return True
    except Exception as e:
        logger.error(f"delete_credential hiba ({key}): {e}")
        return False


def list_credential_keys(tenant_id: str) -> list[str]:
    """Visszaadja a tenant által tárolt credential kulcsok listáját.
    Az értékeket NEM olvassa ki — csak a kulcsneveket a GET API-hoz."""
    if not tenant_id or not supabase:
        return []
    try:
        res = (
            supabase.table("tenant_credentials")
            .select("key")
            .eq("tenant_id", tenant_id)
            .execute()
        )
        return [r["key"] for r in res.data] if res.data else []
    except Exception as e:
        logger.warning(f"list_credential_keys hiba: {e}")
        return []


def get_gemini_api_key(tenant_id: str | None = None) -> str:
    """Gemini API kulcs feloldása (BYOK): a tenant saját kulcsa a
    tenant_credentials-ből ('gemini_api_key'), különben a globális platform-kulcs.
    Közös helper — a classifier, email_processor és web_server is ezt használja."""
    tid = tenant_id or get_current_tenant()
    tenant_key = get_credential(tid, "gemini_api_key", default=None)
    if tenant_key:
        return tenant_key
    return os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or ""


def init_db():
    if supabase:
        logger.info(f"Connected to Supabase Cloud at {SUPABASE_URL}")
    else:
        logger.error("Supabase client not initialized.")

# ═══════════════════════════════════════════════════════════════════════════════
# ADMIN USERS
# ═══════════════════════════════════════════════════════════════════════════════

def _hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    hashed = hashlib.sha256(f"{salt}{password}".encode()).hexdigest()
    return f"{salt}:{hashed}"

def _verify_password(password: str, stored_hash: str) -> bool:
    try:
        salt, hashed = stored_hash.split(":", 1)
        return hashlib.sha256(f"{salt}{password}".encode()).hexdigest() == hashed
    except Exception:
        return False

def create_admin_user(username: str, password: str, email: str = "", role: str = "admin", created_by: str = "", full_name: str = "") -> bool:
    """Create a new admin user with role (admin/manager/member). Max 1 manager allowed."""
    if not supabase: return False
    try:
        res = _tenant_eq(supabase.table("admin_users").select("*")).eq("username", username).execute()
        if res.data:
            logger.warning(f"Admin user already exists: {username}")
            return False

        # Enforce max 1 manager per company (per tenant)
        if role == "manager":
            existing_managers = _tenant_eq(supabase.table("admin_users").select("id")).eq("role", "manager").execute()
            if existing_managers.data and len(existing_managers.data) >= 1:
                logger.warning("Cannot create manager: max 1 manager allowed per company")
                return False
        
        supabase.table("admin_users").insert(_with_tenant({
            "username": username,
            "email": email,
            "password_hash": _hash_password(password),
            "role": role,
            "created_by": created_by,
            "full_name": full_name
        })).execute()
        logger.info(f"Admin user created: {username} (role={role})")
        return True
    except Exception as e:
        logger.error(f"Error creating admin user: {e}")
        return False

def verify_admin_user(username: str, password: str) -> dict | None:
    """Verify admin credentials by username OR email, return user info including role.

    FIGYELEM: a login TENANT-FÜGGETLEN (nincs _tenant_eq szűrő) — a tenantot épp
    a user rekordból (tenant_id oszlop) kell kideríteni, tehát a keresésnek minden
    tenantot látnia kell. Ez nem adatszivárgás: a username jelszó-védett, és a
    login után a contextvar már a user saját tenantjára áll be."""
    if not supabase: return None
    try:
        # Try username first
        res = supabase.table("admin_users").select("*").eq("username", username).execute()
        # Fallback: try email
        if not res.data:
            res = supabase.table("admin_users").select("*").eq("email", username).execute()
        if res.data:
            user = res.data[0]
            if _verify_password(password, user["password_hash"]):
                # Update last login timestamp in background (non-blocking)
                import threading
                def _update_last_login(uid):
                    try:
                        _tenant_eq(supabase.table("admin_users").update({
                            "last_login": datetime.now(timezone.utc).isoformat()
                        })).eq("id", uid).execute()
                    except Exception:
                        pass
                threading.Thread(target=_update_last_login, args=(user["id"],), daemon=True).start()
                return {
                    "id": user["id"],
                    "username": user["username"],
                    "email": user.get("email", ""),
                    "role": user.get("role", "admin"),
                    "full_name": user.get("full_name", ""),
                    "tenant_id": user.get("tenant_id")
                }
    except Exception as e:
        logger.error(f"Error verifying admin: {e}")
    return None

def seed_admin_from_env():
    username = os.getenv("ADMIN_USERNAME", "admin")
    password = os.getenv("ADMIN_PASSWORD", "thinkai2026")
    email = os.getenv("ADMIN_EMAIL", "")
    created = create_admin_user(username, password, email, role="admin", created_by="system")
    if created:
        logger.info(f"Seeded admin user from env: {username}")

def get_admin_users() -> list[dict]:
    """List all admin users (without password hashes)."""
    if not supabase: return []
    try:
        res = _tenant_eq(supabase.table("admin_users").select(
            "id, username, email, role, full_name, created_at, last_login, created_by"
        )).order("created_at", desc=False).execute()
        return res.data or []
    except Exception as e:
        logger.error(f"Error listing admin users: {e}")
        return []

def get_admin_user_by_username(username: str) -> dict | None:
    """Get a single admin user by username (without password hash)."""
    if not supabase: return None
    try:
        res = _tenant_eq(supabase.table("admin_users").select(
            "id, username, email, role, full_name"
        )).eq("username", username).execute()
        return res.data[0] if res.data else None
    except Exception as e:
        logger.error(f"Error getting admin user: {e}")
        return None

def update_admin_role(user_id: int, role: str) -> bool:
    """Update admin user role (admin/manager/member). Max 1 manager enforced."""
    if not supabase or role not in ("admin", "manager", "member"): return False
    try:
        # Enforce max 1 manager per company (per tenant)
        if role == "manager":
            existing_managers = _tenant_eq(supabase.table("admin_users").select("id")).eq("role", "manager").neq("id", user_id).execute()
            if existing_managers.data and len(existing_managers.data) >= 1:
                logger.warning("Cannot change role to manager: max 1 manager allowed per company")
                return False
        _tenant_eq(supabase.table("admin_users").update({"role": role})).eq("id", user_id).execute()
        logger.info(f"Updated admin user {user_id} role to {role}")
        return True
    except Exception as e:
        logger.error(f"Error updating admin role: {e}")
        return False

def delete_admin_user(user_id: int) -> bool:
    """Delete an admin user."""
    if not supabase: return False
    try:
        _tenant_eq(supabase.table("admin_users").delete()).eq("id", user_id).execute()
        logger.info(f"Deleted admin user {user_id}")
        return True
    except Exception as e:
        logger.error(f"Error deleting admin user: {e}")
        return False

def update_admin_password(user_id: int, new_password: str) -> bool:
    """Update admin user password."""
    if not supabase: return False
    try:
        _tenant_eq(supabase.table("admin_users").update({
            "password_hash": _hash_password(new_password)
        })).eq("id", user_id).execute()
        logger.info(f"Updated password for admin user {user_id}")
        return True
    except Exception as e:
        logger.error(f"Error updating admin password: {e}")
        return False

# âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
# SESSIONS
# âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

def create_session(session_id: str, room_name: str, participant: str = "") -> None:
    if not supabase: return
    try:
        supabase.table("sessions").insert(_with_tenant({
            "session_id": session_id,
            "room_name": room_name,
            "started_at": datetime.now(timezone.utc).isoformat(),
            "participant": participant
        })).execute()
    except Exception as e:
        logger.error(f"Error creating session: {e}")

def close_session(session_id: str) -> None:
    if not supabase: return
    try:
        res = _tenant_eq(supabase.table("sessions").select("started_at")).eq("session_id", session_id).execute()
        if res.data:
            started_at = datetime.fromisoformat(res.data[0]["started_at"].replace("Z", "+00:00"))
            duration = int((datetime.now(timezone.utc) - started_at).total_seconds())
            _tenant_eq(supabase.table("sessions").update({
                "ended_at": datetime.now(timezone.utc).isoformat(),
                "duration_seconds": duration
            })).eq("session_id", session_id).execute()
    except Exception as e:
        logger.error(f"Error closing session: {e}")

def update_session_participant(session_id: str, participant: str) -> None:
    if not supabase: return
    try:
        _tenant_eq(supabase.table("sessions").update({"participant": participant})).eq("session_id", session_id).execute()
    except Exception as e:
        logger.error(f"Error updating session participant: {e}")

def get_sessions(limit: int = 50) -> list[dict]:
    if not supabase: return []
    try:
        return _tenant_eq(supabase.table("sessions").select("*")).order("started_at", desc=True).limit(limit).execute().data
    except Exception:
        return []

# âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
# INTERACTIONS
# âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

def log_interaction(type: str, topic: str = "", summary: str = "", result: str = "", tool_name: str = "", session_id: str = "", funnel_stage: str = "relevant", alert_tags: list = None, handover_reason: str = None, direction: str = "inbound", approval_status: str = "pending", ai_draft_response: str = None, clinic_id: int = None, classification: dict = None, client_id: int = None) -> None:
    if not supabase: return
    try:
        data = {
            "session_id": session_id or None,
            "type": type,
            "topic": topic,
            "summary": summary,
            "result": result,
            "tool_name": tool_name or None,
            "funnel_stage": funnel_stage,
            "alert_tags": alert_tags or [],
            "handover_reason": handover_reason,
            "direction": direction,
            "approval_status": approval_status,
            "ai_draft_response": ai_draft_response,
            "clinic_id": clinic_id
        }
        if client_id is not None:
            data["client_id"] = client_id
        if classification is not None:
            data["classification"] = classification
        supabase.table("interactions").insert(_with_tenant(data)).execute()
    except Exception as e:
        logger.error(f"Error logging interaction: {e}")
        # Fallback: try dropping optional columns that may not exist in the schema
        dropped = []
        if client_id is not None and "client_id" in data:
            del data["client_id"]
            dropped.append("client_id")
        if classification is not None and "classification" in data:
            del data["classification"]
            dropped.append("classification")
        if dropped:
            logger.info(f"Attempting fallback log without {', '.join(dropped)}...")
            try:
                supabase.table("interactions").insert(_with_tenant(data)).execute()
                logger.info(f"Fallback log successful ({', '.join(dropped)} dropped)!")
            except Exception as fe:
                logger.error(f"Fallback log failed: {fe}")

# âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
# CALENDAR
# âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

def get_calendar_events() -> list[dict]:
    if not supabase: return []
    try:
        res = _tenant_eq(supabase.table("calendar_events").select("*")).order("start_dt", desc=False).execute()
        return res.data
    except Exception:
        return []

def add_calendar_event(title, start_dt, end_dt, duration_minutes, attendee="", attendee_email="") -> int:
    if not supabase: return 0
    try:
        res = supabase.table("calendar_events").insert(_with_tenant({
            "title": title,
            "start_dt": start_dt,
            "end_dt": end_dt,
            "duration_minutes": duration_minutes,
            "attendee": attendee,
            "attendee_email": attendee_email
        })).execute()
        return res.data[0]["id"] if res.data else 0
    except Exception as e:
        logger.error(f"Add event error: {e}")
        return 0

def update_calendar_event(event_id: int, **fields) -> bool:
    if not supabase: return False
    allowed = {"title", "start_dt", "end_dt", "duration_minutes", "attendee", "attendee_email", "completed"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates: return False
    try:
        _tenant_eq(supabase.table("calendar_events").update(updates)).eq("id", event_id).execute()
        return True
    except Exception:
        return False

def delete_calendar_event(event_id: int) -> bool:
    if not supabase: return False
    try:
        _tenant_eq(supabase.table("calendar_events").delete()).eq("id", event_id).execute()
        return True
    except Exception:
        return False

def find_calendar_event_by_title(title_fragment: str) -> dict | None:
    if not supabase: return None
    try:
        res = _tenant_eq(supabase.table("calendar_events").select("*")).ilike("title", f"%{title_fragment}%").order("start_dt", desc=False).limit(1).execute()
        return res.data[0] if res.data else None
    except Exception:
        return None

def find_upcoming_event_by_attendee(email: str = None, name: str = None) -> dict | None:
    if not supabase: return None
    from datetime import datetime
    now_iso = datetime.now().isoformat()
    try:
        query = _tenant_eq(supabase.table("calendar_events").select("*")).gte("start_dt", now_iso).order("start_dt", desc=False)
        if email:
            query = query.eq("attendee_email", email)
        elif name:
            query = query.ilike("attendee", f"%{name}%")
        else:
            return None
            
        res = query.limit(1).execute()
        return res.data[0] if res.data else None
    except Exception as e:
        logger.error(f"Find upcoming event error: {e}")
        return None


def get_calendar_event(event_id: int) -> dict | None:
    if not supabase: return None
    try:
        res = _tenant_eq(supabase.table("calendar_events").select("*")).eq("id", event_id).execute()
        return res.data[0] if res.data else None
    except Exception as e:
        logger.error(f"Get calendar event error: {e}")
        return None

# âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
# EMAIL LOGS
# âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

def add_email_log(to_name, to_email, subject, message, status, error="", session_id="") -> int:
    if not supabase: return 0
    try:
        res = supabase.table("email_logs").insert(_with_tenant({
            "to_name": to_name,
            "to_email": to_email,
            "subject": subject,
            "message": message,
            "status": status,
            "error": error or None,
            "session_id": session_id or None
        })).execute()
        return res.data[0]["id"] if res.data else 0
    except Exception:
        return 0

def get_grouped_interactions(limit: int = 100, offset: int = 0) -> dict:
    """Szerver-oldali session-aggregáció (SQL függvény): sessionönként 1 sor,
    reprezentatív interakció + session-max státusz + darabszám. A kliens-oldali
    500 soros ablakos merge helyett. A sessions tábla participant/room_name
    mezőit Python-oldalon csatoljuk (a frontend client-feloldásához kell)."""
    if not supabase:
        return {"sessions": [], "total": 0}
    try:
        res = supabase.rpc("get_grouped_interactions", {"p_limit": limit, "p_offset": offset, "p_tenant": get_current_tenant()}).execute()
        data = res.data
        if not isinstance(data, dict):
            return {"sessions": [], "total": 0}
        # Participant/room kiegészítés a sessions táblából
        try:
            sids = [s.get("session_id") for s in data.get("sessions", []) if s.get("session_id")]
            if sids:
                sres = _tenant_eq(supabase.table("sessions").select("session_id, room_name, participant")).in_("session_id", sids).execute()
                smap = {s["session_id"]: s for s in (sres.data or [])}
                for s in data.get("sessions", []):
                    sess = smap.get(s.get("session_id"), {})
                    s["room_name"] = sess.get("room_name")
                    s["participant"] = sess.get("participant")
        except Exception as se:
            logger.warning(f"grouped sessions participant enrich hiba: {se}")
        return data
    except Exception as e:
        logger.error(f"get_grouped_interactions error: {e}")
        return {"sessions": [], "total": 0}


def get_email_logs(limit: int = 100) -> list[dict]:
    if not supabase: return []
    try:
        res = _tenant_eq(supabase.table("email_logs").select("*")).order("sent_at", desc=True).limit(limit).execute()
        return res.data
    except Exception:
        return []

# ═══════════════════════════════════════════════════════════════════════════════
# PROCESSED EMAILS — Message-ID alapú deduplikáció (EAISY-241 email pipeline)
# ═══════════════════════════════════════════════════════════════════════════════

def claim_processed_email(message_id: str, from_email: str = "", session_id: str = "") -> bool:
    """Insert-first claim a bejövő levélre. True = mi nyertük a claimet (feldolgozható),
    False = már feldolgozta (ez vagy egy másik process) → ki kell hagyni.
    DB-hiba esetén True-t ad (fail-open): inkább dolgozzuk fel kétszer, mint hogy
    elvesszen — a versenyhelyzet ablaka így is nagyságrendekkel kisebb."""
    if not supabase or not message_id:
        return True
    try:
        supabase.table("processed_emails").insert(_with_tenant({
            "message_id": message_id,
            "from_email": from_email or None,
            "session_id": session_id or None,
        })).execute()
        return True
    except Exception as e:
        err = str(e)
        if "23505" in err or "duplicate" in err.lower() or "409" in err:
            return False  # már létezik → duplikátum
        logger.warning(f"claim_processed_email hiba (fail-open, feldolgozzuk): {e}")
        return True

def update_processed_email_status(message_id: str, status: str) -> bool:
    if not supabase or not message_id:
        return False
    try:
        _tenant_eq(supabase.table("processed_emails").update({"status": status})).eq("message_id", message_id).execute()
        return True
    except Exception:
        return False

# âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
# TASKS
# âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

def add_task(text, priority="normal", due_date="", session_id="") -> int:
    if not supabase: return 0
    try:
        res = supabase.table("tasks").insert(_with_tenant({
            "text": text,
            "priority": priority,
            "due_date": due_date or None,
            "session_id": session_id or None
        })).execute()
        return res.data[0]["id"] if res.data else 0
    except Exception:
        return 0

def get_tasks(completed: bool | None = None, limit: int = 100) -> list[dict]:
    if not supabase: return []
    try:
        query = _tenant_eq(supabase.table("tasks").select("*")).order("created_at", desc=True).limit(limit)
        if completed is not None:
            query = query.eq("completed", 1 if completed else 0)
        res = query.execute()
        return res.data
    except Exception:
        return []

def update_task_complete(task_id: int) -> dict:
    if not supabase: return {"ok": False}
    try:
        res = _tenant_eq(supabase.table("tasks").select("completed")).eq("id", task_id).execute()
        if not res.data: return {"ok": False}
        new_val = 0 if res.data[0]["completed"] else 1
        _tenant_eq(supabase.table("tasks").update({"completed": new_val})).eq("id", task_id).execute()
        return {"ok": True, "completed": bool(new_val)}
    except Exception:
        return {"ok": False}

def delete_task(task_id: int) -> bool:
    if not supabase: return False
    try:
        _tenant_eq(supabase.table("tasks").delete()).eq("id", task_id).execute()
        return True
    except Exception:
        return False

# âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
# ANALYTICS
# âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

def get_alerts_stats(period: str = "month", channel: str = "mind", clinic_id: str = "mind", date_from: str = "", date_to: str = "") -> dict:
    if not supabase: 
        return {"urgent_count": 0, "complaint_count": 0, "callback_count": 0, "recurring_count": 0, "stuck_count": 0}
    try:
        # Calculate period start date (consistent with get_stats)
        today = datetime.now(timezone.utc)
        if date_from and date_to:
            start_dt = datetime.fromisoformat(date_from).replace(tzinfo=timezone.utc)
        elif period == "week":
            start_dt = today - timedelta(days=today.weekday())
        elif period == "month":
            start_dt = today.replace(day=1)
        else:  # year
            start_dt = today - timedelta(days=365)

        # Fetch interactions with alert_tags, filtered by period
        all_alerts_query = _tenant_eq(supabase.table("interactions").select("type, alert_tags, clinic_id")).not_.is_("alert_tags", "null").neq("approval_status", "spam").gte("created_at", start_dt.isoformat()).execute()
        urgent_count = complaint_count = callback_count = recurring_count = 0
        for row in all_alerts_query.data:
            if not _matches_channel(row.get("type"), channel): continue
            if clinic_id and clinic_id != "mind" and row.get("clinic_id") is not None and str(row.get("clinic_id")) != str(clinic_id): continue
            tags = row.get("alert_tags", [])
            if not tags or tags == []:  continue  # Skip empty tag lists
            if "urgent" in tags: urgent_count += 1
            if "complaint" in tags: complaint_count += 1
            if "callback" in tags: callback_count += 1
            if "recurring" in tags: recurring_count += 1

        
        # Stuck cases: older than 24 hours and not in a closed status
        # Only count when channel is "mind" (all), otherwise stuck_count is not meaningful per channel
        stuck_count = 0
        if channel == "mind":
            yesterday = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
            clients_res = _tenant_eq(supabase.table("clients").select("id, status, custom_data")).lt("created_at", yesterday).execute()
            
            closed_statuses = ["lezarva", "siker", "kuka", "befejezett", "lezart"]
            for c in clients_res.data:
                st_lower = str(c.get("status", "")).lower()
                if not any(k in st_lower for k in closed_statuses):
                    # Filter by clinic_id if specified
                    if clinic_id and clinic_id != "mind":
                        cd = c.get("custom_data") or {}
                        if isinstance(cd, str):
                            try:
                                import json as _json
                                cd = _json.loads(cd)
                            except: cd = {}
                        if cd.get("clinic_id") and str(cd.get("clinic_id", "")) != str(clinic_id):
                            continue
                    stuck_count += 1
                
        return {
            "urgent_count": urgent_count,
            "complaint_count": complaint_count,
            "callback_count": callback_count,
            "recurring_count": recurring_count,
            "stuck_count": stuck_count
        }
    except Exception as e:
        logger.error(f"Alert stats error: {e}")
        return {"urgent_count": 0, "complaint_count": 0, "callback_count": 0, "recurring_count": 0, "stuck_count": 0}

def get_alert_details(alert_type: str) -> list[dict]:
    if not supabase: return []
    try:
        if alert_type == "stuck":
            yesterday = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
            clients_res = _tenant_eq(supabase.table("clients").select("*")).lt("created_at", yesterday).order("created_at", desc=True).execute()
            
            stuck_cases = []
            closed_statuses = ["lezarva", "siker", "kuka", "befejezett", "lezart"]
            for c in clients_res.data:
                st_lower = str(c.get("status", "")).lower()
                if not any(k in st_lower for k in closed_statuses):
                    import json
                    try:
                        custom = json.loads(c.get("custom_data") or "{}")
                    except:
                        custom = {}
                    
                    source = custom.get("forras_csatorna") or ("Messenger" if custom.get("messenger_id") else "Ismeretlen")
                    name = custom.get("name", custom.get("név", "Névtelen"))
                    
                    stuck_cases.append({
                        "id": c["id"],
                        "created_at": c["created_at"],
                        "name": name,
                        "channel": source,
                        "status": c["status"],
                        "is_stuck": True
                    })
            return stuck_cases
        elif alert_type in ["urgent", "complaint", "callback", "recurring"]:
            # Standard interactions filter
            res = _tenant_eq(supabase.table("interactions").select("*")).contains("alert_tags", f'["{alert_type}"]').order("created_at", desc=True).limit(50).execute()
            
            alerts = []
            for item in res.data:
                alerts.append({
                    "id": item["id"],
                    "created_at": item["created_at"],
                    "channel": item["type"],
                    "topic": item["topic"],
                    "summary": item["summary"],
                    "is_stuck": False
                })
            return alerts
            
        return []
    except Exception as e:
        logger.error(f"Alert details error: {e}")
        return []

def get_latest_ai_insights() -> list[str]:
    if not supabase: return []
    try:
        res = _tenant_eq(supabase.table("ai_insights").select("insights")).order("created_at", desc=True).limit(1).execute()
        if res.data and len(res.data) > 0:
            return res.data[0].get("insights", [])
        return []
    except Exception as e:
        logger.error(f"Get AI insights error: {e}")
        return []

def save_ai_insights(insights: list[str]) -> bool:
    if not supabase: return False
    try:
        supabase.table("ai_insights").insert(_with_tenant({"insights": insights})).execute()
        return True
    except Exception as e:
        logger.error(f"Save AI insights error: {e}")
        return False


def _matches_channel(type_str: str, channel: str) -> bool:
    if channel == "mind": return True
    if not type_str: return False  # Unknown type does not match any specific channel filter
    t = type_str.lower()
    if channel == "telefon":
        return "email" not in t and "whatsapp" not in t and "messenger" not in t and "meta" not in t and "facebook" not in t and "instagram" not in t
    if channel == "email": return "email" in t
    if channel == "whatsapp": return "whatsapp" in t
    if channel == "instagram": return "instagram" in t
    if channel in ["facebook", "messenger"]:
        return "messenger" in t or "meta" in t or "facebook" in t
    return False

def map_topic_category(raw_topic: str) -> str:
    if not raw_topic: return "Egyéb"
    t = str(raw_topic).lower()
    
    if any(x in t for x in ["sürgős", "fáj", "panasz", "gyulladás", "vérzik", "letört", "kiesett", "sürgősségi", "duzzanat"]):
        return "Sürgős panasz"
    if any(x in t for x in ["kontroll", "varratszedés", "visszarendelés", "későbbi", "folytatás"]):
        return "Kontroll időpont"
    if any(x in t for x in ["időpont", "foglalás", "bejelentkezés", "lemondás", "módosítás", "booking"]):
        return "Időpontfoglalás"
    if any(x in t for x in ["ár", "mennyi", "költség", "ajánlat", "fizetés", "akció", "részletfizetés"]):
        return "Árkérdés"
    if any(x in t for x in ["nyitva", "óra", "mikor", "rendelési idő", "rendelés"]):
        return "Nyitvatartás"
    if "email" in t or "e-mail" in t or "marketing" in t or "növelje" in t or "hírlevél" in t:
        return "E-mail megkeresés"
    
    return "Általános érdeklődés"

def get_stats(period: str = "month", channel: str = "mind", clinic_id: str = "mind", date_from: str = "", date_to: str = "") -> dict:
    if not supabase: return {}
    today = datetime.now(timezone.utc)
    
    if date_from and date_to:
        start_dt = datetime.fromisoformat(date_from).replace(tzinfo=timezone.utc)
        end_dt = datetime.fromisoformat(date_to).replace(tzinfo=timezone.utc) + timedelta(days=1)
        duration = end_dt - start_dt
        prev_end = start_dt
        prev_start = prev_end - duration
    elif period == "week":
        start_dt = today - timedelta(days=today.weekday())
        prev_start = start_dt - timedelta(days=7)
        prev_end = start_dt
    elif period == "month":
        start_dt = today.replace(day=1)
        prev_end = start_dt
        prev_start = (prev_end - timedelta(days=1)).replace(day=1)
    else: # year
        start_dt = today - timedelta(days=365)
        prev_end = start_dt
        prev_start = prev_end - timedelta(days=365)

    try:
        # Fallback to count="exact" for Mind channel
        if channel == "mind" and clinic_id == "mind":
            sess_res = _tenant_eq(supabase.table("sessions").select("id", count="exact", head=True)).gte("started_at", start_dt.isoformat()).execute()
            inter_res = _tenant_eq(supabase.table("interactions").select("id", count="exact", head=True)).gte("created_at", start_dt.isoformat()).execute()
            email_res = _tenant_eq(supabase.table("email_logs").select("id", count="exact", head=True)).gte("sent_at", start_dt.isoformat()).execute()
            cal_res = _tenant_eq(supabase.table("calendar_events").select("id", count="exact", head=True)).gte("start_dt", start_dt.isoformat()).execute()
            
            tot_sess = sess_res.count or 0
            tot_inter = inter_res.count or 0
            tot_email = email_res.count or 0
            tot_cal = cal_res.count or 0
        else:
            # If a specific channel is selected, we compute these via Python filtering or approximation
            # Since emails and calendar events don't have "channel" easily, we'll just keep them 0 or fetch all.
            # Actually, total_interactions can be calculated from all_inters below.
            tot_sess = 0
            tot_inter = 0
            tot_email = 0
            tot_cal = 0
        
        prev_sess = _tenant_eq(supabase.table("sessions").select("id", count="exact", head=True)).gte("started_at", prev_start.isoformat()).lt("started_at", prev_end.isoformat()).execute()
        prev_inter = _tenant_eq(supabase.table("interactions").select("id", count="exact", head=True)).gte("created_at", prev_start.isoformat()).lt("created_at", prev_end.isoformat()).execute()
        prev_email = _tenant_eq(supabase.table("email_logs").select("id", count="exact", head=True)).gte("sent_at", prev_start.isoformat()).lt("sent_at", prev_end.isoformat()).execute()
        prev_cal = _tenant_eq(supabase.table("calendar_events").select("id", count="exact", head=True)).gte("start_dt", prev_start.isoformat()).lt("start_dt", prev_end.isoformat()).execute()

        tasks_res = _tenant_eq(supabase.table("tasks").select("id", count="exact", head=True)).eq("completed", 0).execute()

        all_inters = _tenant_eq(supabase.table("interactions").select("type, topic, handover_reason, created_at, clinic_id, session_id, approval_status")).gte("created_at", start_dt.isoformat()).neq("approval_status", "spam").execute()
        type_counts = {}
        seen_sessions_for_type = set()
        topic_counts = {}
        handover_counts = {
            "Összetett kérdés": 0,
            "Sürgős / triázs": 0,
            "Hiányzó info": 0,
            "Foglalási kivétel": 0,
            "Emberi döntés": 0
        }
        
        interactions_by_dow = {"total": [0]*7, "channels": {}}
        interactions_by_hour = {"total": [0]*24, "channels": {}}
        
        for i in all_inters.data:
            if not _matches_channel(i.get("type"), channel):
                continue
            if clinic_id and clinic_id != "mind" and i.get("clinic_id") is not None and str(i.get("clinic_id")) != str(clinic_id):
                continue
            t_raw = (i.get("type") or "Telefon").lower()
            if "email" in t_raw:
                t = "E-Mail"
            elif "whatsapp" in t_raw:
                t = "Whatsapp"
            elif "instagram" in t_raw:
                t = "Instagram"
            elif "messenger" in t_raw or "meta" in t_raw or "facebook" in t_raw:
                t = "Messenger"
            else:
                t = "Telefon"
                
            session_id = i.get("session_id")
            if session_id:
                # Csatornamegoszlásnál csak egyedi session/ügyfél számít
                if session_id not in seen_sessions_for_type:
                    seen_sessions_for_type.add(session_id)
                    type_counts[t] = type_counts.get(t, 0) + 1
            else:
                # Ha nincs session_id, akkor minden interakció egyedi (pl. régi adatok)
                type_counts[t] = type_counts.get(t, 0) + 1
            
            created_at = i.get("created_at")
            if created_at:
                try:
                    dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                    dt_local = dt + timedelta(hours=2) # CET/CEST aprox
                    
                    wd = dt_local.weekday()
                    hr = dt_local.hour
                    
                    interactions_by_dow["total"][wd] += 1
                    if t not in interactions_by_dow["channels"]:
                        interactions_by_dow["channels"][t] = [0]*7
                    interactions_by_dow["channels"][t][wd] += 1
                    
                    interactions_by_hour["total"][hr] += 1
                    if t not in interactions_by_hour["channels"]:
                        interactions_by_hour["channels"][t] = [0]*24
                    interactions_by_hour["channels"][t][hr] += 1
                except Exception:
                    pass            
            topic_raw = i.get("topic")
            if topic_raw:
                t_topic = str(topic_raw).strip()
                if t_topic.lower() not in ["", "none", "null", "ismeretlen"]:
                    # Group into predefined categories
                    mapped_topic = map_topic_category(t_topic)
                    topic_counts[mapped_topic] = topic_counts.get(mapped_topic, 0) + 1

            ho_reason = i.get("handover_reason")
            if ho_reason:
                ho_reason = str(ho_reason).strip()
                if ho_reason:
                    handover_counts[ho_reason] = handover_counts.get(ho_reason, 0) + 1

        interactions_by_type = [{"type": k, "count": v} for k, v in sorted(type_counts.items(), key=lambda x: x[1], reverse=True)]
        interactions_by_topic = [{"topic": k, "count": v} for k, v in sorted(topic_counts.items(), key=lambda x: x[1], reverse=True)]
        
        # Sort handovers primarily by predefined order or count, but dict items are fine as is, we'll format them to a list
        handovers = [{"reason": k, "count": v} for k, v in handover_counts.items()]

        all_sess = _tenant_eq(supabase.table("sessions").select("started_at, duration_seconds")).gte("started_at", start_dt.isoformat()).execute()
        day_counts = {}
        total_dur = 0
        valid_durs = 0
        for s in all_sess.data:
            d = s["started_at"][:10]
            if period == "year":
                d = s["started_at"][:7]
            day_counts[d] = day_counts.get(d, 0) + 1
            if s.get("duration_seconds") is not None:
                total_dur += s["duration_seconds"]
                valid_durs += 1
        
        avg_dur = (total_dur / valid_durs) if valid_durs > 0 else 0

        prev_sess_data = _tenant_eq(supabase.table("sessions").select("duration_seconds")).gte("started_at", prev_start.isoformat()).lt("started_at", prev_end.isoformat()).execute()
        prev_tot_dur = sum([s["duration_seconds"] for s in prev_sess_data.data if s.get("duration_seconds") is not None])
        prev_val_durs = len([s for s in prev_sess_data.data if s.get("duration_seconds") is not None])
        prev_avg_dur = (prev_tot_dur / prev_val_durs) if prev_val_durs > 0 else 0

        # Previous period handover count
        prev_handover_res = _tenant_eq(supabase.table("interactions").select("id", count="exact", head=True)).not_.is_("handover_reason", "null").gte("created_at", prev_start.isoformat()).lt("created_at", prev_end.isoformat()).execute()
        prev_total_handovers = prev_handover_res.count or 0

        all_keys = []
        if period == "week":
            for i in range((today.date() - start_dt.date()).days + 1):
                all_keys.append((start_dt.date() + timedelta(days=i)).isoformat())
        elif period == "month":
            for i in range((today.date() - start_dt.date()).days + 1):
                all_keys.append((start_dt.date() + timedelta(days=i)).isoformat())
        else:
            d = today.replace(day=1)
            for _ in range(12):
                all_keys.insert(0, d.strftime("%Y-%m"))
                d = (d - timedelta(days=1)).replace(day=1)
        
        filled_days = [{"day": k, "count": day_counts.get(k, 0)} for k in all_keys]

        # Total handovers in current period (interactions with handover_reason filled)
        total_handovers = sum(handover_counts.values())

        return {
            "total_sessions": tot_sess if channel == "mind" else len([i for i in all_sess.data if _matches_channel(i.get("room_name",""), channel)]) ,
            "total_interactions": tot_inter if channel == "mind" else sum(type_counts.values()),
            "total_emails": tot_email if channel == "mind" else (tot_email if channel == "email" else 0),
            "total_bookings": tot_cal if channel == "mind" else 0,
            "total_handovers": total_handovers,
            "open_tasks": tasks_res.count or 0,
            "avg_session_duration": round(avg_dur),
            "handovers": handovers,
            "interactions_by_type": interactions_by_type,
            "interactions_by_topic": interactions_by_topic,
            "interactions_by_dow": interactions_by_dow,
            "interactions_by_hour": interactions_by_hour,
            "sessions_per_day": filled_days,
            "previous_period": {
                "total_sessions": prev_sess.count or 0,
                "total_interactions": prev_inter.count or 0,
                "total_emails": prev_email.count or 0,
                "total_bookings": prev_cal.count or 0,
                "total_handovers": prev_total_handovers,
                "avg_session_duration": round(prev_avg_dur),
            }
        }
    except Exception as e:
        logger.error(f"Stats error: {e}")
        return {}

def get_outbound_stats(period: str = "month", channel: str = "mind", clinic_id: str = "mind", date_from: str = "", date_to: str = "") -> dict:
    if not supabase: return {"total_outbound": 0, "reached_rate": 0, "booked_count": 0, "booked_rate": 0, "open_followup": 0}
    today = datetime.now(timezone.utc)
    
    if date_from and date_to:
        start_dt = datetime.fromisoformat(date_from).replace(tzinfo=timezone.utc)
    elif period == "week":
        start_dt = today - timedelta(days=today.weekday())
    elif period == "month":
        start_dt = today.replace(day=1)
    else: # year
        start_dt = today - timedelta(days=365)

    try:
        all_inters = _tenant_eq(supabase.table("interactions").select("session_id, direction, funnel_stage, handover_reason, created_at, type, clinic_id, topic")).gte("created_at", start_dt.isoformat()).neq("approval_status", "spam").execute()
        
        sessions = {}
        # also count interactions without session_id that are outbound
        total_outbound = 0
        
        activities = {
            'Visszahívás': 0,
            'Emlékeztető': 0,
            'Utánkövetés': 0,
            'Kampány': 0,
            'Kontroll': 0,
            'Passzív': 0
        }
        
        for i in all_inters.data:
            if not _matches_channel(i.get("type"), channel):
                continue
            if clinic_id and clinic_id != "mind" and i.get("clinic_id") is not None and str(i.get("clinic_id")) != str(clinic_id):
                continue
            d = i.get("direction", "inbound") or "inbound"
            if d == "outbound":
                total_outbound += 1
                
                t_lower = str(i.get("topic", "")).lower() + " " + str(i.get("type", "")).lower()
                if "emlékeztető" in t_lower:
                    activities['Emlékeztető'] += 1
                elif "visszahívás" in t_lower or ("hív" in t_lower and "sip" in t_lower):
                    activities['Visszahívás'] += 1
                elif "utánkövetés" in t_lower:
                    activities['Utánkövetés'] += 1
                elif "kampány" in t_lower:
                    activities['Kampány'] += 1
                elif "kontroll" in t_lower:
                    activities['Kontroll'] += 1
                else:
                    activities['Passzív'] += 1
                
            sid = i.get("session_id")
            if not sid:
                continue
            if sid not in sessions:
                sessions[sid] = {"outbound": [], "inbound": []}
            sessions[sid][d].append(i)
            
        reached_count = 0
        booked_count = 0
        open_followup = 0
        negotiating_count = 0
        
        for sid, data in sessions.items():
            if not data["outbound"]:
                continue
            
            # Reached: if there is any inbound in this session (meaning they replied)
            if data["inbound"]:
                reached_count += 1
                
                # Check for followup
                has_handover = any(o.get("handover_reason") for o in data["outbound"] + data["inbound"])
                # Ideally we check if it's open, but for now we check if there's a handover reason
                if has_handover:
                    open_followup += 1
            
            # Negotiating: if any interaction in this session has funnel_stage in ['ajanlat', 'foglalas_alatt', 'foglalt']
            is_negotiating = any(o.get("funnel_stage") in ["ajanlat", "foglalas_alatt", "foglalt"] for o in data["outbound"] + data["inbound"])
            if is_negotiating:
                negotiating_count += 1
                
            # Booked: if any interaction in this session has funnel_stage == 'foglalt'
            is_booked = any(o.get("funnel_stage") == "foglalt" for o in data["outbound"] + data["inbound"])
            if is_booked:
                booked_count += 1
                
        reached_rate = round((reached_count / total_outbound * 100)) if total_outbound > 0 else 0
        booked_rate = round((booked_count / total_outbound * 100)) if total_outbound > 0 else 0
        
        return {
            "total_outbound": total_outbound,
            "reached_count": reached_count,
            "reached_rate": reached_rate,
            "negotiating_count": negotiating_count,
            "booked_count": booked_count,
            "booked_rate": booked_rate,
            "open_followup": open_followup,
            "activities": activities
        }
    except Exception as e:
        logger.error(f"Outbound stats error: {e}")
        return {"total_outbound": 0, "reached_rate": 0, "booked_count": 0, "booked_rate": 0, "open_followup": 0, "activities": {}}

def get_funnel_stats(period: str = "month", channel: str = "mind", clinic_id: str = "mind", date_from: str = "", date_to: str = "") -> dict:
    if not supabase: return {}
    try:
        today = datetime.now(timezone.utc)
        if date_from and date_to:
            start_dt = datetime.fromisoformat(date_from).replace(tzinfo=timezone.utc)
        elif period == "week": start_dt = today - timedelta(days=today.weekday())
        elif period == "month": start_dt = today.replace(day=1)
        else: start_dt = today - timedelta(days=365)
        
        res = _tenant_eq(supabase.table("interactions").select("funnel_stage, type, clinic_id")).gte("created_at", start_dt.isoformat()).neq("approval_status", "spam").execute()
        stages = []
        for r in res.data:
            if not _matches_channel(r.get("type"), channel): continue
            if clinic_id and clinic_id != "mind" and r.get("clinic_id") is not None and str(r.get("clinic_id")) != str(clinic_id): continue
            stages.append(r.get("funnel_stage") or "relevant")
        
        relevant_count = len([s for s in stages if s not in ("irrelevant", "spam")])
        valaszolt_count = len([s for s in stages if s in ("valaszolt", "ajanlat", "foglalt")])
        ajanlat_count = len([s for s in stages if s in ("ajanlat", "foglalt")])
        foglalt_count = len([s for s in stages if s == "foglalt"])
        
        return {
            "osszes_relevans": relevant_count,
            "valaszolt_ugyek": valaszolt_count,
            "ajanlatig_jutott": ajanlat_count,
            "idopont_lett": foglalt_count
        }
    except Exception as e:
        logger.error(f"Funnel stats error: {e}")
        return {
            "osszes_relevans": 0,
            "valaszolt_ugyek": 0,
            "ajanlatig_jutott": 0,
            "idopont_lett": 0
        }

def get_interactions(limit: int = 100, type_filter: str = "") -> list[dict]:
    if not supabase: return []
    try:
        query = _tenant_eq(supabase.table("interactions").select("*")).order("created_at", desc=True).limit(limit)
        if type_filter:
            query = query.eq("type", type_filter)
        res = query.execute()
        interactions = res.data
        
        # Enrich with session participant names
        session_ids = list(set(i.get("session_id") for i in interactions if i.get("session_id")))
        if session_ids:
            sess_res = _tenant_eq(supabase.table("sessions").select("session_id, participant")).in_("session_id", session_ids).execute()
            sess_map = {s["session_id"]: s.get("participant", "") for s in (sess_res.data or [])}
            for i in interactions:
                sid = i.get("session_id")
                if sid and sid in sess_map:
                    i["participant"] = sess_map[sid]
        
        return interactions
    except Exception:
        return []

def _build_session_summary(interactions: list[dict]) -> str:
    if not interactions: return "Nincs rögzített interakció ebben a sessionben."
    type_counts = {}
    topics = []
    for i in interactions:
        t = i.get("type", "")
        if t: type_counts[t] = type_counts.get(t, 0) + 1
        topic = i.get("topic", "")
        if topic and topic not in topics: topics.append(topic)
    parts = []
    label_map = {"email": "email küldés", "foglalás": "időpontfoglalás", "feladat": "feladat rögzítés", "kérdés": "kérdés / tudásbázis", "időjárás": "időjárás lekérdezés"}
    for typ, cnt in type_counts.items():
        label = label_map.get(typ, typ)
        parts.append(f"{cnt}× {label}")
    summary = ("A session során: " + ", ".join(parts) + ".") if parts else "Általános beszélgetés."
    specific = [t for t in topics if t not in ("Email küldés", "Időpontfoglalás", "Feladat rögzítés")][:3]
    if specific: summary += " Témák: " + "; ".join(specific) + "."
    return summary

def get_sessions_with_summary(limit: int = 50) -> list[dict]:
    if not supabase: return []
    try:
        sessions = _tenant_eq(supabase.table("sessions").select("*")).order("started_at", desc=True).limit(limit).execute().data
        if not sessions:
            return []
            
        session_ids = [s["session_id"] for s in sessions]
        
        # 1 lekérdezéssel lehozzuk az összes interakciót (N+1 query javítás)
        all_inters = _tenant_eq(supabase.table("interactions").select("*")).in_("session_id", session_ids).order("created_at", desc=False).execute().data
        
        inters_by_session = {}
        for inter in all_inters:
            sid = inter.get("session_id")
            if sid not in inters_by_session:
                inters_by_session[sid] = []
            inters_by_session[sid].append(inter)
            
        for sess in sessions:
            inters = inters_by_session.get(sess["session_id"], [])
            sess["interaction_count"] = len(inters)
            sess["interactions"] = inters
            sess["summary"] = _build_session_summary(inters)
            
            # Find the handover interaction to extract handover_reason, approval_status, alert_tags, client_id
            handover_reason = None
            approval_status = None
            alert_tags = []
            client_id = None
            for inter in inters:
                if inter.get("handover_reason"):
                    handover_reason = inter["handover_reason"]
                    approval_status = inter.get("approval_status")
                    alert_tags = inter.get("alert_tags") or []
                    client_id = inter.get("client_id")
                    break
            sess["handover_reason"] = handover_reason
            sess["approval_status"] = approval_status
            sess["alert_tags"] = alert_tags
            sess["client_id"] = client_id
        return sessions
    except Exception as e:
        logger.error(f"Sessions with summary error: {e}")
        return []

def migrate_from_json():
    pass

# âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
# CLIENTS (KANBAN)
# âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

def add_client(custom_data: dict, status: str = "uj") -> int:
    if not supabase: return 0
    name = custom_data.get("name", "Névtelen").strip() or "Névtelen"
    try:
        res = supabase.table("clients").insert(_with_tenant({
            "name": name,
            "email": custom_data.get("email", ""),
            "phone": custom_data.get("phone", ""),
            "status": status,
            "custom_data": custom_data
        })).execute()
        return res.data[0]["id"] if res.data else 0
    except Exception as e:
        logger.error(f"Add client error: {e}")
        return 0

# Nevek, amelyek NEM tekinthetők valódi ügyfélnévnek (LLM/placeholder szemét) —
# ezekre név-alapú client-keresést nem végzünk, mert substring-match esetén
# létező, másik ügyfelet találnánk meg velük (CRM-korrupció).
INVALID_CLIENT_NAMES = {
    "ismeretlen", "ismeretlen hívó", "ismeretlen hivo", "névtelen", "nevtelen",
    "nem tudom", "nem mondta meg", "nem árulta el", "unknown", "n/a", "none",
    "null", "-", "ügyfél", "ugyfel", "hívó", "hivo",
}


def is_valid_client_name(name: str | None) -> bool:
    """Ellenőrzi, hogy a (tipikusan LLM-ből jövő) név valódi ügyfélnévnek
    tekinthető-e: min. 3 karakter, nem blacklistelt placeholder."""
    if not name:
        return False
    n = name.strip()
    if len(n) < 3:
        return False
    if n.lower() in INVALID_CLIENT_NAMES:
        return False
    return True


def find_client_by_contact(email: str = "", phone: str = "", messenger_id: str = "", name: str = "") -> dict | None:
    if not supabase: return None
    try:
        if messenger_id:
            res = _tenant_eq(supabase.table("clients").select("*")).contains("custom_data", {"messenger_id": messenger_id}).order("id", desc=True).limit(1).execute()
            if res.data: return res.data[0]
        if email and phone:
            res = _tenant_eq(supabase.table("clients").select("*")).or_(f"email.eq.{email},phone.eq.{phone}").order("id", desc=True).limit(1).execute()
        elif email:
            res = _tenant_eq(supabase.table("clients").select("*")).eq("email", email).order("id", desc=True).limit(1).execute()
        elif phone:
            res = _tenant_eq(supabase.table("clients").select("*")).eq("phone", phone).order("id", desc=True).limit(1).execute()
        else:
            res = None
        if res and res.data:
            return res.data[0]
        # EAISY-241: név-alapú keresés (case-insensitive) — ha phone/email nem talált.
        # Először PONTOS (teljes név) egyezés, csak utána substring — egy rövid vagy
        # részleges név (pl. „Péter") így nem ír felül egy másik ügyfelet véletlenül.
        if is_valid_client_name(name):
            n = name.strip()
            res = _tenant_eq(supabase.table("clients").select("*")).ilike("name", n).order("id", desc=True).limit(1).execute()
            if res.data:
                return res.data[0]
            # substring match csak elég hosszú (≥5 karakteres) névvel
            if len(n) >= 5:
                res = _tenant_eq(supabase.table("clients").select("*")).ilike("name", f"%{n}%").order("id", desc=True).limit(1).execute()
                if res.data:
                    return res.data[0]
        return None
    except Exception as e:
        logger.error(f"Find client error: {e}")
        return None

def upsert_client(custom_data: dict, additional_log: str = "", status: str | None = None, existing_id: int | None = None) -> int:
    email = custom_data.get("email", "").strip()
    phone = custom_data.get("phone", "").strip()
    messenger_id = custom_data.get("messenger_id", "").strip()

    # existing_id megadása esetén KÖZVETLENÜL azt a klienst frissítjük —
    # ez akkor kell, ha a hívó már név alapján találta meg a klienst, és a
    # belső find_client_by_contact (ami nem kap name-t) máskülönben duplikátumot
    # hozna létre.
    if existing_id:
        try:
            res = _tenant_eq(supabase.table("clients").select("*")).eq("id", existing_id).limit(1).execute()
            existing = res.data[0] if res.data else None
        except Exception as e:
            logger.error(f"Upsert client by id error: {e}")
            existing = None
    else:
        existing = find_client_by_contact(email, phone, messenger_id)
    if existing:
        curr_data = existing.get("custom_data", {}) or {}
        for k, v in custom_data.items():
            if v is None or str(v).strip() == "":
                continue
            if k == "name":
                # Meglévő VALÓDI nevet nem írunk felül (LLM-szemét / becenév /
                # eltérő átirat ellen) — csak placeholder vagy üres név cserélhető.
                old_name = (curr_data.get("name") or existing.get("name") or "")
                if is_valid_client_name(old_name) and str(v).strip().lower() != old_name.strip().lower():
                    continue
            curr_data[k] = v
        
        if additional_log:
            old_log = curr_data.get("beszelgetes_naplo", "")
            now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
            new_entry = f"[{now_str}]\n{additional_log}\n"
            curr_data["beszelgetes_naplo"] = (old_log + "\n" + new_entry).strip()
            
        edit_client_details(existing["id"], curr_data)
        if status is not None:
            update_client_status(existing["id"], status)
        return existing["id"]
    else:
        if additional_log:
            now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
            custom_data["beszelgetes_naplo"] = f"[{now_str}]\n{additional_log}"
        return add_client(custom_data, status if status is not None else "uj")

def get_clients(limit: int = 500) -> list[dict]:
    if not supabase: return []
    try:
        res = _tenant_eq(supabase.table("clients").select("*")).order("created_at", desc=True).limit(limit).execute()
        return res.data
    except Exception:
        return []

def update_client_status(client_id: int, status: str) -> bool:
    if not supabase: return False
    try:
        _tenant_eq(supabase.table("clients").update({"status": status})).eq("id", client_id).execute()
        return True
    except Exception:
        return False

def delete_client_by_meta_id(meta_id: str) -> int:
    """Meta Data Deletion Callback: töröl egy ügyfél ÖSSZES adatát, amely a megadott
    Meta-azonosítóhoz (PSID / IGSID / WhatsApp telefonszám) kapcsolódik.
    Visszaadja a törölt ügyfelek számát (a kapcsolódó interakciók is törlődnek).

    A keresés a custom_data.messenger_id / messenger_psid / instagram_id /
    whatsapp_id mezőkben ÉS a clients.phone mezőben (WhatsApp-szám) történik.
    """
    if not supabase or not meta_id:
        return 0
    deleted = 0
    try:
        # Ügyfelek keresése a Meta-azonosító alapján
        # custom_data JSONB contains() működik messenger_id/instagram_id/etc-re
        meta_id_clean = str(meta_id).strip()
        candidates: list[dict] = []
        # 1) custom_data kulcsokon — TENANT-SZŰRVE (különben cross-tenant törlés!)
        for key in ("messenger_id", "messenger_psid", "instagram_id", "whatsapp_id", "wa_id"):
            try:
                res = _tenant_eq(supabase.table("clients").select("id,phone,custom_data")).contains("custom_data", {key: meta_id_clean}).execute()
                if res.data:
                    candidates.extend(res.data)
            except Exception:
                pass
        # 2) telefonszám (WhatsApp) — digit-normalizált egyezés is, TENANT-SZŰRVE
        meta_digits = ''.join(ch for ch in meta_id_clean if ch.isdigit())
        if meta_digits and len(meta_digits) >= 7:
            try:
                res = _tenant_eq(supabase.table("clients").select("id,phone,custom_data")).execute()
                for c in (res.data or []):
                    c_digits = ''.join(ch for ch in str(c.get("phone") or "") if ch.isdigit())
                    if c_digits and (c_digits == meta_digits or c_digits.endswith(meta_digits) or meta_digits.endswith(c_digits)):
                        candidates.append(c)
            except Exception:
                pass

        # Deduplikálás id alapján
        seen_ids: set = set()
        for c in candidates:
            cid = c.get("id")
            if cid and cid not in seen_ids:
                seen_ids.add(cid)

        for cid in seen_ids:
            try:
                if delete_client(int(cid)):
                    deleted += 1
            except Exception as e:
                logger.error(f"delete_client_by_meta_id: delete_client({cid}) hiba: {e}")
    except Exception as e:
        logger.error(f"delete_client_by_meta_id hiba: {e}")
    return deleted


def delete_client(client_id: int) -> bool:
    if not supabase: return False
    try:
        client = _tenant_eq(supabase.table("clients").select("name, email, phone, custom_data")).eq("id", client_id).execute().data
        if client:
            c = client[0]
            name = c.get("name")
            email = c.get("email")
            phone = c.get("phone")
            cd = c.get("custom_data") or {}
            messenger_id = cd.get("messenger_id", "")

            # ── Delete calendar events (tenant-szűrve) ──
            if name and name not in ("Névtelen", "-"):
                _tenant_eq(supabase.table("calendar_events").delete()).or_(f"title.ilike.%{name}%,attendee.ilike.%{name}%").execute()
            if email and email != "-":
                _tenant_eq(supabase.table("calendar_events").delete()).or_(f"title.ilike.%{email}%,attendee_email.ilike.%{email}%").execute()

            # ── Delete ALL related sessions & interactions (tenant-szűrve) ──
            session_ids_to_delete = set()

            # By email
            if email and email != "-":
                _tenant_eq(supabase.table("email_logs").delete()).eq("to_email", email).execute()
                sess_res = _tenant_eq(supabase.table("sessions").select("session_id")).or_(f"session_id.ilike.%{email}%,participant.ilike.%{email}%").execute()
                for s in (sess_res.data or []):
                    session_ids_to_delete.add(s["session_id"])

            # By name
            if name and name not in ("Névtelen", "-"):
                sess_res = _tenant_eq(supabase.table("sessions").select("session_id")).ilike("participant", f"%{name}%").execute()
                for s in (sess_res.data or []):
                    session_ids_to_delete.add(s["session_id"])

            # By phone
            if phone and phone not in ("", "-"):
                sess_res = _tenant_eq(supabase.table("sessions").select("session_id")).ilike("participant", f"%{phone}%").execute()
                for s in (sess_res.data or []):
                    session_ids_to_delete.add(s["session_id"])

            # By messenger_id (session_id often contains it)
            if messenger_id:
                sess_res = _tenant_eq(supabase.table("sessions").select("session_id")).ilike("session_id", f"%{messenger_id}%").execute()
                for s in (sess_res.data or []):
                    session_ids_to_delete.add(s["session_id"])

            # Also try to find interactions by client name in participant field of their sessions
            if name and name not in ("Névtelen", "-"):
                inter_sess_res = _tenant_eq(supabase.table("interactions").select("session_id")).ilike("topic", f"%{name}%").execute()
                for i in (inter_sess_res.data or []):
                    if i.get("session_id"):
                        session_ids_to_delete.add(i["session_id"])

            # Delete interactions & sessions by collected session_ids
            sid_list = list(session_ids_to_delete)
            # Supabase .in_() has a limit, process in chunks
            for chunk_start in range(0, len(sid_list), 50):
                chunk = sid_list[chunk_start:chunk_start + 50]
                _tenant_eq(supabase.table("interactions").delete()).in_("session_id", chunk).execute()
                _tenant_eq(supabase.table("sessions").delete()).in_("session_id", chunk).execute()

        # ── Finally delete the client record itself ──
        _tenant_eq(supabase.table("clients").delete()).eq("id", client_id).execute()
        return True
    except Exception as e:
        logger.error(f"Delete client cascade error: {e}")
        return False

def edit_client_details(client_id: int, custom_data: dict) -> bool:
    if not supabase: return False
    name = custom_data.get("name", "Névtelen").strip() or "Névtelen"
    try:
        _tenant_eq(supabase.table("clients").update({
            "name": name,
            "email": custom_data.get("email", ""),
            "phone": custom_data.get("phone", ""),
            "custom_data": custom_data
        })).eq("id", client_id).execute()
        return True
    except Exception:
        return False

def add_client_tags(client_id: int, tags: list[str]) -> tuple[bool, list[str]]:
    """Add tags to a client's custom_data.tags array. Returns (success, actually_added_tags)."""
    if not supabase: return False, []
    try:
        res = _tenant_eq(supabase.table("clients").select("custom_data")).eq("id", client_id).execute()
        if not res.data:
            return False, []
        cd = res.data[0].get("custom_data") or {}
        current_tags = cd.get("tags", []) or []
        new_tags = [t for t in tags if t not in current_tags]
        if not new_tags:
            return True, []  # All tags already present
        cd["tags"] = current_tags + new_tags
        _tenant_eq(supabase.table("clients").update({"custom_data": cd})).eq("id", client_id).execute()
        return True, new_tags
    except Exception as e:
        logger.error(f"Add client tags error: {e}")
        return False, []


def get_client_fields() -> list[dict]:
    if not supabase: return []
    try:
        res = _tenant_eq(supabase.table("client_fields").select("*")).order("order_index", desc=False).execute()
        return res.data
    except Exception:
        return []

def add_client_field(field_id: str, name: str, order_index: int) -> bool:
    if not supabase: return False
    try:
        supabase.table("client_fields").insert(_with_tenant({"id": field_id, "name": name, "order_index": order_index})).execute()
        return True
    except Exception:
        return False

def update_client_field(field_id: str, name: str) -> bool:
    if not supabase: return False
    try:
        _tenant_eq(supabase.table("client_fields").update({"name": name})).eq("id", field_id).execute()
        return True
    except Exception:
        return False

def delete_client_field(field_id: str) -> bool:
    if not supabase: return False
    try:
        _tenant_eq(supabase.table("client_fields").delete()).eq("id", field_id).execute()
        return True
    except Exception:
        return False

def get_kanban_columns() -> list[dict]:
    if not supabase: return []
    try:
        res = _tenant_eq(supabase.table("kanban_columns").select("*")).order("order_index", desc=False).execute()
        return res.data
    except Exception:
        return []

def add_kanban_column(col_id: str, name: str, order_index: int) -> bool:
    if not supabase: return False
    try:
        supabase.table("kanban_columns").insert(_with_tenant({"id": col_id, "name": name, "order_index": order_index})).execute()
        return True
    except Exception:
        return False

def update_kanban_column(col_id: str, name: str) -> bool:
    if not supabase: return False
    try:
        _tenant_eq(supabase.table("kanban_columns").update({"name": name})).eq("id", col_id).execute()
        return True
    except Exception:
        return False

def delete_kanban_column(col_id: str) -> bool:
    if not supabase: return False
    try:
        count_res = _tenant_eq(supabase.table("clients").select("id", count="exact", head=True)).eq("status", col_id).execute()
        if count_res.count and count_res.count > 0:
            raise ValueError(f"Nem törölheted: a(z) '{col_id}' oszlopban {count_res.count} ügyfél található.")
        _tenant_eq(supabase.table("kanban_columns").delete()).eq("id", col_id).execute()
        return True
    except ValueError as e:
        raise e
    except Exception:
        return False

# ════════════════════════════════════════════════════════════════════════════
# TRIAGE RULES
# ════════════════════════════════════════════════════════════════════════════

def get_triage_rules() -> list[dict]:
    if not supabase: return []
    try:
        res = _tenant_eq(supabase.table("triage_rules").select("*")).order("id", desc=False).execute()
        return res.data
    except Exception:
        return []

def add_triage_rule(situation: str, priority: str, escalation_email: str) -> int:
    if not supabase: return 0
    try:
        res = supabase.table("triage_rules").insert(_with_tenant({
            "situation": situation,
            "priority": priority,
            "escalation_email": escalation_email or None
        })).execute()
        return res.data[0]["id"] if res.data else 0
    except Exception as e:
        logger.error(f"Add triage rule error: {e}")
        return 0

def update_triage_rule(rule_id: int, situation: str, priority: str, escalation_email: str) -> bool:
    if not supabase: return False
    try:
        _tenant_eq(supabase.table("triage_rules").update({
            "situation": situation,
            "priority": priority,
            "escalation_email": escalation_email or None
        })).eq("id", rule_id).execute()
        return True
    except Exception:
        return False

# ── EAISY-241: Döntési mátrix (routing JSONB a triage_rules táblán) ───────────
# A routing tartalmazza a kimeneteket (eredmeny/statusz/teendo) korlátozásonként,
# valamint a kb_required / autonomous_allowed / subtypes jelzőket. A classifier.py
# ebből olvassa a routing döntéseket, hardkódolt if/elif helyett.
# Lásd: migrate_decision_matrix.sql

def get_triage_rule_by_situation(situation: str) -> dict | None:
    """Pontos egyezésre keres (case-insensitive). Hasznos a classifiernek."""
    if not supabase or not situation:
        return None
    try:
        res = _tenant_eq(supabase.table("triage_rules").select("*")).ilike("situation", situation).execute()
        return res.data[0] if res.data else None
    except Exception as e:
        logger.error(f"get_triage_rule_by_situation error: {e}")
        return None

def get_decision_matrix() -> dict:
    """
    A teljes döntési mátrixot ügytípus (situation) szerint indexelve adja vissza.
    { situation: { id, priority, escalation_email, routing{...} } }
    A classifier ezt tölti be egyszer és cached formában használja.
    """
    if not supabase: return {}
    try:
        rules = get_triage_rules()
        return {r["situation"]: r for r in rules if r.get("situation")}
    except Exception as e:
        logger.error(f"get_decision_matrix error: {e}")
        return {}

def upsert_triage_rule(situation: str, priority: str, escalation_email: str = "", routing: dict = None) -> int:
    """
    Beszúr vagy frissít egy triage szabályt a teljes routing-tal együtt.
    situation alapján upsert. Visszaadja az id-t.
    """
    if not supabase or not situation:
        return 0
    try:
        payload = {
            "situation": situation,
            "priority": priority,
            "escalation_email": escalation_email or None,
        }
        if routing is not None:
            payload["routing"] = routing
        # Megnézzük létezik-e már
        existing = _tenant_eq(supabase.table("triage_rules").select("id")).ilike("situation", situation).execute()
        if existing.data:
            rule_id = existing.data[0]["id"]
            _tenant_eq(supabase.table("triage_rules").update(payload)).eq("id", rule_id).execute()
            return rule_id
        else:
            res = supabase.table("triage_rules").insert(_with_tenant(payload)).execute()
            return res.data[0]["id"] if res.data else 0
    except Exception as e:
        logger.error(f"upsert_triage_rule error: {e}")
        return 0

def update_triage_rule_routing(rule_id: int, routing: dict) -> bool:
    """Csak a routing JSONB mezőt frissíti egy meglévő szabályon."""
    if not supabase or not routing:
        return False
    try:
        _tenant_eq(supabase.table("triage_rules").update({"routing": routing})).eq("id", rule_id).execute()
        return True
    except Exception as e:
        logger.error(f"update_triage_rule_routing error: {e}")
        return False

def delete_triage_rule(rule_id: int) -> bool:
    if not supabase: return False
    try:
        _tenant_eq(supabase.table("triage_rules").delete()).eq("id", rule_id).execute()
        return True
    except Exception:
        return False

# ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
# SERVICES

def get_services() -> list[dict]:
    if not supabase: return []
    try:
        res = _tenant_eq(supabase.table("services").select("*")).order("id", desc=False).execute()
        return res.data
    except Exception:
        return []

def add_service(service_name: str, duration_minutes: int, description: str = "", assigned_to: str = "", note: str = "") -> int:
    if not supabase: return 0
    try:
        res = supabase.table("services").insert(_with_tenant({
            "service_name": service_name,
            "duration_minutes": duration_minutes,
            "description": description,
            "assigned_to": assigned_to,
            "note": note
        })).execute()
        return res.data[0]["id"] if res.data else 0
    except Exception as e:
        logger.error(f"Add service error: {e}")
        return 0

def update_service(srv_id: int, service_name: str, duration_minutes: int, description: str = "", assigned_to: str = "", note: str = "") -> bool:
    if not supabase: return False
    try:
        _tenant_eq(supabase.table("services").update({
            "service_name": service_name,
            "duration_minutes": duration_minutes,
            "description": description,
            "assigned_to": assigned_to,
            "note": note
        })).eq("id", srv_id).execute()
        return True
    except Exception:
        return False

def delete_service(srv_id: int) -> bool:
    if not supabase: return False
    try:
        _tenant_eq(supabase.table("services").delete()).eq("id", srv_id).execute()
        return True
    except Exception:
        return False


def get_approvals(status: str = 'pending', limit: int = 100) -> list[dict]:
    if not supabase: return []
    try:
        if status == 'history':
            res = _tenant_eq(supabase.table('interactions').select('*')).neq('approval_status', 'pending').not_.is_('ai_draft_response', 'null').order('created_at', desc=True).limit(limit).execute()
        else:
            res = _tenant_eq(supabase.table('interactions').select('*')).eq('approval_status', status).not_.is_('ai_draft_response', 'null').order('created_at', desc=True).limit(limit).execute()
        return res.data
    except Exception as e:
        logger.error(f'Error fetching approvals: {e}')
        return []

def delete_approvals(interaction_ids: list[int]) -> bool:
    if not supabase: return False
    try:
        _tenant_eq(supabase.table('interactions').delete()).in_('id', interaction_ids).execute()
        return True
    except Exception as e:
        logger.error(f'Error deleting approvals: {e}')
        return False

def update_approval_status(interaction_id: int, status: str, new_draft: str = None) -> bool:
    if not supabase: return False
    try:
        updates = {'approval_status': status}
        if new_draft is not None:
            updates['ai_draft_response'] = new_draft
            
        if status == 'approved':
            # Fetch existing interaction to determine how to update classification
            res = _tenant_eq(supabase.table('interactions').select('classification, result')).eq('id', interaction_id).execute()
            if res.data:
                row = res.data[0]
                classification = row.get('classification') or {}
                
                # Determine ugytipus
                ugytipus = classification.get('ugytipus') or 'Kérdés'
                idopont_altipus = classification.get('idopont_altipus')
                
                # Determine new outcome
                new_result = 'Megválaszolt kérdés'
                if ugytipus == 'Kérés':
                    new_result = 'Igény rögzítve'
                elif ugytipus == 'Időpont':
                    if idopont_altipus == 'Lemondás':
                        new_result = 'Időpont törölve'
                    elif idopont_altipus == 'Módosítás':
                        new_result = 'Időpont módosítva'
                    else:
                        new_result = 'Új időpont'
                elif ugytipus == 'Panasz':
                    new_result = 'Panasz rögzítve'
                
                # Update classification JSON
                classification['eredmeny'] = new_result
                classification['statusz'] = 'Lezárt'
                classification['teendo'] = 'Nincs további teendő'
                
                updates['classification'] = classification
                updates['result'] = new_result
                
        _tenant_eq(supabase.table('interactions').update(updates)).eq('id', interaction_id).execute()
        return True
    except Exception as e:
        logger.error(f'Error updating approval status: {e}')
        return False

# âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
# CLINICS (TELEPHELYEK)
# âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

def get_clinics() -> list[dict]:
    if not supabase: return []
    try:
        res = _tenant_eq(supabase.table("clinics").select("*")).order("id", desc=False).execute()
        return res.data
    except Exception as e:
        logger.error(f"Get clinics error: {e}")
        return []

def save_clinics(clinics: list[dict]) -> bool:
    if not supabase: return False
    try:
        # Keep track of updated IDs to delete removed clinics
        updated_ids = []
        for clinic in clinics:
            cid = clinic.get("id")
            if cid:
                _tenant_eq(supabase.table("clinics").update({
                    "name_and_address": clinic.get("name_and_address", ""),
                    "access_info": clinic.get("access_info", "")
                })).eq("id", cid).execute()
                updated_ids.append(int(cid))
            else:
                res = supabase.table("clinics").insert(_with_tenant({
                    "name_and_address": clinic.get("name_and_address", ""),
                    "access_info": clinic.get("access_info", "")
                })).execute()
                if res.data:
                    updated_ids.append(res.data[0]["id"])
        
        # Remove any clinics that weren't in the list (get_clinics() már tenant-szűrt,
        # és a törlés is tenant-szűrt — más tenant klinikái nem törlődnek)
        all_clinics = get_clinics()
        for c in all_clinics:
            if c["id"] not in updated_ids:
                _tenant_eq(supabase.table("clinics").delete()).eq("id", c["id"]).execute()

        return True
    except Exception as e:
        logger.error(f"Save clinics error: {e}")
        return False


# ── Settings persistence (Supabase) ───────────────────────────────────────────

def get_agent_settings() -> dict:
    """Read the current tenant's agent_settings row from Supabase (singleton per tenant)."""
    if not supabase: return {}
    try:
        res = _tenant_eq(supabase.table("agent_settings").select("*")).order("id", desc=False).limit(1).execute()
        if res.data:
            row = res.data[0]
            row.pop("id", None)
            row.pop("updated_at", None)
            return row
        return {}
    except Exception as e:
        logger.error(f"Error reading agent_settings: {e}")
        return {}


def update_agent_settings(data: dict) -> bool:
    """Upsert the current tenant's agent_settings row (match on tenant_id, not id=1)."""
    if not supabase: return False
    try:
        data.pop("id", None)  # az id tenantonként eltér — tenant_id a match kulcs
        data["updated_at"] = "now()"
        supabase.table("agent_settings").upsert(_with_tenant(data), on_conflict="tenant_id").execute()
        return True
    except Exception as e:
        logger.error(f"Error updating agent_settings: {e}")
        return False


def get_business_info() -> dict:
    """Read the current tenant's business_info row from Supabase (singleton per tenant)."""
    if not supabase: return {}
    try:
        res = _tenant_eq(supabase.table("business_info").select("*")).order("id", desc=False).limit(1).execute()
        if res.data:
            row = res.data[0]
            row.pop("id", None)
            row.pop("updated_at", None)
            return row
        return {}
    except Exception as e:
        logger.error(f"Error reading praxis_info: {e}")
        return {}


def update_business_info(data: dict) -> bool:
    """Upsert the current tenant's business_info row (match on tenant_id, not id=1)."""
    if not supabase: return False
    try:
        data.pop("id", None)  # az id tenantonként eltér — tenant_id a match kulcs
        data["updated_at"] = "now()"
        supabase.table("business_info").upsert(_with_tenant(data), on_conflict="tenant_id").execute()
        return True
    except Exception as e:
        logger.error(f"Error updating business_info: {e}")
        return False


def get_knowledge_base() -> dict:
    """Read the current tenant's knowledge_base row from Supabase. Returns {format, content}."""
    if not supabase: return {"format": "json", "content": "{}"}
    try:
        res = _tenant_eq(supabase.table("knowledge_base").select("*")).order("id", desc=False).limit(1).execute()
        if res.data:
            row = res.data[0]
            return {"format": row.get("format", "json"), "content": row.get("content", "{}")}
        return {"format": "json", "content": "{}"}
    except Exception as e:
        logger.error(f"Error reading knowledge_base: {e}")
        return {"format": "json", "content": "{}"}


def update_knowledge_base(fmt: str, content: str) -> bool:
    """Upsert the current tenant's knowledge_base row (match on tenant_id, not id=1)."""
    if not supabase: return False
    try:
        supabase.table("knowledge_base").upsert(_with_tenant({
            "format": fmt, "content": content, "updated_at": "now()"
        }), on_conflict="tenant_id").execute()
        return True
    except Exception as e:
        logger.error(f"Error updating knowledge_base: {e}")
        return False


def get_text_config(key: str) -> str:
    """Read a text_configs row by key. Returns content string."""
    if not supabase: return ""
    try:
        res = _tenant_eq(supabase.table("text_configs").select("content")).eq("key", key).execute()
        if res.data:
            return res.data[0].get("content", "")
        return ""
    except Exception as e:
        logger.error(f"Error reading text_config '{key}': {e}")
        return ""


def update_text_config(key: str, content: str) -> bool:
    """Upsert a text_configs row by key."""
    if not supabase: return False
    try:
        supabase.table("text_configs").upsert(_with_tenant({
            "key": key, "content": content, "updated_at": "now()"
        })).execute()
        return True
    except Exception as e:
        logger.error(f"Error updating text_config '{key}': {e}")
        return False


def get_reminder_settings() -> dict:
    if not supabase: return {}
    try:
        res = _tenant_eq(supabase.table('reminder_settings').select('*')).order('id', desc=False).limit(1).execute()
        if res.data: return res.data[0]
        return {'reminder_enabled': False, 'reminder_hours': 24, 'reminder_template': ''}
    except Exception as e:
        logger.error(f'Error getting reminder settings: {e}')
        return {}

def update_reminder_settings(enabled: bool, hours: int, template: str) -> bool:
    if not supabase: return False
    try:
        supabase.table('reminder_settings').upsert(_with_tenant({
            'reminder_enabled': enabled,
            'reminder_hours': hours,
            'reminder_template': template
        }), on_conflict='tenant_id').execute()
        return True
    except Exception as e:
        logger.error(f'Error updating reminder settings: {e}')
        return False

def get_upcoming_events_for_reminders(hours_offset: int):
    if not supabase: return []
    try:
        from datetime import datetime, timedelta, timezone
        now = datetime.now(timezone.utc)
        target_start = now + timedelta(hours=hours_offset)
        target_end = target_start + timedelta(minutes=15)
        res = _tenant_eq(supabase.table('calendar_events').select('*')).gte('start_dt', target_start.isoformat()).lt('start_dt', target_end.isoformat()).execute()
        events = []
        for e in res.data:
            if not e.get('reminder_sent'):
                events.append(e)
        return events
    except Exception as e:
        logger.error(f'Error getting upcoming events: {e}')
        return []

def mark_reminder_sent(event_id: int) -> bool:
    if not supabase: return False
    try:
        _tenant_eq(supabase.table('calendar_events').update({'reminder_sent': True})).eq('id', event_id).execute()
        return True
    except Exception as e:
        logger.error(f'Error marking reminder sent: {e}')
        return False

# ═══════════════════════════════════════════════════════════════════════════════
# CAMPAIGNS (KIMENŐ KOMMUNIKÁCIÓ)
# ═══════════════════════════════════════════════════════════════════════════════

def create_campaign(name: str, channels: list, client_ids: list, ai_instructions: str = "", mode: str = "ai") -> int:
    if not supabase: return 0
    try:
        # A mode-ot az ai_instructions elejébe kódoljuk, hogy ne kelljen DB séma módosítás
        instructions_with_mode = f"MODE:{mode}:{ai_instructions}"
        res = supabase.table("campaigns").insert(_with_tenant({
            "name": name,
            "channels": channels,
            "status": "Vázlat",
            "client_ids": client_ids,
            "ai_instructions": instructions_with_mode,
            "total_count": len(client_ids),
            "processed_count": 0
        })).execute()
        return res.data[0]["id"] if res.data else 0
    except Exception as e:
        logger.error(f"Error creating campaign: {e}")
        return 0

def get_campaigns() -> list[dict]:
    if not supabase: return []
    try:
        res = _tenant_eq(supabase.table("campaigns").select("*")).order("created_at", desc=True).execute()
        return res.data
    except Exception as e:
        logger.error(f"Error fetching campaigns: {e}")
        return []

def get_campaign(campaign_id: int) -> dict | None:
    if not supabase: return None
    try:
        res = _tenant_eq(supabase.table("campaigns").select("*")).eq("id", campaign_id).execute()
        return res.data[0] if res.data else None
    except Exception as e:
        logger.error(f"Error fetching campaign: {e}")
        return None

def update_campaign_status(campaign_id: int, status: str, processed_count: int = None) -> bool:
    if not supabase: return False
    try:
        updates = {"status": status}
        if processed_count is not None:
            updates["processed_count"] = processed_count
        _tenant_eq(supabase.table("campaigns").update(updates)).eq("id", campaign_id).execute()
        return True
    except Exception as e:
        logger.error(f"Error updating campaign status: {e}")
        return False

def update_campaign_content(campaign_id: int, ai_instructions: str, subject: str = "") -> bool:
    """
    EAISY-241 §1.6.2 — Kampány üzenet (ai_instructions) + subject szerkesztése.
    A subject-et prefix-ként kódolja (SUBJECT:...|), ahogy a create/schedule is teszi.
    Csak Tervezet/Ütemezett státuszú kampányoknál értelmes (élő kampányt nem módosítunk).
    """
    if not supabase: return False
    try:
        # Ha van subject, prefix-ként tesszük az ai_instructions elé (a _run_campaign
        # majd lecsipkedi). Ha nincs subject, csak az ai_instructions-t mentjük.
        if subject and subject.strip():
            final_instructions = f"SUBJECT:{subject.strip()}|{ai_instructions}"
        else:
            final_instructions = ai_instructions
        _tenant_eq(supabase.table("campaigns").update({
            "ai_instructions": final_instructions
        })).eq("id", campaign_id).execute()
        return True
    except Exception as e:
        logger.error(f"Error updating campaign content: {e}")
        return False

def delete_campaign(campaign_id: int) -> bool:
    if not supabase: return False
    try:
        _tenant_eq(supabase.table("campaigns").delete()).eq("id", campaign_id).execute()
        return True
    except Exception as e:
        logger.error(f"Error deleting campaign: {e}")
        return False

def get_clients_by_ids(client_ids: list[int]) -> list[dict]:
    if not supabase or not client_ids: return []
    try:
        res = _tenant_eq(supabase.table("clients").select("*")).in_("id", client_ids).execute()
        return res.data
    except Exception as e:
        logger.error(f"Error fetching clients by IDs: {e}")
        return []

# ═══════════════════════════════════════════════════════════════════════════════
# OUTBOUND AUTOMATIONS (ESEMÉNYVEZÉRELT KOMMUNIKÁCIÓ)
# ═══════════════════════════════════════════════════════════════════════════════

def get_outbound_automations() -> list[dict]:
    if not supabase: return []
    try:
        res = _tenant_eq(supabase.table("outbound_automations").select("*")).order("id", desc=False).execute()
        return res.data
    except Exception as e:
        logger.error(f"Error fetching outbound automations: {e}")
        return []

def update_outbound_automation(automation_id: int, data: dict) -> bool:
    if not supabase: return False
    try:
        allowed_keys = {"name", "enabled", "delay_hours", "channel", "message_template", "target_tag"}
        updates = {k: v for k, v in data.items() if k in allowed_keys}
        _tenant_eq(supabase.table("outbound_automations").update(updates)).eq("id", automation_id).execute()
        return True
    except Exception as e:
        logger.error(f"Error updating outbound automation: {e}")
        return False

def check_automation_sent(client_id: int, automation_id: int) -> bool:
    """Check if an automation was already sent to a client."""
    if not supabase: return False
    try:
        res = _tenant_eq(supabase.table("automation_sent_log").select("id")).eq("client_id", client_id).eq("automation_id", automation_id).execute()
        return len(res.data) > 0
    except Exception:
        return False

def mark_automation_sent(client_id: int, automation_id: int) -> bool:
    """Mark that an automation was sent to prevent duplicates."""
    if not supabase: return False
    try:
        supabase.table("automation_sent_log").upsert(_with_tenant({
            "client_id": client_id,
            "automation_id": automation_id
        })).execute()
        return True
    except Exception as e:
        logger.error(f"Error marking automation sent: {e}")
        return False

def clear_automation_sent(client_id: int) -> bool:
    """Clear all automation sent records for a client so automations can re-trigger."""
    if not supabase: return False
    try:
        _tenant_eq(supabase.table("automation_sent_log").delete()).eq("client_id", client_id).execute()
        return True
    except Exception as e:
        logger.error(f"Error clearing automation sent log: {e}")
        return False


# ═══════════════════════════════════════════════════════════════════════════════
# EMAIL CAMPAIGNS (EAISY Marketing)
# ═══════════════════════════════════════════════════════════════════════════════

def get_email_campaigns(limit: int = 50) -> list[dict]:
    """Kampányok listázása, legújabb elöl."""
    if not supabase: return []
    try:
        res = _tenant_eq(supabase.table("email_campaigns").select("*")).order("created_at", desc=True).limit(limit).execute()
        return res.data or []
    except Exception as e:
        logger.error(f"Error listing email campaigns: {e}")
        return []


def get_email_campaign(campaign_id: str) -> dict | None:
    """Egy kampány lekérése ID alapján."""
    if not supabase: return None
    try:
        res = _tenant_eq(supabase.table("email_campaigns").select("*")).eq("id", campaign_id).execute()
        return res.data[0] if res.data else None
    except Exception as e:
        logger.error(f"Error getting email campaign: {e}")
        return None


def create_email_campaign(data: dict) -> dict | None:
    """Új kampány létrehozása. Visszaadja a létrehozott kampányt."""
    if not supabase: return None
    try:
        allowed = {"name", "type", "subject_line", "subject_line_b", "template_html",
                    "segment_name", "status", "scheduled_at", "created_by"}
        insert_data = {k: v for k, v in data.items() if k in allowed and v is not None}
        res = supabase.table("email_campaigns").insert(_with_tenant(insert_data)).execute()
        return res.data[0] if res.data else None
    except Exception as e:
        logger.error(f"Error creating email campaign: {e}")
        return None


def update_email_campaign(campaign_id: str, data: dict) -> bool:
    """Kampány frissítése."""
    if not supabase: return False
    try:
        allowed = {"name", "type", "subject_line", "subject_line_b", "template_html",
                    "segment_name", "status", "scheduled_at", "sent_at",
                    "brevo_campaign_id", "stats", "recipients_count", "updated_at"}
        updates = {k: v for k, v in data.items() if k in allowed}
        if not updates: return False
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        _tenant_eq(supabase.table("email_campaigns").update(updates)).eq("id", campaign_id).execute()
        return True
    except Exception as e:
        logger.error(f"Error updating email campaign: {e}")
        return False


def delete_email_campaign(campaign_id: str) -> bool:
    """Kampány törlése."""
    if not supabase: return False
    try:
        _tenant_eq(supabase.table("email_campaigns").delete()).eq("id", campaign_id).execute()
        return True
    except Exception as e:
        logger.error(f"Error deleting email campaign: {e}")
        return False


def get_email_campaign_stats_summary() -> dict:
    """Kampány KPI összesítés (dashboard-hoz)."""
    if not supabase: return {"total": 0, "sent": 0, "draft": 0, "active": 0}
    try:
        res = _tenant_eq(supabase.table("email_campaigns").select("status, stats")).execute()
        total = len(res.data) if res.data else 0
        sent = sum(1 for c in (res.data or []) if c.get("status") == "sent")
        draft = sum(1 for c in (res.data or []) if c.get("status") == "draft")
        active = sum(1 for c in (res.data or []) if c.get("status") in ("sending", "scheduled"))

        # Aggregate stats
        total_opens = 0
        total_clicks = 0
        total_delivered = 0
        total_unsubscribes = 0
        for c in (res.data or []):
            s = c.get("stats") or {}
            total_opens += s.get("opens", 0)
            total_clicks += s.get("clicks", 0)
            total_delivered += s.get("delivered", 0)
            total_unsubscribes += s.get("unsubscribes", 0)

        open_rate = round((total_opens / total_delivered * 100), 1) if total_delivered > 0 else 0
        ctr = round((total_clicks / total_delivered * 100), 1) if total_delivered > 0 else 0
        unsub_rate = round((total_unsubscribes / total_delivered * 100), 2) if total_delivered > 0 else 0

        return {
            "total": total, "sent": sent, "draft": draft, "active": active,
            "open_rate": open_rate, "ctr": ctr, "unsub_rate": unsub_rate
        }
    except Exception as e:
        logger.error(f"Error getting campaign stats: {e}")
        return {"total": 0, "sent": 0, "draft": 0, "active": 0, "open_rate": 0, "ctr": 0, "unsub_rate": 0}


# ═══════════════════════════════════════════════════════════════════════════════
# EMAIL SUBSCRIBERS (EAISY Marketing)
# ═══════════════════════════════════════════════════════════════════════════════

def get_email_subscribers(limit: int = 200) -> list[dict]:
    """Feliratkozók listázása."""
    if not supabase: return []
    try:
        res = _tenant_eq(supabase.table("email_subscribers").select("*")).order("created_at", desc=True).limit(limit).execute()
        return res.data or []
    except Exception as e:
        logger.error(f"Error listing email subscribers: {e}")
        return []


def add_email_subscriber(email: str, name: str = "", tags: list = None, consent_source: str = "manual") -> dict | None:
    """Új feliratkozó hozzáadása (upsert: ha létezik, frissíti a nevet/tageket)."""
    if not supabase: return None
    try:
        res = supabase.table("email_subscribers").upsert(_with_tenant({
            "email": email,
            "name": name,
            "tags": tags or [],
            "consent_source": consent_source,
            "status": "active"
        }), on_conflict="email").execute()
        return res.data[0] if res.data else None
    except Exception as e:
        logger.error(f"Error adding email subscriber: {e}")
        return None


def get_subscriber_count() -> int:
    """Összes aktív feliratkozó száma."""
    if not supabase: return 0
    try:
        res = _tenant_eq(supabase.table("email_subscribers").select("id", count="exact", head=True)).eq("status", "active").execute()
        return res.count or 0
    except Exception as e:
        logger.error(f"Error counting subscribers: {e}")
        return 0


def update_subscriber_status(email: str, status: str) -> bool:
    """Feliratkozó státusz frissítés (unsubscribed, bounced, complained)."""
    if not supabase: return False
    try:
        _tenant_eq(supabase.table("email_subscribers").update({"status": status})).eq("email", email).execute()
        return True
    except Exception as e:
        logger.error(f"Error updating subscriber status: {e}")
        return False


# ═══════════════════════════════════════════════════════════════════════════════
# AI CONTENT ITEMS (EAISY Marketing — Social Média)
# ═══════════════════════════════════════════════════════════════════════════════

def get_content_items(status_filter: str = None, limit: int = 50) -> list[dict]:
    """AI tartalmak listázása, opcionálisan szűrve státusz szerint."""
    if not supabase: return []
    try:
        q = _tenant_eq(supabase.table("content_items").select("*")).order("created_at", desc=True).limit(limit)
        if status_filter and status_filter != "all":
            if status_filter == "pending":
                q = q.in_("status", ["requested", "ai_draft", "editing"])
            else:
                q = q.eq("status", status_filter)
        res = q.execute()
        return res.data or []
    except Exception as e:
        logger.error(f"Error listing content items: {e}")
        return []


def create_content_item(data: dict) -> dict | None:
    """Új AI tartalom létrehozása."""
    if not supabase: return None
    try:
        row = {
            "title": data.get("title", "Új tartalom"),
            "type": data.get("type", "social_post"),
            "body": data.get("body", ""),
            "hashtags": data.get("hashtags", []),
            "image_url": data.get("image_url", ""),
            "image_description": data.get("image_description", ""),
            "keywords": data.get("keywords", []),
            "status": data.get("status", "requested"),
            "ai_prompt": data.get("ai_prompt", ""),
            "ai_model": data.get("ai_model", "gemini-2.0-flash"),
            "target_platforms": data.get("target_platforms", ["instagram"]),
            "image_prompt": data.get("image_prompt", ""),
            "created_by": data.get("created_by", "admin"),
        }
        if data.get("scheduled_at"):
            row["scheduled_at"] = data["scheduled_at"]
        res = supabase.table("content_items").insert(_with_tenant(row)).execute()
        return res.data[0] if res.data else None
    except Exception as e:
        logger.error(f"Error creating content item: {e}")
        return None


def update_content_item(item_id: str, data: dict) -> dict | None:
    """AI tartalom frissítése (szöveg, státusz, stb.)."""
    if not supabase: return None
    try:
        allowed = ["title", "body", "hashtags", "image_url", "image_description",
                    "keywords", "status", "target_platforms", "published_at",
                    "published_platforms", "ig_media_id", "fb_post_id",
                    "engagement_stats", "scheduled_at", "image_prompt"]
        update = {k: v for k, v in data.items() if k in allowed}
        update["updated_at"] = "now()"
        res = _tenant_eq(supabase.table("content_items").update(update)).eq("id", item_id).execute()
        return res.data[0] if res.data else None
    except Exception as e:
        logger.error(f"Error updating content item: {e}")
        return None


def delete_content_item(item_id: str) -> bool:
    """AI tartalom törlése."""
    if not supabase: return False
    try:
        _tenant_eq(supabase.table("content_items").delete()).eq("id", item_id).execute()
        return True
    except Exception as e:
        logger.error(f"Error deleting content item: {e}")
        return False


def get_content_stats() -> dict:
    """AI tartalom statisztikák összesítés."""
    if not supabase: return {"total": 0, "pending": 0, "approved": 0, "published": 0, "scheduled": 0}
    try:
        res = _tenant_eq(supabase.table("content_items").select("status")).execute()
        items = res.data or []
        pending_statuses = ["requested", "ai_draft", "editing"]
        return {
            "total": len(items),
            "pending": sum(1 for i in items if i.get("status") in pending_statuses),
            "approved": sum(1 for i in items if i.get("status") == "approved"),
            "scheduled": sum(1 for i in items if i.get("status") == "scheduled"),
            "published": sum(1 for i in items if i.get("status") == "published"),
        }
    except Exception as e:
        logger.error(f"Error getting content stats: {e}")
        return {"total": 0, "pending": 0, "approved": 0, "published": 0, "scheduled": 0}


def get_scheduled_content() -> list[dict]:
    """Esedékes ütemezett tartalmak (scheduled_at <= now)."""
    if not supabase: return []
    try:
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc).isoformat()
        res = (_tenant_eq(supabase.table("content_items")
               .select("*"))
               .eq("status", "scheduled")
               .lte("scheduled_at", now)
               .execute())
        return res.data or []
    except Exception as e:
        logger.error(f"Error getting scheduled content: {e}")
        return []


def get_content_item(item_id: str) -> dict | None:
    """Egyetlen content item lekérése ID alapján."""
    if not supabase: return None
    try:
        res = _tenant_eq(supabase.table("content_items").select("*")).eq("id", item_id).execute()
        return res.data[0] if res.data else None
    except Exception as e:
        logger.error(f"Error getting content item: {e}")
        return None
