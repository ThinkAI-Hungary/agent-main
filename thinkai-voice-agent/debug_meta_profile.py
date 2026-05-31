"""Simulate a Messenger webhook to test the full process_meta_message flow locally."""
import asyncio
import os
import json
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).resolve().parent / ".env")

# Patch: ensure we use the local web_server module
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))

from web_server import process_meta_message, fetch_meta_user_profile

async def test():
    sender_id = "26629190113363954"
    message_text = "Szia, érdeklődnék időpontról"
    source_channel = "Messenger"
    
    # Test 1: fetch_meta_user_profile
    print("=== Test 1: fetch_meta_user_profile ===")
    try:
        name = await fetch_meta_user_profile(sender_id, source_channel)
        print(f"  Result: {name}")
    except Exception as e:
        print(f"  ERROR: {e}")
        import traceback
        traceback.print_exc()
    
    # Test 2: Full process_meta_message
    print("\n=== Test 2: process_meta_message (full flow) ===")
    try:
        await process_meta_message(sender_id, message_text, source_channel)
        print("  Completed without error!")
    except Exception as e:
        print(f"  ERROR: {e}")
        import traceback
        traceback.print_exc()
    
    # Check what was stored
    print("\n=== Check stored data ===")
    import database as db
    client = db.find_client_by_contact(messenger_id=sender_id)
    if client:
        cd = client.get("custom_data", {})
        print(f"  name (top-level): {client.get('name')}")
        print(f"  custom_data.name: {cd.get('name')}")
    
    # Check latest interaction
    result = db.supabase.table("interactions").select("id, ai_draft_response, approval_status").eq("session_id", f"messenger_{sender_id}").order("created_at", desc=True).limit(1).execute()
    if result.data:
        r = result.data[0]
        draft = json.loads(r.get("ai_draft_response", "{}"))
        print(f"  Latest interaction to_name: {draft.get('to_name')}")
        print(f"  approval_status: {r.get('approval_status')}")

asyncio.run(test())
