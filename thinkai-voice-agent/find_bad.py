import database as db

def print_bad_records():
    print("--- Clients ---")
    clients = db.supabase.table('clients').select('id, custom_data').execute().data
    for c in clients:
        cd = c.get('custom_data') or {}
        for k, v in cd.items():
            if isinstance(v, str) and 'Bej' in v:
                print(f"Client {c['id']} {k}: {repr(v)}")

    print("--- Interactions ---")
    interactions = db.supabase.table('interactions').select('id, topic, summary, transcript, ai_draft_response').execute().data
    for i in interactions:
        for k in ['topic', 'summary', 'transcript', 'ai_draft_response']:
            v = i.get(k)
            if isinstance(v, str) and 'Bej' in v:
                print(f"Interaction {i['id']} {k}: {repr(v)}")

print_bad_records()
