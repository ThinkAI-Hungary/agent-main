async def process_meta_message(sender_id: str, message_text: str, source_channel: str = "Messenger", phone_number_id: str = None):
    """Aszinkron háttérfeladat a Meta Messenger / Instagram üzenetek feldolgozására."""
    import asyncio
    import json
    from datetime import datetime, timedelta
    from google import genai
    from google.genai import types
    from prompt_utils import get_system_prompt
    import database as db
    import email_processor

    alert_tags_task = asyncio.create_task(analyze_alert_tags(message_text))

    try:
        # 1. Beolvassuk a rendszer promptot
        system_prompt = get_system_prompt()
        today = datetime.now().strftime("%Y-%m-%d (%A)")
        
        # Először is elmentjük a bejövő üzenetet a Kanbanba
        client_data = {"messenger_id": sender_id, "forras_csatorna": source_channel}
        meta_name = await fetch_meta_user_profile(sender_id, source_channel)
        if meta_name:
            client_data["name"] = meta_name
            
        db.upsert_client(client_data, additional_log=f"Ügyfél ({source_channel}): {message_text}")

        # Előzmények beolvasása
        client_record = db.find_client_by_contact(messenger_id=sender_id)
        if client_record:
            try:
                cd = client_record.get("custom_data")
                if isinstance(cd, str):
                    c_data = json.loads(cd or "{}")
                elif isinstance(cd, dict):
                    c_data = cd
                else:
                    c_data = {}
                
                chat_history = c_data.get("beszelgetes_naplo", "")
                if chat_history:
                    if len(chat_history) > 3000:
                        chat_history = "... " + chat_history[-3000:]
                    system_prompt += f"\n\n--- Eddigi beszélgetés előzménye a felhasználóval ---\n{chat_history}\n----------------------------------------------------"
            except Exception as e:
                print(f"[Meta AI Process] Hiba a napló beolvasásakor: {e}")

        # Szabályok
        triage_rules = db.get_triage_rules()
        if triage_rules:
            rules_text = "\n".join([f"- Szabály ID: {r['id']}, Helyzet: {r['situation']}, Prioritás: {r['priority']}" for r in triage_rules])
            system_prompt += f"\n\n--- TRIÁZS SZABÁLYOK ---\nKérlek értékeld a páciens problémáját az alábbi szabályok alapján is. Ha egyezik egy 'Sürgős' prioritású szabállyal, KÖTELEZŐ felvenned az 'urgent' tag-et az alert_tags listába. Ha 'Kiemelt', akkor a 'kiemelt' tag-et!\n{rules_text}\n----------------------------------------------------"

        clinics = db.get_clinics()
        if clinics and len(clinics) > 1:
            clinics_text = ", ".join([f"{c['name_and_address']} (ID: {c['id']})" for c in clinics])
            system_prompt += f"\n\n--- TELEPHELYEK ---\nTöbb telephelyünk van: {clinics_text}. Ha az ügyfél időpontot foglal, KÖTELEZŐ megkérdezned, hogy melyik telephelyet választja! A választott telephely ID-ját a JSON-ben add meg.\n----------------------------------------------------"

        # JSON UTASÍTÁS
        json_instruction = f"""
FONTOS INSTRUKCIÓ: A mai dátum: {today}. Minden dátumot ehhez a dátumhoz viszonyíts!
TE FELADATOD:
Értékeld a beérkezett üzenetet és a beszélgetés előzményeit. Formázz röviden, mint egy Messenger üzenetet. Válaszolj közvetlenül az ügyfélnek.
A kimeneted KIZÁRÓLAG egyetlen valid JSON objektum legyen, minden további markdown formázás (pl. ```json) NÉLKÜL.

JSON STRUKTÚRA:
{{
    "reply_text": "A válaszüzenet szövege. Ez fog kimenni a Messengerre.",
    "kanban_data": {{
        "name": "Ügyfél neve (ha megadta vagy tudod)",
        "email": "Ügyfél e-mailje (ha megadta)",
        "phone": "Telefonszám (ha megadta)",
        "clinic_id": 0, // A telephely ID-ja, ha kiválasztotta, különben 0
        "priority": "Normál" // vagy 'Sürgős', 'Kiemelt' stb. a triázs alapján
    }},
    "meeting": {{
        "title": "Találkozó címe (ha VÉGLEGESÍTVE időpontot foglal, különben null)",
        "date": "YYYY-MM-DD",
        "time": "HH:MM",
        "duration_minutes": 30
    }},
    "action_modify_meeting": {{
        "event_title_to_modify": "A módosítandó esemény címe vagy része (csak ha kéri)",
        "new_date": "YYYY-MM-DD",
        "new_time": "HH:MM"
    }},
    "action_delete_meeting": {{
        "event_title_to_delete": "A törlendő esemény címe vagy része (csak ha lemondja)"
    }},
    "alert_tags": ["urgent", "callback", "kiemelt"] // Válaszd ki, ha releváns, különben üres lista []
}}
FIGYELEM: Ha az eset Sürgős vagy Kiemelt prioritású, VAGY a kérés szerepel a Kivételek (Exceptions) listájában, a "meeting" értéke KÖTELEZŐEN null kell legyen (SZIGORÚAN TILOS időpontot foglalni!).
KIVÉTEL A TILTÁS ALÓL: Ha az ügyfél egyértelműen időpontot kér, de NEM adja meg a panaszát, AKKOR IS FOGLALD LE az időpontot!
"""
        system_prompt += f"\n\n--- JSON UTASÍTÁS ---\n{json_instruction}"

        # 3. Gemini hívás
        client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))
        user_content = f"Ügyfél neve: {meta_name if meta_name else 'Ismeretlen'}\nÚj üzenet: {message_text}"

        try:
            response = await client.aio.models.generate_content(
                model="gemini-2.5-flash",
                contents=user_content,
                config=types.GenerateContentConfig(
                    system_instruction=system_prompt,
                    temperature=0.2,
                    response_mime_type="application/json"
                )
            )
            ai_text = response.text.strip()
        except Exception as e:
            print(f"[Meta AI Process] Kritikus Gemini API Hiba: {e}")
            db.upsert_client({"messenger_id": sender_id}, additional_log=f"[Rendszer] Gemini API hiba: {e}")
            return

        if ai_text.startswith("```json"): ai_text = ai_text[7:]
        if ai_text.startswith("```"): ai_text = ai_text[3:]
        if ai_text.endswith("```"): ai_text = ai_text[:-3]
        ai_text = ai_text.strip()

        try:
            data = json.loads(ai_text)
        except json.JSONDecodeError as e:
            print(f"[Meta AI Process] Hibás JSON válasz: {e}")
            db.upsert_client({"messenger_id": sender_id}, additional_log=f"[Rendszer] Hibás JSON válasz az AI-tól: {e}")
            return

        final_text = data.get("reply_text", "")
        kanban = data.get("kanban_data") or {}
        meeting = data.get("meeting")
        modify_action = data.get("action_modify_meeting")
        delete_action = data.get("action_delete_meeting")
        alert_tags = data.get("alert_tags", [])
        
        booked_meeting = False
        chosen_clinic_id = None

        # --- ACTION: KANBAN ADATOK MENTÉSE ---
        if kanban:
            custom_data = {
                "messenger_id": sender_id,
                "forras_csatorna": source_channel
            }
            if kanban.get("name"): custom_data["name"] = kanban["name"]
            if kanban.get("email"): custom_data["email"] = kanban["email"]
            if kanban.get("phone"): custom_data["phone"] = kanban["phone"]
            if kanban.get("clinic_id"):
                try:
                    custom_data["clinic_id"] = int(kanban["clinic_id"])
                    chosen_clinic_id = int(kanban["clinic_id"])
                except:
                    pass
                    
            custom_data = {k: v for k, v in custom_data.items() if v}
            client_id = db.upsert_client(custom_data)
            
            # Kiemelt eszkaláció
            priority = kanban.get("priority", "Normál")
            if priority == "Kiemelt" or "kiemelt" in alert_tags:
                email_to_send = None
                t_rules = db.get_triage_rules()
                for r in t_rules:
                    if r.get("priority") == "Kiemelt" and r.get("escalation_email"):
                        email_to_send = r["escalation_email"]
                        break
                if email_to_send:
                    name_val = kanban.get("name") or meta_name or "Ismeretlen"
                    contact_val = f"Email: {kanban.get('email', '-')} | Telefon: {kanban.get('phone', '-')}"
                    asyncio.create_task(email_processor.send_escalation_email_to_staff(
                        to_email=email_to_send,
                        patient_name=name_val,
                        patient_contact=contact_val,
                        problem_description=message_text,
                        priority="Kiemelt"
                    ))

        # --- ACTION: NAPTÁR FOGLALÁS ---
        if meeting and meeting.get("title") and meeting.get("date") and meeting.get("time"):
            start_dt_val = f"{meeting['date']}T{meeting['time']}:00"
            existing = db.get_calendar_events()
            if any(ev.get("start_dt") == start_dt_val for ev in existing):
                db.upsert_client({"messenger_id": sender_id}, additional_log="[Rendszer] Figyelmeztetés: Ebbe az időpontba már van foglalás, nem rögzítve.")
            else:
                db.add_calendar_event(
                    title=meeting.get("title", "Konzultáció"),
                    start_dt=start_dt_val,
                    end_dt="",
                    duration_minutes=int(meeting.get("duration_minutes", 30)),
                    attendee=kanban.get("name") or meta_name or "Ismeretlen Ügyfél",
                    attendee_email=kanban.get("email", "-")
                )
                db.upsert_client({"messenger_id": sender_id}, additional_log=f"[Rendszer] Naptár bejegyzés létrehozva: {start_dt_val}")
                booked_meeting = True

        # --- ACTION: NAPTÁR MÓDOSÍTÁS ---
        if modify_action and modify_action.get("event_title_to_modify"):
            ev_title = modify_action["event_title_to_modify"]
            found = db.find_calendar_event_by_title(ev_title)
            if found:
                updates = {}
                old_dt = datetime.fromisoformat(found["start_dt"])
                d = modify_action.get("new_date") or old_dt.strftime("%Y-%m-%d")
                t = modify_action.get("new_time") or old_dt.strftime("%H:%M")
                new_start = datetime.fromisoformat(f"{d}T{t}:00")
                dur = found.get("duration_minutes", 30)
                updates["start_dt"] = new_start.isoformat()
                updates["end_dt"] = (new_start + timedelta(minutes=dur)).isoformat()
                db.update_calendar_event(found["id"], **updates)
                db.upsert_client({"messenger_id": sender_id}, additional_log=f"[Rendszer] Naptár bejegyzés módosítva: {found['title']}")
            else:
                db.upsert_client({"messenger_id": sender_id}, additional_log=f"[Rendszer] Módosítás sikertelen, nem található: {ev_title}")

        # --- ACTION: NAPTÁR TÖRLÉS ---
        if delete_action and delete_action.get("event_title_to_delete"):
            ev_title = delete_action["event_title_to_delete"]
            found = db.find_calendar_event_by_title(ev_title)
            if found:
                db.delete_calendar_event(found["id"])
                db.upsert_client({"messenger_id": sender_id}, additional_log=f"[Rendszer] Naptár bejegyzés törölve: {found['title']}")
            else:
                db.upsert_client({"messenger_id": sender_id}, additional_log=f"[Rendszer] Törlés sikertelen, nem található: {ev_title}")

        # 4. Válasz rögzítése a Kanbanba
        if final_text:
            db.upsert_client({"messenger_id": sender_id, "forras_csatorna": source_channel}, additional_log=f"AI Válasz: {final_text}")
            
            f_stage = "foglalt" if booked_meeting else "valaszolt"
            
            # Piszkozat készítése
            draft_payload = {
                "channel": source_channel,
                "sender_id": sender_id,
                "to_name": meta_name if meta_name else sender_id,
                "phone_number_id": phone_number_id,
                "body": final_text
            }
            draft_json = json.dumps(draft_payload)
            
            session_id = f"{source_channel.lower()}_{sender_id}"
            db.create_session(session_id=session_id, room_name=f"{source_channel} Chat", participant=meta_name if meta_name else "Ismeretlen")
            
            # alert tags beolvasása az aszinkron feladatból, ha az AI nem adott
            tags_from_ai = alert_tags if isinstance(alert_tags, list) else []
            try:
                tags_from_task = await alert_tags_task
                if not tags_from_task: tags_from_task = []
            except:
                tags_from_task = []
                
            combined_tags = list(set(tags_from_ai + tags_from_task))
            
            # Logolás az interactions táblába + approval
            db.log_interaction(
                type=source_channel.lower(),
                topic=f"{source_channel} AI válasz",
                summary=message_text,
                result="Várakozik jóváhagyásra",
                tool_name="process_meta_message",
                session_id=session_id,
                direction="inbound",
                funnel_stage=f_stage,
                alert_tags=combined_tags,
                handover_reason=None,
                approval_status="pending",
                ai_draft_response=draft_json,
                clinic_id=str(chosen_clinic_id) if chosen_clinic_id else None
            )

    except Exception as e:
        print(f"[Meta AI Process] Hiba: {e}")
