# -*- coding: utf-8 -*-
import asyncio
import os
import sys
from pathlib import Path

# Add the app directory to sys.path
sys.path.insert(0, "/root/dobozos/thinkai-voice-agent")

from classifier import classify_interaction

async def run_tests():
    print("🚀 Klasszifikációs Pipeline Programmatikus Tesztelés\n")
    
    test_cases = [
        {
            "name": "WhatsApp Időpont Foglalás (Új)",
            "text": "Szeretnék egy új időpontot kérni foghúzásra holnap 10-re.",
            "channel": "whatsapp",
            "tool_calls": [],
            "expected": {"ugytipus": "Időpont", "idopont_altipus": "Új", "statusz": "Nyitott", "teendo": "Időpont véglegesítése"}
        },
        {
            "name": "Email Kérdés (KB-ből válaszolható)",
            "text": "Mennyibe kerül egy fogkőeltávolítás?",
            "channel": "email",
            "tool_calls": ["lookup_info"],
            "expected": {"ugytipus": "Kérdés", "statusz": "Nyitott", "eredmeny": "Válasz előkészítve", "teendo": "Jóváhagyás"}
        },
        {
            "name": "Telefonos Panasz (Sürgős)",
            "text": "Nagyon fáj a fogam a tegnapi kezelés után, ez elviselhetetlen!",
            "channel": "telefon",
            "tool_calls": [],
            "expected": {"ugytipus": "Panasz", "statusz": "Sürgős", "teendo": "Azonnali beavatkozás"}
        },
        {
            "name": "Messenger Időpont Lemondás",
            "text": "Sajnos mégsem tudok menni a mai időpontomra, le szeretném mondani.",
            "channel": "messenger",
            "tool_calls": [],
            "expected": {"ugytipus": "Időpont", "idopont_altipus": "Lemondás", "statusz": "Nyitott"}
        },
        {
            "name": "Telefonos Időpont Foglalás (Sikeres Voice Agent)",
            "text": "Köszönöm a foglalást keddre.",
            "channel": "telefon",
            "tool_calls": ["book_meeting"],
            "expected": {"ugytipus": "Időpont", "idopont_altipus": "Új", "statusz": "Lezárt", "eredmeny": "Új időpont"}
        }
    ]

    success_count = 0
    for case in test_cases:
        print(f"--- Teszt: {case['name']} ---")
        try:
            res = await classify_interaction(
                message_text=case["text"],
                channel=case["channel"],
                tool_calls=case["tool_calls"]
            )
            
            passed = True
            for key, val in case["expected"].items():
                if res.get(key) != val:
                    print(f"  ❌ HIBA: {key} várt: '{val}', kapott: '{res.get(key)}'")
                    passed = False
            
            if passed:
                print(f"  ✅ SIKERES: {res['ugytipus']} -> {res['eredmeny']} ({res['statusz']})")
                success_count += 1
            
        except Exception as e:
            print(f"  💥 KRITIKUS HIBA: {e}")
        print()

    print(f"Eredmény: {success_count}/{len(test_cases)} teszt sikeres.")

if __name__ == "__main__":
    asyncio.run(run_tests())
