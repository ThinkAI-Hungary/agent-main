import os

# 1. Patch admin.html
admin_file = "admin.html"
with open(admin_file, "r", encoding="utf-8", errors="ignore") as f:
    content = f.read()

target_html = "document.getElementById('approval-draft-text').value = draftData.body || '';"
replacement_html = """let initialDraft = draftData.body || '';
      initialDraft = initialDraft.replace(/<br\\s*\\/?>/gi, '\\n');
      document.getElementById('approval-draft-text').value = initialDraft;"""

if target_html in content:
    content = content.replace(target_html, replacement_html)
    with open(admin_file, "w", encoding="utf-8") as f:
        f.write(content)
    print("Siker: admin.html javítva.")
else:
    print("Hiba: admin.html target string nem található.")

# 2. Patch web_server.py
server_file = "web_server.py"
with open(server_file, "r", encoding="utf-8", errors="ignore") as f:
    server_content = f.read()

target_server = 'f\'<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">{final_text}</div>\''
replacement_server = 'f\'<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">{final_text.replace(chr(10), "<br>")}</div>\''

if target_server in server_content:
    server_content = server_content.replace(target_server, replacement_server)
    with open(server_file, "w", encoding="utf-8") as f:
        f.write(server_content)
    print("Siker: web_server.py javítva.")
else:
    print("Hiba: web_server.py target string nem található.")
