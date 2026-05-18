import asyncio
from email_processor import send_booking_confirmation_email

async def test():
    print("Testing email send...")
    await send_booking_confirmation_email(
        event_id=999,
        title="Konzultáció",
        date="2026-05-14",
        time="10:00",
        attendee="Dániel Nagy",
        attendee_email="nagyd965@gmail.com"
    )
    print("Done")

asyncio.run(test())
