with open('admin.html', 'r', encoding='utf-8') as f:
    content = f.read()

old_btn = 'onclick="editClientProfile()" style="background:transparent; border:none; cursor:pointer; color:#082432; font-size:14px; font-weight:600; display:flex; align-items:center; gap:6px;"'
new_btn = 'onclick="alert(\'Gomb megnyomva!\'); editClientProfile();" style="background:transparent; border:none; cursor:pointer; color:#082432; font-size:14px; font-weight:600; display:flex; align-items:center; gap:6px; position:relative; z-index:99; pointer-events:auto;"'

content = content.replace(old_btn, new_btn)

old_func_start = "function editClientProfile() {\n        try {\n"
new_func_start = "function editClientProfile() {\n        try {\n            alert('JS fut');\n"
content = content.replace(old_func_start, new_func_start)

with open('admin.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("Button patched")
