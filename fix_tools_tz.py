import re

with open("/root/dobozos/thinkai-voice-agent/tools.py", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Add ZoneInfo import and Helper
if "ZoneInfo" not in content:
    content = content.replace("from datetime import datetime, timedelta", 
        "from datetime import datetime, timedelta\nfrom zoneinfo import ZoneInfo\n\nBUDAPEST_TZ = ZoneInfo(\"Europe/Budapest\")\n\ndef _to_budapest_tz(dt_str: str) -> datetime:\n    dt = datetime.fromisoformat(dt_str)\n    if dt.tzinfo is None:\n        return dt.replace(tzinfo=BUDAPEST_TZ)\n    return dt.astimezone(BUDAPEST_TZ)")

# 2. Replace utcnow() with aware now
content = content.replace("now = datetime.utcnow()", "now = datetime.now(BUDAPEST_TZ)")

# 3. Replace fromisoformat calls
content = re.sub(r'datetime\.fromisoformat\(([^)]+)\)', r'_to_budapest_tz(\1)', content)

# But wait, we have _to_budapest_tz in the helper itself now, which will also get replaced if we do a blind regex!
# So let's restore the helper!
content = content.replace("_to_budapest_tz(dt_str)", "datetime.fromisoformat(dt_str)")

with open("/root/dobozos/thinkai-voice-agent/tools.py", "w", encoding="utf-8") as f:
    f.write(content)

print("Done")
