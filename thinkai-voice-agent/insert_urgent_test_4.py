import os
import json
import uuid
import database as db

c_urgent = {
    "from_email": "surgos.teszt4@example.hu",
    "from_name": "Sürgős Teszt 4 (Baleset)",
    "subject": "Sürgős: Kitört a fogam!",
    "body": "Jó napot! Elestem biciklivel és letört az egyik első fogam fele. Rettenetesen fáj, tudnának ma fogadni?",
    "f_stage": "valaszolt",
    "alert_tags": ["urgent"],
    "handover": "Sürgős / triázs"
}

details_urgent = {
    "name": c_urgent["from_name"],
    "email": c_urgent["from_email"],
    "phone": "+36307778899",
    "forras_csatorna": "E-mail",
    "prioritas": "Sürgős",
    "problem_description": "Teszt 4: Baleset miatt letört fog"
}

cols = db.get_kanban_columns()
first_col = cols[0]["id"] if cols else "uj"
client_id = db.upsert_client(custom_data=details_urgent, additional_log=f"Teszt email: {c_urgent['subject']}", status=first_col)

# Interakció (Piszkozat)
session_id = f"email_{c_urgent['from_email']}_{str(uuid.uuid4())[:8]}"
db.create_session(session_id=session_id, room_name="Email Chat", participant=c_urgent['from_name'])
draft_payload = {
    "channel": "Email", "to_email": c_urgent["from_email"], "to_name": c_urgent["from_name"],
    "subject": f"Re: {c_urgent['subject']}", "body": "Kérem, azonnal induljon el a rendelőbe, az ilyen baleseti sérüléseket soron kívül ellátjuk!"
}
db.log_interaction(
    type="email", topic=c_urgent["subject"], summary=c_urgent["body"][:100],
    result="Piszkozat mentve", tool_name="imap_worker_ai", session_id=session_id,
    funnel_stage=c_urgent["f_stage"], alert_tags=c_urgent["alert_tags"],
    handover_reason=c_urgent["handover"], approval_status="pending", ai_draft_response=json.dumps(draft_payload)
)

print(f"Sikeresen beillesztve 1 db ÚJ SÜRGŐS teszt 4! Kanban ID: {client_id}")
