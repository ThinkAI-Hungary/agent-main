import database as db

interactions = db.get_interactions(limit=1000)

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
    'Ã\xad': 'í',
    'cÃ\xadmrÅ‘l': 'címről',
    'Ã­': 'í',
}

fixed_count = 0

for inter in interactions:
    topic = inter.get('topic') or ''
    summary = inter.get('summary') or ''
    
    new_topic = topic
    new_summary = summary
    
    for bad, good in replacements.items():
        new_topic = new_topic.replace(bad, good)
        new_summary = new_summary.replace(bad, good)
        
    new_topic = new_topic.replace('Email Al ', 'Email AI ')
    new_topic = new_topic.replace('Email AI ', 'Email AI ')
        
    if new_topic != topic or new_summary != summary:
        try:
            db.supabase.table("interactions").update({
                "topic": new_topic,
                "summary": new_summary
            }).eq("id", inter['id']).execute()
            fixed_count += 1
            print(f"Fixed interaction {inter['id']}")
        except Exception as e:
            print(f"Failed to fix {inter['id']}: {e}")

print(f"Fixed {fixed_count} interactions.")
