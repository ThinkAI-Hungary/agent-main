import asyncio
import os
from dotenv import load_dotenv
import email_processor

load_dotenv()
print("Starting IMAP check...")
emails = email_processor.check_imap_sync()
print(f"Found {len(emails)} emails.")
for e in emails:
    print("Email ID:", e[0], "From:", e[1], "Subject:", e[3])
