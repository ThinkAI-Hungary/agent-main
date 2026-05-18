import os
import asyncio
import database as db
from dotenv import load_dotenv

load_dotenv()

from web_server import process_meta_message

async def test():
    print("Testing process_meta_message with JSON output...")
    # Szia Kovács János vagyok, 06201234567, szeretnék foglalni holnap délután 2-re állapotfelmérésre
    await process_meta_message(
        sender_id="TEST_USER_99",
        message_text="Szia Kovács János vagyok, 06201234567, szeretnék foglalni holnap délután 2-re állapotfelmérésre.",
        source_channel="Messenger"
    )
    print("Process finished. Checking DB...")
    
    # Check client
    client = db.find_client_by_contact(messenger_id="TEST_USER_99")
    if client:
        print("Found client!")
        print("Name:", client.get("name"))
        print("Phone:", client.get("phone"))
        print("Status:", client.get("status"))
    else:
        print("Client not found!")
        
    # Check calendar
    events = db.get_calendar_events()
    found_event = False
    for e in events:
        if e.get("attendee") == "Kovács János":
            print("Found event!", e.get("title"), e.get("start_dt"))
            found_event = True
            
    if not found_event:
        print("Event not found!")

if __name__ == "__main__":
    asyncio.run(test())
