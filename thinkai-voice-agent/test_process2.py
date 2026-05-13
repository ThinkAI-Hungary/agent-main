import asyncio
import email_processor

original_search = None
def mock_search(self, *args):
    global original_search
    typ, data = original_search(self, None, "ALL")
    if typ == "OK" and data[0]:
        last_id = data[0].split()[-1]
        print(f"Mock search returning last ID: {last_id}")
        return "OK", [last_id]
    return "OK", [b'']

async def run():
    import imaplib
    global original_search
    original_search = imaplib.IMAP4_SSL.search
    imaplib.IMAP4_SSL.search = mock_search
    
    emails = email_processor.check_imap_sync()
    print("Found emails:", len(emails))
    for msg_id, from_email, from_name, subject, text_content in emails:
        print(f"Processing: {subject} from {from_email}")
        try:
            await email_processor.process_single_email(from_email, from_name, subject, text_content)
            print("Successfully processed!")
        except Exception as e:
            print("CRASH:", e)

if __name__ == "__main__":
    asyncio.run(run())
