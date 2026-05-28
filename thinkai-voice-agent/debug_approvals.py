import database as db
import json

approvals = db.get_approvals(status='pending')
clients = db.get_clients()

print(f"Pending approvals: {len(approvals)}")
print(f"Clients: {len(clients)}")
print()

for a in approvals:
    draft = {}
    try:
        draft = json.loads(a.get('ai_draft_response', '{}'))
    except:
        pass
    sid = draft.get('sender_id', '')
    to_name = draft.get('to_name', '')
    channel = draft.get('channel', '')
    session_id = a.get('session_id', '')
    print(f"Approval ID:{a['id']} sender_id:'{sid}' (type:{type(sid).__name__}) to_name:'{to_name}' channel:{channel} session:{session_id}")

print()
for c in clients:
    cd = c.get('custom_data', {}) or {}
    if isinstance(cd, str):
        try: cd = json.loads(cd)
        except: cd = {}
    mid = cd.get('messenger_id', '')
    print(f"Client ID:{c['id']} Name:{c['name']} messenger_id:'{mid}' (type:{type(mid).__name__})")
