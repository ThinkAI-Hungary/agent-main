import asyncio
from database import get_clients

clients = get_clients()
count = 0
for c in clients:
    custom_data = c.get('custom_data') or {}
    if custom_data.get('prioritas') == 'Sürgős' or custom_data.get('priority') == 'Sürgős':
        print(f"Client {c['id']}: urgent_viewed = {custom_data.get('urgent_viewed')}")
        count += 1
if count == 0:
    print("No urgent clients found.")
