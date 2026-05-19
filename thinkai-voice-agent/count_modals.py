with open('admin.html', 'r', encoding='utf-8') as f:
    content = f.read()
print(content.count('id="edit-profile-modal"'))
