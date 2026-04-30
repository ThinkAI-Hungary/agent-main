import codecs
import re

with codecs.open('email_processor.py', 'r', 'utf-8') as f:
    content = f.read()

old_block_regex = r'(\s*)# Email küldés Brevo API-n[\s\S]*?logger\.error\(f"Hiba a válaszlevél küldésekor: \{e\}"\)'
new_block = r'''\1# Email "kiküldés" helyett piszkozat mentése a Jóváhagyó rendszerbe (Human-in-the-loop)
\1sent_ok = False
\1import json
\1draft_payload = {
\1    "channel": "Email",
\1    "to_email": from_email,
\1    "to_name": from_name,
\1    "subject": f"Re: {subject}",
\1    "body": email_reply
\1}
\1draft_json = json.dumps(draft_payload)
\1logger.info(f"E-mail piszkozat mentve jóváhagyásra: {from_email}")'''

content = re.sub(old_block_regex, new_block, content)

old_log_regex = r'(\s*)result="Sikeres válasz" if sent_ok else "Hibás küldés",([\s\S]*?)handover_reason=handover_reason\n(\s*)\)'
new_log = r'''\1result="Piszkozat mentve",\2handover_reason=handover_reason,
\1approval_status="pending",
\1ai_draft_response=draft_json
\3)'''

content = re.sub(old_log_regex, new_log, content)

with codecs.open('email_processor.py', 'w', 'utf-8') as f:
    f.write(content)
print("Done refactoring email_processor.py")
