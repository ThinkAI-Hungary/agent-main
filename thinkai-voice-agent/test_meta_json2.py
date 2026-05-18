import os
import asyncio
import database as db
from dotenv import load_dotenv

load_dotenv()

from web_server import process_meta_message

async def test():
    print("Testing process_meta_message with JSON output...")
    # This will trigger the AI to actually BOOK because it gave the clinic ID.
    await process_meta_message(
        sender_id="TEST_USER_99",
        message_text="Szia Kovács János vagyok, 06201234567, szeretnék foglalni holnap délután 2-re állapotfelmérésre a Teszt Telephelyre.",
        source_channel="Messenger"
    )
    print("Process finished. Checking DB...")
    
    # Check calendar
    events = db.get_calendar_events()
    found_event = False
    for e in events:
        if e.get("attendee") == "Kovács János":
            print("Found event!", e.get("title"), e.get("start_dt"), "End:", e.get("end_dt"))
            found_event = True
            db.delete_calendar_event(e.get("id"))
            print("Deleted test event.")
            
    if not found_event:
        print("Event not found!")

if __name__ == "__main__":
    asyncio.run(test())
