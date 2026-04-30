import os
import re

file_path = 'email_processor.py'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

pattern = re.compile(
    r'db\.log_interaction\(\s*'
    r'type="email",\s*'
    r'topic="Email AI válasz",\s*'
    r'summary=f"Bejövő e-mail \{from_email\} címről",\s*'
    r'result="Sikeres válasz" if sent_ok else "Hibás küldés",\s*'
    r'tool_name="imap_worker_ai",\s*'
    r'session_id=session_id,\s*'
    r'funnel_stage=f_stage,\s*'
    r'alert_tags=alert_tags if isinstance\(alert_tags, list\) else \[\],\s*'
    r'handover_reason=handover_reason\s*'
    r'\)'
)

replacement = """db.log_interaction(
            type="email",
            topic="Email AI válasz",
            summary=f"Bejövő e-mail {from_email} címről",
            result="Várakozik jóváhagyásra",
            tool_name="imap_worker_ai",
            session_id=session_id,
            funnel_stage=f_stage,
            alert_tags=alert_tags if isinstance(alert_tags, list) else [],
            handover_reason=handover_reason,
            approval_status="pending",
            ai_draft_response=draft_json
        )"""

new_content, count = pattern.subn(replacement, content)

if count > 0:
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print(f"Successfully replaced {count} occurrences.")
else:
    print("Regex did not match anything in the file!")
