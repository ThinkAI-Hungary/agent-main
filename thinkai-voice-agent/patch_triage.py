import os
import re

# 1. Patch admin.html
admin_file = "admin.html"
with open(admin_file, "r", encoding="utf-8", errors="ignore") as f:
    content = f.read()

# Remove TH
content = re.sub(
    r'<th[^>]*>Eszkal[^<]*e-mail</th>',
    '',
    content,
    flags=re.IGNORECASE
)

# Replace TD with input
td_regex = r'<td[^>]*>\s*<div[^>]*class="triage-email-container"[^>]*>.*?</div>\s*</td>'
content = re.sub(td_regex, '', content, flags=re.IGNORECASE | re.DOTALL)

# Remove escalation_email value extraction
content = re.sub(
    r'escalation_email:\s*row\.querySelector\(\'\.triage-email\'\)\.value\.trim\(\)',
    "escalation_email: ''",
    content
)

# Remove validation block
validation_regex = r"if\s*\(\(data\.priority\s*===\s*'Srgs'\s*\|\|\s*data\.priority\s*===\s*'Kiemelt'\)\s*&&\s*!data\.escalation_email\)\s*\{\s*showToast\('error',\s*'Krlek add meg az eszkalcis e-mailt a srgs/kiemelt szablyokhoz!'\);\s*return;\s*\}"
content = re.sub(validation_regex, "", content)
validation_regex2 = r"if\s*\(\(data\.priority\s*===\s*'Sürgős'\s*\|\|\s*data\.priority\s*===\s*'Kiemelt'\)\s*&&\s*!data\.escalation_email\)\s*\{\s*showToast\('error',\s*'Kérlek add meg az eszkalációs e-mailt a sürgős/kiemelt szabályokhoz!'\);\s*return;\s*\}"
content = re.sub(validation_regex2, "", content)

# Also there might be another occurrence in saveAll?
content = re.sub(
    r"if\s*\(\(priorityVal\s*===\s*'Srgs'\s*\|\|\s*priorityVal\s*===\s*'Kiemelt'\)\s*&&\s*!emailVal\)\s*\{[^}]*\}",
    "",
    content
)

with open(admin_file, "w", encoding="utf-8") as f:
    f.write(content)
print("Siker: admin.html javítva.")

# 2. Patch web_server.py
web_file = "web_server.py"
if os.path.exists(web_file):
    with open(web_file, "r", encoding="utf-8", errors="ignore") as f:
        web_content = f.read()
    
    # Remove escalation logic
    web_content = re.sub(
        r'if\s*email_to_send:\s*name_val\s*=\s*tool_args\.get\("name",\s*"Ismeretlen"\).*?priority=priority\s*\)\)',
        'if False: pass',
        web_content,
        flags=re.DOTALL
    )
    with open(web_file, "w", encoding="utf-8") as f:
        f.write(web_content)
    print("Siker: web_server.py javítva.")

# 3. Patch tools.py
tools_file = "tools.py"
if os.path.exists(tools_file):
    with open(tools_file, "r", encoding="utf-8", errors="ignore") as f:
        tools_content = f.read()
    
    tools_content = re.sub(
        r'if\s*email_to_send:\s*name_val\s*=\s*tool_args\.get\("name",\s*"Ismeretlen"\).*?priority=priority\s*\)\)',
        'if False: pass',
        tools_content,
        flags=re.DOTALL
    )
    with open(tools_file, "w", encoding="utf-8") as f:
        f.write(tools_content)
    print("Siker: tools.py javítva.")

# 4. Patch email_processor.py
email_file = "email_processor.py"
if os.path.exists(email_file):
    with open(email_file, "r", encoding="utf-8", errors="ignore") as f:
        email_content = f.read()
    
    email_content = re.sub(
        r'if\s*email_to_send:\s*asyncio\.create_task\(send_escalation_email_to_staff\(.*?priority="Srgs"\s*\)\)',
        'if False: pass',
        email_content,
        flags=re.DOTALL
    )
    email_content = re.sub(
        r'if\s*email_to_send:\s*asyncio\.create_task\(send_escalation_email_to_staff\(.*?priority="Sürgős"\s*\)\)',
        'if False: pass',
        email_content,
        flags=re.DOTALL
    )
    with open(email_file, "w", encoding="utf-8") as f:
        f.write(email_content)
    print("Siker: email_processor.py javítva.")
