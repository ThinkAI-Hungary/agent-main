import json
import re
import database as db

def clean_drafts():
    res = db.supabase.table('interactions').select('id, ai_draft_response').execute()
    for row in res.data:
        draft_str = row.get('ai_draft_response')
        if not draft_str:
            continue
            
        try:
            draft_obj = json.loads(draft_str)
            body = draft_obj.get('body', '')
            if '<ul>' in body or '<li>' in body:
                # Replace <li> with '- '
                new_body = re.sub(r'<li>', '- ', body)
                # Remove <ul>, </ul>, </li>
                new_body = re.sub(r'</?ul>|</li>', '', new_body)
                # Replace <br> with \n
                new_body = re.sub(r'<br\s*/?>', '\n', new_body)
                # Fix double newlines that might have been introduced
                new_body = re.sub(r'\n{3,}', '\n\n', new_body)
                
                draft_obj['body'] = new_body.strip()
                
                db.supabase.table('interactions').update({'ai_draft_response': json.dumps(draft_obj)}).eq('id', row['id']).execute()
                print(f"Cleaned HTML from draft ID {row['id']}")
        except Exception as e:
            print(f"Error processing row {row['id']}: {e}")

if __name__ == "__main__":
    clean_drafts()
