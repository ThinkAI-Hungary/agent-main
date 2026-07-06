# -*- coding: utf-8 -*-
import asyncio
import json
import os
from pathlib import Path
from dotenv import load_dotenv

# Load env manually
env_path = Path(__file__).resolve().parent / ".env"
if env_path.exists():
    with open(env_path) as f:
        for line in f:
            if "GEMINI_API_KEY" in line or "GOOGLE_API_KEY" in line:
                key = line.split("=")[1].strip().strip('"').strip("'")
                # Set both to be safe
                os.environ["GEMINI_API_KEY"] = key
                os.environ["GOOGLE_API_KEY"] = key
                break

from classifier import classify_interaction
import database as db

async def run_tests():
    print("🚀 Starting Programmatic Classification Tests on REBUILD branch...")
    db.init_db()
    
    test_cases = [
        {
            "name": "WhatsApp - Erős Panasz",
            "text": "Nagyon dühös vagyok, elrontották a fogamat tegnap és most iszonyatosan fáj! Azonnali segítséget kérek!",
            "channel": "whatsapp",
            "tools": [],
            "expected_ugytipus": "Panasz",
            "expected_statusz": "Sürgős"
        },
        {
            "name": "Email - Általános Kérdés (KB megválaszolta)",
            "text": "Jó napot, érdeklődnék, hogy van-e parkolási lehetőség a rendelő közelében?",
            "channel": "email",
            "tools": ["lookup_info"],
            "expected_ugytipus": "Kérdés",
            "expected_statusz": "Nyitott", # Mert emailnél jóváhagyás kell
            "expected_teendo": "Jóváhagyás"
        },
        {
            "name": "Telefon - Sikeres Időpontfoglalás",
            "text": "Szeretnék holnapra egy konzultációt. Igen, a 10 óra megfelel. Köszönöm, le is foglaltam az időpontot.",
            "channel": "telefon",
            "tools": ["book_meeting"],
            "expected_ugytipus": "Időpont",
            "expected_statusz": "Lezárt"
        },
        {
            "name": "Email - Időpont Lemondás",
            "text": "Sajnos mégsem tudok menni a holnapi időpontomra, kérlek töröljétek.",
            "channel": "email",
            "tools": [],
            "expected_ugytipus": "Időpont",
            "expected_altipus": "Lemondás",
            "expected_statusz": "Nyitott",
            "expected_teendo": "Törlés a naptárból"
        }
    ]

    passed = 0
    for tc in test_cases:
        print(f"\n--- Test: {tc['name']} ---")
        try:
            res = await classify_interaction(
                message_text=tc["text"],
                channel=tc["channel"],
                tool_calls=tc["tools"]
            )
            
            # Validation
            u_ok = res.get("ugytipus") == tc["expected_ugytipus"]
            s_ok = res.get("statusz") == tc["expected_statusz"]
            
            # Special checks
            alt_ok = True
            if "expected_altipus" in tc:
                alt_ok = res.get("idopont_altipus") == tc["expected_altipus"]
            
            t_ok = True
            if "expected_teendo" in tc:
                t_ok = tc["expected_teendo"] in res.get("teendo", "")

            if u_ok and s_ok and alt_ok and t_ok:
                print(f"✅ PASSED")
                passed += 1
            else:
                print(f"❌ FAILED")
                print(f"   Got: {res}")
                print(f"   Expected: {tc['expected_ugytipus']} / {tc['expected_statusz']}")
        except Exception as e:
            print(f"💥 ERROR: {e}")

    print(f"\n📊 Summary: {passed}/{len(test_cases)} tests passed.")

if __name__ == "__main__":
    asyncio.run(run_tests())
