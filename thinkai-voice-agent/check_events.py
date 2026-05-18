import os
from dotenv import load_dotenv
import database as db

load_dotenv()

def check_events():
    events = db.get_calendar_events()
    for e in events:
        print("Event:", e.get("title"), e.get("start_dt"), e.get("attendee"))

if __name__ == "__main__":
    check_events()
