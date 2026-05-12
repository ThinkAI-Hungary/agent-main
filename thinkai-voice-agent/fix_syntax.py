import sys

with open('email_processor.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

start_idx = -1
end_idx = -1

for i, line in enumerate(lines):
    if "client = genai.Client(api_key=google_key)" in line:
        start_idx = i
    if "logger.info(f\"Gemini 2.5 Flash elemzi az e-mailt:" in line:
        end_idx = i

if start_idx != -1 and end_idx != -1 and start_idx < end_idx:
    new_code = """    client = genai.Client(api_key=google_key)
    
    # ELŐZMÉNYEK LEKÉRDEZÉSE
    history_text = ""
    try:
        session_id = f"email_{from_email}"
        history_res = db.supabase.table("interactions").select("summary, ai_draft_response").eq("session_id", session_id).order("created_at", desc=False).execute()
        if history_res.data:
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
        
    triage_rules = db.get_triage_rules()
    if triage_rules:
        rules_text = "\\n".join([f"- Szabály ID: {r['id']}, Helyzet: {r['situation']}, Prioritás: {r['priority']}" for r in triage_rules])
        sys_prompt += f"\\n\\n--- TRIÁZS SZABÁLYOK ---\\nKérlek értékeld az e-mail tartalmát az alábbi szabályok alapján is. Ha egyezik egy 'Sürgős' szabállyal, KÖTELEZŐ felvenned az 'urgent' tag-et az alert_tags listába!\\n{rules_text}\\n"

    sys_prompt += "\\n\\n--- VISELKEDÉSI SZABÁLYOK A VÁLASZLEVÉLHEZ ---\\n"
    sys_prompt += "1. SOHA ne írd, hogy 'Jó napot!' vagy más sablonos köszönést, ha a beszélgetés már elkezdődött (lásd Előző üzenetek). Ha ez a legelső üzenet, akkor is maximum egy 'Üdvözlöm!' elegendő.\\n"
    sys_prompt += "2. SOHA ne kérdezd meg, hogy 'Miben segíthetek?', ha az ügyfél már konkrét kérdést tett fel (pl. 'érdeklődnék hogy foglalkoznak-e fogkőeltávolítással'). Válaszolj közvetlenül és felesleges udvariaskodás nélkül a kérdésére (pl. 'Igen, foglalkozunk fogkőeltávolítással, az áraink...', stb.)! Ne fárasszuk az ügyfelet felesleges kérdésekkel, ha már tudjuk mit akar.\\n"
    sys_prompt += "3. Légy célratörő, lényegretörő és emberi.\\n"
    sys_prompt += f"\\n\\n--- JSON UTASÍTÁS ---\\n{json_instruction}"

"""
    lines = lines[:start_idx] + [new_code] + lines[end_idx:]
    
    with open('email_processor.py', 'w', encoding='utf-8') as f:
        f.writelines(lines)
    print("Fixed syntax errors successfully.")
else:
    print("Could not find start/end indices.")
