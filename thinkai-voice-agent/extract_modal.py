import re
with open('admin.html', 'r', encoding='utf-8') as f:
    content = f.read()

idx = content.find('id="edit-profile-modal"')
if idx != -1:
    print(content[idx-20:idx+2000])
else:
    print('Not found')
