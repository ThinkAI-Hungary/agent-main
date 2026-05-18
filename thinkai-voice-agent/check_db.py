import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(".env")
supabase_url = os.environ.get("SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_KEY")
supabase = create_client(supabase_url, supabase_key)

res = supabase.table("clients").select("custom_data").eq("id", 5).execute()
print(res.data[0]["custom_data"].get("beszelgetes_naplo", "NINCS"))
