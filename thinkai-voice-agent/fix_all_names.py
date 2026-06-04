"""Fix ALL clients that have Névtelen by checking session participants"""
import database as db
db.init_db()

# Get all clients with Névtelen
clients = db.supabase.table("clients").select("id, name, custom_data").execute().data
print(f"Total clients: {len(clients)}")

for c in clients:
    if c["name"] in ("Névtelen", "Ismeretlen", None, ""):
        cd = c.get("custom_data") or {}
        mid = cd.get("messenger_id", "")
        if mid:
            # Check session for participant name
            sid = f"messenger_{mid}"
            sessions = db.supabase.table("sessions").select("participant").eq("session_id", sid).execute().data
            if sessions and sessions[0].get("participant"):
                pname = sessions[0]["participant"]
                if pname and pname not in ("Ismeretlen", "Névtelen", "-", ""):
                    print(f"  Fixing client #{c['id']}: '{c['name']}' -> '{pname}'")
                    cd["name"] = pname
                    db.edit_client_details(c["id"], cd)
                else:
                    print(f"  Client #{c['id']}: session participant also bad: '{pname}'")
            else:
                print(f"  Client #{c['id']}: no session found for {sid}")
        else:
            print(f"  Client #{c['id']}: no messenger_id")

print("\nDone!")
