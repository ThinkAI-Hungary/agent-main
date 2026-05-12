import re

with open('email_processor.py', 'r', encoding='utf-8') as f:
    text = f.read()

history_code = """
    client = genai.Client(api_key=google_key)
    
    # ELŐZMÉNYEK LEKÉRDEZÉSE
    history_text = ""
    try:
        session_id = f"email_{from_email}"
        history_res = db.supabase.table("interactions").select("summary, ai_draft_response").eq("session_id", session_id).order("created_at", desc=False).execute()
        if history_res.data:
            # Get last 3 interactions to avoid huge prompts
            recent_history = history_res.data[-3:]
            history_text = "--- ELŐZŐ ÜZENETEK (KONTEXTUS A BESZÉLGETÉSHEZ) ---\\n"
            for h in recent_history:
                history_text += f"ÜGYFÉL KORÁBBI E-MAILJE: {h.get('summary', '')}\\n"
                draft_str = h.get('ai_draft_response')
                if draft_str:
                    try:
                        import json
                        draft_obj = json.loads(draft_str)
                        history_text += f"A MI KORÁBBI VÁLASZUNK: {draft_obj.get('body', '')}\\n"
                    except:
                        pass
            history_text += "--------------------------------\\n\\n"
    except Exception as e:
        logger.error(f"Hiba az előzmények lekérdezésekor: {e}")

    user_content = history_text + f"--- ÚJ BEJÖVŐ E-MAIL ---\\nFeladó: {from_name} <{from_email}>\\nTárgy: {subject}\\nÜzenet:\\n{text_content}\\n"
"""

behavior_code = """
    sys_prompt += "\\n\\n--- VISELKEDÉSI SZABÁLYOK A VÁLASZLEVÉLHEZ ---\\n"
    sys_prompt += "1. SOHA ne írd, hogy 'Jó napot!', ha a beszélgetés már elkezdődött (lásd Előző üzenetek). Használj 'Üdvözlöm!' vagy 'Üdvözöljük!' formát, vagy egyből térj a tárgyra.\\n"
    sys_prompt += "2. SOHA ne kérdezd meg, hogy 'Miben segíthetek?', ha az ügyfél már konkrét kérdést tett fel (pl. fogkőeltávolítást kér). Válaszolj közvetlenül a kérdésére (pl. igen, csinálunk ilyet, itt vannak az árak, stb.)! Ne fárasszuk az ügyfelet felesleges kérdésekkel.\\n"
    sys_prompt += "3. Légy célratörő és emberi.\\n"
"""

# Replace the user_content creation block
text = re.sub(
    r'    client = genai\.Client\(api_key=google_key\)\s*user_content = f"--- BEJÖVŐ E-MAIL ---\\nFeladó: \{from_name\} <\{from_email\}>\\nTárgy: \{subject\}\\nÜzenet:\\n\{text_content\}\\n"\s*',
    history_code,
    text
)

# Insert behavior_code right before JSON utasítás
text = text.replace('sys_prompt += f"\\n\\n--- JSON UTASÍTÁS ---\\n{json_instruction}"', behavior_code + '\\n    sys_prompt += f"\\n\\n--- JSON UTASÍTÁS ---\\n{json_instruction}"')

with open('email_processor.py', 'w', encoding='utf-8') as f:
    f.write(text)

print("Patch applied to email_processor.py")
