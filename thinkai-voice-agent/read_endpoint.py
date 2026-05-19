with open('web_server.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()
for i, l in enumerate(lines):
    if '@app.put("/admin/api/clients/{client_id}")' in l:
        print("".join(lines[i:i+30]))
        break
