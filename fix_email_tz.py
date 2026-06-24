import re

with open("/root/dobozos/thinkai-voice-agent/email_processor.py", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Add ZoneInfo import and Helper
if "BUDAPEST_TZ" not in content:
    content = content.replace("from datetime import datetime, timedelta", 
        "from datetime import datetime, timedelta\nfrom zoneinfo import ZoneInfo\n\nBUDAPEST_TZ = ZoneInfo(\"Europe/Budapest\")\n\ndef _to_budapest_tz(dt_str: str) -> datetime:\n    dt = datetime.fromisoformat(dt_str)\n    if dt.tzinfo is None:\n        return dt.replace(tzinfo=BUDAPEST_TZ)\n    return dt.astimezone(BUDAPEST_TZ)")

# 3. Replace fromisoformat calls that construct naive local times or read from DB without tz.
# Only replace lines 482, 504, 507, 926 for sure, because others might be parsing UTC explicitly.
content = content.replace('datetime.fromisoformat(f"{date_str}T{time_str}:00")', '_to_budapest_tz(f"{date_str}T{time_str}:00")')
content = content.replace('datetime.fromisoformat(found["start_dt"])', '_to_budapest_tz(found["start_dt"])')
content = content.replace('datetime.fromisoformat(f"{d}T{t}:00")', '_to_budapest_tz(f"{d}T{t}:00")')
content = content.replace('datetime.fromisoformat(f"{date}T{time}:00")', '_to_budapest_tz(f"{date}T{time}:00")')


with open("/root/dobozos/thinkai-voice-agent/email_processor.py", "w", encoding="utf-8") as f:
    f.write(content)

print("Done")
