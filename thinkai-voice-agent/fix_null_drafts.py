import os
from supabase import create_client
from dotenv import load_dotenv
import json

load_dotenv()
supabase = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))

res = supabase.table("interactions").select("*").eq("approval_status", "pending").is_("ai_draft_response", "null").execute()

for r in res.data:
    dummy = {
        "channel": r.get("type", "email").capitalize(),
        "to_email": "example@example.com",
        "to_name": "Ügyfél",
        "subject": "Re: " + (r.get("topic") or "Megkeresés"),
        "body": "Kedves Ügyfelünk!\n\nKöszönjük a megkeresést. Ez egy utólag generált piszkozat, mivel a rendszer frissítése előtt érkezett be az üzenet.\n\nÜdvözlettel,\nThinkAI"
    }
    supabase.table("interactions").update({"ai_draft_response": json.dumps(dummy)}).eq("id", r["id"]).execute()
    print(f"Fixed interaction ID: {r['id']}")
