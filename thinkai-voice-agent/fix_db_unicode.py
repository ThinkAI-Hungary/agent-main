import database as db

def fix_db():
    print("Fixing DB...")
    # The bad character is literally U+00C5 followed by U+2018 (Left Single Quotation Mark)
    bad_o = '\u00c5\u2018'
    good_o = 'ő'
    
    # Another variant: U+00C5 followed by U+2019 (Right Single Quotation Mark)
    bad_o2 = '\u00c5\u2019'
    
    # Another variant: U+00C5 followed by U+0091
    bad_o3 = '\u00c5\x91'

    # And U+00C3 + U+00A1 for á, etc.
    replacements = {
        bad_o: good_o,
        bad_o2: good_o,
        bad_o3: good_o,
        '\u00c3\u00b6': 'ö', # Ã¶
        '\u00c3\u00a1': 'á', # Ã¡
        '\u00c3\u00ad': 'í', # Ã­
        '\u00c3\u00a9': 'é', # Ã©
        '\u00c3\u00ba': 'ú', # Ãº
        '\u00c3\u00bc': 'ü', # Ã¼
        '\u00c3\u00b3': 'ó', # Ã³
    }

    # Clients
    clients = db.supabase.table('clients').select('id, custom_data').execute().data
    fixed = 0
    for c in clients:
        cd = c.get('custom_data') or {}
        updated = False
        for k, v in cd.items():
            if isinstance(v, str):
                new_v = v
                for bad, good in replacements.items():
                    new_v = new_v.replace(bad, good)
                if new_v != v:
                    cd[k] = new_v
                    updated = True
        if updated:
            db.supabase.table('clients').update({'custom_data': cd}).eq('id', c['id']).execute()
            fixed += 1
            
    print(f"Fixed {fixed} clients.")

    # Interactions
    interactions = db.supabase.table('interactions').select('id, topic, summary, ai_draft_response').execute().data
    fixed = 0
    for i in interactions:
        updates = {}
        for k in ['topic', 'summary', 'ai_draft_response']:
            v = i.get(k)
            if isinstance(v, str):
                new_v = v
                for bad, good in replacements.items():
                    new_v = new_v.replace(bad, good)
                if new_v != v:
                    updates[k] = new_v
        if updates:
            db.supabase.table('interactions').update(updates).eq('id', i['id']).execute()
            fixed += 1
            
    print(f"Fixed {fixed} interactions.")

fix_db()
