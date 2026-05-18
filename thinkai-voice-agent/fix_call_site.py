import re

file_path = 'c:/Users/dani pc xd/Desktop/Projectek/agent-main/thinkai-voice-agent/admin.html'
with open(file_path, 'r', encoding='utf-8') as f:
    html = f.read()

old_str = "onclick=\"openLogModal('${esc(btoa(encodeURIComponent(val)))}', '${safeName}', '${esc(csatorna)}', '${safeDate}')\""
new_str = "onclick=\"openLogModal('${esc(btoa(encodeURIComponent(val)))}', '${safeName}', '${esc(csatorna)}', '${safeDate}', '${esc(btoa(encodeURIComponent(JSON.stringify(customObj))))}')\""

if old_str in html:
    html = html.replace(old_str, new_str)
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(html)
    print("Fixed!")
else:
    print("Not found")
