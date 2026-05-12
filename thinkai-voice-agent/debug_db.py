import database as db

res = db.supabase.table('interactions').select('id, summary, ai_draft_response, created_at').order('created_at', desc=True).limit(5).execute()
with open('debug_db.txt', 'w', encoding='utf-8') as f:
    for r in res.data:
        f.write(f"ID: {r['id']} | Summary: {r['summary']} | Time: {r['created_at']}\n")
        f.write(f"Draft: {r.get('ai_draft_response', '')}\n\n")
