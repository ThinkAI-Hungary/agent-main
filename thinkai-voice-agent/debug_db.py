import database as db

clients = db.get_clients(limit=5)
print("--- Last 5 Clients ---")
for c in clients:
    print(f"ID: {c.get('id')}, Name: {c.get('name')}, Email: {c.get('email')}, Status: {c.get('status')}")
    cd = c.get("custom_data", {})
    if type(cd) is str:
        import json
        try:
            cd = json.loads(cd)
        except:
            cd = {}
    print(f"  cancelled_viewed: {cd.get('cancelled_viewed')}")

print("\n--- Last 5 Kanban Columns ---")
cols = db.get_kanban_columns()
for col in cols:
    print(f"Col ID: {col.get('id')}, Name: {col.get('name')}")
