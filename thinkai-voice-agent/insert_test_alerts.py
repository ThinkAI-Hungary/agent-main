import os
import json
import uuid
import database as db

# --- 1. Új Sürgős Teszt ---
c_urgent = {
    "from_email": "surgos.teszt2@example.hu",
    "from_name": "Sürgős Teszt 2",
    "subject": "Nagyon Erős fájdalom - Új SÜRGŐS TESZT!",
    "body": "Segítség, elviselhetetlenül fáj a fogam! Mit tegyek?",
    "f_stage": "valaszolt",
    "alert_tags": ["urgent"],
    "handover": "Sürgős / triázs"
}

details_urgent = {
    "name": c_urgent["from_name"],
    "email": c_urgent["from_email"],
    "phone": "+36301112233",
    "forras_csatorna": "E-mail",
    "prioritas": "Sürgős",
    "problem_description": "Teszt 2: Erős fogfájás"
}

cols = db.get_kanban_columns()
first_col = cols[0]["id"] if cols else "uj"
client_id_urgent = db.upsert_client(custom_data=details_urgent, additional_log=f"Teszt email: {c_urgent['subject']}", status=first_col)

# Interakció (Piszkozat)
session_id_urgent = f"email_{c_urgent['from_email']}_{str(uuid.uuid4())[:8]}"
db.create_session(session_id=session_id_urgent, room_name="Email Chat", participant=c_urgent['from_name'])
draft_payload_urgent = {
    "channel": "Email", "to_email": c_urgent["from_email"], "to_name": c_urgent["from_name"],
    "subject": f"Re: {c_urgent['subject']}", "body": "Azonnal hívjon minket!"
}
db.log_interaction(
    type="email", topic=c_urgent["subject"], summary=c_urgent["body"][:100],
    result="Piszkozat mentve", tool_name="imap_worker_ai", session_id=session_id_urgent,
    funnel_stage=c_urgent["f_stage"], alert_tags=c_urgent["alert_tags"],
    handover_reason=c_urgent["handover"], approval_status="pending", ai_draft_response=json.dumps(draft_payload_urgent)
)

print(f"Sikeresen beillesztve 1 db ÚJ SÜRGŐS teszt! Kanban ID: {client_id_urgent}")


# --- 2. Lemondás Teszt ---
c_cancel = {
    "from_email": "lemondas.teszt@example.hu",
    "from_name": "Lemondás Teszt",
    "subject": "Időpont lemondása",
    "body": "Sajnos nem tudok elmenni a holnapi időpontra.",
    "f_stage": "valaszolt",
    "alert_tags": [],
    "handover": None
}

details_cancel = {
    "name": c_cancel["from_name"],
    "email": c_cancel["from_email"],
    "phone": "+36309998877",
    "forras_csatorna": "E-mail",
    "problem_description": "Teszt: Lemondás"
}

# A lemondásnál a status-t kell 'lemondott'-ra állítani!
client_id_cancel = db.upsert_client(custom_data=details_cancel, additional_log=f"Teszt email: {c_cancel['subject']}", status="lemondott")

# Interakció (Piszkozat)
session_id_cancel = f"email_{c_cancel['from_email']}_{str(uuid.uuid4())[:8]}"
db.create_session(session_id=session_id_cancel, room_name="Email Chat", participant=c_cancel['from_name'])
draft_payload_cancel = {
    "channel": "Email", "to_email": c_cancel["from_email"], "to_name": c_cancel["from_name"],
    "subject": f"Re: {c_cancel['subject']}", "body": "Rendben, töröltük az időpontot."
}
db.log_interaction(
    type="email", topic=c_cancel["subject"], summary=c_cancel["body"][:100],
    result="Piszkozat mentve", tool_name="imap_worker_ai", session_id=session_id_cancel,
    funnel_stage=c_cancel["f_stage"], alert_tags=c_cancel["alert_tags"],
    handover_reason=c_cancel["handover"], approval_status="pending", ai_draft_response=json.dumps(draft_payload_cancel)
)

print(f"Sikeresen beillesztve 1 db LEMONDÁS teszt! Kanban ID: {client_id_cancel}")
