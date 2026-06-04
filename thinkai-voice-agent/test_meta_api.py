"""Test Meta API profile fetch directly"""
import asyncio
import os
from dotenv import load_dotenv
load_dotenv()

token = os.getenv("META_PAGE_ACCESS_TOKEN")
print(f"Token exists: {bool(token)}")
if token:
    print(f"Token first 20 chars: {token[:20]}...")

async def test_fetch():
    import httpx
    
    # Get the latest sender_id from DB
    import database as db
    db.init_db()
    
    # Check latest interactions
    interactions = db.supabase.table("interactions").select("session_id, ai_draft_response, created_at").order("created_at", desc=True).limit(5).execute().data
    print(f"\n=== Latest 5 interactions ===")
    for i in interactions:
        print(f"  {i['created_at']} | {i['session_id']}")
    
    # Try to fetch the profile for the latest messenger sender
    for i in interactions:
        sid = i.get("session_id", "")
        if sid.startswith("messenger_"):
            psid = sid[10:]
            print(f"\n=== Testing Meta API for PSID: {psid} ===")
            
            url = f"https://graph.facebook.com/v25.0/{psid}?fields=first_name,last_name,profile_pic&access_token={token}"
            async with httpx.AsyncClient() as client:
                resp = await client.get(url, timeout=10.0)
                print(f"Status: {resp.status_code}")
                print(f"Response: {resp.text[:500]}")
            break

asyncio.run(test_fetch())
