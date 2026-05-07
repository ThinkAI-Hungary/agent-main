import os
import json
import uuid
import database as db

# 1 Urgent Test Case
c = {
    "from_email": "surgos.teszt@example.hu",
    "from_name": "Sürgős Teszt",
    "subject": "Nagyon Erős fogfájás - SÜRGŐS TESZT!",
    "body": "Kedves Sürgős Teszt!\n\nSajnálattal halljuk, hogy fájdalmai vannak! Az ilyen eseteket soron kívül kezeljük. Kérem, azonnal hívja a rendelőnket a +36 30 123 4567-es számon, hogy a mai napon fogadhassuk!\n\nJobbulást kívánunk,\nBégé Design Kft.",
    "f_stage": "valaszolt",
    "alert_tags": ["urgent"],
    "handover": "Sürgős / triázs"
}

# 1. Mentsük a Kanbanba is, mint ahogy az éles rendszer csinálja (ez adja az alertet)
details = {
    "name": c["from_name"],
    "email": c["from_email"],
    "phone": "",
    "forras_csatorna": "E-mail",
    "prioritas": "Sürgős",
    "problem_description": "Teszt: Erős fogfájás"
}

cols = db.get_kanban_columns()
first_col = cols[0]["id"] if cols else "uj"
client_id = db.upsert_client(custom_data=details, additional_log=f"Teszt email: {c['subject']}", status=first_col)

# 2. Mentsük az interakciót is (Piszkozat / Jóváhagyás)
session_id = f"email_{c['from_email']}_{str(uuid.uuid4())[:8]}"
db.create_session(session_id=session_id, room_name="Email Chat", participant=c['from_name'])

draft_payload = {
    "channel": "Email",
    "to_email": c["from_email"],
    "to_name": c["from_name"],
    "subject": f"Re: {c['subject']}",
    "body": c["body"]
}
draft_json = json.dumps(draft_payload)

db.log_interaction(
    type="email",
    topic=c["subject"],
    summary=f"Bejövő e-mail {c['from_email']} címről",
    result="Piszkozat mentve",
    tool_name="imap_worker_ai",
    session_id=session_id,
    funnel_stage=c["f_stage"],
    alert_tags=c["alert_tags"],
    handover_reason=c["handover"],
    approval_status="pending",
    ai_draft_response=draft_json
)

print(f"Sikeresen beillesztve 1 db sürgős teszt e-mail! Kanban ID: {client_id}")
