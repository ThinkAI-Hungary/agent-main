import asyncio
import os
import imaplib
import email
from email.header import decode_header
from dotenv import load_dotenv

load_dotenv()

async def test_last_email():
    from email_processor import process_email
    
    mail = imaplib.IMAP4_SSL(os.getenv("IMAP_SERVER"), int(os.getenv("IMAP_PORT")))
    mail.login(os.getenv("IMAP_USER"), os.getenv("IMAP_PASS"))
    mail.select("inbox")
    
    status, messages = mail.search(None, "ALL")
    if status == "OK" and messages[0]:
        msg_ids = messages[0].split()
        last_id = msg_ids[-1]
        print(f"Letöltés: {last_id}")
        
        status, msg_data = mail.fetch(last_id, "(RFC822)")
        for response_part in msg_data:
            if isinstance(response_part, tuple):
                msg = email.message_from_bytes(response_part[1])
                subject, encoding = decode_header(msg["Subject"])[0]
                if isinstance(subject, bytes):
                    subject = subject.decode(encoding if encoding else "utf-8")
                
                print(f"Subject: {subject}")
                
                # Csupasz tartalom
                text_content = ""
                if msg.is_multipart():
                    for part in msg.walk():
                        if part.get_content_type() == "text/plain":
                            try:
                                text_content += part.get_payload(decode=True).decode()
                            except:
                                text_content += part.get_payload()
                else:
                    try:
                        text_content = msg.get_payload(decode=True).decode()
                    except:
                        text_content = msg.get_payload()
                
                print(f"Content: {text_content[:100]}")
                print("Processing email via process_email...")
                try:
                    await process_email(msg, "teszt@teszt.hu", "Teszt", subject, text_content)
                    print("Process finished successfully.")
                except Exception as e:
                    print(f"CRASH: {e}")

if __name__ == "__main__":
    asyncio.run(test_last_email())
