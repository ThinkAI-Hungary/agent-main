import codecs
import re

with codecs.open('web_server.py', 'r', 'utf-8') as f:
    content = f.read()

old_block_regex = r'(\s*)db\.log_interaction\([\s\S]*?result="Üzenet generálva",[\s\S]*?alert_tags=alert_tags if isinstance\(alert_tags, list\) else \[\]\n\s*\)\n\s*async with httpx\.AsyncClient\(\) as http_client:[\s\S]*?print\(f"\[Meta AI Process\] META_PAGE_ACCESS_TOKEN hiányzik, \{source_channel\} üzenet nem lett elküldve\."\)'

new_str = r'''\1import json
\1draft_payload = {
\1    "channel": source_channel,
\1    "sender_id": sender_id,
\1    "phone_number_id": phone_number_id,
\1    "body": final_text
\1}
\1draft_json = json.dumps(draft_payload)
\1
\1db.log_interaction(
\1    type=source_channel.lower(),
\1    topic=f"{source_channel} AI válasz",
\1    summary=final_text[:100],
\1    result="Piszkozat mentve",
\1    tool_name="process_meta_message",
\1    session_id=session_id,
\1    funnel_stage=f_stage,
\1    alert_tags=alert_tags if isinstance(alert_tags, list) else [],
\1    approval_status="pending",
\1    ai_draft_response=draft_json
\1)
\1print(f"[Meta AI Process] {source_channel} piszkozat mentve jóváhagyásra.")'''

if re.search(old_block_regex, content):
    content = re.sub(old_block_regex, new_str, content)
    print("Regex replace successful.")
else:
    print("WARNING: Regex not found.")

with codecs.open('web_server.py', 'w', 'utf-8') as f:
    f.write(content)
