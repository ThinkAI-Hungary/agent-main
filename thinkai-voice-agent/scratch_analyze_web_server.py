# -*- coding: utf-8 -*-
import sys
if sys.platform.startswith('win'):
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.detach())

with open("web_server.py", "r", encoding="utf-8") as f:
    lines = f.readlines()

import re
router_pattern = re.compile(r'@app\.(post|get|put|delete)\("([^"]+)"')
admin_router_pattern = re.compile(r'@admin_router\.(post|get|put|delete)\("([^"]+)"')

print("=== App Routes ===")
for idx, line in enumerate(lines):
    m = router_pattern.search(line)
    if m:
        print(f"Line {idx+1}: {m.group(1).upper()} {m.group(2)}")
    m2 = admin_router_pattern.search(line)
    if m2:
        print(f"Line {idx+1}: ADMIN ROUTE {m2.group(1).upper()} {m2.group(2)}")

print("=== Check Gemini Config ===")
for idx, line in enumerate(lines):
    if "Gemini" in line or "genai" in line:
        print(f"Line {idx+1}: {line.strip()}")
