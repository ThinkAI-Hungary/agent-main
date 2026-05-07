import os
import json
import uuid
import database as db

# --- Új Lemondás Teszt 3 ---
c_cancel = {
    "from_email": "lemondas.teszt3@example.hu",
    "from_name": "Lemondás Teszt 3",
    "subject": "Időpont törlése váratlan utazás miatt",
    "body": "Tisztelt Rendelő! Sajnos váratlanul el kell utaznom, így a holnapi időpontomat szeretném lemondani. Elnézést kérek a kellemetlenségért.",
    "f_stage": "valaszolt",
    "alert_tags": [],
    "handover": None
}

details_cancel = {
    "name": c_cancel["from_name"],
    "email": c_cancel["from_email"],
    "phone": "+36301239876",
    "forras_csatorna": "E-mail",
    "problem_description": "Teszt 3: Lemondás váratlan utazás miatt"
}

# A lemondásnál a status-t kell 'lemondott'-ra állítani!
client_id_cancel = db.upsert_client(custom_data=details_cancel, additional_log=f"Teszt email: {c_cancel['subject']}", status="lemondott")

# Interakció (Piszkozat)
session_id_cancel = f"email_{c_cancel['from_email']}_{str(uuid.uuid4())[:8]}"
db.create_session(session_id=session_id_cancel, room_name="Email Chat", participant=c_cancel['from_name'])
draft_payload_cancel = {
    "channel": "Email", "to_email": c_cancel["from_email"], "to_name": c_cancel["from_name"],
    "subject": f"Re: {c_cancel['subject']}", "body": "Köszönjük az értesítést. Az időpontját sikeresen töröltük a rendszerből."
}
db.log_interaction(
    type="email", topic=c_cancel["subject"], summary=c_cancel["body"][:100],
    result="Piszkozat mentve", tool_name="imap_worker_ai", session_id=session_id_cancel,
    funnel_stage=c_cancel["f_stage"], alert_tags=c_cancel["alert_tags"],
    handover_reason=c_cancel["handover"], approval_status="pending", ai_draft_response=json.dumps(draft_payload_cancel)
)

print(f"Sikeresen beillesztve 1 db ÚJ LEMONDÁS teszt 3! Kanban ID: {client_id_cancel}")
