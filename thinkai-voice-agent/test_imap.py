import imaplib
import os
from dotenv import load_dotenv
load_dotenv()
mail = imaplib.IMAP4_SSL(os.getenv('IMAP_SERVER'), port=993)
mail.login(os.getenv('IMAP_USER'), os.getenv('IMAP_PASS'))
mail.select('inbox')
status, msgs = mail.search(None, 'ALL')
ids = msgs[0].split()[-3:]
print('Last 3 emails:')
for i in ids:
    status, data = mail.fetch(i, '(BODY.PEEK[HEADER.FIELDS (SUBJECT)])')
    print(data[0][1].decode('utf-8').strip())
