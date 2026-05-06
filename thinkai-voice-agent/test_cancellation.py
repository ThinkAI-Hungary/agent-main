import requests
import jwt
import os
import time
from datetime import datetime, timedelta
import database as db

# 1. Create a test client
print("Creating test client...")
test_email = f"test_cancel_{int(time.time())}@example.com"
client_id = db.add_client({
    "name": "Test Cancel Elek",
    "email": test_email,
    "phone": "+36301234567"
}, status="uj")

print(f"Created client ID: {client_id} with email {test_email}")

# 2. Add calendar event
print("Adding calendar event...")
event_id = db.add_calendar_event(
    title="Konzultáció - Test Cancel Elek",
    start_dt=(datetime.utcnow() + timedelta(days=2)).isoformat() + "Z",
    end_dt=(datetime.utcnow() + timedelta(days=2, hours=1)).isoformat() + "Z",
    duration_minutes=60,
    attendee="Test Cancel Elek",
    attendee_email=test_email
)
print(f"Created event ID: {event_id}")

# 3. Generate token
print("Generating cancellation token...")
JWT_SECRET = os.getenv("JWT_SECRET", "thinkai-admin-secret-change-me")
JWT_ALGO = "HS256"
token = jwt.encode({"event_id": event_id, "exp": datetime.utcnow() + timedelta(days=90)}, JWT_SECRET, algorithm=JWT_ALGO)

# 4. Call cancel endpoint
print("Calling public cancellation endpoint...")
cancel_url = f"http://127.0.0.1:8000/api/public/cancel?token={token}"
response = requests.get(cancel_url)
print(f"Cancel Response Code: {response.status_code}")

if response.status_code == 200 and "sikeresen lemondva" in response.text.lower():
    print("SUCCESS: Cancellation endpoint returned successful HTML.")
else:
    print("WARNING: Cancellation endpoint did not return expected success HTML.")
    print(response.text)

# 5. Verify results
print("Verifying database state...")
event = db.get_calendar_event(event_id)
if event is None:
    print("SUCCESS: Calendar event was deleted.")
else:
    print("ERROR: Calendar event still exists!")

client = db.find_client_by_contact(email=test_email)
if client:
    print(f"Client status is: {client.get('status')}")
    if client.get('status') == 'lemondott':
        print("SUCCESS: Client status is correctly set to 'lemondott'.")
    else:
        print("ERROR: Client status is not 'lemondott'.")
    
    cd = client.get("custom_data", {})
    if type(cd) is str:
        import json
        cd = json.loads(cd)
    if cd.get("cancelled_viewed") is False:
        print("SUCCESS: cancelled_viewed flag is False.")
    else:
        print("ERROR: cancelled_viewed flag is not False.")
else:
    print("ERROR: Client was deleted or not found!")

# 6. Verify alerts endpoint
print("Verifying alerts endpoint...")
# We need an admin token to call the endpoint
admin_token = jwt.encode({
    "sub": "admin",
    "exp": datetime.utcnow() + timedelta(hours=1)
}, JWT_SECRET, algorithm=JWT_ALGO)

headers = {"Authorization": f"Bearer {admin_token}"}
alerts_res = requests.get("http://127.0.0.1:8000/admin/api/alerts/cancelled", headers=headers)
if alerts_res.status_code == 200:
    data = alerts_res.json()
    cancelled_clients = data.get("cancelled_clients", [])
    found = any(c.get("id") == client_id for c in cancelled_clients)
    if found:
        print("SUCCESS: Client is returned in the cancelled alerts endpoint.")
    else:
        print("ERROR: Client is NOT returned in the cancelled alerts endpoint.")
else:
    print(f"ERROR: alerts endpoint failed with status {alerts_res.status_code}")
