import os
import re

# 1. Patch admin.html
admin_file = "admin.html"
with open(admin_file, "r", encoding="utf-8", errors="ignore") as f:
    content = f.read()

# isSurgosOrKiemelt -> isKiemelt
content = re.sub(
    r"const isSurgosOrKiemelt = rule\.priority === 'Sürgős' \|\| rule\.priority === 'Kiemelt';",
    "const isKiemelt = rule.priority === 'Kiemelt';",
    content
)
content = re.sub(
    r"const isSurgosOrKiemelt = rule\.priority === 'Srgs' \|\| rule\.priority === 'Kiemelt';",
    "const isKiemelt = rule.priority === 'Kiemelt';",
    content
)

# visibility check
content = re.sub(
    r"\$\{isSurgosOrKiemelt \? 'visible' : 'hidden'\}",
    "${isKiemelt ? 'visible' : 'hidden'}",
    content
)

# validation check
content = re.sub(
    r"if \(\(data\.priority === 'Sürgős' \|\| data\.priority === 'Kiemelt'\) && !data\.escalation_email\) \{\s*showToast\('error', 'Kérlek add meg az eszkalációs e-mailt a sürgős/kiemelt szabályokhoz!'\);",
    "if (data.priority === 'Kiemelt' && !data.escalation_email) {\n          showToast('error', 'Kérlek add meg az eszkalációs e-mailt a kiemelt szabályokhoz!');",
    content
)
content = re.sub(
    r"if \(\(data\.priority === 'Srgs' \|\| data\.priority === 'Kiemelt'\) && !data\.escalation_email\) \{\s*showToast\('error', 'Krlek add meg az eszkalcis e-mailt a srgs/kiemelt szablyokhoz!'\);",
    "if (data.priority === 'Kiemelt' && !data.escalation_email) {\n          showToast('error', 'Kérlek add meg az eszkalációs e-mailt a kiemelt szabályokhoz!');",
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
    
    web_content = re.sub(
        r'if priority == "Sürgős":',
        'if priority == "Kiemelt":',
        web_content
    )
    web_content = re.sub(
        r'if priority == "Srgs":',
        'if priority == "Kiemelt":',
        web_content
    )
    with open(web_file, "w", encoding="utf-8") as f:
        f.write(web_content)
    print("Siker: web_server.py javítva.")

# 3. Patch tools.py and email_processor.py
for py_file in ["tools.py", "email_processor.py"]:
    if os.path.exists(py_file):
        with open(py_file, "r", encoding="utf-8", errors="ignore") as f:
            py_content = f.read()
        
        py_content = re.sub(
            r'r\.get\("priority"\) == "Sürgős"',
            'r.get("priority") == "Kiemelt"',
            py_content
        )
        py_content = re.sub(
            r'r\.get\("priority"\) == "Srgs"',
            'r.get("priority") == "Kiemelt"',
            py_content
        )
        
        py_content = re.sub(
            r'priority="Sürgős"',
            'priority="Kiemelt"',
            py_content
        )
        py_content = re.sub(
            r'priority="Srgs"',
            'priority="Kiemelt"',
            py_content
        )
        
        with open(py_file, "w", encoding="utf-8") as f:
            f.write(py_content)
        print(f"Siker: {py_file} javítva.")
