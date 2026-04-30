import os
import email
import imaplib
import json
import asyncio
from email.header import decode_header
from pathlib import Path
from datetime import datetime, timedelta

import httpx
from dotenv import load_dotenv
from loguru import logger
from google import genai
from google.genai import types

import database as db

THIS_DIR = Path(__file__).resolve().parent
load_dotenv(THIS_DIR / ".env")
from prompt_utils import get_system_prompt
def decode_mime_words(s):
    if not s:
        return ""
    return "".join(
        word.decode(encoding or "utf8", errors="replace") if isinstance(word, bytes) else word
        for word, encoding in decode_header(s)
    )

async def process_single_email(from_email: str, from_name: str, subject: str, text_content: str):
    google_key = os.getenv("GOOGLE_API_KEY")
    if not google_key:
        logger.error("Nincs GOOGLE_API_KEY beállítva. E-mail feldolgozás megszakítva.")
        return

    sys_prompt = get_system_prompt()

    # Utasítás a strukturált JSON outputra
    json_instruction = """
TE FELADATOD:
Értékeld a beérkezett e-mailt a Tudásbázis és a Rendszer Prompt alapján.
A kimeneted KIZÁRÓLAG egyetlen valid JSON objektum legyen, minden további markdown formázás (pl. ```json) NÉLKÜL.
A válaszlevélt (email_reply) te fogalmazod meg, barátságos, segítőkész hangnemben. Ha releváns autókról vagy projektből van szó, mentsd el a Kanban adatokat is.

JSON STRUKTÚRA:
{
    "is_relevant": true|false,
    "email_reply": "A pontos válaszlevél szövege, HTML sortörésekkel (<br>)",
    "beszelgetes_naplobejegyzes": "A bejövő levél és a válaszod tömör összefoglalója 1 mondatban (későbbi kontextushoz).",
    "kanban_data": {
        "name": "Ügyfél neve (ha tudod, különben az e-mailből)",
        "email": "Ügyfél e-mailje",
        "phone": "Telefonszám (ha megadta, különben üres string)",
        "jarmu_tipusa": "autó / hajó / motor / stb. (opcionális)",
        "jarmu_modell": "pontos modell (opcionális)"
    },
    "meeting": {
        "title": "Találkozó címe (ha az email egyértelműen időpontot kér/foglal)",
        "date": "YYYY-MM-DD",
        "time": "HH:MM",
        "duration_minutes": 30
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
    "handover_reason": "Az átadás oka, ha emberi beavatkozás szükséges. Válaszd ezek közül: 'Összetett kérdés', 'Sürgős / triázs', 'Hiányzó info', 'Foglalási kivétel', 'Emberi döntés'. Ha az AI mindent meg tudott oldani, ez legyen null."
}
Ha nem kérnek egyértelműen időpontot, a "meeting" értéke legyen null. 
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
"""
    client = genai.Client(api_key=google_key)
    
    user_content = f"--- BEJÖVŐ E-MAIL ---\nFeladó: {from_name} <{from_email}>\nTárgy: {subject}\nÜzenet:\n{text_content}\n"
        
    triage_rules = db.get_triage_rules()
    if triage_rules:
        rules_text = "\n".join([f"- Szabály ID: {r['id']}, Helyzet: {r['situation']}, Prioritás: {r['priority']}" for r in triage_rules])
        sys_prompt += f"\n\n--- TRIÁZS SZABÁLYOK ---\nKérlek értékeld az e-mail tartalmát az alábbi szabályok alapján is. Ha egyezik egy 'Sürgős' szabállyal, KÖTELEZŐ felvenned az 'urgent' tag-et az alert_tags listába!\n{rules_text}\n"

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
        # Mivel a levél már Seen állapotba került, de hiba volt,
        # éles rendszerben vissza lehetne állítani Unseen-re.
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
        return

    is_relevant = data.get("is_relevant", False)
    email_reply = data.get("email_reply", "")
    kanban = data.get("kanban_data", {})
    beszelgetes = data.get("beszelgetes_naplobejegyzes", "")
    meeting = data.get("meeting")
    alert_tags = data.get("alert_tags", [])
    handover_reason = data.get("handover_reason")
    
    # Fallback emberi döntés
    if not handover_reason and email_reply and ("hív" in email_reply.lower() or "ember" in email_reply.lower() or "kollég" in email_reply.lower()):
        if "callback" in alert_tags or "urgent" in alert_tags:
            handover_reason = "Emberi döntés"
    
    log_szoveg = f"{beszelgetes}\n- Bejövő e-mail (Tárgy: {subject}): {text_content}"

    # Ha releváns lead, felvesszük a Kanbanba
    if is_relevant and kanban:
        name = kanban.get("name", from_name) or "Névtelen E-mail lead"
        details = {
            "name": name,
            "email": kanban.get("email", from_email) or from_email,
            "phone": kanban.get("phone", ""),
            "forras_csatorna": "E-mail",
        }
        if kanban.get("jarmu_tipusa"):
            details["jarmu_tipusa"] = kanban["jarmu_tipusa"]
        if kanban.get("jarmu_modell"):
            details["jarmu_modell"] = kanban["jarmu_modell"]
            
        if isinstance(alert_tags, list) and "urgent" in alert_tags:
            details["prioritas"] = "Sürgős"
            
        if beszelgetes:
            details["problem_description"] = beszelgetes
        else:
            details["problem_description"] = f"E-mail tárgy: {subject}"
        
        # Mentsük Kanban "uj" oszlopba
        cols = db.get_kanban_columns()
        first_col = cols[0]["id"] if cols else "uj"
        db.upsert_client(custom_data=details, additional_log=log_szoveg, status=first_col)
        logger.info(f"Ügyfél mentve/frissítve a Kanban táblában: {name}")
        
    if meeting:
        try:
            date_str = meeting.get("date")
            time_str = meeting.get("time")
            dur = meeting.get("duration_minutes", 30)
            title = meeting.get("title", f"Megbeszélés: {from_name}")
            
            if date_str and time_str:
                start_dt = datetime.fromisoformat(f"{date_str}T{time_str}:00")
                end_dt = start_dt + timedelta(minutes=dur)
                db.add_calendar_event(
                    title=title,
                    start_dt=start_dt.isoformat(),
                    end_dt=end_dt.isoformat(),
                    duration_minutes=dur,
                    attendee=from_name,
                    attendee_email=from_email
                )
                logger.info(f"Naptár esemény sikeresen létrehozva: {title} {start_dt}")
        except Exception as e:
            logger.error(f"Hiba a naptáresemény hozzáadásakor: {e}")

    modify_action = data.get("action_modify_meeting")
    if modify_action and modify_action.get("event_title_to_modify"):
        try:
            ev_title = modify_action["event_title_to_modify"]
            found = db.find_calendar_event_by_title(ev_title)
            if found:
                updates = {}
                if modify_action.get("new_date") or modify_action.get("new_time"):
                    old_dt = datetime.fromisoformat(found["start_dt"])
                    d = modify_action.get("new_date") or old_dt.strftime("%Y-%m-%d")
                    t = modify_action.get("new_time") or old_dt.strftime("%H:%M")
                    new_start = datetime.fromisoformat(f"{d}T{t}:00")
                    dur = found.get("duration_minutes", 30)
                    updates["start_dt"] = new_start.isoformat()
                    updates["end_dt"] = (new_start + timedelta(minutes=dur)).isoformat()
                if updates:
                    db.update_calendar_event(found["id"], **updates)
                    logger.info(f"Naptár esemény módosítva (e-mailből): {found['title']}")
        except Exception as e:
            logger.error(f"Hiba a naptáresemény módosításakor: {e}")

    delete_action = data.get("action_delete_meeting")
    if delete_action and delete_action.get("event_title_to_delete"):
        try:
            ev_title = delete_action["event_title_to_delete"]
            found = db.find_calendar_event_by_title(ev_title)
            if found:
                db.delete_calendar_event(found["id"])
                logger.info(f"Naptár esemény törölve (e-mailből): {found['title']}")
        except Exception as e:
            logger.error(f"Hiba a naptáresemény törlésekor: {e}")

    if email_reply:
        # Email "kiküldés" helyett piszkozat mentése a Jóváhagyó rendszerbe (Human-in-the-loop)

        sent_ok = False

        draft_payload = {
            "channel": "Email",

            "to_email": from_email,

            "to_name": from_name,

            "subject": f"Re: {subject}",

            "body": email_reply

        }

        draft_json = json.dumps(draft_payload)

        logger.info(f"E-mail piszkozat mentve jóváhagyásra: {from_email}")

        # Naplózás
        session_id = f"email_{from_email}"
        db.create_session(session_id=session_id, room_name="Email Thread", participant=from_name)
        
        db.add_email_log(
            to_name=from_name,
            to_email=from_email,
            subject=f"Re: {subject}",
            message=email_reply,
            status="pending",
            session_id=session_id
        )
        f_stage = "valaszolt"
        if meeting:
            f_stage = "foglalt"
            
        db.log_interaction(
            type="email",
            topic="Email AI válasz",
            summary=f"Bejövő e-mail {from_email} címről",
            result="Várakozik jóváhagyásra",
            tool_name="imap_worker_ai",
            session_id=session_id,
            funnel_stage=f_stage,
            alert_tags=alert_tags if isinstance(alert_tags, list) else [],
            handover_reason=handover_reason,
            approval_status="pending",
            ai_draft_response=draft_json
        )

        if isinstance(alert_tags, list) and "urgent" in alert_tags:
            email_to_send = None
            t_rules = db.get_triage_rules()
            for r in t_rules:
                if r.get("priority") == "Kiemelt" and r.get("escalation_email"):
                    email_to_send = r["escalation_email"]
                    break
            
            if email_to_send:
                asyncio.create_task(send_escalation_email_to_staff(
                    to_email=email_to_send,
                    patient_name=from_name,
                    patient_contact=from_email,
                    problem_description=f"E-mail tárgy: {subject}\n{text_content[:200]}...",
                    priority="Kiemelt"
                ))


def check_imap_sync():
    """Szinkron IMAP lekérdezés, amit egy threadpoolban futtatunk."""
    server = os.getenv("IMAP_SERVER")
    user = os.getenv("IMAP_USER")
    pwd = os.getenv("IMAP_PASS")

    if not server or not user or not pwd:
        # Ha nincsenek meg az adatok, csendben kilép
        return []

    emails_to_process = []
    
    try:
        # Port 993 az alapértelmezett IMAP SSL
        mail = imaplib.IMAP4_SSL(server, port=993)
        mail.login(user, pwd)
        mail.select("inbox")

        # Csak az olvasatlan (UNSEEN) leveleket kérdezzük le
        status, messages = mail.search(None, "UNSEEN")
        if status == "OK" and messages[0]:
            msg_ids = messages[0].split()
            for msg_id in msg_ids:
                res, msg_data = mail.fetch(msg_id, "(RFC822)")
                if res == "OK":
                    raw_email = msg_data[0][1]
                    msg = email.message_from_bytes(raw_email)

                    subject = decode_mime_words(msg.get("Subject", ""))
                    from_header = decode_mime_words(msg.get("From", ""))
                    
                    from_name = from_header
                    from_email = from_header
                    if "<" in from_header and ">" in from_header:
                        parts = from_header.split("<")
                        from_name = parts[0].strip() or "Névtelen E-mail"
                        from_email = parts[1].replace(">", "").strip()

                    text_content = ""
                    if msg.is_multipart():
                        for part in msg.walk():
                            content_type = part.get_content_type()
                            content_disposition = str(part.get("Content-Disposition"))
                            if content_type == "text/plain" and "attachment" not in content_disposition:
                                text_content = part.get_payload(decode=True).decode("utf-8", errors="replace")
                                break
                            elif content_type == "text/html" and "attachment" not in content_disposition:
                                # Fallback, ha nincs text/plain, de van html (később megtisztíthatnánk bs4-el, 
                                # de a Claude HTML-ből is megérti a szöveget)
                                text_content = part.get_payload(decode=True).decode("utf-8", errors="replace")
                    else:
                        text_content = msg.get_payload(decode=True).decode("utf-8", errors="replace")

                    emails_to_process.append((msg_id, from_email, from_name, subject, text_content))
        
        # A feldolgozott üzeneteket megjelöljük egyelőre olvasottként ("Seen") beolvasáskor,
        # hogy ha kilép a program a kiexpediálás előtt, ne olvassa be még egyszer
        for item in emails_to_process:
            mail.store(item[0], "+FLAGS", "\\Seen")

        mail.close()
        mail.logout()
    except Exception as e:
        logger.error(f"IMAP csatlakozási hiba: {e}")
        
    return emails_to_process

async def email_worker_loop():
    """Háttérfolyamat, ami percenként hívja az IMAP-et és feldolgozza azt."""
    server = os.getenv("IMAP_SERVER")
    if not server:
        logger.info("Nincs IMAP_SERVER beállítva. Az e-mail háttérfolyamat nem indul el.")
        return
        
    logger.info("E-mail figyelő worker elindítva.")
    while True:
        try:
            # Futtatjuk a blokkoló IMAP műveletet thread-ben
            emails = await asyncio.to_thread(check_imap_sync)
            
            for msg_id, from_email, from_name, subject, text_content in emails:
                await process_single_email(from_email, from_name, subject, text_content)
                
        except asyncio.CancelledError:
            logger.info("E-mail figyelő worker megszakítva.")
            break
        except Exception as e:
            logger.error(f"E-mail worker hiba: {e}")
            
        # Várakozás a következő lekérdezésig (pl. 60 másodperc)
        await asyncio.sleep(60)

async def send_escalation_email_to_staff(to_email: str, patient_name: str, patient_contact: str, problem_description: str, priority: str = "Sürgős") -> bool:
    """Eszkalációs e-mail küldése az orvosnak/személyzetnek sürgős eseteknél."""
    brevo_key = os.getenv("BREVO_API_KEY", "")
    api_key = brevo_key
    if brevo_key and not brevo_key.startswith("xkeysib-"):
        try:
            import base64 as b64module
            decoded = b64module.b64decode(brevo_key).decode()
            parsed = json.loads(decoded)
            api_key = parsed.get("api_key", brevo_key)
        except Exception:
            pass

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
        <p style="color: #666; font-size: 12px; margin-top: 20px;">Ez egy automatikusan generált üzenet a ThinkAI Voice Agent rendszerből.</p>
    </div>
    """

    try:
        async with httpx.AsyncClient() as http_client:
            resp = await http_client.post(
                "https://api.brevo.com/v3/smtp/email",
                headers={"api-key": api_key, "Content-Type": "application/json"},
                json={
                    "sender": {"name": "ThinkAI Riasztás", "email": "bege@thinkai.hu"},
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
