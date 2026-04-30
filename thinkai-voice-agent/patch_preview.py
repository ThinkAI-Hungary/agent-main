import os

admin_file = "admin.html"
with open(admin_file, "r", encoding="utf-8", errors="ignore") as f:
    content = f.read()

target = '<div class="approval-card-preview">${esc(draftData.body || \'\')}</div>'
replacement = '<div class="approval-card-preview">${esc((draftData.body || \'\').replace(/<br\\s*\\/?>/gi, \' \'))}</div>'

if target in content:
    content = content.replace(target, replacement)
    with open(admin_file, "w", encoding="utf-8") as f:
        f.write(content)
    print("Siker: kártya előnézet javítva az admin.html-ben.")
else:
    print("Hiba: target string nem található.")
