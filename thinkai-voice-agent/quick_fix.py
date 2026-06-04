import database as db
db.init_db()
import asyncio, httpx, os
from dotenv import load_dotenv
load_dotenv()
token = os.getenv("META_PAGE_ACCESS_TOKEN")

async def fix():
    async with httpx.AsyncClient() as c:
        r = await c.get(f"https://graph.facebook.com/v25.0/26629190113363954?fields=first_name,last_name&access_token={token}", timeout=10)
        d = r.json()
        name = f"{d.get('first_name','')} {d.get('last_name','')}".strip()
        # Fix ALL Névtelen clients with this messenger_id
        clients = db.supabase.table("clients").select("id,name,custom_data").execute().data
        for cl in clients:
            if cl["name"] in ("Névtelen","Ismeretlen",None,""):
                cd = cl.get("custom_data") or {}
                if cd.get("messenger_id") == "26629190113363954":
                    cd["name"] = name
                    db.edit_client_details(cl["id"], cd)
                    print(f"Fixed #{cl['id']} -> {name}")
        db.update_session_participant("messenger_26629190113363954", name)
        print("Done")

asyncio.run(fix())
