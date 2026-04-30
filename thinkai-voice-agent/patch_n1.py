import os

filename = "database.py"

with open(filename, "r", encoding="utf-8") as f:
    content = f.read()

target = """def get_sessions_with_summary(limit: int = 50) -> list[dict]:
    if not supabase: return []
    try:
        sessions = supabase.table("sessions").select("*").order("started_at", desc=True).limit(limit).execute().data
        for sess in sessions:
            inters = supabase.table("interactions").select("*").eq("session_id", sess["session_id"]).order("created_at", desc=False).execute().data
            sess["interaction_count"] = len(inters)
            sess["interactions"] = inters
            sess["summary"] = _build_session_summary(inters)
        return sessions
    except Exception as e:
        logger.error(f"Sessions with summary error: {e}")
        return []"""

replacement = """def get_sessions_with_summary(limit: int = 50) -> list[dict]:
    if not supabase: return []
    try:
        sessions = supabase.table("sessions").select("*").order("started_at", desc=True).limit(limit).execute().data
        if not sessions:
            return []
            
        session_ids = [s["session_id"] for s in sessions]
        
        # 1 lekérdezéssel lehozzuk az összes interakciót (N+1 query javítás)
        all_inters = supabase.table("interactions").select("*").in_("session_id", session_ids).order("created_at", desc=False).execute().data
        
        inters_by_session = {}
        for inter in all_inters:
            sid = inter.get("session_id")
            if sid not in inters_by_session:
                inters_by_session[sid] = []
            inters_by_session[sid].append(inter)
            
        for sess in sessions:
            inters = inters_by_session.get(sess["session_id"], [])
            sess["interaction_count"] = len(inters)
            sess["interactions"] = inters
            sess["summary"] = _build_session_summary(inters)
        return sessions
    except Exception as e:
        logger.error(f"Sessions with summary error: {e}")
        return []"""

if target in content:
    with open(filename, "w", encoding="utf-8") as f:
        f.write(content.replace(target, replacement))
    print("Siker: N+1 problema javitva a database.py-ban.")
else:
    print("Hiba: A cel kodreszlet nem talalhato. Lehet, hogy mar modositva lett?")
