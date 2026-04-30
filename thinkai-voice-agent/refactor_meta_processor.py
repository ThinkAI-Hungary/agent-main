import codecs
import re

with codecs.open('web_server.py', 'r', 'utf-8') as f:
    content = f.read()

# Replace db.log_interaction call and the async with httpx block
old_block_regex = r'(\s*)db\.log_interaction\([\s\S]*?result="Üzenet generálva",[\s\S]*?alert_tags=alert_tags if isinstance\(alert_tags, list\) else \[\]\n\s*\)\n\s*async with httpx\.AsyncClient\(\) as http_client:[\s\S]*?print\(f"\[Meta AI Process\] META_PAGE_ACCESS_TOKEN hiányzik, \{source_channel\} üzenet nem lett elküldve\."\)'

# Wait, if there are spaces or different strings, I should match carefully.
# Let's search from db.log_interaction to the end of the else block
old_str_start = '''            db.log_interaction(
                type=source_channel.lower(),
                topic=f"{source_channel} AI válasz",
                summary=final_text[:100],
                result="Üzenet generálva",
                tool_name="process_meta_message",
                session_id=session_id,
                funnel_stage=f_stage,
                alert_tags=alert_tags if isinstance(alert_tags, list) else []
            )

            async with httpx.AsyncClient() as http_client:
                if source_channel == "WhatsApp":
                    wa_token = os.getenv("WHATSAPP_TOKEN", os.getenv("META_PAGE_ACCESS_TOKEN", ""))
                    wa_phone_id = phone_number_id or os.getenv("WHATSAPP_PHONE_ID", "")
                    
                    if wa_token and wa_phone_id:
                        send_endpoint = f"https://graph.facebook.com/v25.0/{wa_phone_id}/messages"
                        payload = {
                            "messaging_product": "whatsapp",
                            "to": sender_id,
                            "type": "text",
                            "text": {"body": final_text}
                        }
                        fb_resp = await http_client.post(
                            send_endpoint,
                            headers={"Authorization": f"Bearer {wa_token}"},
                            json=payload
                        )
                        print(f"[Meta AI Process] Graph API response (WhatsApp): {fb_resp.status_code} - {fb_resp.text}")
                    else:
                        print("[Meta AI Process] Hiba: WhatsApp üzenet nem lett elküldve, mert hiányzik a WHATSAPP_TOKEN vagy WHATSAPP_PHONE_ID.")
                        
                else:
                    # Messenger / Instagram
                    page_access_token = os.getenv("META_PAGE_ACCESS_TOKEN", "")
                    if page_access_token:
                        send_endpoint = "https://graph.facebook.com/v25.0/me/messages"
                        payload = {
                            "recipient": {"id": sender_id},
                            "message": {"text": final_text}
                        }
                        
                        fb_resp = await http_client.post(
                            send_endpoint,
                            headers={"Authorization": f"Bearer {page_access_token}"},
                            json=payload
                        )
                        print(f"[Meta AI Process] Graph API response ({source_channel}): {fb_resp.status_code} - {fb_resp.text}")
                    else:
                        print(f"[Meta AI Process] META_PAGE_ACCESS_TOKEN hiányzik, {source_channel} üzenet nem lett elküldve.")'''

new_str = '''            import json
            draft_payload = {
                "channel": source_channel,
                "sender_id": sender_id,
                "phone_number_id": phone_number_id,
                "body": final_text
            }
            draft_json = json.dumps(draft_payload)
            
            db.log_interaction(
                type=source_channel.lower(),
                topic=f"{source_channel} AI válasz",
                summary=final_text[:100],
                result="Piszkozat mentve",
                tool_name="process_meta_message",
                session_id=session_id,
                funnel_stage=f_stage,
                alert_tags=alert_tags if isinstance(alert_tags, list) else [],
                approval_status="pending",
                ai_draft_response=draft_json
            )
            print(f"[Meta AI Process] {source_channel} piszkozat mentve jóváhagyásra.")'''

if old_str_start in content:
    content = content.replace(old_str_start, new_str)
    print("Replaced Meta logic successfully.")
else:
    print("WARNING: Could not find exact block to replace.")

with codecs.open('web_server.py', 'w', 'utf-8') as f:
    f.write(content)
