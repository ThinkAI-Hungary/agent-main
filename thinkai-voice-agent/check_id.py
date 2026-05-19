with open('admin.html', 'r', encoding='utf-8') as f:
    content = f.read()
if 'id="editClientProfile"' in content or "id='editClientProfile'" in content:
    print('Shadowing exists')
else:
    print('No shadowing')
