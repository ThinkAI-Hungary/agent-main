"""Quick debug: check what messenger_id data exists in clients DB"""
import database as db
db.init_db()

TARGET_PSID = "26629190113363954"

# 1. Try find_client_by_contact
print("=== find_client_by_contact ===")
result = db.find_client_by_contact(messenger_id=TARGET_PSID)
print(f"Result: {result}")

# 2. Check ALL clients for this messenger_id
print("\n=== Scanning all clients ===")
all_clients = db.supabase.table("clients").select("id, name, custom_data").execute().data
print(f"Total clients: {len(all_clients)}")

found = False
for c in all_clients:
    cd = c.get("custom_data") or {}
    mid = cd.get("messenger_id", "")
    mpsid = cd.get("messenger_psid", "")
    if mid == TARGET_PSID or mpsid == TARGET_PSID:
        print(f"\n  FOUND! Client #{c['id']}")
        print(f"  name column: {c['name']}")
        print(f"  custom_data.messenger_id: {mid}")
        print(f"  custom_data.name: {cd.get('name')}")
        print(f"  custom_data.nev: {cd.get('nev')}")
        found = True

if not found:
    print(f"  NOT FOUND with messenger_id={TARGET_PSID}")
    # Check if name "Daniel" or "Nagy" exists
    for c in all_clients:
        name = c.get("name", "")
        cd = c.get("custom_data") or {}
        cdn = cd.get("nev", "") or cd.get("name", "")
        if "nagy" in (name or "").lower() or "dani" in (name or "").lower() or "nagy" in (cdn or "").lower() or "dani" in (cdn or "").lower():
            print(f"\n  Possible match: Client #{c['id']}")
            print(f"  name: {name}")
            print(f"  custom_data keys: {list(cd.keys())}")
            print(f"  custom_data.messenger_id: {cd.get('messenger_id', 'N/A')}")
