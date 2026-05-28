"""
Egyszeri script: Frissíti az 'Ismeretlen' nevű ügyfelek nevét
az Instagram/Messenger profil API alapján.
"""
import os
import json
import requests
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

import database as db

def fix_unknown_names():
    token = os.getenv("META_PAGE_ACCESS_TOKEN")
    if not token:
        print("Nincs META_PAGE_ACCESS_TOKEN!")
        return
    
    # Összes ügyfél lekérdezése
    clients = db.get_clients()
    fixed = 0
    
    for client in clients:
        name = client.get("name", "")
        if name and name != "Ismeretlen":
            continue  # már van neve
        
        # Keressük a messenger_id-t a custom_data-ban
        custom_data = client.get("custom_data", {})
        if isinstance(custom_data, str):
            try:
                custom_data = json.loads(custom_data)
            except:
                custom_data = {}
        
        messenger_id = custom_data.get("messenger_id")
        if not messenger_id:
            continue
        
        # Profil lekérdezés
        url = f"https://graph.facebook.com/v25.0/{messenger_id}?fields=name,profile_pic&access_token={token}"
        try:
            resp = requests.get(url, timeout=5)
            if resp.status_code == 200:
                data = resp.json()
                new_name = data.get("name")
                if new_name:
                    # Frissítjük az adatbázisban
                    custom_data["name"] = new_name
                    db.edit_client_details(client["id"], custom_data)
                    # Név frissítése a fő rekordban is
                    db.upsert_client({"messenger_id": messenger_id, "name": new_name})
                    print(f"  OK: {messenger_id} -> {new_name}")
                    fixed += 1
                else:
                    print(f"  SKIP: {messenger_id}: nincs nev a valaszban")
            else:
                print(f"  FAIL: {messenger_id}: API hiba {resp.status_code} - {resp.text[:100]}")
        except Exception as e:
            print(f"  FAIL: {messenger_id}: {e}")
    
    print(f"\nKész! {fixed} ügyfél neve frissítve.")

if __name__ == "__main__":
    fix_unknown_names()
