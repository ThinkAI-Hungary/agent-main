import database as db
import os
import requests
from dotenv import load_dotenv
load_dotenv(".env")

clients = db.get_clients()
token = os.getenv("META_PAGE_ACCESS_TOKEN")
print(f"Total clients: {len(clients)}")
print()

for c in clients:
    cd = c.get("custom_data", {}) or {}
    if not isinstance(cd, dict):
        cd = {}
    mid = cd.get("messenger_id", "")
    name = c.get("name", "")
    print(f"ID:{c['id']} Name:{name} messenger_id:{mid or 'none'}")
    
    # If name is "Ismeretlen" and has messenger_id, try to fix
    if name == "Ismeretlen" and mid and token:
        url = f"https://graph.facebook.com/v25.0/{mid}?fields=name,profile_pic&access_token={token}"
        try:
            resp = requests.get(url, timeout=5)
            if resp.status_code == 200:
                data = resp.json()
                new_name = data.get("name")
                if new_name:
                    cd["name"] = new_name
                    db.edit_client_details(c["id"], cd)
                    print(f"  -> FIXED: {new_name}")
        except Exception as e:
            print(f"  -> ERROR: {e}")
