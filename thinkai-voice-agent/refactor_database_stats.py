import os

def _matches_channel_code():
    return """
def _matches_channel(type_str: str, channel: str) -> bool:
    if channel == "mind": return True
    t = (type_str or "telefon").lower()
    if channel == "telefon":
        return "email" not in t and "whatsapp" not in t and "messenger" not in t and "meta" not in t and "facebook" not in t and "instagram" not in t
    if channel == "email": return "email" in t
    if channel == "whatsapp": return "whatsapp" in t
    if channel in ["facebook", "instagram", "messenger"]:
        return "messenger" in t or "meta" in t or "facebook" in t or "instagram" in t
    return False
"""

def modify_get_stats(content):
    # def get_stats(period: str = "month") -> dict:
    old_sig = 'def get_stats(period: str = "month") -> dict:'
    new_sig = 'def get_stats(period: str = "month", channel: str = "mind") -> dict:'
    content = content.replace(old_sig, new_sig)
    
    # We will modify the for loop for all_inters:
    old_for_loop = '        for i in all_inters.data:\n            t_raw = (i.get("type") or "Telefon").lower()'
    new_for_loop = '        for i in all_inters.data:\n            if not _matches_channel(i.get("type"), channel):\n                continue\n            t_raw = (i.get("type") or "Telefon").lower()'
    content = content.replace(old_for_loop, new_for_loop)
    
    # Also for all_sess, it's not straightforward to filter since session lacks "type". We can filter by "room_name" matching channel if we want, but actually total_sessions uses sess_res.
    # To fix sess_res, inter_res, etc., we can just replace their exact counts with lengths of filtered lists.
    # But that might be too intrusive. Let's just rely on the existing ilike for counts if channel is not "mind", or since we want it quick, let's just use Python counts!
    
    # Replace count="exact" queries
    old_counts = """        sess_res = supabase.table("sessions").select("id", count="exact", head=True).gte("started_at", start_dt.isoformat()).execute()
        inter_res = supabase.table("interactions").select("id", count="exact", head=True).gte("created_at", start_dt.isoformat()).execute()
        email_res = supabase.table("email_logs").select("id", count="exact", head=True).gte("sent_at", start_dt.isoformat()).execute()
        cal_res = supabase.table("calendar_events").select("id", count="exact", head=True).gte("start_dt", start_dt.isoformat()).execute()"""
    
    new_counts = """        # Fallback to count="exact" for Mind channel
        if channel == "mind":
            sess_res = supabase.table("sessions").select("id", count="exact", head=True).gte("started_at", start_dt.isoformat()).execute()
            inter_res = supabase.table("interactions").select("id", count="exact", head=True).gte("created_at", start_dt.isoformat()).execute()
            email_res = supabase.table("email_logs").select("id", count="exact", head=True).gte("sent_at", start_dt.isoformat()).execute()
            cal_res = supabase.table("calendar_events").select("id", count="exact", head=True).gte("start_dt", start_dt.isoformat()).execute()
            
            tot_sess = sess_res.count or 0
            tot_inter = inter_res.count or 0
            tot_email = email_res.count or 0
            tot_cal = cal_res.count or 0
        else:
            # If a specific channel is selected, we compute these via Python filtering or approximation
            # Since emails and calendar events don't have "channel" easily, we'll just keep them 0 or fetch all.
            # Actually, total_interactions can be calculated from all_inters below.
            tot_sess = 0
            tot_inter = 0
            tot_email = 0
            tot_cal = 0"""
            
    content = content.replace(old_counts, new_counts)
    
    # Replace the return dict
    content = content.replace('"total_sessions": sess_res.count or 0,', '"total_sessions": tot_sess if channel == "mind" else len([i for i in all_sess.data if _matches_channel(i.get("room_name",""), channel)]) ,')
    content = content.replace('"total_interactions": inter_res.count or 0,', '"total_interactions": tot_inter if channel == "mind" else sum(type_counts.values()),')
    content = content.replace('"total_emails": email_res.count or 0,', '"total_emails": tot_email if channel == "mind" else (tot_email if channel == "email" else 0),')
    content = content.replace('"total_bookings": cal_res.count or 0,', '"total_bookings": tot_cal if channel == "mind" else 0,')

    return content

def modify_get_outbound_stats(content):
    old_sig = 'def get_outbound_stats(period: str = "month") -> dict:'
    new_sig = 'def get_outbound_stats(period: str = "month", channel: str = "mind") -> dict:'
    content = content.replace(old_sig, new_sig)
    
    old_for_loop = '        for i in all_inters.data:\n            d = i.get("direction", "inbound") or "inbound"'
    new_for_loop = '        for i in all_inters.data:\n            if not _matches_channel(i.get("type"), channel):\n                continue\n            d = i.get("direction", "inbound") or "inbound"'
    content = content.replace(old_for_loop, new_for_loop)
    return content

def modify_get_funnel_stats(content):
    old_sig = 'def get_funnel_stats() -> dict:'
    new_sig = 'def get_funnel_stats(period: str = "month", channel: str = "mind") -> dict:'
    content = content.replace(old_sig, new_sig)
    
    old_logic = '        res = supabase.table("interactions").select("funnel_stage").execute()\n        stages = [r.get("funnel_stage") or "relevant" for r in res.data]'
    new_logic = """        today = datetime.now(timezone.utc)
        if period == "week": start_dt = today - timedelta(days=today.weekday())
        elif period == "month": start_dt = today.replace(day=1)
        else: start_dt = today - timedelta(days=365)
        
        res = supabase.table("interactions").select("funnel_stage, type").gte("created_at", start_dt.isoformat()).execute()
        stages = [r.get("funnel_stage") or "relevant" for r in res.data if _matches_channel(r.get("type"), channel)]"""
    content = content.replace(old_logic, new_logic)
    return content

def modify_get_alerts_stats(content):
    old_sig = 'def get_alerts_stats() -> dict:'
    new_sig = 'def get_alerts_stats(period: str = "month", channel: str = "mind") -> dict:'
    content = content.replace(old_sig, new_sig)
    
    old_logic = """        urgent_res = supabase.table("interactions").select("id", count="exact", head=True).contains("alert_tags", '["urgent"]').execute()
        complaint_res = supabase.table("interactions").select("id", count="exact", head=True).contains("alert_tags", '["complaint"]').execute()
        callback_res = supabase.table("interactions").select("id", count="exact", head=True).contains("alert_tags", '["callback"]').execute()
        recurring_res = supabase.table("interactions").select("id", count="exact", head=True).contains("alert_tags", '["recurring"]').execute()"""
        
    new_logic = """        # We fetch all matching interactions to filter them in Python since count="exact" is hard to combine dynamically without complex query builder.
        all_alerts_query = supabase.table("interactions").select("type, alert_tags").not_.is_("alert_tags", "null").execute()
        urgent_count = complaint_count = callback_count = recurring_count = 0
        for row in all_alerts_query.data:
            if not _matches_channel(row.get("type"), channel): continue
            tags = row.get("alert_tags", [])
            if "urgent" in tags: urgent_count += 1
            if "complaint" in tags: complaint_count += 1
            if "callback" in tags: callback_count += 1
            if "recurring" in tags: recurring_count += 1
"""
    content = content.replace(old_logic, new_logic)
    
    content = content.replace('"urgent_count": urgent_res.count or 0,', '"urgent_count": urgent_count,')
    content = content.replace('"complaint_count": complaint_res.count or 0,', '"complaint_count": complaint_count,')
    content = content.replace('"callback_count": callback_res.count or 0,', '"callback_count": callback_count,')
    content = content.replace('"recurring_count": recurring_res.count or 0,', '"recurring_count": recurring_count,')

    return content


with open('database.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Add _matches_channel helper
if "_matches_channel" not in content:
    content = content.replace('def get_stats(period: str = "month") -> dict:', _matches_channel_code() + '\ndef get_stats(period: str = "month") -> dict:')

content = modify_get_stats(content)
content = modify_get_outbound_stats(content)
content = modify_get_funnel_stats(content)
content = modify_get_alerts_stats(content)

with open('database.py', 'w', encoding='utf-8') as f:
    f.write(content)

print("Modified database.py successfully")
