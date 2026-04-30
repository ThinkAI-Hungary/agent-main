import codecs

# 1. Update database.py
with codecs.open('database.py', 'r', 'utf-8') as f:
    db_content = f.read()

old_db = """def update_approval_status(interaction_id: int, status: str, new_draft: str = None) -> bool:"""
new_db = """def delete_approvals(interaction_ids: list[int]) -> bool:
    if not supabase: return False
    try:
        supabase.table('interactions').delete().in_('id', interaction_ids).execute()
        return True
    except Exception as e:
        logger.error(f'Error deleting approvals: {e}')
        return False

def update_approval_status(interaction_id: int, status: str, new_draft: str = None) -> bool:"""

if 'def delete_approvals' not in db_content:
    db_content = db_content.replace(old_db, new_db)

with codecs.open('database.py', 'w', 'utf-8') as f:
    f.write(db_content)

# 2. Update web_server.py
with codecs.open('web_server.py', 'r', 'utf-8') as f:
    web_content = f.read()

old_web = """class ApproveRequest(BaseModel):"""
new_web = """class DeleteApprovalsRequest(BaseModel):
    ids: list[int]

@app.delete("/admin/api/approvals")
def delete_approvals_api(req: DeleteApprovalsRequest, username: str = Depends(verify_jwt)):
    success = db.delete_approvals(req.ids)
    if success: return {"status": "success"}
    raise HTTPException(status_code=500, detail="Hiba a törlés során")

class ApproveRequest(BaseModel):"""

if 'def delete_approvals_api' not in web_content:
    web_content = web_content.replace(old_web, new_web)

with codecs.open('web_server.py', 'w', 'utf-8') as f:
    f.write(web_content)
