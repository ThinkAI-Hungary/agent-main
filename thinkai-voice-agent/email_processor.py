# -*- coding: utf-8 -*-
import os
import email
import imaplib
import json
import asyncio
from email.header import decode_header
from pathlib import Path
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from charset_normalizer import from_bytes

BUDAPEST_TZ = ZoneInfo("Europe/Budapest")

def _to_budapest_tz(dt_str: str) -> datetime:
    dt = datetime.fromisoformat(dt_str)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=BUDAPEST_TZ)
    return dt.astimezone(BUDAPEST_TZ)

import httpx
from dotenv import load_dotenv
from loguru import logger
from google import genai
from google.genai import types

import database as db
from classifier import classify_interaction

THIS_DIR = Path(__file__).resolve().parent


def _get_sender(tenant_id: str | None = None) -> dict:
    """Return dynamic sender dict from the TENANT's business_info (multi-tenant).
    A business_info már tenant-scopeolt (a contextvar alapján); explicit tenant_id
    is átadható (worker-eknél)."""
    if tenant_id:
        db.set_current_tenant(tenant_id)
    bi = db.get_business_info()
    name = bi.get("sender_name") or bi.get("practice_name") or "Virtuális Asszisztens"
    email_addr = bi.get("sender_email") or os.getenv("BREVO_SENDER_EMAIL", "")
    return {"name": name, "email": email_addr}


def _sender_is_valid(sender: dict) -> bool:
    """Ellenőrzi, hogy a feladó valósnak tekinthető-e (nem üres / nem placeholder).
    Érvénytelen feladóval a Brevo 400-zal elutasít — inkább itt bukjunk el
    explicit hibaüzenettel."""
    email_addr = (sender.get("email") or "").strip()
    if not email_addr:
        return False
    if email_addr.endswith("@example.com"):
        return False
    return True


def _decode_brevo_key(brevo_key: str) -> str:
    """A BREVO_API_KEY lehet nyers (xkeysib-...) vagy base64-kódolt JSON
    ({'api_key': ...}). A dekódolt nyers kulcsot adja."""
    if brevo_key and not brevo_key.startswith("xkeysib-"):
        try:
            import base64 as b64module
            decoded = b64module.b64decode(brevo_key).decode()
            parsed = json.loads(decoded)
            return parsed.get("api_key", brevo_key)
        except Exception:
            pass
    return brevo_key


def _get_brevo_api_key(tenant_id: str | None = None) -> str:
    """BREVO kulcs feloldása (hibrid, FÁZIS 5):
    1. Ha a tenant adott saját kulcsot a tenant_credentials-ben ('brevo_api_key'),
       azzal küld (teljes izoláció, saját domain/reputáció).
    2. Különben a globális platform-kulcs (a tenant sender_email-jével)."""
    tid = tenant_id or db.get_current_tenant()
    tenant_key = db.get_credential(tid, "brevo_api_key", default=None)
    if tenant_key:
        return _decode_brevo_key(tenant_key)
    return _decode_brevo_key(os.getenv("BREVO_API_KEY", ""))


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


def _reply_subject(subject: str) -> str:
    """Válasz-tárgy normalizálás — ne halmozódjon: 'Re: Re: Re: …'."""
    s = (subject or "").strip()
    if s.lower().startswith("re:"):
        return s
    return f"Re: {s}"
load_dotenv(THIS_DIR / ".env")
from prompt_utils import get_system_prompt
# Common encodings for Hungarian emails, tried in order of likelihood
_FALLBACK_CHARSETS = ['iso-8859-2', 'windows-1250', 'latin-1', 'iso-8859-1', 'cp1252', 'utf-8']


def _decode_payload(raw_payload: bytes | None, declared_charset: str) -> str:
    """Decode email payload with universal charset detection using charset-normalizer."""
    if raw_payload is None:
        return ""

    # 1. First, try decoding as UTF-8 (strict)
    try:
        return raw_payload.decode('utf-8')
    except UnicodeDecodeError:
        pass

    # 2. Use charset-normalizer for intelligent detection
    try:
        detection = from_bytes(raw_payload).best()
        if detection:
            return str(detection)
    except Exception:
        pass

    # 3. Fallback to declared charset or utf-8 with replacement
    try:
        return raw_payload.decode(declared_charset or 'utf-8', errors='replace')
    except Exception:
        return raw_payload.decode('utf-8', errors='replace')


def decode_mime_words(s):
    if not s:
        return ""
    # Ensure s is a string before passing to decode_header
    if isinstance(s, bytes):
        try:
            s = s.decode('ascii', 'surrogateescape')
        except Exception:
            s = s.decode('utf-8', errors='replace')

    parts = []
    try:
        header_parts = decode_header(s)
    except Exception as e:
        logger.error(f"Failed to decode header with decode_header: {e}")
        if isinstance(s, str):
            s_bytes = s.encode('ascii', 'surrogateescape')
        else:
            s_bytes = s
        return _decode_payload(s_bytes, "utf-8")

    for word, encoding in header_parts:
        if isinstance(word, bytes):
            decoded = _decode_payload(word, encoding or "utf-8")
            parts.append(decoded)
        elif isinstance(word, str):
            try:
                word_bytes = word.encode('ascii', 'surrogateescape')
                if any(b >= 0x80 for b in word_bytes):
                    decoded = _decode_payload(word_bytes, encoding or "utf-8")
                    parts.append(decoded)
                else:
                    parts.append(word)
            except UnicodeEncodeError:
                parts.append(word)
            except Exception:
                parts.append(word)
        else:
            parts.append(str(word))
    return "".join(parts)



def clean_email_body(text: str) -> str:
    import re
    patterns = [
        r'\nOn\s.*?wrote:\s*\n?',
        r'\n202\d.*?(?:időpontban|-kor|)\s*.*?ezt írta:\s*\n?',
        r'\n.*?202\d.*?(?:ezt írta|wrote|írta):\s*\n?',
        r'\nBégé Design Kft.*?ezt írta:\s*\n?',
        r'\nEAISY Marketing.*?ezt írta:\s*\n?',
        r'\nFrom:\s.*?\nSent:\s.*?\nTo:\s.*?\nSubject:\s.*?\n'
    ]
    for p in patterns:
        parts = re.split(p, text, maxsplit=1, flags=re.IGNORECASE)
        text = parts[0]
    
    lines = text.split('\n')
    while lines and lines[-1].startswith('>'):
        lines.pop()
    return '\n'.join(lines).strip()


# ═══════════════════════════════════════════════════════════════════════════════


# ═══════════════════════════════════════════════════════════════════════════════
# SPAM FILTER — Heuristic email spam detection (no AI cost)
# ═══════════════════════════════════════════════════════════════════════════════

import re as _re

# Feladó prefixek, amik szinte mindig automatikus/marketing levelek
_SPAM_SENDER_PREFIXES = (
    "noreply@", "no-reply@", "no_reply@",
    "newsletter@", "news@",
    "marketing@", "promo@", "promotions@",
    "mailer-daemon@", "postmaster@",
    "donotreply@", "do-not-reply@",
    "bounce@", "bounces@",
    "notifications@", "notification@",
    "updates@", "update@",
    "support@mailchimp.com", "info@mail.",
)

# Feladó domain-ek, amik szinte mindig spam
_SPAM_SENDER_DOMAINS = (
    "mailchimp.com", "sendgrid.net", "constantcontact.com",
    "mailgun.org", "amazonses.com", "sendinblue.com",
    "brevo.com", "mailjet.com", "campaign-archive.com",
    "hubspot.com", "hubspotmail.net",
    "list-manage.com",
)

# Tárgy minták (case-insensitive)
_SPAM_SUBJECT_PATTERNS = [
    r"\bunsubscribe\b", r"\bnewsletter\b", r"\bhírlevél\b",
    r"\bleiratkoz\b", r"\bsale\b", r"\b\d+%\s*off\b",
    r"\bfree trial\b", r"\blimited time\b", r"\bact now\b",
    r"\bspecial offer\b", r"\bexclusive deal\b",
    r"\bpromotion\b", r"\bcoupon\b", r"\bdiscount\b",
    r"\bkedvezmény\b", r"\bakció\b.*\bcsak\b",
    r"\bwin\b.*\bfree\b", r"\bcongratulations\b",
    r"\bdelivery status\b", r"\bfailure notice\b",
    r"\bmailer.daemon\b", r"\bundeliverable\b",
    r"\bauto[- ]?reply\b", r"\bautomatic reply\b",
    r"\bout of office\b", r"\bházon kívül\b",
    r"\biroda[i]?\s*kívül\b", r"\babsence\b",
]
_SPAM_SUBJECT_RE = [_re.compile(p, _re.IGNORECASE) for p in _SPAM_SUBJECT_PATTERNS]

# Tartalom minták
_SPAM_CONTENT_PATTERNS = [
    r"\bunsubscribe\b", r"\bemail preferences\b",
    r"\bleiratkoz\b", r"\bfeliratkoz.*kezel\b",
    r"\bclick here to stop\b", r"\bopt.out\b",
    r"\bview in browser\b", r"\bböngészőben megnyit\b",
]
_SPAM_CONTENT_RE = [_re.compile(p, _re.IGNORECASE) for p in _SPAM_CONTENT_PATTERNS]

# URL regex a link-counting-hez
_URL_RE = _re.compile(r"https?://\S+", _re.IGNORECASE)


def is_spam_email(from_email: str, from_name: str, subject: str, text_content: str) -> bool:
    """
    Heuristic spam detection for incoming emails.
    Conservative approach — returns True only when highly confident.
    """
    email_lower = from_email.lower().strip()
    subject_lower = subject.lower().strip()
    content_lower = text_content.lower().strip()

    # 1. Sender prefix check
    for prefix in _SPAM_SENDER_PREFIXES:
        if email_lower.startswith(prefix):
            logger.debug(f"Spam detected (sender prefix): {email_lower}")
            return True

    # 2. Sender domain check
    domain = email_lower.split("@")[-1] if "@" in email_lower else ""
    for spam_domain in _SPAM_SENDER_DOMAINS:
        if domain == spam_domain or domain.endswith("." + spam_domain):
            logger.debug(f"Spam detected (sender domain): {domain}")
            return True

    # 3. Subject pattern matching — 2 találat kell (egyetlen kulcsszó, pl.
    # „kedvezmény" egy legitim ügyfél-tárgyban, nem elég a silent drop-hoz)
    spam_subject_hits = sum(1 for rx in _SPAM_SUBJECT_RE if rx.search(subject_lower))
    if spam_subject_hits >= 2:
        logger.debug(f"Spam detected (subject, {spam_subject_hits} hits): {subject}")
        return True

    # 4. Content pattern matching — require at least 2 hits for content-only
    spam_content_hits = sum(1 for rx in _SPAM_CONTENT_RE if rx.search(content_lower))
    if spam_content_hits >= 2:
        logger.debug(f"Spam detected (content patterns): {spam_content_hits} hits")
        return True

    # 5. Link flood — more than 8 links is very likely marketing
    link_count = len(_URL_RE.findall(text_content))
    if link_count > 8:
        logger.debug(f"Spam detected (link flood): {link_count} links")
        return True

    # 6. Empty body with marketing subject
    if len(content_lower) < 10 and not subject_lower:
        logger.debug("Spam detected (empty email)")
        return True

    return False


async def process_single_email(from_email: str, from_name: str, subject: str, text_content: str, message_id: str = ""):
    # ── SPAM CHECK — before any AI call ──────────────────────────────
    if is_spam_email(from_email, from_name, subject, text_content):
        logger.info(f"SPAM szűrve (silent drop): {from_email} — {subject}")
        db.create_session(session_id=f"spam_{from_email}", room_name="Spam", participant=from_name)
        db.log_interaction(
            type="email",
            topic=f"[SPAM] {subject[:200]}",
            summary=f"Spam email automatikusan szűrve: {from_email}",
            result="Automatikusan szűrve",
            tool_name="spam_filter",
            session_id=f"spam_{from_email}",
            funnel_stage="spam",
            approval_status="spam"
        )
        return

    # EAISY-241: email_client_id KORAI inicializálása — az AI-hívások ELŐTT,
    # hogy hibaágakon (Gemini hiba, JSON parse hiba) is meglegyen a client-
    # kapcsolat és az interakció-log. A lookup minden nem-spam emailnél lefut.
    email_client_id = None
    try:
        existing_sender_client = db.find_client_by_contact(email=from_email)
        if existing_sender_client:
            email_client_id = existing_sender_client.get("id")
    except Exception as e:
        logger.error(f"Email client lookup hiba: {e}")

    # BYOK: a tenant saját Gemini kulcsa (tenant_credentials), különben globális
    google_key = db.get_gemini_api_key()
    if not google_key:
        logger.error("Nincs Gemini API kulcs (tenant vagy globális). E-mail feldolgozás megszakítva.")
        return

    sys_prompt = get_system_prompt(channel="email")

    # ── Ügyfél-kontextus injektálása ─────────────────────────────────
    # A válaszgeneráló AI-nak tudnia kell, hogy a feladó ÚJ vagy VISSZATÉRŐ
    # ügyfél — különben felesleges azonosítási köröket kérdezi (név, születési
    # dátum, "járt már nálunk?"), amiknek az adatai megvannak a rendszerben.
    client_context = ""
    try:
        if existing_sender_client:
            cid = existing_sender_client.get("id")
            cd = existing_sender_client.get("custom_data", {}) or {}
            if isinstance(cd, str):
                try: cd = json.loads(cd)
                except Exception: cd = {}
            created_at = existing_sender_client.get("created_at", "") or ""

            int_count = 0
            last_int_dt = ""
            try:
                res_i = db.supabase.table("interactions").select("created_at").eq("client_id", cid).order("created_at", desc=True).limit(100).execute()
                if res_i.data:
                    int_count = len(res_i.data)
                    last_int_dt = (res_i.data[0].get("created_at") or "")[:10]
            except Exception: pass

            upcoming = []
            try:
                from datetime import datetime as _dt, timezone as _tz
                now_iso = _dt.now(_tz.utc).isoformat()
                res_e = db.supabase.table("calendar_events").select("title,start_dt").eq("attendee_email", from_email).gte("start_dt", now_iso).order("start_dt", desc=False).limit(3).execute()
                upcoming = res_e.data or []
            except Exception: pass

            details = []
            cname = cd.get("nev") or cd.get("name") or existing_sender_client.get("name", "")
            if cname: details.append(f"nyilvántartott név: {cname}")
            if created_at: details.append(f"nyilvántartásba véve: {created_at[:10]}")
            if int_count: details.append(f"korábbi interakciók: {int_count} db")
            if last_int_dt: details.append(f"utolsó interakció: {last_int_dt}")
            if upcoming:
                up_str = "; ".join(f"{(e.get('title') or 'időpont')} ({(e.get('start_dt') or '')[:16].replace('T', ' ')})" for e in upcoming)
                details.append(f"bejegyzett jövőbeli időpontja: {up_str}")
            ctags = cd.get("tags", []) or []
            if ctags: details.append("címkék: " + ", ".join(ctags))

            client_context = (
                "--- AZ ÜGYFÉL STÁTUSZA A NYILVÁNTARTÁSBAN ---\n"
                "AZ ÜGYFÉL VISSZATÉRŐ ÜGYFÉL: már szerepel a nyilvántartásban.\n"
                + ("; ".join(details) + "\n" if details else "")
                + "SZIGORÚ SZABÁLY: Mivel az ügyfél már szerepel a nyilvántartásban, TILOS rákérdezni, hogy járt-e már nálunk, és TILOS újból bekérni az azonosításához szükséges adatokat (név, születési dátum stb.) — ezek megvannak. "
                "Ha időpontot érint a kérés, erősítsd meg vagy kínálj neki időpontot.\n"
            )
        else:
            client_context = (
                "--- AZ ÜGYFÉL STÁTUSZA A NYILVÁNTARTÁSBAN ---\n"
                "AZ ÜGYFÉL ÚJ ÜGYFÉL: még nem szerepel a nyilvántartásban, korábbi foglalása vagy interakciója nincs.\n"
            )
    except Exception as ctx_err:
        logger.warning(f"Ügyfél-kontextus összeállítási hiba: {ctx_err}")

    if client_context:
        sys_prompt += "\n\n" + client_context

    # Utasítás a strukturált JSON outputra
    json_instruction = """
TE FELADATOD:
Értékeld a beérkezett e-mailt a Tudásbázis és a Rendszer Prompt alapján.
A kimeneted KIZÁRÓLAG egyetlen valid JSON objektum legyen, minden további markdown formázás (pl. ```json) NÉLKÜL.
A válaszlevélt (email_reply) te fogalmazod meg, barátságos, segítőkész hangnemben.

JSON STRUKTÚRA:
{
    "is_relevant": true|false,
    "email_reply": "A pontos válaszlevél szövege (TILOS HTML TAGEKET HASZNÁLNI! Listákhoz kötőjelet, sortöréshez \n-t használj)",
    "beszelgetes_naplobejegyzes": "A bejövő levél és a válaszod tömör összefoglalója 1 mondatban (későbbi kontextushoz).",
    "kanban_data": {
        "name": "Ügyfél neve (ha tudod, különben az e-mailből)",
        "email": "Ügyfél e-mailje",
        "phone": "Telefonszám (ha megadta, különben üres string)",
        "clinic_id": "A kiválasztott telephely ID-ja (ha releváns)",
        "szolgaltatas": "A kért szolgáltatás megnevezése (opcionális)"
    },
    "meeting": {
        "title": "Találkozó címe (KIZÁRÓLAG akkor töltsd ki ezt a meeting objektumot, ha az ügyfél konkrét dátumot és konkrét időpontot/idősávot jelölt meg a foglaláshoz! Ha csak általánosságban kérdez szabad időpontokról vagy kér időpontot konkrét nap és óra megjelölése nélkül, a meeting értéke KÖTELEZŐEN null kell legyen!)",
        "date": "YYYY-MM-DD",
        "time": "HH:MM",
        "duration_minutes": 30,
        "assigned_to": "A felelős munkatárs neve (ha releváns), különben null"
    },
    "action_modify_meeting": {
        "event_title_to_modify": "A módosítandó esemény címe vagy része",
        "new_date": "YYYY-MM-DD",
        "new_time": "HH:MM"
    },
    "action_delete_meeting": {
        "event_title_to_delete": "A törlendő esemény címe vagy része"
    },
    "alert_tags": ["urgent", "complaint", "callback", "recurring"], // Válaszd ki, ha releváns, különben üres lista []
    "secondary_tags": [],
    "handover_reason": "Az átadás oka, ha emberi beavatkozás szükséges. Válaszd ezek közül: 'Összetett kérdés', 'Sürgős / triázs', 'Hiányzó info', 'Foglalási kivétel', 'Emberi döntés'. Ha az AI mindent meg tudott oldani, ez legyen null."
}
Ha az ügyfél nem jelölt meg konkrét és pontos foglalási időpontot (konkrét napot és órát), a "meeting" értéke KÖTELEZŐEN null legyen.
FIGYELEM: Ha az eset Sürgős vagy Kiemelt prioritású, VAGY a kérés szerepel a Kivételek (Exceptions) listájában, a "meeting" értéke KÖTELEZŐEN null kell legyen (SZIGORÚAN TILOS időpontot foglalni!), és a "handover_reason" legyen 'Sürgős / triázs' vagy 'Foglalási kivétel'.
Ebben az esetben a válaszlevélben se ígérj egyeztetést konkrét időpontokról, kizárólag azt jelezd, hogy az ügyét azonnal továbbítottad egy élő kollégának/munkatársnak!

KIVÉTEL A TILTÁS ALÓL (FONTOS!):
Ha a felhasználó egyértelműen időpontot kér, de NEM adja meg, hogy milyen panasza/kezelése van, AKKOR IS FOGLALD LE az időpontot (a "meeting" objektum kitöltésével, pl. "Konzultáció" vagy "Általános vizsgálat" címmel)! Ne tagadd meg a foglalást és ne kérj vissza pontosítást csak azért, mert nem tudod a kezelés típusát. Csak akkor tilos a foglalás, ha a megadott panasz egyértelműen Sürgős/Kiemelt, vagy egyértelműen szerepel a Kivételek között. Ha nincs panasz megadva, feltételezd, hogy Normál eset!
A lehetséges alert_tags értékek:
- "urgent": ha nagyon sürgős az ügy
- "exception": ha a kérés szerepel a Kivételek listájában
- "complaint": ha a levél panaszt, elégedetlenséget tartalmaz
- "callback": ha telefonos visszahívást kérnek
- "recurring": ha egy gyakori ismétlődő hibát/kérdést vetnek fel.

A "secondary_tags" mező: válaszd ki azokat a másodlagos címkéket, amelyek relevánsak az interakcióra.
Lehetséges értékek:
- "árkérdés": ha az ügyfél árról, díjakról, kedvezményekről érdeklődik
- "ajánlatkérés": ha az ügyfél konkrét ajánlatot kér
- "kampány lead": ha az ügyfél egy kampányra/akcióra reagált
Ha egyik sem releváns, legyen üres lista [].
"""

    client = genai.Client(api_key=google_key)
    
    # ELŐZMÉNYEK LEKÉRDEZÉSE — csak az utolsó 3 (nem a teljes szál + Python-szelet)
    history_text = ""
    try:
        session_id = f"email_{from_email}"
        history_res = db.supabase.table("interactions").select("summary, ai_draft_response").eq("session_id", session_id).order("created_at", desc=True).limit(3).execute()
        if history_res.data:
            recent_history = list(reversed(history_res.data))
            history_text = "--- ELŐZŐ ÜZENETEK (KONTEXTUS A BESZÉLGETÉSHEZ) ---\n"
            for h in recent_history:
                history_text += f"ÜGYFÉL KORÁBBI E-MAILJE: {h.get('summary', '')}\n"
                draft_str = h.get('ai_draft_response')
                if draft_str:
                    try:
                        draft_obj = json.loads(draft_str)
                        history_text += f"A MI KORÁBBI VÁLASZUNK: {draft_obj.get('body', '')}\n"
                    except:
                        pass
            history_text += "--------------------------------\n\n"
    except Exception as e:
        logger.error(f"Hiba az előzmények lekérdezésekor: {e}")

    user_content = history_text + f"--- ÚJ BEJÖVŐ E-MAIL ---\nFeladó: {from_name} <{from_email}>\nTárgy: {subject}\nÜzenet:\n{text_content}\n"
    
    # Reinforce the correct institution name dynamically from the database
    current_bi = db.get_business_info()
    db_practice_name = current_bi.get('practice_name')
    if db_practice_name:
        sys_prompt += f"\n\nSZIGORÚ UTASÍTÁS: Az intézmény jelenlegi hivatalos neve: '{db_practice_name}'. Az Előző üzenetekben (history) esetlegesen szereplő BÁRMILYEN más nevet tekintsd elavultnak vagy hibásnak, és hagyd figyelmen kívül! A válaszodban KIZÁRÓLAG a '{db_practice_name}' nevet használd azonosításra és elköszönéshez!\n"
        
    triage_rules = db.get_triage_rules()
    if triage_rules:
        rules_text = "\n".join([f"- Szabály ID: {r['id']}, Helyzet: {r['situation']}, Prioritás: {r['priority']}" for r in triage_rules])
        sys_prompt += f"\n\n--- TRIÁZS SZABÁLYOK ---\nKérlek értékeld az e-mail tartalmát az alábbi szabályok alapján is. Ha egyezik egy 'Sürgős' prioritású szabállyal, KÖTELEZŐ felvenned az 'urgent' tag-et az alert_tags listába. Ha egy 'Kiemelt' prioritású szabállyal egyezik, KÖTELEZŐ felvenned a 'kiemelt' tag-et!\n{rules_text}\n"

    sys_prompt += "\n\n--- VISELKEDÉSI SZABÁLYOK A VÁLASZLEVÉLHEZ ---\n"
    sys_prompt += "1. SOHA ne írd, hogy 'Jó napot!' vagy más sablonos köszönést, ha a beszélgetés már elkezdődött (lásd Előző üzenetek). Ha ez a legelső üzenet, akkor is maximum egy 'Üdvözlöm!' elegendő.\n"
    sys_prompt += "2. SOHA ne kérdezd meg, hogy 'Miben segíthetek?', ha az ügyfél már konkrét kérdést tett fel (pl. 'érdeklődnék hogy foglalkoznak-e fogkőeltávolítással'). Válaszolj közvetlenül és felesleges udvariaskodás nélkül a kérdésére (pl. 'Igen, foglalkozunk fogkőeltávolítással, az áraink...', stb.)! Ne fárasszuk az ügyfelet felesleges kérdésekkel, ha már tudjuk mit akar.\n"
    sys_prompt += "3. Légy célratörő, lényegretörő és emberi.\n"
    sys_prompt += f"\n\n--- JSON UTASÍTÁS ---\n{json_instruction}"

    logger.info(f"Gemini 2.5 Flash elemzi az e-mailt: {from_email} - {subject}")
    try:
        response = await client.aio.models.generate_content(
            model="gemini-2.5-flash",
            contents=user_content,
            config=types.GenerateContentConfig(
                system_instruction=sys_prompt,
                temperature=0.2,
                response_mime_type="application/json"
            )
        )
        ai_text = response.text.strip()
    except Exception as e:
        logger.error(f"Gemini API hiba: {e}")
        # Hibaágakon is naplózunk interakciót — a levél ne tűnjön el nyomtalanul
        # (a dedup-tábla rögzíti, újrafeldolgozás nem lesz, de az admin látja).
        db.create_session(session_id=f"email_{from_email}", room_name="Email Thread", participant=from_name)
        db.log_interaction(
            type="email",
            topic=f"[FELDOLGOZÁSI HIBA] {subject[:200]}",
            summary=f"Bejövő email feldolgozása meghiúsult (Gemini API hiba): {from_email}",
            result=str(e)[:500],
            tool_name="imap_worker_ai",
            session_id=f"email_{from_email}",
            funnel_stage="relevant",
            approval_status="pending",
            client_id=email_client_id
        )
        return

    # Eltávolítjuk a markdown json blockokat ha esetleg mégis beletenné
    if ai_text.startswith("```json"):
        ai_text = ai_text[7:]
    if ai_text.startswith("```"):
        ai_text = ai_text[3:]
    if ai_text.endswith("```"):
        ai_text = ai_text[:-3]
    ai_text = ai_text.strip()

    try:
        data = json.loads(ai_text)
    except json.JSONDecodeError as e:
        logger.error(f"Hibás JSON válasz az AI-tól: {e}\nNyers AI válasz:\n{ai_text}")
        db.create_session(session_id=f"email_{from_email}", room_name="Email Thread", participant=from_name)
        db.log_interaction(
            type="email",
            topic=f"[FELDOLGOZÁSI HIBA] {subject[:200]}",
            summary=f"Bejövő email feldolgozása meghiúsult (hibás AI JSON): {from_email}",
            result=str(e)[:500],
            tool_name="imap_worker_ai",
            session_id=f"email_{from_email}",
            funnel_stage="relevant",
            approval_status="pending",
            client_id=email_client_id
        )
        return

    is_relevant = data.get("is_relevant", False)
    email_reply = data.get("email_reply", "")
    kanban = data.get("kanban_data", {})
    beszelgetes = data.get("beszelgetes_naplobejegyzes", "")
    meeting = data.get("meeting")
    alert_tags = data.get("alert_tags", [])
    handover_reason = data.get("handover_reason")
    secondary_tags = data.get("secondary_tags", [])
    
    # Fallback emberi döntés — szóhatáros regex (a „hív" substring kihívás-ra,
    # felhív-ra stb. is matchelt; téves pozitívokat okozott)
    if not handover_reason and email_reply and _re.search(r"(visszahív|emberi döntés|kolléga|kollégánk)", email_reply.lower()):
        if "callback" in alert_tags or "urgent" in alert_tags:
            handover_reason = "Emberi döntés"

    log_szoveg = f"{beszelgetes}\n- Bejövő e-mail (Tárgy: {subject}): {text_content}"
    if email_reply:
        log_szoveg += f"\n\nAI Válasz:\n{email_reply}"

    # Ügyfél és beszélgetés napló mentése MINDEN bejövő emailhez
    kanban = kanban or {}
    name = kanban.get("name") or from_name or "Névtelen E-mail lead"
    # A KLIENS IDENTITÁSA a tényleges feladó
    kanban_email = (kanban.get("email") or "").strip()
    if kanban_email and kanban_email.lower() != from_email.lower():
        logger.info(f"A kanban_data email ({kanban_email}) eltér a feladótól ({from_email}) — a feladót használjuk")
    email = from_email
    details = {
        "name": name,
        "email": email,
        "phone": kanban.get("phone", ""),
        "forras_csatorna": "E-mail",
    }
    if kanban.get("jarmu_tipusa"):
        details["jarmu_tipusa"] = kanban["jarmu_tipusa"]
    if kanban.get("jarmu_modell"):
        details["jarmu_modell"] = kanban["jarmu_modell"]
        
    if meeting and meeting.get("assigned_to"):
        details["assigned_to"] = meeting.get("assigned_to")
        
    if isinstance(alert_tags, list) and "urgent" in alert_tags:
        details["prioritas"] = "Sürgős"
        
    if beszelgetes:
        details["problem_description"] = beszelgetes
    else:
        details["problem_description"] = f"E-mail tárgy: {subject}"
        
    alert_tags_list = data.get("alert_tags", [])
    if isinstance(alert_tags_list, list):
        if "kiemelt" in alert_tags_list:
            details["prioritas"] = "Kiemelt"
        elif "urgent" in alert_tags_list:
            details["prioritas"] = "Sürgős"
            
    # AI-alapú másodlagos címkék hozzáadása (meglévő tagek megőrzésével)
    existing_tags = []
    existing_client = existing_sender_client
    if existing_client:
        ec_data = existing_client.get("custom_data", {}) or {}
        if isinstance(ec_data, str):
            try: ec_data = json.loads(ec_data)
            except: ec_data = {}
        existing_tags = ec_data.get("tags", []) if isinstance(ec_data, dict) else []
    if not isinstance(existing_tags, list): existing_tags = []
    
    if isinstance(secondary_tags, list) and secondary_tags:
        for st in secondary_tags:
            if st and st not in existing_tags:
                existing_tags.append(st)
    if existing_tags:
        details["tags"] = existing_tags
            
    # Mentsük Kanban "uj" oszlopba és frissítsük a beszélgetés naplót
    cols = db.get_kanban_columns()
    first_col = cols[0]["id"] if cols else "uj"
    email_client_id = db.upsert_client(custom_data=details, additional_log=log_szoveg, status=first_col)
    logger.info(f"Ügyfél mentve/frissítve a Kanban táblában: {name} (client_id={email_client_id})")
        
    created_event_id = None
    if meeting:
        try:
            date_str = meeting.get("date")
            time_str = meeting.get("time")
            dur = meeting.get("duration_minutes", 30)
            title = meeting.get("title", f"Megbeszélés: {from_name}")

            # time_str normalizálás: az AI adhat "14:30:00"-t is → HH:MM-re vágjuk
            if isinstance(time_str, str):
                m_time = _re.match(r"^(\d{1,2}:\d{2})", time_str.strip())
                time_str = m_time.group(1) if m_time else None

            if date_str and time_str:
                start_dt = _to_budapest_tz(f"{date_str}T{time_str}:00")
                end_dt = start_dt + timedelta(minutes=dur)
                created_event_id = db.add_calendar_event(
                    title=title,
                    start_dt=start_dt.isoformat(),
                    end_dt=end_dt.isoformat(),
                    duration_minutes=dur,
                    attendee=from_name,
                    attendee_email=from_email
                )
                if created_event_id:
                    logger.info(f"Naptár esemény sikeresen létrehozva: {title} {start_dt}")
                else:
                    raise ValueError("add_calendar_event nem adott vissza event id-t")
            else:
                raise ValueError(f"Hiányzó/érvénytelen dátum vagy idő: date={date_str!r} time={time_str!r}")
        except Exception as e:
            logger.error(f"Hiba a naptáresemény hozzáadásakor: {e}")
            # KRITIKUS: ha az esemény NEM jött létre, a meeting truthy maradna →
            # a klasszifikáció „auto_booking"-ot adhatna, és az autonóm válasz
            # nem létező foglalást igérne vissza. Ilyenkor meeting=None.
            created_event_id = None
            meeting = None

    modify_action = data.get("action_modify_meeting")
    if modify_action and modify_action.get("event_title_to_modify"):
        try:
            ev_title = modify_action["event_title_to_modify"]
            found = db.find_calendar_event_by_title(ev_title)
            if found:
                updates = {}
                if modify_action.get("new_date") or modify_action.get("new_time"):
                    old_dt = _to_budapest_tz(found["start_dt"])
                    d = modify_action.get("new_date") or old_dt.strftime("%Y-%m-%d")
                    t = modify_action.get("new_time") or old_dt.strftime("%H:%M")
                    new_start = _to_budapest_tz(f"{d}T{t}:00")
                    dur = found.get("duration_minutes", 30)
                    updates["start_dt"] = new_start.isoformat()
                    updates["end_dt"] = (new_start + timedelta(minutes=dur)).isoformat()
                if updates:
                    db.update_calendar_event(found["id"], **updates)
                    logger.info(f"Naptár esemény módosítva (e-mailből): {found['title']}")
                    # Módosítás visszaigazolás email küldése
                    attendee_email = found.get("attendee_email")
                    if attendee_email and attendee_email != "-":
                        old_dt_str = found["start_dt"]
                        new_dt_str = updates.get("start_dt", old_dt_str)
                        asyncio.create_task(
                            send_modification_confirmation_email(
                                attendee=found.get("attendee", "Ügyfél"),
                                attendee_email=attendee_email,
                                title=found.get("title", "Konzultáció"),
                                old_datetime=old_dt_str,
                                new_datetime=new_dt_str
                            )
                        )
        except Exception as e:
            logger.error(f"Hiba a naptáresemény módosításakor: {e}")

    delete_action = data.get("action_delete_meeting")
    if delete_action and delete_action.get("event_title_to_delete"):
        try:
            ev_title = delete_action["event_title_to_delete"]
            found = db.find_calendar_event_by_title(ev_title)
            if found:
                # Mark client as cancelled
                client = None
                email = found.get("attendee_email")
                if email and email != "-":
                    client = db.find_client_by_contact(email=email)
                
                if not client:
                    name = found.get("attendee")
                    if name and name != "-":
                        res = db.supabase.table("clients").select("*").ilike("name", f"%{name}%").order("id", desc=True).limit(1).execute()
                        if res.data:
                            client = res.data[0]
                
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
                    # Automatikus 'törölt időpont' tag hozzáadása
                    existing_tags = custom_data.get("tags", [])
                    if not isinstance(existing_tags, list): existing_tags = []
                    if "törölt időpont" not in existing_tags:
                        existing_tags.append("törölt időpont")
                        custom_data["tags"] = existing_tags
                    db.edit_client_details(client["id"], custom_data)
                    db.update_client_status(client["id"], "lemondott")

                db.delete_calendar_event(found["id"])
                logger.info(f"Naptár esemény törölve (e-mailből): {found['title']}")
        except Exception as e:
            logger.error(f"Hiba a naptáresemény törlésekor: {e}")

    if email_reply and email_reply.strip():
        # Email "kiküldés" helyett piszkozat mentése a Jóváhagyó rendszerbe (Human-in-the-loop)

        sent_ok = False
        reply_subject = _reply_subject(subject)

        draft_payload = {
            "channel": "Email",

            "to_email": from_email,

            "to_name": from_name,

            "subject": reply_subject,

            "body": email_reply

        }

        if message_id:
            draft_payload["in_reply_to"] = message_id

        if created_event_id is not None:
            draft_payload["event_id"] = created_event_id

        draft_json = json.dumps(draft_payload)

        logger.info(f"E-mail piszkozat mentve jóváhagyásra: {from_email}")

        # Naplózás
        session_id = f"email_{from_email}"
        db.create_session(session_id=session_id, room_name="Email Thread", participant=from_name)

        email_log_id = db.add_email_log(
            to_name=from_name,
            to_email=from_email,
            subject=reply_subject,
            message=email_reply,
            status="pending",
            session_id=session_id
        )
        f_stage = "valaszolt"
        if meeting:
            f_stage = "foglalt"

        # ── KLASSZIFIKÁCIÓ ──
        ai_answered = bool(email_reply and email_reply.strip() and not handover_reason)
        classification = await classify_interaction(
            message_text=text_content,
            channel="email",
            tool_calls=["book_meeting"] if meeting else [],
            handover_reason=handover_reason or "",
            kb_answered=ai_answered
        )

        # EAISY-241: Ha az ügytípus eljárása „Önállóan kezelhető" (autonomous + none),
        # és az eaisyDesk tud válaszolni (KB / system prompt alapján), akkor a válasz
        # azonnal kikerül Brevo-n. Státusz: Lezárt, eredmény: ügytípustól függő
        # (Megválaszolt kérdés / Új időpont / stb.), teendő: Nincs további teendő.
        # Ellenkező esetben a státusz NEM lehet Lezárt (Nyitott vagy Sürgős),
        # és az interakció pending marad (emberi beavatkozás szükséges).
        is_autonomous_email = (
            bool(classification.get("autonomous"))
            and classification.get("restriction") == "none"
            and ai_answered
        )
        send_ok = False
        if is_autonomous_email and email_reply.strip():
            try:
                send_ok = await _send_autonomous_email(
                    to_email=from_email,
                    to_name=from_name or "",
                    subject=reply_subject,
                    body=email_reply,
                    in_reply_to=message_id,
                )
            except Exception as send_err:
                logger.error(f"Auto-send email hiba: {send_err}")
                send_ok = False

        email_approval = "approved" if (is_autonomous_email and send_ok) else "pending"
        email_funnel = "valaszolt" if (is_autonomous_email and send_ok) else f_stage

        db.log_interaction(
            type="email",
            topic=f"Email AI válasz - {subject}: {text_content[:200]}",
            summary=classification.get("osszefoglalas") or f"Bejövő e-mail {from_email} címről",
            result=classification.get("eredmeny", "Várakozik jóváhagyásra"),
            tool_name="imap_worker_ai",
            session_id=session_id,
            funnel_stage=email_funnel,
            alert_tags=alert_tags if isinstance(alert_tags, list) else [],
            handover_reason=handover_reason,
            approval_status=email_approval,
            ai_draft_response=draft_json,
            client_id=email_client_id if email_client_id else None,
            classification=classification
        )

        if is_autonomous_email and send_ok:
            logger.info(f"✅ Autonóm email válasz kiküldve: {from_email} — {classification.get('eredmeny','')}")
            # CSAK a mostani levél email_log sorát állítjuk 'sent'-re (korábban
            # session_id-re frissített — a feladó ÖSSZES korábbi, akár ki nem
            # küldött draftját is „sent"-re állította)
            try:
                if email_log_id:
                    db.supabase.table("email_logs").update({"status": "sent"}).eq("id", email_log_id).execute()
            except Exception as elu_err:
                logger.warning(f"email_log státusz-frissítés sikertelen: {elu_err}")

        if isinstance(alert_tags, list) and "kiemelt" in alert_tags:
            email_to_send = None
            t_rules = db.get_triage_rules()
            for r in t_rules:
                if (r.get("priority") or "").lower() in ("surgos", "sürgős", "kiemelt", "urgent") and r.get("escalation_email"):
                    email_to_send = r["escalation_email"]
                    break

            if email_to_send:
                _spawn(send_escalation_email_to_staff(
                    to_email=email_to_send,
                    patient_name=from_name,
                    patient_contact=from_email,
                    problem_description=f"E-mail tárgy: {subject}\n{text_content[:200]}...",
                    priority="Kiemelt"
                ), name="escalation-email")


def _imap_credentials(tenant_id: str | None = None) -> tuple[str, str, str, int]:
    """IMAP hitelesítés feloldása tenantonként (FÁZIS 4 multi-mailbox).
    Sorrend: tenant_credentials (imap_server/user/pass/port) → globális .env.
    Visszatérés: (server, user, pass, port)."""
    tid = tenant_id or db.get_current_tenant()
    server = db.get_credential(tid, "imap_server", default=os.getenv("IMAP_SERVER"))
    user = db.get_credential(tid, "imap_user", default=os.getenv("IMAP_USER"))
    pwd = db.get_credential(tid, "imap_pass", default=os.getenv("IMAP_PASS"))
    port = int(db.get_credential(tid, "imap_port", default=os.getenv("IMAP_PORT", "993")) or 993)
    return server, user, pwd, port


def check_imap_sync(server: str = "", user: str = "", pwd: str = "", port: int = 993):
    """Szinkron IMAP lekérdezés, amit egy threadpoolban futtatunk.

    UID-alapú műveletek (a message sequence numberök EXPUNGE esetén elcsúszhatnak).
    A leveleket NEM jelöljük olvasottnak — azt a worker teszi meg a feldolgozás
    UTÁN (mark_emails_seen_sync), így crash esetén a levél nem vész el.
    Visszatérés: [(uid, message_id, from_email, from_name, subject, text), ...]

    A hitelesítő adatok paraméterben is jöhetnek (multi-mailbox); ha üresek,
    a globális .env-ből olvassuk (visszafelé kompatibilitás).
    """
    if not server:
        server = os.getenv("IMAP_SERVER")
    if not user:
        user = os.getenv("IMAP_USER")
    if not pwd:
        pwd = os.getenv("IMAP_PASS")

    if not server or not user or not pwd:
        logger.warning("Hiányzó IMAP hitelesítés — a poll kihagyva")
        return []

    emails_to_process = []

    try:
        mail = imaplib.IMAP4_SSL(server, port=port)
        mail.login(user, pwd)
        mail.select("inbox")

        # Csak az olvasatlan (UNSEEN) leveleket kérdezzük le — UID SEARCH
        status, messages = mail.uid("search", None, "UNSEEN")
        if status == "OK" and messages[0]:
            uids = messages[0].split()
            logger.info(f"IMAP poll: {len(uids)} olvasatlan levél")
            for uid in uids:
                try:
                    res, msg_data = mail.uid("fetch", uid, "(RFC822)")
                    if res != "OK":
                        continue
                    raw_email = msg_data[0][1]
                    msg = email.message_from_bytes(raw_email)

                    subject = decode_mime_words(msg.get("Subject", ""))
                    from_header = decode_mime_words(msg.get("From", ""))
                    message_id = (msg.get("Message-ID") or "").strip()

                    from_name = from_header
                    from_email = from_header
                    if "<" in from_header and ">" in from_header:
                        parts = from_header.split("<")
                        from_name = parts[0].strip() or "Névtelen E-mail"
                        from_email = parts[1].replace(">", "").strip()

                    text_content = ""
                    html_content = ""
                    saved_attachments = []
                    if msg.is_multipart():
                        for part in msg.walk():
                            content_type = part.get_content_type()
                            content_disposition = str(part.get("Content-Disposition") or "")
                            part_filename = decode_mime_words(part.get_filename() or "")

                            # Csatolmányok és képek detektálása és mentése
                            is_att = "attachment" in content_disposition or (content_type.startswith("image/") and part_filename) or (content_type.startswith("image/") and "inline" in content_disposition)
                            if is_att:
                                try:
                                    part_data = part.get_payload(decode=True)
                                    if part_data:
                                        from attachment_manager import save_email_attachment
                                        saved_meta = save_email_attachment(part_data, part_filename or "image.png", content_type)
                                        if saved_meta:
                                            saved_attachments.append(saved_meta)
                                except Exception as att_err:
                                    logger.error(f"Csatolmány mentési hiba ({part_filename}): {att_err}")

                            if content_type == "text/plain" and "attachment" not in content_disposition:
                                if not text_content:
                                    charset = part.get_content_charset() or 'utf-8'
                                    raw_payload = part.get_payload(decode=True)
                                    text_content = _decode_payload(raw_payload, charset)
                            elif content_type == "text/html" and "attachment" not in content_disposition:
                                if not html_content:
                                    charset = part.get_content_charset() or 'utf-8'
                                    raw_payload = part.get_payload(decode=True)
                                    html_content = _decode_payload(raw_payload, charset)
                    else:
                        charset = msg.get_content_charset() or 'utf-8'
                        raw_payload = msg.get_payload(decode=True)
                        text_content = _decode_payload(raw_payload, charset)

                    # Ha nem volt text/plain, kinyerjük a text/html-ből
                    if not text_content and html_content:
                        import re as _re_html
                        clean_html = _re_html.sub(r'<style.*?</style>', '', html_content, flags=_re_html.DOTALL | _re_html.IGNORECASE)
                        clean_html = _re_html.sub(r'<script.*?</script>', '', clean_html, flags=_re_html.DOTALL | _re_html.IGNORECASE)
                        clean_html = _re_html.sub(r'<br\s*/?>', '\n', clean_html, flags=_re_html.IGNORECASE)
                        clean_html = _re_html.sub(r'</p>', '\n\n', clean_html, flags=_re_html.IGNORECASE)
                        clean_html = _re_html.sub(r'</div>', '\n', clean_html, flags=_re_html.IGNORECASE)
                        clean_html = _re_html.sub(r'<[^>]+>', '', clean_html)
                        text_content = clean_html.strip()

                    # Csatolmányok és képek linkelése a szövegben
                    if saved_attachments:
                        import re as _re_att
                        for att in saved_attachments:
                            fn = att["filename"]
                            url = att["url"]
                            if att["is_image"]:
                                pattern = _re_att.compile(r'\[image:\s*' + _re_att.escape(fn) + r'\](?!\()', _re_att.IGNORECASE)
                                if pattern.search(text_content):
                                    text_content = pattern.sub(f"[image: {fn}]({url})", text_content, count=1)
                                elif _re_att.search(r'\[image:\s*[^\]]+\](?!\()', text_content):
                                    text_content = _re_att.sub(r'\[image:\s*[^\]]+\](?!\()', f"[image: {fn}]({url})", text_content, count=1)
                                else:
                                    text_content = (text_content.rstrip() + f"\n\n[image: {fn}]({url})").strip()
                            else:
                                pattern = _re_att.compile(r'\[Melléklet:\s*' + _re_att.escape(fn) + r'\](?!\()', _re_att.IGNORECASE)
                                if pattern.search(text_content):
                                    text_content = pattern.sub(f"[Melléklet: {fn}]({url})", text_content, count=1)
                                else:
                                    text_content = (text_content.rstrip() + f"\n\n[Melléklet: {fn}]({url})").strip()

                    text_content = clean_email_body(text_content)
                    emails_to_process.append((uid, message_id, from_email, from_name, subject, text_content))
                except Exception as fe:
                    logger.error(f"Levél fetch/parse hiba (uid={uid}): {fe}")

        mail.close()
        mail.logout()
    except Exception as e:
        logger.error(f"IMAP csatlakozási hiba: {e}")

    return emails_to_process


def mark_emails_seen_sync(uids: list, server: str = "", user: str = "", pwd: str = "", port: int = 993):
    """A feldolgozott levelek \\Seen jelölése a FELDOLGOZÁS UTÁN (UID STORE).
    Crash esetén a jelöletlen levelek újra beolvasódnak — a processed_emails
    dedup-tábla akkor is megakadályozza a dupla feldolgozást.
    Multi-mailbox: a hitelesítő adatok paraméterben is jöhetnek."""
    if not uids:
        return
    if not server:
        server = os.getenv("IMAP_SERVER")
    if not user:
        user = os.getenv("IMAP_USER")
    if not pwd:
        pwd = os.getenv("IMAP_PASS")
    if not server or not user or not pwd:
        return
    try:
        mail = imaplib.IMAP4_SSL(server, port=port)
        mail.login(user, pwd)
        mail.select("inbox")
        for uid in uids:
            try:
                mail.uid("store", uid, "+FLAGS", "\\Seen")
            except Exception as se:
                logger.warning(f"Seen-jelölés sikertelen (uid={uid}): {se}")
        mail.close()
        mail.logout()
    except Exception as e:
        logger.error(f"IMAP seen-jelölési hiba: {e}")


async def _send_autonomous_email(to_email: str, to_name: str, subject: str, body: str, in_reply_to: str = "") -> bool:
    """
    EAISY-241 — Autonóm email válasz küldése Brevo-n keresztül.
    Akkor használjuk, amikor az ügytípus eljárása „Önállóan kezelhető" és a
    klasszifikáció autonomous=true. A válasz azonnal kikerül, nem vár jóváhagyásra.
    Átmeneti Brevo-hiba (429/5xx) esetén 1 retry backoff-fal.
    """
    api_key = _get_brevo_api_key()
    if not api_key:
        logger.error('Nincs BREVO_API_KEY az autonóm email küldéshez.')
        return False
    sender = _get_sender()
    if not _sender_is_valid(sender):
        logger.error(f'Érvénytelen/hiányzó feladó az autonóm küldéshez: {sender!r} — a levél NEM ment ki.')
        return False
    html_body = f'<div style="font-family: Arial, sans-serif;">{body.replace(chr(10), "<br>")}</div>'
    payload = {
        'sender': {'name': sender["name"], 'email': sender["email"]},
        'to': [{'email': to_email, 'name': to_name}],
        'subject': subject,
        'htmlContent': html_body,
    }
    # Threading: az ügyfél levelezőprogramja így a meglévő szálhoz fűzi a választ
    if in_reply_to:
        payload['headers'] = {'In-Reply-To': in_reply_to, 'References': in_reply_to}
    try:
        async with httpx.AsyncClient() as client:
            for attempt in range(2):
                resp = await client.post(
                    'https://api.brevo.com/v3/smtp/email',
                    headers={'api-key': api_key, 'Content-Type': 'application/json'},
                    json=payload,
                    timeout=15.0,
                )
                if resp.status_code in [200, 201, 202]:
                    logger.info(f'Autonóm email kiküldve: {to_email}')
                    return True
                if resp.status_code == 429 or resp.status_code >= 500:
                    if attempt == 0:
                        logger.warning(f'Brevo átmeneti hiba ({resp.status_code}), retry 2 mp múlva…')
                        await asyncio.sleep(2)
                        continue
                logger.error(f'Brevo autonóm küldés hiba: {resp.status_code} - {resp.text}')
                return False
    except Exception as e:
        logger.error(f'Hiba az autonóm email küldésekor: {e}')
        return False


async def _poll_tenant_mailbox(tenant: dict):
    """Egy tenant IMAP-fiókjának lekérdezése és feldolgozása (FÁZIS 4).
    A tenant-kontextust a coroutine elején beállítjuk, hogy a db-lekérdezések
    (client-lookup, klasszifikáció, sender) a helyes tenant scope-ban fussanak."""
    tid = tenant["id"]
    db.set_current_tenant(tid)
    server, user, pwd, port = _imap_credentials(tid)
    if not server or not user or not pwd:
        return  # nincs IMAP konfigurálva ennél a tenantnál

    try:
        emails = await asyncio.to_thread(check_imap_sync, server, user, pwd, port)

        seen_uids = []
        for uid, message_id, from_email, from_name, subject, text_content in emails:
            try:
                # Dedup-claim: ha már feldolgoztuk, kihagyjuk
                if message_id and not db.claim_processed_email(message_id, from_email, f"email_{from_email}"):
                    logger.info(f"Duplikált levél kihagyva (már feldolgozva): {message_id}")
                    seen_uids.append(uid)
                    continue
                await process_single_email(from_email, from_name, subject, text_content, message_id=message_id)
            except Exception as proc_err:
                logger.error(f"Email feldolgozási hiba ({from_email} — {subject}): {proc_err}")
                if message_id:
                    try:
                        db.update_processed_email_status(message_id, "error")
                    except Exception:
                        pass
            seen_uids.append(uid)

        if seen_uids:
            await asyncio.to_thread(mark_emails_seen_sync, seen_uids, server, user, pwd, port)
    except Exception as e:
        logger.error(f"IMAP poll hiba (tenant={tenant.get('slug')}): {e}")


async def email_worker_loop():
    """Háttérfolyamat, ami percenként hívja az IMAP-et MINDEN aktív tenant
    fiókjára és feldolgozza azt (FÁZIS 4 multi-mailbox).

    Dedup: a Message-ID-t a processed_emails táblába claimeli (insert-first);
    ha már létezik, a levél kihagyásra kerül — két párhuzamos process sem
    dolgozhatja fel kétszer. Per-email try/except: egy hiba nem veszíti el
    a batch maradékát. A \\Seen jelölés a feldolgozás UTÁN történik.
    """
    logger.info("E-mail figyelő worker elindítva (multi-mailbox).")
    while True:
        try:
            for tenant in db.get_active_tenants():
                await _poll_tenant_mailbox(tenant)
        except asyncio.CancelledError:
            logger.info("E-mail figyelő worker megszakítva.")
            break
        except Exception as e:
            logger.error(f"E-mail worker hiba: {e}")

        # Várakozás a következő lekérdezésig (pl. 60 másodperc)
        await asyncio.sleep(60)

async def send_escalation_email_to_staff(to_email: str, patient_name: str, patient_contact: str, problem_description: str, priority: str = "Sürgős") -> bool:
    """Eszkalációs e-mail küldése az orvosnak/személyzetnek sürgős eseteknél."""
    api_key = _get_brevo_api_key()

    if not api_key:
        logger.error("Nincs beállítva BREVO_API_KEY az eszkalációs e-mailhez.")
        return False

    html_content = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #ef4444; border-radius: 8px; padding: 20px;">
        <h2 style="color: #ef4444; margin-top: 0;">Rendszer Riasztás: {priority} eset</h2>
        <p>Egy új {priority.lower()} prioritású eset érkezett az AI rendszerbe.</p>
        <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold; width: 120px;">Páciens neve:</td>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee;">{patient_name}</td>
            </tr>
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold;">Elérhetőség:</td>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee;">{patient_contact}</td>
            </tr>
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold;">Probléma leírása:</td>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee;">{problem_description}</td>
            </tr>
        </table>
        <p style="color: #666; font-size: 12px; margin-top: 20px;">Ez egy automatikusan generált üzenet.</p>
    </div>
    """

    try:
        async with httpx.AsyncClient() as http_client:
            resp = await http_client.post(
                "https://api.brevo.com/v3/smtp/email",
                headers={"api-key": api_key, "Content-Type": "application/json"},
                json={
                    "sender": _get_sender(),
                    "to": [{"email": to_email}],
                    "subject": f"[{priority}] Riasztás: {patient_name}",
                    "htmlContent": html_content,
                },
                timeout=20,
            )
            resp.raise_for_status()
            logger.info(f"Eszkalációs e-mail elküldve a következő címre: {to_email}")
            return True
    except Exception as e:
        logger.error(f"Hiba az eszkalációs e-mail küldésekor: {e}")
        return False


async def send_reminder_email(to_email: str, subject: str, html_content: str) -> bool:
    import os, json
    api_key = _get_brevo_api_key()
    if not api_key:
        logger.error('Nincs beállítva BREVO_API_KEY az emlékeztető e-mailhez.')
        return False
    import httpx
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                'https://api.brevo.com/v3/smtp/email',
                headers={'api-key': api_key, 'Content-Type': 'application/json'},
                json={
                    'sender': _get_sender(),
                    'to': [{'email': to_email}],
                    'subject': subject,
                    'htmlContent': html_content
                },
                timeout=10.0
            )
            if resp.status_code in [200, 201, 202]:
                logger.info(f'Emlékeztető e-mail kiküldve: {to_email}')
                return True
            else:
                logger.error(f'Brevo hiba: {resp.status_code} - {resp.text}')
                return False
    except Exception as e:
        logger.error(f'Hiba az emlékeztető e-mail küldésekor: {e}')
        return False

async def _run_reminders_for_tenant(tenant: dict):
    """Egy tenant emlékeztetőinek kiküldése (FÁZIS 6 multi-tenant)."""
    import datetime
    db.set_current_tenant(tenant["id"])
    settings = db.get_reminder_settings()
    if settings and settings.get('reminder_enabled'):
                hours = settings.get('reminder_hours', 24)
                template = settings.get('reminder_template', '')
                events = db.get_upcoming_events_for_reminders(hours_offset=hours)
                for ev in events:
                    # Per-event védelem: egy rossz esemény ne áldozza fel a teljes
                    # 15 perces iteráció maradékát
                    try:
                        if not ev.get('attendee_email') or ev.get('attendee_email') == '-':
                            continue

                        nev = ev.get('attendee', 'Páciens')
                        idopont = ev.get('start_dt', '')
                        if idopont:
                            try:
                                dt = datetime.datetime.fromisoformat(idopont.replace('Z', '+00:00'))
                                idopont = dt.strftime('%Y.%m.%d %H:%M')
                            except:
                                pass

                        szolgaltatas = ev.get('title', '')
                        telephely = ''
                        client = db.find_client_by_contact(email=ev.get('attendee_email'))
                        if client:
                            cd = client.get('custom_data') or {}
                            if isinstance(cd, str):
                                try: cd = json.loads(cd)
                                except: cd = {}
                            clinic_id = cd.get('clinic_id') if isinstance(cd, dict) else None
                            if clinic_id:
                                clinics = db.get_clinics()
                                for c in clinics:
                                    if str(c.get('id')) == str(clinic_id):
                                        telephely = c.get('name_and_address', '')
                                        break

                        msg = template.replace('{nev}', nev).replace('{idopont}', idopont).replace('{szolgaltatas}', szolgaltatas).replace('{telephely}', telephely)
                        html_msg = msg.replace('\n', '<br>')

                        success = await send_reminder_email(
                            to_email=ev.get('attendee_email'),
                            subject=f'Időpont emlékeztető: {szolgaltatas}',
                            html_content=html_msg
                        )

                        if success:
                            db.mark_reminder_sent(ev.get('id'))
                            session_id = f"reminder_{ev.get('id')}"
                            db.create_session(session_id=session_id, room_name="Időpont emlékeztető", participant=nev)
                            db.log_interaction(
                                type="email",
                                topic="Emlékeztető",
                                summary=f"Emlékeztető elküldve a(z) {ev.get('attendee_email')} címre",
                                result="Elküldve",
                                tool_name="reminder_worker",
                                session_id=session_id,
                                direction="outbound",
                                funnel_stage="relevant"
                            )
                    except Exception as ev_err:
                        logger.error(f'Emlékeztető küldési hiba (event id={ev.get("id")}): {ev_err}')


async def reminder_worker_loop():
    """Időpont emlékeztető worker MINDEN aktív tenantnak (FÁZIS 6 multi-tenant)."""
    logger.info('Időpont emlékeztető worker elindítva (multi-tenant).')
    while True:
        try:
            import asyncio
            for tenant in db.get_active_tenants():
                try:
                    await _run_reminders_for_tenant(tenant)
                except Exception as t_err:
                    logger.error(f'Emlékeztető worker hiba (tenant={tenant.get("slug")}): {t_err}')
        except asyncio.CancelledError:
            logger.info('Emlékeztető worker megszakítva.')
            break
        except Exception as e:
            logger.error(f'Hiba az emlékeztető workerben: {e}')

        await asyncio.sleep(15 * 60) # 15 perc

async def send_booking_confirmation_email(event_id: int, title: str, date: str, time: str, attendee: str, attendee_email: str):
    import jwt as pyjwt
    import os
    import base64 as b64module
    import database as db
    from datetime import datetime, timedelta
    JWT_SECRET = os.getenv("JWT_SECRET", "thinkai-admin-secret-change-me")
    JWT_ALGO = "HS256"
    SERVER_URL = os.getenv("SERVER_URL", "http://localhost:8000")
    
    try:
        # ── Tenant beállítások: visszaigazoló sablon + lemondási link kapcsoló ──
        conf_enabled = True
        conf_subject = "Időpont visszaigazolás"
        conf_template = None
        conf_cancel_link = True
        try:
            settings = db.get_reminder_settings()
            if settings:
                conf_enabled = settings.get('confirmation_enabled', True)
                conf_subject = settings.get('confirmation_subject') or conf_subject
                conf_template = settings.get('confirmation_template') or None
                conf_cancel_link = settings.get('confirmation_cancel_link', True)
        except Exception:
            pass

        if not conf_enabled:
            logger.info(f"Confirmation email skipped (disabled in settings): {attendee_email}")
            return


        token = pyjwt.encode({"event_id": event_id, "exp": datetime.utcnow() + timedelta(days=90)}, JWT_SECRET, algorithm=JWT_ALGO)
        cancel_url = f"{SERVER_URL}/api/public/cancel?token={token}"
        
        # ── ICS naptárfájl generálása ──────────────────────────────────
        try:
            start_dt = _to_budapest_tz(f"{date}T{time}:00")
            end_dt = start_dt + timedelta(minutes=30)  # alapértelmezett 30 perc
            
            # Próbáljuk megkapni a tényleges időtartamot az adatbázisból
            try:
                ev = db.supabase.table("calendar_events").select("duration_minutes").eq("id", event_id).execute()
                if ev.data and ev.data[0].get("duration_minutes"):
                    end_dt = start_dt + timedelta(minutes=ev.data[0]["duration_minutes"])
            except Exception:
                pass
            
            # ICS formátum (RFC 5545)
            uid = f"eaisy-{event_id}@thinkai.hu"
            now_utc = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
            dtstart = start_dt.strftime("%Y%m%dT%H%M%S")
            dtend = end_dt.strftime("%Y%m%dT%H%M%S")
            
            ics_cancel_desc = f"\\nLemondás: {cancel_url}" if conf_cancel_link else ""
            ics_content = (
                "BEGIN:VCALENDAR\r\n"
                "VERSION:2.0\r\n"
                "PRODID:-//EAISY//Booking//HU\r\n"
                "CALSCALE:GREGORIAN\r\n"
                "METHOD:REQUEST\r\n"
                "BEGIN:VEVENT\r\n"
                f"UID:{uid}\r\n"
                f"DTSTAMP:{now_utc}\r\n"
                f"DTSTART;TZID=Europe/Budapest:{dtstart}\r\n"
                f"DTEND;TZID=Europe/Budapest:{dtend}\r\n"
                f"SUMMARY:{title}\r\n"
                f"DESCRIPTION:Időpont visszaigazolás - {title}{ics_cancel_desc}\r\n"
                f"ATTENDEE;CN={attendee}:mailto:{attendee_email}\r\n"
                "STATUS:CONFIRMED\r\n"
                "BEGIN:VALARM\r\n"
                "TRIGGER:-PT60M\r\n"
                "ACTION:DISPLAY\r\n"
                f"DESCRIPTION:Emlékeztető: {title} 1 óra múlva\r\n"
                "END:VALARM\r\n"
                "END:VEVENT\r\n"
                "END:VCALENDAR\r\n"
            )
            ics_base64 = b64module.b64encode(ics_content.encode("utf-8")).decode("utf-8")
        except Exception as e:
            logger.error(f"ICS generálási hiba: {e}")
            ics_base64 = None
        
        html_content = f"""
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; line-height: 1.6;">
            <p>Kedves {attendee}!</p>
            <br>
            <p>Köszönjük az adatokat! Lefoglaltuk Önnek az alábbi időpontot:</p>
            <div style="background-color: #f9fafb; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0;">
                <strong>Időpont:</strong> {date} {time}<br>
                <strong>Szolgáltatás:</strong> {title}
            </div>
            <p>Mellékletként csatoltuk az időpont naptárfájlját (.ics), melyet könnyedén hozzáadhatsz okostelefonod vagy számítógéped naptárához.</p>
            <p style="font-size: 12px; color: #6b7280; font-style: italic;">
                * Kérjük, vegye figyelembe, hogy időpont módosítására az időpont előtti 48 órával van lehetőség. 
                Tájékoztatjuk, hogy 24 órán belüli lemondás esetén rendelőnk külön szabályzata lehet érvényben.
            </p>
            <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            <div style="text-align: center;">
                <p style="margin-bottom: 20px;">Üdvözlettel: <strong>A virtuális asszisztens csapata</strong></p>
                <a href="{cancel_url}" style="background-color: #ef4444; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; font-size: 16px;">Lemondom</a>
            </div>
            <hr style="border: 0; border-top: 1px dotted #e5e7eb; margin: 30px 0;">
        </div>
        """
        
        # Egyedi sablon: {nev} / {idopont} / {szolgaltatas} / {lemondas_gomb} helyettesítéssel
        if conf_template:
            lemondas_gomb = get_cancellation_html(event_id) if conf_cancel_link else ""
            html_content = (
                conf_template
                .replace("{nev}", attendee)
                .replace("{idopont}", f"{date} {time}")
                .replace("{szolgaltatas}", title)
                .replace("{lemondas_gomb}", lemondas_gomb)
                .replace("\n", "<br>")
            )
            if conf_cancel_link:
                html_content += get_cancellation_html(event_id)
        elif not conf_cancel_link:
            # Lemondási link kikapcsolva: gomb + URL eltávolítása az alap emailből
            import re as _re
            html_content = _re.sub(r'<a href="[^"]*"[^>]*>Lemondom</a>', '', html_content)
            html_content = html_content.replace(cancel_url, '')

        api_key = _get_brevo_api_key()

        if not api_key:
            logger.error("Nincs beállítva BREVO_API_KEY az időpont visszaigazoló e-mailhez.")
            return

        email_payload = {
            "sender": _get_sender(),
            "to": [{"email": attendee_email, "name": attendee}],
            "subject": conf_subject,
            "htmlContent": html_content,
        }
        
        # ICS melléklet csatolása (Brevo API attachment formátum)
        if ics_base64:
            safe_title = title.replace(" ", "_").replace("/", "-")[:30]
            email_payload["attachment"] = [{
                "content": ics_base64,
                "name": f"idopont_{safe_title}_{date}.ics"
            }]

        async with httpx.AsyncClient() as http_client:
            resp = await http_client.post(
                "https://api.brevo.com/v3/smtp/email",
                headers={"api-key": api_key, "Content-Type": "application/json"},
                json=email_payload,
                timeout=20,
            )
            resp.raise_for_status()
        logger.info(f"Booking confirmation email sent to {attendee_email} with cancel link.")
    except Exception as e:
        logger.error(f"Failed to send booking confirmation email: {e}")

def get_cancellation_html(event_id: int) -> str:
    import jwt as pyjwt
    import os
    from datetime import datetime, timedelta
    JWT_SECRET = os.getenv("JWT_SECRET", "thinkai-admin-secret-change-me")
    JWT_ALGO = "HS256"
    SERVER_URL = os.getenv("SERVER_URL", "http://localhost:8000")
    
    token = pyjwt.encode({"event_id": event_id, "exp": datetime.utcnow() + timedelta(days=90)}, JWT_SECRET, algorithm=JWT_ALGO)
    cancel_url = f"{SERVER_URL}/api/public/cancel?token={token}"
    
    return f"""
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; color: #333; line-height: 1.6; margin-top: 30px;">
        <p style="font-size: 12px; color: #6b7280; font-style: italic;">
            * Kérjük, vegye figyelembe, hogy időpont módosítására az időpont előtti 48 órával van lehetőség. 
            Tájékoztatjuk, hogy 24 órán belüli lemondás esetén rendelőnk külön szabályzata lehet érvényben.
        </p>
        <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 30px 0;">
        <div style="text-align: center;">
            <a href="{cancel_url}" style="background-color: #ef4444; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; font-size: 16px;">Lemondom</a>
        </div>
        <hr style="border: 0; border-top: 1px dotted #e5e7eb; margin: 30px 0;">
    </div>
    """


async def send_modification_confirmation_email(attendee: str, attendee_email: str, title: str, old_datetime: str, new_datetime: str):
    """Időpont módosítás visszaigazolás email küldése."""
    import os, json
    from datetime import datetime as dt

    # Format datetimes
    try:
        old_dt = dt.fromisoformat(old_datetime.replace('Z', '+00:00'))
        old_formatted = old_dt.strftime('%Y.%m.%d %H:%M')
    except:
        old_formatted = old_datetime
    try:
        new_dt = dt.fromisoformat(new_datetime.replace('Z', '+00:00'))
        new_formatted = new_dt.strftime('%Y.%m.%d %H:%M')
    except:
        new_formatted = new_datetime

    html_content = f"""
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; line-height: 1.6;">
        <p>Kedves {attendee}!</p>
        <br>
        <p>Időpontja sikeresen módosításra került. Az új időpont részletei:</p>
        <div style="background-color: #f9fafb; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
            <strong>Szolgáltatás:</strong> {title}<br>
            <del style="color: #9ca3af;">Eredeti időpont: {old_formatted}</del><br>
            <strong style="color: #059669;">Új időpont: {new_formatted}</strong>
        </div>
        <p style="font-size: 12px; color: #6b7280; font-style: italic;">
            * Kérjük, vegye figyelembe, hogy további módosításra az időpont előtti 48 órával van lehetőség.
        </p>
        <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 30px 0;">
        <p style="text-align: center;">Üdvözlettel: <strong>A virtuális asszisztens csapata</strong></p>
    </div>
    """

    api_key = _get_brevo_api_key()

    if not api_key:
        logger.error("Nincs beállítva BREVO_API_KEY a módosítás visszaigazoló e-mailhez.")
        return

    try:
        async with httpx.AsyncClient() as http_client:
            resp = await http_client.post(
                "https://api.brevo.com/v3/smtp/email",
                headers={"api-key": api_key, "Content-Type": "application/json"},
                json={
                    "sender": _get_sender(),
                    "to": [{"email": attendee_email, "name": attendee}],
                    "subject": f"Időpont módosítás visszaigazolás - {title}",
                    "htmlContent": html_content,
                },
                timeout=20,
            )
            resp.raise_for_status()
        logger.info(f"Modification confirmation email sent to {attendee_email}.")
    except Exception as e:
        logger.error(f"Failed to send modification confirmation email: {e}")


async def _run_automations_for_tenant(tenant: dict):
    """Egy tenant eseményvezérelt automatizációi (FÁZIS 6 multi-tenant)."""
    from datetime import datetime, timezone
    db.set_current_tenant(tenant["id"])

    automations = db.get_outbound_automations()
    if not automations:
        return

    active = [a for a in automations if a.get("enabled")]
    if not active:
        return

    clients = db.get_clients(limit=1000)
    now = datetime.now(timezone.utc)

    for auto in active:
        trigger = auto.get("trigger_type", "")
        template = auto.get("message_template", "")
        delay_hours = auto.get("delay_hours", 24)

        for client in clients:
            cd = client.get("custom_data", {})
            if isinstance(cd, str):
                try: cd = json.loads(cd)
                except: cd = {}
            if not isinstance(cd, dict): cd = {}

            tags = cd.get("tags", [])
            email = cd.get("email") or client.get("email", "")
            if not email or email == "-":
                continue

            # Dupla küldés elkerülése
            if db.check_automation_sent(client["id"], auto["id"]):
                continue

            should_send = False
            nev = cd.get("nev") or cd.get("name") or client.get("name", "Ügyfél")
            szolgaltatas = ""
            idopont = ""

            if trigger == "no_show" and "no-show" in tags:
                should_send = True
                szolgaltatas = "korábbi időpont"

            elif trigger == "inactive_client":
                # Check last interaction
                last_log = cd.get("beszelgetes_naplo", "")
                if last_log:
                    # Simple heuristic: check if last entry is > 60 days old
                    created = client.get("created_at", "")
                    if created:
                        try:
                            created_dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
                            if (now - created_dt).days > 60:
                                should_send = True
                        except: pass

            elif trigger == "cancelled_no_rebook" and "törölt időpont" in tags:
                # Check if they have a future appointment
                has_future = False
                events = db.supabase.table("calendar_events").select("id").eq("attendee_email", email).gte("start_dt", now.isoformat()).limit(1).execute()
                if events.data:
                    has_future = True
                if not has_future:
                    should_send = True
                    szolgaltatas = "lemondott időpont"

            elif trigger == "follow_up":
                # Check if there's a past completed appointment (within delay_hours window)
                try:
                    past_events = db.supabase.table("calendar_events").select("start_dt, title").eq("attendee_email", email).lt("start_dt", now.isoformat()).order("start_dt", desc=True).limit(1).execute()
                    if past_events.data:
                        ev = past_events.data[0]
                        ev_dt = datetime.fromisoformat(ev["start_dt"].replace("Z", "+00:00"))
                        hours_since = (now - ev_dt).total_seconds() / 3600
                        if delay_hours <= hours_since <= delay_hours + 24:
                            should_send = True
                            szolgaltatas = ev.get("title", "")
                            idopont = ev_dt.strftime("%Y.%m.%d %H:%M")
                except: pass

            elif trigger == "price_inquiry_follow" and "árkérdés" in tags:
                # Only if no booking exists
                has_booking = False
                try:
                    events = db.supabase.table("calendar_events").select("id").eq("attendee_email", email).gte("start_dt", now.isoformat()).limit(1).execute()
                    if events.data: has_booking = True
                except: pass
                if not has_booking:
                    should_send = True

            if should_send:
                # Fill template
                msg = template.replace("{nev}", nev).replace("{szolgaltatas}", szolgaltatas).replace("{idopont}", idopont).replace("{telephely}", "")
                html_msg = msg.replace("\n", "<br>")

                # ── Human-in-the-loop: NE küldjünk közvetlenül! ──
                # Piszkozatot mentünk jóváhagyásra, pont úgy, mint az email/messenger válaszoknál.
                db.mark_automation_sent(client["id"], auto["id"])
                session_id = f"automation_{auto['id']}_{client['id']}"
                db.create_session(session_id=session_id, room_name=auto["name"], participant=nev)

                draft_payload = {
                    "channel": "Email",
                    "to_email": email,
                    "to_name": nev,
                    "subject": f"{auto['name']} - {nev}",
                    "body": msg,
                }
                draft_json = json.dumps(draft_payload)

                db.log_interaction(
                    type="email",
                    topic=auto["name"],
                    summary=f"{auto['name']} — {nev} ({email})",
                    result="Várakozik jóváhagyásra",
                    tool_name="automation_worker",
                    session_id=session_id,
                    direction="outbound",
                    funnel_stage="relevant",
                    approval_status="pending",
                    ai_draft_response=draft_json,
                )
                logger.info(f"Automation '{auto['name']}' draft saved for approval: {email}")


async def automation_worker_loop():
    """Háttérfolyamat: eseményvezérelt kimenő automatizációk MINDEN aktív
    tenantnak (FÁZIS 6 multi-tenant)."""
    logger.info("Eseményvezérelt automatizáció worker elindítva (multi-tenant).")
    while True:
        try:
            for tenant in db.get_active_tenants():
                try:
                    await _run_automations_for_tenant(tenant)
                except Exception as t_err:
                    logger.error(f"Automatizáció worker hiba (tenant={tenant.get('slug')}): {t_err}")
        except asyncio.CancelledError:
            logger.info("Automatizáció worker megszakítva.")
            break
        except Exception as e:
            logger.error(f"Automation worker error: {e}")

        await asyncio.sleep(5 * 60)  # 5 perc
