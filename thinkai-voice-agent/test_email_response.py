# -*- coding: utf-8 -*-
import asyncio
import os
from pathlib import Path
from dotenv import load_dotenv

# Load env
env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(env_path)

import database as db
import email_processor

async def test_email():
    print("📧 Testing Email AI Response...")
    db.init_db()
    
    from_email = "test_peter@example.com"
    from_name = "Teszt Péter"
    subject = "Érdeklődés nyitvatartásról"
    text_content = "Jó napot, érdeklődnék, hogy szombaton nyitva vannak-e? Valamint mi a pontos nevük és címük?"

    print(f"Incoming Email: {text_content}")
    print("Processing...")
    
    # We call the internal logic of process_single_email but capture the output
    # Since process_single_email is designed to log to DB, we'll check the latest interaction
    await email_processor.process_single_email(from_email, from_name, subject, text_content)
    
    # Fetch the latest interaction for this session
    session_id = f"email_{from_email}"
    res = db.supabase.table("interactions").select("id, ai_draft_response, summary").eq("session_id", session_id).order("id", desc=True).limit(1).execute()
    
    if res.data:
        interaction = res.data[0]
        draft = interaction.get("ai_draft_response")
        print("\n--- AI DRAFT RESPONSE ---")
        if draft:
            import json
            try:
                draft_obj = json.loads(draft)
                print(f"Reply: {draft_obj.get('email_reply')}")
                print(f"Kanban Data: {draft_obj.get('kanban_data')}")
            except:
                print(f"Raw draft: {draft}")
        else:
            print("No draft found.")
    else:
        print("No interaction logged.")

if __name__ == "__main__":
    asyncio.run(test_email())
