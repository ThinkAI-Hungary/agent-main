import database as db
users = db.get_admin_users()
for u in users:
    print(f"{u['username']:20s} {u['email']:30s} {u['role']:10s} {u.get('full_name','')}")
