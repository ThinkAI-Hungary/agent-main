"""Fix client #104 name from session participant"""
import database as db
db.init_db()

# Get session participant name
sessions = db.supabase.table("sessions").select("session_id, participant").eq("session_id", "messenger_26629190113363954").execute().data
print(f"Session data: {sessions}")

if sessions and sessions[0].get("participant"):
    name = sessions[0]["participant"]
    if name and name not in ("Ismeretlen", "Névtelen", "-", ""):
        print(f"Updating client #104 name to: {name}")
        # Update client record
        client = db.find_client_by_contact(messenger_id="26629190113363954")
        if client:
            cd = client.get("custom_data", {}) or {}
            cd["name"] = name
            db.edit_client_details(client["id"], cd)
            print(f"Done! Client #{client['id']} name updated to '{name}'")
    else:
        print(f"Session participant is not useful: '{name}'")
else:
    print("No session found")
