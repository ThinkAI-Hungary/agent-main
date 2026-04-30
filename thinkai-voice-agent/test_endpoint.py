import asyncio
from database import get_clients, edit_client_details

client_id = 27
clients = get_clients()
found = False
for c in clients:
    if c.get("id") == client_id:
        found = True
        custom_data = c.get("custom_data")
        if isinstance(custom_data, str):
            try:
                import json
                custom_data = json.loads(custom_data)
            except:
                custom_data = {}
        if not isinstance(custom_data, dict):
            custom_data = {}
        
        custom_data["urgent_viewed"] = True
        print(f"Calling edit_client_details with client_id={client_id}, custom_data={custom_data}")
        success = edit_client_details(client_id, custom_data)
        print(f"Success: {success}")
        break

if not found:
    print("Client not found!")
