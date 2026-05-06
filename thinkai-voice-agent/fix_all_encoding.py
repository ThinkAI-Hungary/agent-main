import database as db

replacements = {
    'Ã¡': 'á',
    'Ã©': 'é',
    'Ã\xad': 'í',  
    'Ã³': 'ó',
    'Ã¶': 'ö',
    'Å‘': 'ő',
    'Ãº': 'ú',
    'Ã¼': 'ü',
    'Å±': 'ű',
    'Ã\x81': 'Á',
    'Ã‰': 'É',
    'Ã\x8d': 'Í',
    'Ã“': 'Ó',
    'Ã–': 'Ö',
    'Å\x90': 'Ő',
    'Ãš': 'Ú',
    'Ãœ': 'Ü',
    'Å°': 'Ű',
    'Ã­': 'í',
    'cÃ­mrÅ‘l': 'címről',
    'BejÃ¶vÅ‘': 'Bejövő',
    'TÃ¡rgy:': 'Tárgy:',
    'íœzenet:': 'Üzenet:',
}

def fix_string(text):
    if not text:
        return text
    new_text = text
    for bad, good in replacements.items():
        new_text = new_text.replace(bad, good)
    # Also handle some edge cases for email processor
    new_text = new_text.replace('BEJÃ–VŐ', 'BEJÖVŐ')
    new_text = new_text.replace('Ãœzenet:', 'Üzenet:')
    new_text = new_text.replace('BejövÅ‘', 'Bejövő')
    return new_text

# 1. Fix interactions
try:
    interactions = db.get_interactions(limit=5000)
    fixed_count = 0
    for inter in interactions:
        updates = {}
        for field in ['topic', 'summary', 'transcript', 'ai_draft_response']:
            val = inter.get(field)
            if isinstance(val, str):
                fixed_val = fix_string(val)
                if fixed_val != val:
                    updates[field] = fixed_val
        if updates:
            db.supabase.table("interactions").update(updates).eq("id", inter['id']).execute()
            fixed_count += 1
    print(f"Fixed {fixed_count} interactions.")
except Exception as e:
    print("Error fixing interactions:", e)

# 2. Fix clients
try:
    clients = db.supabase.table("clients").select("*").execute().data
    fixed_count = 0
    for client in clients:
        updates = {}
        custom_data = client.get('custom_data') or {}
        custom_data_updated = False
        
        # Check custom_data string fields
        for k, v in custom_data.items():
            if isinstance(v, str):
                fixed_v = fix_string(v)
                if fixed_v != v:
                    custom_data[k] = fixed_v
                    custom_data_updated = True
        
        if custom_data_updated:
            updates['custom_data'] = custom_data
            
        additional_log = client.get('additional_log')
        if additional_log and isinstance(additional_log, str):
            fixed_log = fix_string(additional_log)
            if fixed_log != additional_log:
                updates['additional_log'] = fixed_log
                
        if updates:
            db.supabase.table("clients").update(updates).eq("id", client['id']).execute()
            fixed_count += 1
    print(f"Fixed {fixed_count} clients.")
except Exception as e:
    print("Error fixing clients:", e)

# 3. Fix email_processor.py file content
try:
    with open('email_processor.py', 'r', encoding='utf-8') as f:
        content = f.read()
    
    fixed_content = fix_string(content)
    
    if fixed_content != content:
        with open('email_processor.py', 'w', encoding='utf-8') as f:
            f.write(fixed_content)
        print("Fixed email_processor.py")
    else:
        print("email_processor.py unchanged")
except Exception as e:
    print("Error fixing email_processor.py:", e)
