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
        logger.error("Nincs GOOGLE_API_KEY beÃ¡llÃ­tva. E-mail feldolgozÃ¡s megszakÃ­tva.")
        return

    sys_prompt = get_system_prompt()

    # UtasÃ­tÃ¡s a strukturÃ¡lt JSON outputra
    json_instruction = """
TE FELADATOD:
ÃrtÃ©keld a beÃ©rkezett e-mailt a TudÃ¡sbÃ¡zis Ã©s a Rendszer Prompt alapjÃ¡n.
A kimeneted KIZÃRÃLAG egyetlen valid JSON objektum legyen, minden tovÃ¡bbi markdown formÃ¡zÃ¡s (pl. ```json) NÃLKÃL.
A vÃ¡laszlevÃ©lt (email_reply) te fogalmazod meg, barÃ¡tsÃ¡gos, segÃ­tÅkÃ©sz hangnemben. Ha relevÃ¡ns autÃ³krÃ³l vagy projektbÅl van szÃ³, mentsd el a Kanban adatokat is.

JSON STRUKTÃRA:
{
    "is_relevant": true|false,
    "email_reply": "A pontos vÃ¡laszlevÃ©l szÃ¶vege, HTML sortÃ¶rÃ©sekkel (<br>)",
    "beszelgetes_naplobejegyzes": "A bejÃ¶vÅ levÃ©l Ã©s a vÃ¡laszod tÃ¶mÃ¶r Ã¶sszefoglalÃ³ja 1 mondatban (kÃ©sÅbbi kontextushoz).",
    "kanban_data": {
        "name": "ÃgyfÃ©l neve (ha tudod, kÃ¼lÃ¶nben az e-mailbÅl)",
        "email": "ÃgyfÃ©l e-mailje",
        "phone": "TelefonszÃ¡m (ha megadta, kÃ¼lÃ¶nben Ã¼res string)",
        "jarmu_tipusa": "autÃ³ / hajÃ³ / motor / stb. (opcionÃ¡lis)",
        "jarmu_modell": "pontos modell (opcionÃ¡lis)"
    },
    "meeting": {
        "title": "TalÃ¡lkozÃ³ cÃ­me (ha az email egyÃ©rtelmÅ±en idÅpontot kÃ©r/foglal)",
        "date": "YYYY-MM-DD",
        "time": "HH:MM",
        "duration_minutes": 30
    },
    "action_modify_meeting": {
        "event_title_to_modify": "A mÃ³dosÃ­tandÃ³ esemÃ©ny cÃ­me vagy rÃ©sze",
        "new_date": "YYYY-MM-DD",
        "new_time": "HH:MM"
    },
    "action_delete_meeting": {
        "event_title_to_delete": "A tÃ¶rlendÅ esemÃ©ny cÃ­me vagy rÃ©sze"
    },
    "alert_tags": ["urgent", "complaint", "callback", "recurring"], // VÃ¡laszd ki, ha relevÃ¡ns, kÃ¼lÃ¶nben Ã¼res lista []
    "handover_reason": "Az Ã¡tadÃ¡s oka, ha emberi beavatkozÃ¡s szÃ¼ksÃ©ges. VÃ¡laszd ezek kÃ¶zÃ¼l: 'Ãsszetett kÃ©rdÃ©s', 'SÃ¼rgÅs / triÃ¡zs', 'HiÃ¡nyzÃ³ info', 'FoglalÃ¡si kivÃ©tel', 'Emberi dÃ¶ntÃ©s'. Ha az AI mindent meg tudott oldani, ez legyen null."
}
Ha nem kÃ©rnek egyÃ©rtelmÅ±en idÅpontot, a "meeting" Ã©rtÃ©ke legyen null. 
FIGYELEM: Ha az eset SÃ¼rgÅs vagy Kiemelt prioritÃ¡sÃº, VAGY a kÃ©rÃ©s szerepel a KivÃ©telek (Exceptions) listÃ¡jÃ¡ban, a "meeting" Ã©rtÃ©ke KÃTELEZÅEN null kell legyen (SZIGORÃAN TILOS idÅpontot foglalni!), Ã©s a "handover_reason" legyen 'SÃ¼rgÅs / triÃ¡zs' vagy 'FoglalÃ¡si kivÃ©tel'.
Ebben az esetben a vÃ¡laszlevÃ©lben se Ã­gÃ©rj egyeztetÃ©st konkrÃ©t idÅpontokrÃ³l, kizÃ¡rÃ³lag azt jelezd, hogy az Ã¼gyÃ©t azonnal tovÃ¡bbÃ­tottad egy Ã©lÅ kollÃ©gÃ¡nak/munkatÃ¡rsnak!

KIVÃTEL A TILTÃS ALÃL (FONTOS!):
Ha a felhasznÃ¡lÃ³ egyÃ©rtelmÅ±en idÅpontot kÃ©r, de NEM adja meg, hogy milyen panasza/kezelÃ©se van, AKKOR IS FOGLALD LE az idÅpontot (a "meeting" objektum kitÃ¶ltÃ©sÃ©vel, pl. "KonzultÃ¡ciÃ³" vagy "ÃltalÃ¡nos vizsgÃ¡lat" cÃ­mmel)! Ne tagadd meg a foglalÃ¡st Ã©s ne kÃ©rj vissza pontosÃ­tÃ¡st csak azÃ©rt, mert nem tudod a kezelÃ©s tÃ­pusÃ¡t. Csak akkor tilos a foglalÃ¡s, ha a megadott panasz egyÃ©rtelmÅ±en SÃ¼rgÅs/Kiemelt, vagy egyÃ©rtelmÅ±en szerepel a KivÃ©telek kÃ¶zÃ¶tt. Ha nincs panasz megadva, feltÃ©telezd, hogy NormÃ¡l eset!
A lehetsÃ©ges alert_tags Ã©rtÃ©kek:
- "urgent": ha nagyon sÃ¼rgÅs az Ã¼gy
- "exception": ha a kÃ©rÃ©s szerepel a KivÃ©telek listÃ¡jÃ¡ban
- "complaint": ha a levÃ©l panaszt, elÃ©gedetlensÃ©get tartalmaz
- "callback": ha telefonos visszahÃ­vÃ¡st kÃ©rnek
- "recurring": ha egy gyakori ismÃ©tlÅdÅ hibÃ¡t/kÃ©rdÃ©st vetnek fel.
"""
    client = genai.Client(api_key=google_key)
    
    user_content = f"--- BEJÃVÅ E-MAIL ---\nFeladÃ³: {from_name} <{from_email}>\nTÃ¡rgy: {subject}\nÃzenet:\n{text_content}\n"
        
    triage_rules = db.get_triage_rules()
    if triage_rules:
        rules_text = "\n".join([f"- SzabÃ¡ly ID: {r['id']}, Helyzet: {r['situation']}, PrioritÃ¡s: {r['priority']}" for r in triage_rules])
        sys_prompt += f"\n\n--- TRIÃZS SZABÃLYOK ---\nKÃ©rlek Ã©rtÃ©keld az e-mail tartalmÃ¡t az alÃ¡bbi szabÃ¡lyok alapjÃ¡n is. Ha egyezik egy 'SÃ¼rgÅs' szabÃ¡llyal, KÃTELEZÅ felvenned az 'urgent' tag-et az alert_tags listÃ¡ba!\n{rules_text}\n"

    sys_prompt += f"\n\n--- JSON UTASÃTÃS ---\n{json_instruction}"

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
        # Mivel a levÃ©l mÃ¡r Seen Ã¡llapotba kerÃ¼lt, de hiba volt,
        # Ã©les rendszerben vissza lehetne Ã¡llÃ­tani Unseen-re.
        return

    # EltÃ¡volÃ­tjuk a markdown json blockokat ha esetleg mÃ©gis beletennÃ©
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
        logger.error(f"HibÃ¡s JSON vÃ¡lasz az AI-tÃ³l: {e}\nNyers AI vÃ¡lasz:\n{ai_text}")
        return

    is_relevant = data.get("is_relevant", False)
    email_reply = data.get("email_reply", "")
    kanban = data.get("kanban_data", {})
    beszelgetes = data.get("beszelgetes_naplobejegyzes", "")
    meeting = data.get("meeting")
    alert_tags = data.get("alert_tags", [])
    handover_reason = data.get("handover_reason")
    
    # Fallback emberi dÃ¶ntÃ©s
    if not handover_reason and email_reply and ("hÃ­v" in email_reply.lower() or "ember" in email_reply.lower() or "kollÃ©g" in email_reply.lower()):
        if "callback" in alert_tags or "urgent" in alert_tags:
            handover_reason = "Emberi dÃ¶ntÃ©s"
    
    log_szoveg = f"{beszelgetes}\n- BejÃ¶vÅ e-mail (TÃ¡rgy: {subject}): {text_content}"

    # Ha relevÃ¡ns lead, felvesszÃ¼k a Kanbanba
    if is_relevant and kanban:
        name = kanban.get("name", from_name) or "NÃ©vtelen E-mail lead"
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
            details["prioritas"] = "SÃ¼rgÅs"
            
        if beszelgetes:
            details["problem_description"] = beszelgetes
        else:
            details["problem_description"] = f"E-mail tÃ¡rgy: {subject}"
        
        # MentsÃ¼k Kanban "uj" oszlopba
        cols = db.get_kanban_columns()
        first_col = cols[0]["id"] if cols else "uj"
        db.upsert_client(custom_data=details, additional_log=log_szoveg, status=first_col)
        logger.info(f"ÃgyfÃ©l mentve/frissÃ­tve a Kanban tÃ¡blÃ¡ban: {name}")
        
    if meeting:
        try:
            date_str = meeting.get("date")
            time_str = meeting.get("time")
            dur = meeting.get("duration_minutes", 30)
            title = meeting.get("title", f"MegbeszÃ©lÃ©s: {from_name}")
            
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
                logger.info(f"NaptÃ¡r esemÃ©ny sikeresen lÃ©trehozva: {title} {start_dt}")
        except Exception as e:
            logger.error(f"Hiba a naptÃ¡resemÃ©ny hozzÃ¡adÃ¡sakor: {e}")

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
                    logger.info(f"NaptÃ¡r esemÃ©ny mÃ³dosÃ­tva (e-mailbÅl): {found['title']}")
        except Exception as e:
            logger.error(f"Hiba a naptÃ¡resemÃ©ny mÃ³dosÃ­tÃ¡sakor: {e}")

    delete_action = data.get("action_delete_meeting")
    if delete_action and delete_action.get("event_title_to_delete"):
        try:
            ev_title = delete_action["event_title_to_delete"]
            found = db.find_calendar_event_by_title(ev_title)
            if found:
                db.delete_calendar_event(found["id"])
                logger.info(f"NaptÃ¡r esemÃ©ny tÃ¶rÃ¶lve (e-mailbÅl): {found['title']}")
        except Exception as e:
            logger.error(f"Hiba a naptÃ¡resemÃ©ny tÃ¶rlÃ©sekor: {e}")

    if email_reply:
        # Email "kikÃ¼ldÃ©s" helyett piszkozat mentÃ©se a JÃ³vÃ¡hagyÃ³ rendszerbe (Human-in-the-loop)

        sent_ok = False

        draft_payload = {
            "channel": "Email",

            "to_email": from_email,

            "to_name": from_name,

            "subject": f"Re: {subject}",

            "body": email_reply

        }

        draft_json = json.dumps(draft_payload)

        logger.info(f"E-mail piszkozat mentve jÃ³vÃ¡hagyÃ¡sra: {from_email}")

        # NaplÃ³zÃ¡s
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
            topic="Email AI vÃ¡lasz",
            summary=f"BejÃ¶vÅ e-mail {from_email} cÃ­mrÅl",
            result="VÃ¡rakozik jÃ³vÃ¡hagyÃ¡sra",
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
                    problem_description=f"E-mail tÃ¡rgy: {subject}\n{text_content[:200]}...",
                    priority="Kiemelt"
                ))


def check_imap_sync():
    """Szinkron IMAP lekÃ©rdezÃ©s, amit egy threadpoolban futtatunk."""
    server = os.getenv("IMAP_SERVER")
    user = os.getenv("IMAP_USER")
    pwd = os.getenv("IMAP_PASS")

    if not server or not user or not pwd:
        # Ha nincsenek meg az adatok, csendben kilÃ©p
        return []

    emails_to_process = []
    
    try:
        # Port 993 az alapÃ©rtelmezett IMAP SSL
        mail = imaplib.IMAP4_SSL(server, port=993)
        mail.login(user, pwd)
        mail.select("inbox")

        # Csak az olvasatlan (UNSEEN) leveleket kÃ©rdezzÃ¼k le
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
                        from_name = parts[0].strip() or "NÃ©vtelen E-mail"
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
                                # Fallback, ha nincs text/plain, de van html (kÃ©sÅbb megtisztÃ­thatnÃ¡nk bs4-el, 
                                # de a Claude HTML-bÅl is megÃ©rti a szÃ¶veget)
                                text_content = part.get_payload(decode=True).decode("utf-8", errors="replace")
                    else:
                        text_content = msg.get_payload(decode=True).decode("utf-8", errors="replace")

                    emails_to_process.append((msg_id, from_email, from_name, subject, text_content))
        
        # A feldolgozott Ã¼zeneteket megjelÃ¶ljÃ¼k egyelÅre olvasottkÃ©nt ("Seen") beolvasÃ¡skor,
        # hogy ha kilÃ©p a program a kiexpediÃ¡lÃ¡s elÅtt, ne olvassa be mÃ©g egyszer
        for item in emails_to_process:
            mail.store(item[0], "+FLAGS", "\\Seen")

        mail.close()
        mail.logout()
    except Exception as e:
        logger.error(f"IMAP csatlakozÃ¡si hiba: {e}")
        
    return emails_to_process

async def email_worker_loop():
    """HÃ¡ttÃ©rfolyamat, ami percenkÃ©nt hÃ­vja az IMAP-et Ã©s feldolgozza azt."""
    server = os.getenv("IMAP_SERVER")
    if not server:
        logger.info("Nincs IMAP_SERVER beÃ¡llÃ­tva. Az e-mail hÃ¡ttÃ©rfolyamat nem indul el.")
        return
        
    logger.info("E-mail figyelÅ worker elindÃ­tva.")
    while True:
        try:
            # Futtatjuk a blokkolÃ³ IMAP mÅ±veletet thread-ben
            emails = await asyncio.to_thread(check_imap_sync)
            
            for msg_id, from_email, from_name, subject, text_content in emails:
                await process_single_email(from_email, from_name, subject, text_content)
                
        except asyncio.CancelledError:
            logger.info("E-mail figyelÅ worker megszakÃ­tva.")
            break
        except Exception as e:
            logger.error(f"E-mail worker hiba: {e}")
            
        # VÃ¡rakozÃ¡s a kÃ¶vetkezÅ lekÃ©rdezÃ©sig (pl. 60 mÃ¡sodperc)
        await asyncio.sleep(60)

async def send_escalation_email_to_staff(to_email: str, patient_name: str, patient_contact: str, problem_description: str, priority: str = "SÃ¼rgÅs") -> bool:
    """EszkalÃ¡ciÃ³s e-mail kÃ¼ldÃ©se az orvosnak/szemÃ©lyzetnek sÃ¼rgÅs eseteknÃ©l."""
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
        logger.error("Nincs beÃ¡llÃ­tva BREVO_API_KEY az eszkalÃ¡ciÃ³s e-mailhez.")
        return False

    html_content = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #ef4444; border-radius: 8px; padding: 20px;">
        <h2 style="color: #ef4444; margin-top: 0;">Rendszer RiasztÃ¡s: {priority} eset</h2>
        <p>Egy Ãºj {priority.lower()} prioritÃ¡sÃº eset Ã©rkezett az AI rendszerbe.</p>
        <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold; width: 120px;">PÃ¡ciens neve:</td>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee;">{patient_name}</td>
            </tr>
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold;">ElÃ©rhetÅsÃ©g:</td>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee;">{patient_contact}</td>
            </tr>
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold;">ProblÃ©ma leÃ­rÃ¡sa:</td>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee;">{problem_description}</td>
            </tr>
        </table>
        <p style="color: #666; font-size: 12px; margin-top: 20px;">Ez egy automatikusan generÃ¡lt Ã¼zenet a ThinkAI Voice Agent rendszerbÅl.</p>
    </div>
    """

    try:
        async with httpx.AsyncClient() as http_client:
            resp = await http_client.post(
                "https://api.brevo.com/v3/smtp/email",
                headers={"api-key": api_key, "Content-Type": "application/json"},
                json={
                    "sender": {"name": "ThinkAI RiasztÃ¡s", "email": "bege@thinkai.hu"},
                    "to": [{"email": to_email}],
                    "subject": f"[{priority}] RiasztÃ¡s: {patient_name}",
                    "htmlContent": html_content,
                },
                timeout=20,
            )
            resp.raise_for_status()
            logger.info(f"EszkalÃ¡ciÃ³s e-mail elkÃ¼ldve a kÃ¶vetkezÅ cÃ­mre: {to_email}")
            return True
    except Exception as e:
        logger.error(f"Hiba az eszkalÃ¡ciÃ³s e-mail kÃ¼ldÃ©sekor: {e}")
        return False


async def send_reminder_email(to_email: str, subject: str, html_content: str) -> bool:
    import os, json
    brevo_key = os.getenv('BREVO_API_KEY', '')
    api_key = brevo_key
    if brevo_key and not brevo_key.startswith('xkeysib-'):
        try:
            import base64 as b64module
            decoded = b64module.b64decode(brevo_key).decode()
            parsed = json.loads(decoded)
            api_key = parsed.get('api_key', brevo_key)
        except Exception:
            pass
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
                    'sender': {'name': 'Időpont Emlékeztető', 'email': 'bege@thinkai.hu'},
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

async def reminder_worker_loop():
    logger.info('Időpont emlékeztető worker elindítva.')
    while True:
        try:
            import database as db
            import datetime
            import asyncio
            settings = db.get_reminder_settings()
            if settings and settings.get('reminder_enabled'):
                hours = settings.get('reminder_hours', 24)
                template = settings.get('reminder_template', '')
                events = db.get_upcoming_events_for_reminders(hours_offset=hours)
                for ev in events:
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
                    clients = db.search_clients_by_name_or_email(ev.get('attendee_email'))
                    if clients:
                        client = clients[0]
                        clinic_id = client.get('custom_data', {}).get('clinic_id')
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
                        
        except Exception as e:
            logger.error(f'Hiba az emlékeztető workerben: {e}')
        
        import asyncio
        await asyncio.sleep(15 * 60) # 15 perc
