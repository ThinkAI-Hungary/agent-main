with open('admin.html', 'r', encoding='utf-8') as f:
    content = f.read()

old_div = '<div style="display:flex; align-items:flex-start; gap:20px;">'
new_div = '<div onclick="forceOpenProfile()" style="display:flex; align-items:flex-start; gap:20px; cursor:pointer; padding:8px; margin:-8px; border-radius:12px; transition:background 0.2s;" onmouseover="this.style.background=\'rgba(255,255,255,0.3)\'" onmouseout="this.style.background=\'transparent\'" title="Kattints az adatok szerkesztéséhez">'

# Only replace the FIRST occurrence which is the one in the top card
content = content.replace(old_div, new_div, 1)

with open('admin.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("Make clickable applied")
