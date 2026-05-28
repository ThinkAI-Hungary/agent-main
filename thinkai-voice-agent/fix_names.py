"""Fix client name and approval to_name for Instagram users."""
import os
import json
import requests
from dotenv import load_dotenv
load_dotenv(".env")
import database as db

token = os.getenv("META_PAGE_ACCESS_TOKEN")
if not token:
    print("No token!")
    exit(1)

# 1. Fix client names
clients = db.get_clients()
for c in clients:
    if c.get("name") != "Ismeretlen":
        continue
    cd = c.get("custom_data", {}) or {}
    if isinstance(cd, str):
        try: cd = json.loads(cd)
        except: cd = {}
    mid = cd.get("messenger_id", "")
    if not mid:
        continue
    
    url = f"https://graph.facebook.com/v25.0/{mid}?fields=name,profile_pic&access_token={token}"
    resp = requests.get(url, timeout=5)
    if resp.status_code == 200:
        data = resp.json()
        new_name = data.get("name")
        if new_name:
            cd["name"] = new_name
            db.edit_client_details(c["id"], cd)
            print(f"Client {c['id']}: Ismeretlen -> {new_name}")
    else:
        print(f"Client {c['id']}: API error {resp.status_code}")

# 2. Fix approval to_name fields
approvals = db.get_approvals(status='pending')
# Reload clients with updated names
clients = db.get_clients()
client_by_mid = {}
for c in clients:
    cd = c.get("custom_data", {}) or {}
    if isinstance(cd, str):
        try: cd = json.loads(cd)
        except: cd = {}
    mid = cd.get("messenger_id", "")
    if mid:
        name = cd.get("name") or c.get("name", "")
        if name and name != "Ismeretlen":
            client_by_mid[mid] = name

print(f"\nClient name map: {client_by_mid}")

for a in approvals:
    draft_raw = a.get("ai_draft_response", "{}")
    try:
        draft = json.loads(draft_raw)
    except:
        continue
    
    sender_id = draft.get("sender_id", "")
    to_name = draft.get("to_name", "")
    
    # If to_name is a numeric ID, try to resolve it
    if to_name and to_name.isdigit() and sender_id in client_by_mid:
        draft["to_name"] = client_by_mid[sender_id]
        new_draft = json.dumps(draft, ensure_ascii=False)
        db.update_approval_status(a["id"], a.get("approval_status", "pending"), new_draft)
        print(f"Approval {a['id']}: {to_name} -> {client_by_mid[sender_id]}")

print("\nDone!")
