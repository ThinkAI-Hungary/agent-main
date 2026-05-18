import os
import json
from dotenv import load_dotenv
import database as db

load_dotenv()

def check_clients():
    clients = db.get_clients(limit=5)
    for c in clients:
        cd = c.get("custom_data", {})
        if isinstance(cd, str):
            try: cd = json.loads(cd)
            except: pass
        
        # Check if it's the user who just tested
        messenger_id = cd.get("messenger_id")
        if messenger_id:
            print("ID:", c.get("id"), "| Name:", c.get("name"))
            print("Messenger ID:", messenger_id)
            naplo = cd.get("beszelgetes_naplo", "")
            if naplo:
                lines = naplo.split("\n")
                print("Naplo (last 15 lines):")
                for line in lines[-15:]:
                    # Handle encoding issues carefully for printing
                    print(line.encode("ascii", "ignore").decode("ascii"))
            print("-" * 40)

if __name__ == "__main__":
    check_clients()
