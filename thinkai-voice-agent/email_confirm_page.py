# -*- coding: utf-8 -*-
"""WP-E3 MU-4/MU-5: az SMS-ben kapott /e/{token} e-mail-megerősítő oldal.

A páciens a megerősítő SMS linkjére kattint: itt adja meg / javítja /
megerősíti az e-mail címét, majd a 4.3-as hatások IDEMPOTENSEN lefutnak
(ügyfél-frissítés + események attendee_email + visszaigazoló email +
email_verify_runs audit). A 'az első megerősítés nyer' garanciát a
MU-3-as token-flag (where confirmed_at is null) adja.

A logika PURE modulban él (a teszt-venvben nincs fastapi/supabase), a
web_server csak VÉKONY bekötést ad. Stílus: magyar docstringek, loguru,
fail-open — egyetlen publikus függvény sem dob, a /e/* végpont sosem
500-özzön belső hibán. A `database` és `email_processor` modulokat LAZÁN,
függvényen belül importáljuk, hogy a tesztek stubolhassák.
"""
import asyncio
import html
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from loguru import logger

# A validáció a közös harness-segédekre delegál (NE írjuk újra!).
# FIGYELEM: az email_verify_harness modul-szinten importálja a database-t és
# az email_processort — a teszteknek ezeknek a stubját kell a sys.modules-ba
# tenni AZ IMPORT ELŐTT.
from email_verify_harness import (
    EMAIL_SYNTAX_RE,
    KNOWN_DOMAINS,
    _levenshtein,
    canon_email,
    mx_resolves,
)
from email_confirm_tokens import (
    _parse_dt,
    get_confirm_token,
    mark_confirmed,
    token_is_confirmed,
)

# ── Rate-limit (IP-nkénti, in-memory) ────────────────────────────────────────
RATE_LIMIT_MAX = 20        # kérés / ablak / IP
RATE_LIMIT_WINDOW_S = 60   # az ablak hossza (mp)
_rate_bucket: dict = {}    # ip -> [timestampok (monoton)]


def rate_limited(ip: str, now_ts: float | None = None) -> bool:
    """IP-nként 20 kérés/perc a /e/* útvonalakon. In-memory; hibánál False
    (a rate-limit meghibásodása ne tiltsa le az oldalt)."""
    try:
        import time as _time
        now = float(now_ts) if now_ts is not None else _time.monotonic()
        key = (ip or "").strip() or "ismeretlen"
        win_start = now - RATE_LIMIT_WINDOW_S
        stamps = [t for t in (_rate_bucket.get(key) or []) if t > win_start]
        if len(stamps) >= RATE_LIMIT_MAX:
            _rate_bucket[key] = stamps
            logger.warning("e-mail-megerősítő oldal: rate-limit (ip=…{})",
                           key[-8:])
            return True
        stamps.append(now)
        _rate_bucket[key] = stamps
        # takarítás: elszabadult bucket ellen max. 4096 IP maradjon
        if len(_rate_bucket) > 4096:
            for k in [k for k, v in _rate_bucket.items()
                      if not v or max(v) <= win_start]:
                _rate_bucket.pop(k, None)
        return False
    except Exception as exc:
        logger.warning("rate_limited hiba (fail-open, engedünk): {}", exc)
        return False


# ── E-mail validáció (szintaxis + MX + typo-javaslat) ────────────────────────
def _typo_suggestion(email: str) -> str | None:
    """Domain-elírás javaslat: ha a domain Levenshtein-távolsága ≤ 2 egy
    KNOWN_DOMAINS elemtől és nem azonos vele → a javított TELJES cím."""
    try:
        local, _, domain = (email or "").strip().lower().partition("@")
        if not local or not domain or domain in KNOWN_DOMAINS:
            return None
        best, best_dist = None, None
        for known in KNOWN_DOMAINS:
            dist = _levenshtein(domain, known, cap=3)
            if dist > 2:
                continue
            if best_dist is None or dist < best_dist:
                best, best_dist = known, dist
        return f"{local}@{best}" if best else None
    except Exception:
        return None


def validate_confirmation_email(email: str) -> dict:
    """{"ok": bool, "error": str|None, "suggestion": str|None}.
    1) szintaxis: email_verify_harness.EMAIL_SYNTAX_RE;
    2) mx_resolves(domain) is False (NXDOMAIN) → ok False, 'ismeretlen domain';
    3) typo-javaslat: ismert domain ≤2 távolságra → suggestion (a javított
       teljes cím), de ok True marad (a javaslat opcionálisan elfogadható).
    SOSEM dob."""
    out = {"ok": False, "error": None, "suggestion": None}
    try:
        clean = (email or "").strip().lower()
        if not clean or not EMAIL_SYNTAX_RE.match(clean):
            out["error"] = "érvénytelen e-mail cím"
            return out
        domain = clean.partition("@")[2]
        try:
            mx = mx_resolves(domain)
        except Exception as exc:
            logger.warning("MX-ellenőrzés hiba (nem blokkol): {}", exc)
            mx = None
        if mx is False:
            out["error"] = "ismeretlen domain"
            return out
        out["ok"] = True
        out["suggestion"] = _typo_suggestion(clean)
        return out
    except Exception as exc:
        logger.warning("validate_confirmation_email hiba (fail-open): {}", exc)
        out.update(ok=False, error="e-mail cím ellenőrzése sikertelen")
        return out


# ── Token-kontextus ──────────────────────────────────────────────────────────
def _rendelo_name() -> str:
    """A rendelő megjelenítendő neve: RENDELO_NAME env → tenants.name →
    általános 'Rendelő'. Fail-open: hibánál 'Rendelő'."""
    try:
        env_name = (os.getenv("RENDELO_NAME") or "").strip()
        if env_name:
            return env_name
        import database as db
        tid = db.get_current_tenant()
        if tid:
            res = (db.supabase.table("tenants").select("name")
                   .eq("id", tid).limit(1).execute())
            rows = getattr(res, "data", None) or []
            name = (rows[0].get("name") or "").strip() if rows else ""
            if name:
                return name
    except Exception:
        pass
    return "Rendelő"


def _load_events(event_ids) -> list:
    """Az event_ids-hoz tartozó naptár-események (hiba esetén kihagyva)."""
    try:
        import database as db
    except Exception as exc:
        logger.warning("database import hiba (események kihagyva): {}", exc)
        return []
    out = []
    for eid in (event_ids or []):
        try:
            ev = db.get_calendar_event(eid)
        except Exception as exc:
            logger.warning("esemény-letöltés hiba ({}): {}", eid, exc)
            ev = None
        if ev:
            out.append(ev)
    return out


def load_token_context(token: str) -> dict:
    """get_confirm_token + event_ids → események. Vissza:
    {"row": ..., "events": [ {id,title,start_dt,attendee,attendee_email} ],
     "expired": bool, "already_confirmed": bool, "rendelo": str}.
    Ismeretlen token → row=None (a render hibaoldalt ad). SOSEM dob."""
    ctx = {"row": None, "events": [], "expired": False,
           "already_confirmed": False, "rendelo": _rendelo_name()}
    try:
        row = get_confirm_token(token)
        if not row:
            return ctx
        ctx["row"] = row
        expires = _parse_dt(row.get("expires_at"))
        ctx["expired"] = bool(expires and expires < datetime.now(timezone.utc))
        ctx["already_confirmed"] = token_is_confirmed(row)
        for ev in _load_events(row.get("event_ids")):
            ctx["events"].append({
                "id": ev.get("id"),
                "title": ev.get("title") or "",
                "start_dt": ev.get("start_dt") or "",
                "attendee": ev.get("attendee") or "",
                "attendee_email": ev.get("attendee_email") or "",
            })
        return ctx
    except Exception as exc:
        logger.warning("load_token_context hiba (fail-open): {}", exc)
        return ctx


# ── HTML render (mobil-első) ────────────────────────────────────────────────
_CSS = """
:root { color-scheme: light; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Segoe UI', -apple-system, Arial, sans-serif;
       background: #eef2f7; min-height: 100vh; display: flex;
       align-items: center; justify-content: center; padding: 16px;
       font-size: 18px; line-height: 1.55; color: #1f2937; }
.kartya { background: #ffffff; width: 100%; max-width: 430px;
          border-radius: 16px; padding: 28px 22px;
          box-shadow: 0 6px 24px rgba(0,0,0,0.08); text-align: center; }
.piktogram { font-size: 44px; margin-bottom: 10px; }
h1 { font-size: 24px; margin-bottom: 6px; color: #111827; }
.rendelo { font-weight: 600; color: #2563eb; margin-bottom: 4px; }
.idopont { color: #374151; margin-bottom: 18px; }
label { display: block; text-align: left; font-weight: 600;
        font-size: 16px; margin: 12px 0 6px; }
input[type=email] { width: 100%; font-size: 19px; padding: 14px 12px;
        border: 1px solid #cbd5e1; border-radius: 10px; background: #f8fafc; }
input[type=email]:focus { outline: 2px solid #2563eb; border-color: #2563eb; }
.fob { display: block; width: 100%; margin-top: 18px; padding: 15px;
       font-size: 19px; font-weight: 700; color: #ffffff;
       background: #2563eb; border: 0; border-radius: 10px; }
.ghost { display: block; width: 100%; margin-top: 10px; padding: 12px;
         font-size: 16px; color: #2563eb; background: #eff6ff;
         border: 1px solid #bfdbfe; border-radius: 10px; }
.hiba { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca;
        border-radius: 10px; padding: 12px; margin-top: 16px;
        font-size: 16px; text-align: left; }
.okjei { color: #059669; }
.jegyzet { font-size: 14px; color: #6b7280; margin-top: 16px; }
"""

_PAGE_HEAD = (
    "<!doctype html><html lang=\"hu\"><head><meta charset=\"utf-8\">"
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">"
    "<title>"
)
_PAGE_MID = "</title><style>" + _CSS + "</style></head>"
_PAGE_TAIL = "</div></body></html>"


def _page(title: str, body: str) -> str:
    """Teljes HTML-lap a közös mobil-első vázra építve (NINCS str.format —
    a CSS kapcsos zárójelei miatt összefűzéssel áll össze)."""
    return (_PAGE_HEAD + html.escape(title) + _PAGE_MID
            + "<body><div class=\"kartya\">" + body + _PAGE_TAIL)


def _esc(value) -> str:
    return html.escape(str(value if value is not None else ""), quote=True)


def _event_line(events: list) -> str:
    """Az első eseményből emberi olvasatú időpont-sor (vagy üres)."""
    ev = (events or [{}])[0] or {}
    start = (ev.get("start_dt") or "")
    if not start:
        return ""
    datum, ido = start[:10], start[11:16]
    title = ev.get("title") or "Konzultáció"
    return f"{datum}. {ido} — {title}"


def render_confirm_page(ctx: dict, error: str = "", suggestion: str = "",
                        confirmed_email: str = "") -> str:
    """Mobil-első HTML (viewport meta, nagy betű, inline CSS, KÉK gomb).
    - normál: rendelő neve, foglalás dátuma/időpontja, email mező
      (candidate_email-lel előtöltve vagy üresen), 'Megerősítem' gomb (POST),
      ha suggestion → 'Erre gondolt: …?' gomb, ami beírja a javaslatot;
    - already_confirmed vagy confirmed_email → köszönő oldal;
    - expired/ismeretlen token → barátságos hibaoldal. SOSEM dob."""
    try:
        ctx = ctx if isinstance(ctx, dict) else {}
        row = ctx.get("row") or {}
        rendelo = ctx.get("rendelo") or "Rendelő"
        events = ctx.get("events") or []
        ev_line = _event_line(events)

        # 1) köszönő oldal (POST siker VAGY a token már korábban meg lett erősítve)
        done_email = (confirmed_email or "").strip() or \
            ((row.get("confirmed_email") or "").strip()
             if ctx.get("already_confirmed") else "")
        if done_email:
            body = (
                "<div class=\"piktogram\"><span class=\"okjei\">✅</span></div>"
                f"<h1>Köszönjük!</h1>"
                f"<p class=\"rendelo\">{_esc(rendelo)}</p>"
                "<p>A visszaigazolást elküldtük a(z) "
                f"<b>{_esc(done_email)}</b> címre. "
                "Üdvözlettel, hamarosan várjuk!</p>"
            )
            return _page("E-mail cím megerősítve", body)

        # 2) barátságos hibaoldal (lejárt / ismeretlen token)
        if ctx.get("expired") or error in ("expired", "unknown") \
                or not ctx.get("row"):
            if ctx.get("expired") or error == "expired":
                msg = ("Ez a megerősítő link már lejárt. Kérjük, hívjon "
                       "minket telefonon, szívesen segítünk!")
                cim = "A link lejárt"
            else:
                msg = ("Ezt a megerősítő linket nem találjuk. Kérjük, "
                       "használja az SMS-ben kapott legfrissebb linket, "
                       "vagy hívjon minket telefonon.")
                cim = "Érvénytelen link"
            body = (
                "<div class=\"piktogram\">😔</div>"
                f"<h1>{_esc(cim)}</h1>"
                f"<p class=\"rendelo\">{_esc(rendelo)}</p>"
                f"<p>{_esc(msg)}</p>"
            )
            return _page(cim, body)

        # 3) normál űrlap
        candidate = (row.get("candidate_email") or "").strip()
        token = (row.get("token") or "").strip()
        err_html = (f"<div class=\"hiba\">{_esc(error)}</div>" if error else "")
        sugg_html = ""
        sugg = (suggestion or "").strip()
        if sugg:
            # M1-fix: Nincs onclick/JS (a laza email-regex megenged ';" karaktereket
            # → JS-injektálás lett volna) — külön FORM hidden inputtal, csak
            # html.escape-elt értékkel.
            sugg_html = (
                "<form method=\"post\" action=\"/e/" + _esc(token) + "\">"
                "<input type=\"hidden\" name=\"email\" value=\"" + _esc(sugg) + "\">"
                "<button type=\"submit\" class=\"ghost\">Erre gondolt: "
                + _esc(sugg) + "?</button></form>"
            )
        form = (
            f"<p class=\"idopont\">{_esc(ev_line)}</p>"
            "<form method=\"post\" action=\"/e/"
            + _esc(token) + "\">"
            "<label for=\"em\">E-mail cím</label>"
            "<input id=\"em\" name=\"email\" type=\"email\" "
            "inputmode=\"email\" autocomplete=\"email\" required value=\""
            + _esc(candidate) + "\">"
            + sugg_html +
            "<button type=\"submit\" class=\"fob\">Megerősítem</button>"
            "</form>"
            "<p class=\"jegyzet\">Az e-mail címre küldjük el az időpont "
            "visszaigazolását.</p>"
            + err_html
        )
        head = (
            "<div class=\"piktogram\">✉️</div>"
            "<h1>Erősítse meg e-mail címét</h1>"
            f"<p class=\"rendelo\">{_esc(rendelo)}</p>"
        )
        return _page("E-mail cím megerősítése", head + form)
    except Exception as exc:
        logger.warning("render_confirm_page hiba (fail-open): {}", exc)
        return _page("Hiba", "<h1>Hoppá!</h1><p>Kérjük, próbálja újra "
                             "később, vagy hívjon minket telefonon.</p>")


# ── A megerősítés hatásai (4.3) ──────────────────────────────────────────────
_AUDIT_STATUS = {
    "confirmed": "sms_confirmed",
    "corrected": "sms_corrected",
    "provided": "sms_provided",
}


def _update_client(old_email: str, new_email: str, action: str,
                   client_id=None) -> None:
    """Az ügyfél emailjének frissítése audit-nyomvonallal
    (custom_data.email_verification). A régi cím SOHA nem törlődik el
    hallgatagon: previous mező. M7-fix: ügyfél-ID alapján frissít, ha van
    (a tokenből jön — MÉRVE hiba volt a régi címre keresés: más ügyfél
    rekordját írhatta volna át); a cím-keresés csak fallback."""
    if not old_email and not client_id:
        return
    try:
        import database as db
        client = None
        if client_id:
            rows = db._tenant_eq(db.supabase.table("clients").select("*")
                                 ).eq("id", client_id).limit(1).execute().data or []
            client = rows[0] if rows else None
        if not client:
            client = db.find_client_by_contact(email=old_email)
        if not client:
            return
        cd = client.get("custom_data") or {}
        if isinstance(cd, str):
            import json
            try:
                cd = json.loads(cd)
            except (ValueError, TypeError):
                cd = {}
        cd = dict(cd or {})
        cd["email_verification"] = {
            "previous": old_email,
            "value": new_email,
            "source": "sms_confirm",
            "status": _AUDIT_STATUS.get(action, "sms_confirmed"),
            "applied": True,
            "ts": datetime.now(timezone.utc).isoformat(),
        }
        db.edit_client_details(client["id"], {
            "name": client.get("name") or "Névtelen",
            "email": new_email,
            "phone": client.get("phone") or "",
            "custom_data": cd,
        })
    except Exception as exc:
        logger.warning("ügyfél email-frissítés hiba ({} → {}): {}",
                       old_email, new_email, exc)


def _update_events(event_ids, new_email: str) -> None:
    """MINDEN érintett esemény attendee_email mezője az új címre áll."""
    try:
        import database as db
    except Exception as exc:
        logger.warning("database import hiba (esemény-frissítés kihagyva): {}",
                       exc)
        return
    for eid in (event_ids or []):
        try:
            db._tenant_eq(
                db.supabase.table("calendar_events")
                .update({"attendee_email": new_email})
            ).eq("id", eid).execute()
        except Exception as exc:
            logger.warning("esemény email-frissítés sikertelen ({}): {}",
                           eid, exc)


def _send_emails(events, email: str) -> None:
    """Visszaigazoló email MOST, minden eseményre, az ÚJ címre.
    Az email_processor.send_booking_confirmation_email ASYNC — sima kontextusból
    asyncio.run, FastAPI (futó loop) kontextusból külön szál + új loop."""
    if not events or not email:
        return
    try:
        import email_processor

        async def _send_all():
            for ev in events:
                start = ev.get("start_dt") or ""
                try:
                    await email_processor.send_booking_confirmation_email(
                        event_id=ev.get("id"),
                        title=ev.get("title") or "Konzultáció",
                        date=start[:10],
                        time=start[11:16],
                        attendee=ev.get("attendee") or "Ügyfél",
                        attendee_email=email,
                    )
                except Exception as exc:
                    logger.warning("visszaigazoló küldés hiba ({}): {}", email,
                                   exc)

        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None
        if loop is not None and loop.is_running():
            # futó loop (FastAPI endpoint) → külön szálban saját loop
            with ThreadPoolExecutor(max_workers=1) as pool:
                pool.submit(asyncio.run, _send_all()).result(timeout=180)
        else:
            asyncio.run(_send_all())
    except Exception as exc:
        logger.warning("visszaigazoló email-küldés hiba (fail-open): {}", exc)


def _update_verify_runs(session_id: str, email: str, action: str) -> None:
    """email_verify_runs frissítése a session ÖSSZES során: confirmed_email,
    confirmed_at (ISO UTC), confirm_action."""
    if not session_id:
        return
    try:
        import database as db
        db._tenant_eq(
            db.supabase.table("email_verify_runs").update({
                "confirmed_email": email,
                "confirmed_at": datetime.now(timezone.utc).isoformat(),
                "confirm_action": action,
            })
        ).eq("session_id", session_id).execute()
    except Exception as exc:
        logger.warning("email_verify_runs frissítés sikertelen ({}): {}",
                       session_id, exc)


def apply_confirmation(token: str, email: str) -> dict:
    """A 4.3-as hatások IDEMPOTENSEN. Vissza:
    {"ok": bool, "action": str, "email": str, "error": str|None, "already": bool}.
    A 'az első megerősítés nyer' logika a MU-3 token-flagjén nyugszik:
    már megerősített tokennél SEMMI írás és SEMMI email (already=True).
    SOSEM dob."""
    clean = (email or "").strip()
    try:
        row = get_confirm_token(token)
        if not row:
            return {"ok": False, "action": "", "email": clean,
                    "error": "unknown", "already": False}
        expires = _parse_dt(row.get("expires_at"))
        if expires and expires < datetime.now(timezone.utc):
            return {"ok": False, "action": "", "email": clean,
                    "error": "expired", "already": False}

        # idempotencia: ha már meg van erősítve → az első nyert, semmi írás
        if token_is_confirmed(row):
            return {"ok": True,
                    "action": row.get("action") or "confirmed",
                    "email": (row.get("confirmed_email") or "").strip(),
                    "error": None, "already": True}

        v = validate_confirmation_email(clean)
        if not v.get("ok"):
            return {"ok": False, "action": "", "email": clean,
                    "error": v.get("error") or "érvénytelen e-mail cím",
                    "already": False}

        # B1-fix (review): gépelés-javaslat esetén NINCS azonnali megerősítés —
        # az oldal újratölt a javaslattal ('Erre gondolt: …?'), a user dönt.
        # (MX-t birtokló elgépelt domain különben egy kattintással
        # megerősítetté vált volna.)
        if v.get("suggestion"):
            return {"ok": False, "action": "", "email": clean,
                    "suggestion": v["suggestion"], "error": None,
                    "needs_suggestion": True, "already": False}

        # M6-fix: a token tenant_id-je beállítja a kontextust — multi-tenant
        # prodnál enélkül a frissítések 0 sort találnának (default tenant).
        try:
            import database as _db
            if row.get("tenant_id"):
                _db.set_current_tenant(row["tenant_id"])
        except Exception:
            pass

        candidate = (row.get("candidate_email") or "").strip()
        if not candidate:
            action = "provided"
        elif canon_email(candidate) != canon_email(clean):
            action = "corrected"
        else:
            action = "confirmed"

        event_ids = list(row.get("event_ids") or [])
        events = _load_events(event_ids)

        # 'első megerősítés nyer': a where confirmed_at is null update dönt
        if not mark_confirmed(token, clean, action):
            row2 = get_confirm_token(token)
            if token_is_confirmed(row2):
                return {"ok": True,
                        "action": row2.get("action") or action,
                        "email": (row2.get("confirmed_email") or "").strip(),
                        "error": None, "already": True}
            return {"ok": False, "action": action, "email": clean,
                    "error": "megerősítés rögzítése sikertelen",
                    "already": False}

        old_email = ((events[0].get("attendee_email") if events else "") or "")
        _update_client(old_email.strip(), clean, action,
                       client_id=row.get("client_id"))
        _update_events(event_ids, clean)
        # Recepció-jelzés a naptárban: a függő sor helyett megerősítve (WP-E3)
        try:
            import database as _db
            stamp = datetime.now(timezone.utc).strftime("%Y.%m.%d. %H:%M UTC")
            for _eid in (event_ids or []):
                _db.append_calendar_note(
                    _eid, f"✅ E-mail megerősítve SMS-ből: {clean} ({action}) — {stamp}")
        except Exception as _note_err:
            logger.warning("naptár-note frissítés kihagyva: {}", _note_err)
        _send_emails(events, clean)
        _update_verify_runs(row.get("session_id") or "", clean, action)
        logger.info("SMS-es e-mail-megerősítés: action={} token=…{}",
                    action, str(token)[:4])
        return {"ok": True, "action": action, "email": clean,
                "error": None, "already": False}
    except Exception as exc:
        logger.warning("apply_confirmation hiba (fail-open): {}", exc)
        return {"ok": False, "action": "", "email": clean,
                "error": str(exc), "already": False}
