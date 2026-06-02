import database as db

def fix_db():
    res = db.supabase.table('interactions').select('id, summary').ilike('summary', '%Bej%').execute()
    for row in res.data:
        s = row['summary']
        # brute force replacements for known mojibake
        # 'Å‘' is usually \xc5\x91
        new_s = s.replace('Å‘', 'ő').replace('é', 'é').replace('Ã¡', 'á').replace('Ã³', 'ó').replace('Ã¶', 'ö').replace('Ã¼', 'ü').replace('Ã-', 'Í').replace('Ã', 'í')
        
        # In case the exact char isn't caught, let's try to fix it by encoding/decoding
        try:
            # If it's double encoded:
            new_s2 = s.encode('latin1').decode('utf-8')
            if 'Bejövő' in new_s2:
                new_s = new_s2
        except:
            pass

        if new_s != s:
            db.supabase.table('interactions').update({'summary': new_s}).eq('id', row['id']).execute()
            print(f"Fixed {row['id']}")

if __name__ == "__main__":
    fix_db()
