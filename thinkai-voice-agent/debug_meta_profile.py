"""Check what name data is stored for the Messenger client 26629190113363954."""
import json
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).resolve().parent / ".env")

import database as db
db.init_db()

sender_id = "26629190113363954"

# Check client record
client = db.find_client_by_contact(messenger_id=sender_id)
if client:
    print("=== Client record ===")
    print(f"  id: {client.get('id')}")
    print(f"  name (top-level): {client.get('name')}")
    print(f"  email: {client.get('email')}")
    print(f"  status: {client.get('status')}")
    cd = client.get("custom_data", {})
    if isinstance(cd, str):
        cd = json.loads(cd)
    print(f"\n  custom_data keys: {list(cd.keys())}")
    print(f"  custom_data.name: {cd.get('name')}")
    print(f"  custom_data.nev: {cd.get('nev')}")
    print(f"  custom_data.messenger_id: {cd.get('messenger_id')}")
    print(f"  custom_data.forras_csatorna: {cd.get('forras_csatorna')}")
else:
    print(f"No client found with messenger_id={sender_id}")

# Check interactions/approvals
print("\n=== Recent interactions ===")
result = db.supabase.table("interactions").select("id, session_id, ai_draft_response, approval_status, created_at").eq("session_id", f"messenger_{sender_id}").order("created_at", desc=True).limit(3).execute()
for r in result.data:
    draft = r.get("ai_draft_response", "")
    if draft:
        try:
            d = json.loads(draft)
            print(f"  interaction_id={r['id']}, to_name='{d.get('to_name', '?')}', status={r.get('approval_status')}, created={r.get('created_at', '')[:19]}")
        except:
            print(f"  interaction_id={r['id']}, draft parse error, status={r.get('approval_status')}")
    else:
        print(f"  interaction_id={r['id']}, no draft, status={r.get('approval_status')}")
