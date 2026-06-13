"""Quick debug script to check what data the MemberDashboard sees."""
import database as db
import json

db.init_db()

# 1. Clients with felelos
clients = db.get_clients()
print(f"=== Total clients: {len(clients)} ===")
felelos_clients = []
for c in clients:
    cd = c.get("custom_data") or {}
    if isinstance(cd, str):
        try: cd = json.loads(cd)
        except: cd = {}
    felelos = cd.get("felelos", "")
    if felelos:
        felelos_clients.append(c)
        name = cd.get("nev") or cd.get("name") or c.get("name", "")
        email = cd.get("email") or c.get("email", "")
        print(f"  Client #{c['id']}: name='{name}', felelos='{felelos}', email='{email}'")

print(f"\n=== Clients with felelos: {len(felelos_clients)} ===")

# 2. Calendar events
cals = db.get_calendar_events()
print(f"\n=== Calendar events: {len(cals)} ===")
for ev in cals[:5]:
    print(f"  Event #{ev.get('id')}: title='{ev.get('title')}', attendee='{ev.get('attendee')}', attendee_email='{ev.get('attendee_email')}', client_id={ev.get('client_id')}")

# 3. Approvals
approvals = db.get_approvals()
print(f"\n=== Pending approvals: {len(approvals)} ===")

# 4. Sessions with handover
sessions = db.get_sessions_with_summary(limit=50)
print(f"\n=== Sessions: {len(sessions)} ===")
handover_sessions = [s for s in sessions if s.get("handover_reason")]
print(f"  With handover: {len(handover_sessions)}")
for s in handover_sessions[:5]:
    print(f"  Session: participant='{s.get('participant')}', client_name='{s.get('client_name')}', handover='{s.get('handover_reason')[:60] if s.get('handover_reason') else ''}'")
