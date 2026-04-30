import codecs

endpoints_code = """
# ═══════════════════════════════════════════════════════════════════════════════
# JÓVÁHAGYÓ RENDSZER (HUMAN-IN-THE-LOOP) API
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/admin/api/approvals")
def get_approvals_api(status: str = "pending", username: str = Depends(verify_jwt)):
    approvals = db.get_approvals(status)
    return {"approvals": approvals}

@app.post("/admin/api/approvals/{id}/reject")
def reject_approval_api(id: int, username: str = Depends(verify_jwt)):
    success = db.update_approval_status(id, "rejected")
    if success: return {"status": "success"}
    raise HTTPException(status_code=500, detail="Hiba az elutasítás során")

class ApproveRequest(BaseModel):
    modified_draft: str

@app.post("/admin/api/approvals/{id}/approve")
async def approve_approval_api(id: int, req: ApproveRequest, username: str = Depends(verify_jwt)):
    import json
    import httpx
    import base64 as b64module
    
    # 1. Keresés a pending és rejected listában (hátha egy rejected-et hagynak jóvá utólag)
    approvals = db.get_approvals("pending") + db.get_approvals("rejected")
    target = next((a for a in approvals if a.get("id") == id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Piszkozat nem található")
        
    draft_json = target.get("ai_draft_response")
    if not draft_json:
        raise HTTPException(status_code=400, detail="Nincs érvényes piszkozat")
        
    try:
        draft = json.loads(draft_json)
    except:
        raise HTTPException(status_code=400, detail="Érvénytelen JSON piszkozat")
        
    channel = draft.get("channel", "").lower()
    final_text = req.modified_draft
    
    try:
        async with httpx.AsyncClient() as http_client:
            if channel == "email":
                brevo_key = os.getenv("BREVO_API_KEY", "")
                api_key = brevo_key
                if brevo_key and not brevo_key.startswith("xkeysib-"):
                    try:
                        decoded = b64module.b64decode(brevo_key).decode()
                        parsed = json.loads(decoded)
                        api_key = parsed.get("api_key", brevo_key)
                    except: pass
                
                resp = await http_client.post(
                    "https://api.brevo.com/v3/smtp/email",
                    headers={"api-key": api_key, "Content-Type": "application/json"},
                    json={
                        "sender": {"name": "Bégé Design Kft.", "email": "bege@thinkai.hu"},
                        "to": [{"email": draft.get("to_email"), "name": draft.get("to_name", "")}],
                        "subject": draft.get("subject", "Re:"),
                        "htmlContent": f'<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">{final_text}</div>',
                    },
                    timeout=20,
                )
                resp.raise_for_status()
                
            elif channel == "whatsapp":
                wa_token = os.getenv("WHATSAPP_TOKEN", os.getenv("META_PAGE_ACCESS_TOKEN", ""))
                wa_phone_id = draft.get("phone_number_id") or os.getenv("WHATSAPP_PHONE_ID", "")
                if not wa_token or not wa_phone_id:
                    raise Exception("Hiányzó WhatsApp token vagy Phone ID")
                
                resp = await http_client.post(
                    f"https://graph.facebook.com/v25.0/{wa_phone_id}/messages",
                    headers={"Authorization": f"Bearer {wa_token}"},
                    json={
                        "messaging_product": "whatsapp",
                        "to": draft.get("sender_id"),
                        "type": "text",
                        "text": {"body": final_text}
                    }
                )
                resp.raise_for_status()
                
            elif channel in ["messenger", "instagram"]:
                page_access_token = os.getenv("META_PAGE_ACCESS_TOKEN", "")
                if not page_access_token:
                    raise Exception("Hiányzó Meta oldal token")
                    
                resp = await http_client.post(
                    "https://graph.facebook.com/v25.0/me/messages",
                    headers={"Authorization": f"Bearer {page_access_token}"},
                    json={
                        "recipient": {"id": draft.get("sender_id")},
                        "message": {"text": final_text}
                    }
                )
                resp.raise_for_status()
                
    except Exception as e:
        print(f"[Approval Error] Hiba a kiküldéskor: {e}")
        raise HTTPException(status_code=500, detail=str(e))
        
    # 2. Adatbázis frissítése
    draft["body"] = final_text
    new_draft_json = json.dumps(draft)
    success = db.update_approval_status(id, "approved", new_draft=new_draft_json)
    
    if success: return {"status": "success"}
    raise HTTPException(status_code=500, detail="Sikeres küldés, de adatbázis frissítés hibás")
"""

with codecs.open('web_server.py', 'r', 'utf-8') as f:
    content = f.read()

# Insert before if __name__ == "__main__":
if 'if __name__ == "__main__":' in content:
    content = content.replace('if __name__ == "__main__":', endpoints_code + '\n\nif __name__ == "__main__":')
    with codecs.open('web_server.py', 'w', 'utf-8') as f:
        f.write(content)
    print("Endpoints added to web_server.py")
else:
    print("Could not find __main__ block")
