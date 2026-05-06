import database as db

clients = db.supabase.table('clients').select('id, additional_log').execute().data
for c in clients:
    if c.get('additional_log') and 'Bej' in c['additional_log']:
        print(f"ID {c['id']}: {repr(c['additional_log'])}")
