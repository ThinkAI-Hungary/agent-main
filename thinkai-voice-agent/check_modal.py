import re
with open('admin.html', 'r', encoding='utf-8') as f:
    content = f.read()
if 'id="edit-profile-modal"' in content:
    print("Modal is in the HTML!")
else:
    print("Modal IS MISSING!")
