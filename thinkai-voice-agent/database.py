"""
ThinkAI Voice Agent — Supabase Database Layer
All persistent data: calendar, emails, tasks, sessions, interactions, admin users.
"""

import os
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path

from loguru import logger
from supabase import create_client, Client
from dotenv import load_dotenv

THIS_DIR = Path(__file__).resolve().parent
load_dotenv(THIS_DIR / ".env")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    logger.warning("SUPABASE_URL or SUPABASE_KEY missing from .env!")
    supabase: Client = None
else:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def init_db():
    if supabase:
        logger.info(f"Connected to Supabase Cloud at {SUPABASE_URL}")
    else:
        logger.error("Supabase client not initialized.")

# ═══════════════════════════════════════════════════════════════════════════════
# ADMIN USERS
# ═══════════════════════════════════════════════════════════════════════════════

def _hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    hashed = hashlib.sha256(f"{salt}{password}".encode()).hexdigest()
    return f"{salt}:{hashed}"

def _verify_password(password: str, stored_hash: str) -> bool:
    try:
        salt, hashed = stored_hash.split(":", 1)
        return hashlib.sha256(f"{salt}{password}".encode()).hexdigest() == hashed
    except Exception:
        return False

def create_admin_user(username: str, password: str, email: str = "") -> bool:
    if not supabase: return False
    try:
        res = supabase.table("admin_users").select("*").eq("username", username).execute()
        if res.data:
            logger.warning(f"Admin user already exists: {username}")
            return False
        
        supabase.table("admin_users").insert({
            "username": username,
            "email": email,
            "password_hash": _hash_password(password)
        }).execute()
        logger.info(f"Admin user created: {username}")
        return True
    except Exception as e:
        logger.error(f"Error creating admin user: {e}")
        return False

def verify_admin_user(username: str, password: str) -> dict | None:
    if not supabase: return None
    try:
        res = supabase.table("admin_users").select("*").eq("username", username).execute()
        if res.data:
            user = res.data[0]
            if _verify_password(password, user["password_hash"]):
                return {"id": user["id"], "username": user["username"], "email": user["email"]}
    except Exception as e:
        logger.error(f"Error verifying admin: {e}")
    return None

def seed_admin_from_env():
    username = os.getenv("ADMIN_USERNAME", "admin")
    password = os.getenv("ADMIN_PASSWORD", "thinkai2026")
    email = os.getenv("ADMIN_EMAIL", "")
    created = create_admin_user(username, password, email)
    if created:
        logger.info(f"Seeded admin user from env: {username}")

# ═══════════════════════════════════════════════════════════════════════════════
# SESSIONS
# ═══════════════════════════════════════════════════════════════════════════════

def create_session(session_id: str, room_name: str, participant: str = "") -> None:
    if not supabase: return
    try:
        supabase.table("sessions").insert({
            "session_id": session_id,
            "room_name": room_name,
            "started_at": datetime.now(timezone.utc).isoformat(),
            "participant": participant
        }).execute()
    except Exception as e:
        logger.error(f"Error creating session: {e}")

def close_session(session_id: str) -> None:
    if not supabase: return
    try:
        res = supabase.table("sessions").select("started_at").eq("session_id", session_id).execute()
        if res.data:
            started_at = datetime.fromisoformat(res.data[0]["started_at"].replace("Z", "+00:00"))
            duration = int((datetime.now(timezone.utc) - started_at).total_seconds())
            supabase.table("sessions").update({
                "ended_at": datetime.now(timezone.utc).isoformat(),
                "duration_seconds": duration
            }).eq("session_id", session_id).execute()
    except Exception as e:
        logger.error(f"Error closing session: {e}")

def get_sessions(limit: int = 50) -> list[dict]:
    if not supabase: return []
    try:
        return supabase.table("sessions").select("*").order("started_at", desc=True).limit(limit).execute().data
    except Exception:
        return []

# ═══════════════════════════════════════════════════════════════════════════════
# INTERACTIONS
# ═══════════════════════════════════════════════════════════════════════════════

def log_interaction(type: str, topic: str = "", summary: str = "", result: str = "", tool_name: str = "", session_id: str = "", funnel_stage: str = "relevant", alert_tags: list = None, handover_reason: str = None, direction: str = "inbound") -> None:
    if not supabase: return
    try:
        supabase.table("interactions").insert({
            "session_id": session_id or None,
            "type": type,
            "topic": topic,
            "summary": summary,
            "result": result,
            "tool_name": tool_name or None,
            "funnel_stage": funnel_stage,
            "alert_tags": alert_tags or [],
            "handover_reason": handover_reason,
            "direction": direction
        }).execute()
    except Exception as e:
        logger.error(f"Error logging interaction: {e}")

# ═══════════════════════════════════════════════════════════════════════════════
# CALENDAR
# ═══════════════════════════════════════════════════════════════════════════════

def get_calendar_events() -> list[dict]:
    if not supabase: return []
    try:
        res = supabase.table("calendar_events").select("*").order("start_dt", desc=False).execute()
        return res.data
    except Exception:
        return []

def add_calendar_event(title, start_dt, end_dt, duration_minutes, attendee="", attendee_email="") -> int:
    if not supabase: return 0
    try:
        res = supabase.table("calendar_events").insert({
            "title": title,
            "start_dt": start_dt,
            "end_dt": end_dt,
            "duration_minutes": duration_minutes,
            "attendee": attendee,
            "attendee_email": attendee_email
        }).execute()
        return res.data[0]["id"] if res.data else 0
    except Exception as e:
        logger.error(f"Add event error: {e}")
        return 0

def update_calendar_event(event_id: int, **fields) -> bool:
    if not supabase: return False
    allowed = {"title", "start_dt", "end_dt", "duration_minutes", "attendee", "attendee_email"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates: return False
    try:
        supabase.table("calendar_events").update(updates).eq("id", event_id).execute()
        return True
    except Exception:
        return False

def delete_calendar_event(event_id: int) -> bool:
    if not supabase: return False
    try:
        supabase.table("calendar_events").delete().eq("id", event_id).execute()
        return True
    except Exception:
        return False

def find_calendar_event_by_title(title_fragment: str) -> dict | None:
    if not supabase: return None
    try:
        res = supabase.table("calendar_events").select("*").ilike("title", f"%{title_fragment}%").order("start_dt", desc=False).limit(1).execute()
        return res.data[0] if res.data else None
    except Exception:
        return None

# ═══════════════════════════════════════════════════════════════════════════════
# EMAIL LOGS
# ═══════════════════════════════════════════════════════════════════════════════

def add_email_log(to_name, to_email, subject, message, status, error="", session_id="") -> int:
    if not supabase: return 0
    try:
        res = supabase.table("email_logs").insert({
            "to_name": to_name,
            "to_email": to_email,
            "subject": subject,
            "message": message,
            "status": status,
            "error": error or None,
            "session_id": session_id or None
        }).execute()
        return res.data[0]["id"] if res.data else 0
    except Exception:
        return 0

def get_email_logs(limit: int = 100) -> list[dict]:
    if not supabase: return []
    try:
        res = supabase.table("email_logs").select("*").order("sent_at", desc=True).limit(limit).execute()
        return res.data
    except Exception:
        return []

# ═══════════════════════════════════════════════════════════════════════════════
# TASKS
# ═══════════════════════════════════════════════════════════════════════════════

def add_task(text, priority="normal", due_date="", session_id="") -> int:
    if not supabase: return 0
    try:
        res = supabase.table("tasks").insert({
            "text": text,
            "priority": priority,
            "due_date": due_date or None,
            "session_id": session_id or None
        }).execute()
        return res.data[0]["id"] if res.data else 0
    except Exception:
        return 0

def get_tasks(completed: bool | None = None, limit: int = 100) -> list[dict]:
    if not supabase: return []
    try:
        query = supabase.table("tasks").select("*").order("created_at", desc=True).limit(limit)
        if completed is not None:
            query = query.eq("completed", 1 if completed else 0)
        res = query.execute()
        return res.data
    except Exception:
        return []

def update_task_complete(task_id: int) -> dict:
    if not supabase: return {"ok": False}
    try:
        res = supabase.table("tasks").select("completed").eq("id", task_id).execute()
        if not res.data: return {"ok": False}
        new_val = 0 if res.data[0]["completed"] else 1
        supabase.table("tasks").update({"completed": new_val}).eq("id", task_id).execute()
        return {"ok": True, "completed": bool(new_val)}
    except Exception:
        return {"ok": False}

def delete_task(task_id: int) -> bool:
    if not supabase: return False
    try:
        supabase.table("tasks").delete().eq("id", task_id).execute()
        return True
    except Exception:
        return False

# ═══════════════════════════════════════════════════════════════════════════════
# ANALYTICS
# ═══════════════════════════════════════════════════════════════════════════════

def get_alerts_stats(period: str = "month", channel: str = "mind") -> dict:
    if not supabase: 
        return {"urgent_count": 0, "complaint_count": 0, "callback_count": 0, "recurring_count": 0, "stuck_count": 0}
    try:
        # We fetch all matching interactions to filter them in Python since count="exact" is hard to combine dynamically without complex query builder.
        all_alerts_query = supabase.table("interactions").select("type, alert_tags").not_.is_("alert_tags", "null").execute()
        urgent_count = complaint_count = callback_count = recurring_count = 0
        for row in all_alerts_query.data:
            if not _matches_channel(row.get("type"), channel): continue
            tags = row.get("alert_tags", [])
            if "urgent" in tags: urgent_count += 1
            if "complaint" in tags: complaint_count += 1
            if "callback" in tags: callback_count += 1
            if "recurring" in tags: recurring_count += 1

        
        # Stuck cases: older than 24 hours and not in a closed status
        yesterday = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
        clients_res = supabase.table("clients").select("id, status").lt("created_at", yesterday).execute()
        
        stuck_count = 0
        closed_statuses = ["lezarva", "siker", "kuka", "befejezett", "lezart"]
        for c in clients_res.data:
            st_lower = str(c.get("status", "")).lower()
            if not any(k in st_lower for k in closed_statuses):
                stuck_count += 1
                
        return {
            "urgent_count": urgent_count,
            "complaint_count": complaint_count,
            "callback_count": callback_count,
            "recurring_count": recurring_count,
            "stuck_count": stuck_count
        }
    except Exception as e:
        logger.error(f"Alert stats error: {e}")
        return {"urgent_count": 0, "complaint_count": 0, "callback_count": 0, "recurring_count": 0, "stuck_count": 0}

def get_alert_details(alert_type: str) -> list[dict]:
    if not supabase: return []
    try:
        if alert_type == "stuck":
            yesterday = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
            clients_res = supabase.table("clients").select("*").lt("created_at", yesterday).order("created_at", desc=True).execute()
            
            stuck_cases = []
            closed_statuses = ["lezarva", "siker", "kuka", "befejezett", "lezart"]
            for c in clients_res.data:
                st_lower = str(c.get("status", "")).lower()
                if not any(k in st_lower for k in closed_statuses):
                    import json
                    try:
                        custom = json.loads(c.get("custom_data") or "{}")
                    except:
                        custom = {}
                    
                    source = custom.get("forras_csatorna") or ("Messenger" if custom.get("messenger_id") else "Ismeretlen")
                    name = custom.get("name", custom.get("név", "Névtelen"))
                    
                    stuck_cases.append({
                        "id": c["id"],
                        "created_at": c["created_at"],
                        "name": name,
                        "channel": source,
                        "status": c["status"],
                        "is_stuck": True
                    })
            return stuck_cases
        elif alert_type in ["urgent", "complaint", "callback", "recurring"]:
            # Standard interactions filter
            res = supabase.table("interactions").select("*").contains("alert_tags", f'["{alert_type}"]').order("created_at", desc=True).limit(50).execute()
            
            alerts = []
            for item in res.data:
                alerts.append({
                    "id": item["id"],
                    "created_at": item["created_at"],
                    "channel": item["type"],
                    "topic": item["topic"],
                    "summary": item["summary"],
                    "is_stuck": False
                })
            return alerts
            
        return []
    except Exception as e:
        logger.error(f"Alert details error: {e}")
        return []

def get_latest_ai_insights() -> list[str]:
    if not supabase: return []
    try:
        res = supabase.table("ai_insights").select("insights").order("created_at", desc=True).limit(1).execute()
        if res.data and len(res.data) > 0:
            return res.data[0].get("insights", [])
        return []
    except Exception as e:
        logger.error(f"Get AI insights error: {e}")
        return []

def save_ai_insights(insights: list[str]) -> bool:
    if not supabase: return False
    try:
        supabase.table("ai_insights").insert({"insights": insights}).execute()
        return True
    except Exception as e:
        logger.error(f"Save AI insights error: {e}")
        return False


def _matches_channel(type_str: str, channel: str) -> bool:
    if channel == "mind": return True
    t = (type_str or "telefon").lower()
    if channel == "telefon":
        return "email" not in t and "whatsapp" not in t and "messenger" not in t and "meta" not in t and "facebook" not in t and "instagram" not in t
    if channel == "email": return "email" in t
    if channel == "whatsapp": return "whatsapp" in t
    if channel == "instagram": return "instagram" in t
    if channel in ["facebook", "messenger"]:
        return "messenger" in t or "meta" in t or "facebook" in t
    return False

def get_stats(period: str = "month", channel: str = "mind") -> dict:
    if not supabase: return {}
    today = datetime.now(timezone.utc)
    
    if period == "week":
        start_dt = today - timedelta(days=today.weekday())
        prev_start = start_dt - timedelta(days=7)
        prev_end = start_dt
    elif period == "month":
        start_dt = today.replace(day=1)
        prev_end = start_dt
        prev_start = (prev_end - timedelta(days=1)).replace(day=1)
    else: # year
        start_dt = today - timedelta(days=365)
        prev_end = start_dt
        prev_start = prev_end - timedelta(days=365)

    try:
        # Fallback to count="exact" for Mind channel
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
            tot_cal = 0
        
        prev_sess = supabase.table("sessions").select("id", count="exact", head=True).gte("started_at", prev_start.isoformat()).lt("started_at", prev_end.isoformat()).execute()
        prev_inter = supabase.table("interactions").select("id", count="exact", head=True).gte("created_at", prev_start.isoformat()).lt("created_at", prev_end.isoformat()).execute()
        prev_email = supabase.table("email_logs").select("id", count="exact", head=True).gte("sent_at", prev_start.isoformat()).lt("sent_at", prev_end.isoformat()).execute()
        prev_cal = supabase.table("calendar_events").select("id", count="exact", head=True).gte("start_dt", prev_start.isoformat()).lt("start_dt", prev_end.isoformat()).execute()

        tasks_res = supabase.table("tasks").select("id", count="exact", head=True).eq("completed", 0).execute()

        all_inters = supabase.table("interactions").select("type, topic, handover_reason, created_at").gte("created_at", start_dt.isoformat()).execute()
        type_counts = {}
        topic_counts = {}
        handover_counts = {
            "Összetett kérdés": 0,
            "Sürgős / triázs": 0,
            "Hiányzó info": 0,
            "Foglalási kivétel": 0,
            "Emberi döntés": 0
        }
        
        interactions_by_dow = {"total": [0]*7, "channels": {}}
        interactions_by_hour = {"total": [0]*24, "channels": {}}
        
        for i in all_inters.data:
            if not _matches_channel(i.get("type"), channel):
                continue
            t_raw = (i.get("type") or "Telefon").lower()
            if "email" in t_raw:
                t = "E-Mail"
            elif "whatsapp" in t_raw:
                t = "Whatsapp"
            elif "instagram" in t_raw:
                t = "Instagram"
            elif "messenger" in t_raw or "meta" in t_raw or "facebook" in t_raw:
                t = "Messenger"
            else:
                t = "Telefon"
            type_counts[t] = type_counts.get(t, 0) + 1
            
            created_at = i.get("created_at")
            if created_at:
                try:
                    dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                    dt_local = dt + timedelta(hours=2) # CET/CEST aprox
                    
                    wd = dt_local.weekday()
                    hr = dt_local.hour
                    
                    interactions_by_dow["total"][wd] += 1
                    if t not in interactions_by_dow["channels"]:
                        interactions_by_dow["channels"][t] = [0]*7
                    interactions_by_dow["channels"][t][wd] += 1
                    
                    interactions_by_hour["total"][hr] += 1
                    if t not in interactions_by_hour["channels"]:
                        interactions_by_hour["channels"][t] = [0]*24
                    interactions_by_hour["channels"][t][hr] += 1
                except Exception:
                    pass            
            topic_raw = i.get("topic")
            if topic_raw:
                t_topic = str(topic_raw).strip()
                if t_topic.lower() not in ["", "none", "null", "ismeretlen"]:
                    # Shorten very long topics for display
                    if len(t_topic) > 35:
                        t_topic = t_topic[:32] + "..."
                    topic_counts[t_topic] = topic_counts.get(t_topic, 0) + 1

            ho_reason = i.get("handover_reason")
            if ho_reason:
                ho_reason = str(ho_reason).strip()
                if ho_reason:
                    handover_counts[ho_reason] = handover_counts.get(ho_reason, 0) + 1

        interactions_by_type = [{"type": k, "count": v} for k, v in sorted(type_counts.items(), key=lambda x: x[1], reverse=True)]
        interactions_by_topic = [{"topic": k, "count": v} for k, v in sorted(topic_counts.items(), key=lambda x: x[1], reverse=True)]
        
        # Sort handovers primarily by predefined order or count, but dict items are fine as is, we'll format them to a list
        handovers = [{"reason": k, "count": v} for k, v in handover_counts.items()]

        all_sess = supabase.table("sessions").select("started_at, duration_seconds").gte("started_at", start_dt.isoformat()).execute()
        day_counts = {}
        total_dur = 0
        valid_durs = 0
        for s in all_sess.data:
            d = s["started_at"][:10]
            if period == "year":
                d = s["started_at"][:7]
            day_counts[d] = day_counts.get(d, 0) + 1
            if s.get("duration_seconds") is not None:
                total_dur += s["duration_seconds"]
                valid_durs += 1
        
        avg_dur = (total_dur / valid_durs) if valid_durs > 0 else 0

        prev_sess_data = supabase.table("sessions").select("duration_seconds").gte("started_at", prev_start.isoformat()).lt("started_at", prev_end.isoformat()).execute()
        prev_tot_dur = sum([s["duration_seconds"] for s in prev_sess_data.data if s.get("duration_seconds") is not None])
        prev_val_durs = len([s for s in prev_sess_data.data if s.get("duration_seconds") is not None])
        prev_avg_dur = (prev_tot_dur / prev_val_durs) if prev_val_durs > 0 else 0

        all_keys = []
        if period == "week":
            for i in range((today.date() - start_dt.date()).days + 1):
                all_keys.append((start_dt.date() + timedelta(days=i)).isoformat())
        elif period == "month":
            for i in range((today.date() - start_dt.date()).days + 1):
                all_keys.append((start_dt.date() + timedelta(days=i)).isoformat())
        else:
            d = today.replace(day=1)
            for _ in range(12):
                all_keys.insert(0, d.strftime("%Y-%m"))
                d = (d - timedelta(days=1)).replace(day=1)
        
        filled_days = [{"day": k, "count": day_counts.get(k, 0)} for k in all_keys]

        return {
            "total_sessions": tot_sess if channel == "mind" else len([i for i in all_sess.data if _matches_channel(i.get("room_name",""), channel)]) ,
            "total_interactions": tot_inter if channel == "mind" else sum(type_counts.values()),
            "total_emails": tot_email if channel == "mind" else (tot_email if channel == "email" else 0),
            "total_bookings": tot_cal if channel == "mind" else 0,
            "open_tasks": tasks_res.count or 0,
            "avg_session_duration": round(avg_dur),
            "handovers": handovers,
            "interactions_by_type": interactions_by_type,
            "interactions_by_topic": interactions_by_topic,
            "interactions_by_dow": interactions_by_dow,
            "interactions_by_hour": interactions_by_hour,
            "sessions_per_day": filled_days,
            "previous_period": {
                "total_sessions": prev_sess.count or 0,
                "total_interactions": prev_inter.count or 0,
                "total_emails": prev_email.count or 0,
                "total_bookings": prev_cal.count or 0,
                "avg_session_duration": round(prev_avg_dur),
            }
        }
    except Exception as e:
        logger.error(f"Stats error: {e}")
        return {}

def get_outbound_stats(period: str = "month", channel: str = "mind") -> dict:
    if not supabase: return {"total_outbound": 0, "reached_rate": 0, "booked_count": 0, "booked_rate": 0, "open_followup": 0}
    today = datetime.now(timezone.utc)
    
    if period == "week":
        start_dt = today - timedelta(days=today.weekday())
    elif period == "month":
        start_dt = today.replace(day=1)
    else: # year
        start_dt = today - timedelta(days=365)

    try:
        all_inters = supabase.table("interactions").select("session_id, direction, funnel_stage, handover_reason, created_at").gte("created_at", start_dt.isoformat()).execute()
        
        sessions = {}
        # also count interactions without session_id that are outbound
        total_outbound = 0
        
        for i in all_inters.data:
            if not _matches_channel(i.get("type"), channel):
                continue
            d = i.get("direction", "inbound") or "inbound"
            if d == "outbound":
                total_outbound += 1
                
            sid = i.get("session_id")
            if not sid:
                continue
            if sid not in sessions:
                sessions[sid] = {"outbound": [], "inbound": []}
            sessions[sid][d].append(i)
            
        reached_count = 0
        booked_count = 0
        open_followup = 0
        negotiating_count = 0
        
        for sid, data in sessions.items():
            if not data["outbound"]:
                continue
            
            # Reached: if there is any inbound in this session (meaning they replied)
            if data["inbound"]:
                reached_count += 1
                
                # Check for followup
                has_handover = any(o.get("handover_reason") for o in data["outbound"] + data["inbound"])
                # Ideally we check if it's open, but for now we check if there's a handover reason
                if has_handover:
                    open_followup += 1
            
            # Negotiating: if any interaction in this session has funnel_stage in ['ajanlat', 'foglalas_alatt', 'foglalt']
            is_negotiating = any(o.get("funnel_stage") in ["ajanlat", "foglalas_alatt", "foglalt"] for o in data["outbound"] + data["inbound"])
            if is_negotiating:
                negotiating_count += 1
                
            # Booked: if any interaction in this session has funnel_stage == 'foglalt'
            is_booked = any(o.get("funnel_stage") == "foglalt" for o in data["outbound"] + data["inbound"])
            if is_booked:
                booked_count += 1
                
        reached_rate = round((reached_count / total_outbound * 100)) if total_outbound > 0 else 0
        booked_rate = round((booked_count / total_outbound * 100)) if total_outbound > 0 else 0
        
        return {
            "total_outbound": total_outbound,
            "reached_count": reached_count,
            "reached_rate": reached_rate,
            "negotiating_count": negotiating_count,
            "booked_count": booked_count,
            "booked_rate": booked_rate,
            "open_followup": open_followup
        }
    except Exception as e:
        logger.error(f"Outbound stats error: {e}")
        return {"total_outbound": 0, "reached_rate": 0, "booked_count": 0, "booked_rate": 0, "open_followup": 0}

def get_funnel_stats(period: str = "month", channel: str = "mind") -> dict:
    if not supabase: return {}
    try:
        today = datetime.now(timezone.utc)
        if period == "week": start_dt = today - timedelta(days=today.weekday())
        elif period == "month": start_dt = today.replace(day=1)
        else: start_dt = today - timedelta(days=365)
        
        res = supabase.table("interactions").select("funnel_stage, type").gte("created_at", start_dt.isoformat()).execute()
        stages = [r.get("funnel_stage") or "relevant" for r in res.data if _matches_channel(r.get("type"), channel)]
        
        relevant_count = len([s for s in stages if s not in ("irrelevant", "spam")])
        valaszolt_count = len([s for s in stages if s in ("valaszolt", "ajanlat", "foglalt")])
        ajanlat_count = len([s for s in stages if s in ("ajanlat", "foglalt")])
        foglalt_count = len([s for s in stages if s == "foglalt"])
        
        return {
            "osszes_relevans": relevant_count,
            "valaszolt_ugyek": valaszolt_count,
            "ajanlatig_jutott": ajanlat_count,
            "idopont_lett": foglalt_count
        }
    except Exception as e:
        logger.error(f"Funnel stats error: {e}")
        return {
            "osszes_relevans": 0,
            "valaszolt_ugyek": 0,
            "ajanlatig_jutott": 0,
            "idopont_lett": 0
        }

def get_interactions(limit: int = 100, type_filter: str = "") -> list[dict]:
    if not supabase: return []
    try:
        query = supabase.table("interactions").select("*").order("created_at", desc=True).limit(limit)
        if type_filter:
            query = query.eq("type", type_filter)
        res = query.execute()
        return res.data
    except Exception:
        return []

def _build_session_summary(interactions: list[dict]) -> str:
    if not interactions: return "Nincs rögzített interakció ebben a sessionben."
    type_counts = {}
    topics = []
    for i in interactions:
        t = i.get("type", "")
        if t: type_counts[t] = type_counts.get(t, 0) + 1
        topic = i.get("topic", "")
        if topic and topic not in topics: topics.append(topic)
    parts = []
    label_map = {"email": "email küldés", "foglalás": "időpontfoglalás", "feladat": "feladat rögzítés", "kérdés": "kérdés / tudásbázis", "időjárás": "időjárás lekérdezés"}
    for typ, cnt in type_counts.items():
        label = label_map.get(typ, typ)
        parts.append(f"{cnt}× {label}")
    summary = "A session során: " + ", ".join(parts) + "." if parts else "Általános beszélgetés."
    specific = [t for t in topics if t not in ("Email küldés", "Időpontfoglalás", "Feladat rögzítés")][:3]
    if specific: summary += " Témák: " + "; ".join(specific) + "."
    return summary

def get_sessions_with_summary(limit: int = 50) -> list[dict]:
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
        return []

def migrate_from_json():
    pass

# ═══════════════════════════════════════════════════════════════════════════════
# CLIENTS (KANBAN)
# ═══════════════════════════════════════════════════════════════════════════════

def add_client(custom_data: dict, status: str = "uj") -> int:
    if not supabase: return 0
    name = custom_data.get("name", "Névtelen").strip() or "Névtelen"
    try:
        res = supabase.table("clients").insert({
            "name": name,
            "email": custom_data.get("email", ""),
            "phone": custom_data.get("phone", ""),
            "status": status,
            "custom_data": custom_data
        }).execute()
        return res.data[0]["id"] if res.data else 0
    except Exception as e:
        logger.error(f"Add client error: {e}")
        return 0

def find_client_by_contact(email: str = "", phone: str = "", messenger_id: str = "") -> dict | None:
    if not supabase: return None
    try:
        if messenger_id:
            res = supabase.table("clients").select("*").contains("custom_data", {"messenger_id": messenger_id}).order("id", desc=True).limit(1).execute()
            if res.data: return res.data[0]
        if email and phone:
            res = supabase.table("clients").select("*").or_(f"email.eq.{email},phone.eq.{phone}").order("id", desc=True).limit(1).execute()
        elif email:
            res = supabase.table("clients").select("*").eq("email", email).order("id", desc=True).limit(1).execute()
        elif phone:
            res = supabase.table("clients").select("*").eq("phone", phone).order("id", desc=True).limit(1).execute()
        else:
            res = None
        return res.data[0] if res and res.data else None
    except Exception as e:
        logger.error(f"Find client error: {e}")
        return None

def upsert_client(custom_data: dict, additional_log: str = "", status: str = "uj") -> int:
    email = custom_data.get("email", "").strip()
    phone = custom_data.get("phone", "").strip()
    messenger_id = custom_data.get("messenger_id", "").strip()
    
    existing = find_client_by_contact(email, phone, messenger_id)
    if existing:
        curr_data = existing.get("custom_data", {}) or {}
        for k, v in custom_data.items():
            if v and str(v).strip(): curr_data[k] = v
        
        if additional_log:
            old_log = curr_data.get("beszelgetes_naplo", "")
            now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
            new_entry = f"[{now_str}]\n{additional_log}\n"
            curr_data["beszelgetes_naplo"] = (old_log + "\n" + new_entry).strip()
            
        edit_client_details(existing["id"], curr_data)
        update_client_status(existing["id"], status)
        return existing["id"]
    else:
        if additional_log:
            now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
            custom_data["beszelgetes_naplo"] = f"[{now_str}]\n{additional_log}"
        return add_client(custom_data, status)

def get_clients(limit: int = 500) -> list[dict]:
    if not supabase: return []
    try:
        res = supabase.table("clients").select("*").order("created_at", desc=True).limit(limit).execute()
        return res.data
    except Exception:
        return []

def update_client_status(client_id: int, status: str) -> bool:
    if not supabase: return False
    try:
        supabase.table("clients").update({"status": status}).eq("id", client_id).execute()
        return True
    except Exception:
        return False

def delete_client(client_id: int) -> bool:
    if not supabase: return False
    try:
        client = supabase.table("clients").select("name, email").eq("id", client_id).execute().data
        if client:
            c = client[0]
            name = c.get("name")
            email = c.get("email")
            if name and name not in ("Névtelen", "-"):
                supabase.table("calendar_events").delete().or_(f"title.ilike.%{name}%,attendee.ilike.%{name}%").execute()
            if email and email != "-":
                supabase.table("calendar_events").delete().or_(f"title.ilike.%{email}%,attendee_email.ilike.%{email}%").execute()
        supabase.table("clients").delete().eq("id", client_id).execute()
        return True
    except Exception:
        return False

def edit_client_details(client_id: int, custom_data: dict) -> bool:
    if not supabase: return False
    name = custom_data.get("name", "Névtelen").strip() or "Névtelen"
    try:
        supabase.table("clients").update({
            "name": name,
            "email": custom_data.get("email", ""),
            "phone": custom_data.get("phone", ""),
            "custom_data": custom_data
        }).eq("id", client_id).execute()
        return True
    except Exception:
        return False

def get_client_fields() -> list[dict]:
    if not supabase: return []
    try:
        res = supabase.table("client_fields").select("*").order("order_index", desc=False).execute()
        return res.data
    except Exception:
        return []

def add_client_field(field_id: str, name: str, order_index: int) -> bool:
    if not supabase: return False
    try:
        supabase.table("client_fields").insert({"id": field_id, "name": name, "order_index": order_index}).execute()
        return True
    except Exception:
        return False

def update_client_field(field_id: str, name: str) -> bool:
    if not supabase: return False
    try:
        supabase.table("client_fields").update({"name": name}).eq("id", field_id).execute()
        return True
    except Exception:
        return False

def delete_client_field(field_id: str) -> bool:
    if not supabase: return False
    try:
        supabase.table("client_fields").delete().eq("id", field_id).execute()
        return True
    except Exception:
        return False

def get_kanban_columns() -> list[dict]:
    if not supabase: return []
    try:
        res = supabase.table("kanban_columns").select("*").order("order_index", desc=False).execute()
        return res.data
    except Exception:
        return []

def add_kanban_column(col_id: str, name: str, order_index: int) -> bool:
    if not supabase: return False
    try:
        supabase.table("kanban_columns").insert({"id": col_id, "name": name, "order_index": order_index}).execute()
        return True
    except Exception:
        return False

def update_kanban_column(col_id: str, name: str) -> bool:
    if not supabase: return False
    try:
        supabase.table("kanban_columns").update({"name": name}).eq("id", col_id).execute()
        return True
    except Exception:
        return False

def delete_kanban_column(col_id: str) -> bool:
    if not supabase: return False
    try:
        count_res = supabase.table("clients").select("id", count="exact", head=True).eq("status", col_id).execute()
        if count_res.count and count_res.count > 0:
            raise ValueError(f"Nem törölheted: a(z) '{col_id}' oszlopban {count_res.count} ügyfél található.")
        supabase.table("kanban_columns").delete().eq("id", col_id).execute()
        return True
    except ValueError as e:
        raise e
    except Exception:
        return False

# ═══════════════════════════════════════════════════════════════════════════════
# TRIAGE RULES
# ═══════════════════════════════════════════════════════════════════════════════

def get_triage_rules() -> list[dict]:
    if not supabase: return []
    try:
        res = supabase.table("triage_rules").select("*").order("id", desc=False).execute()
        return res.data
    except Exception:
        return []

def add_triage_rule(situation: str, priority: str, escalation_email: str) -> int:
    if not supabase: return 0
    try:
        res = supabase.table("triage_rules").insert({
            "situation": situation,
            "priority": priority,
            "escalation_email": escalation_email or None
        }).execute()
        return res.data[0]["id"] if res.data else 0
    except Exception as e:
        logger.error(f"Add triage rule error: {e}")
        return 0

def update_triage_rule(rule_id: int, situation: str, priority: str, escalation_email: str) -> bool:
    if not supabase: return False
    try:
        supabase.table("triage_rules").update({
            "situation": situation,
            "priority": priority,
            "escalation_email": escalation_email or None
        }).eq("id", rule_id).execute()
        return True
    except Exception:
        return False

def delete_triage_rule(rule_id: int) -> bool:
    if not supabase: return False
    try:
        supabase.table("triage_rules").delete().eq("id", rule_id).execute()
        return True
    except Exception:
        return False

# ──────────────────────────────────────────────────────────────────────────────
# DOCTORS & SERVICES
# ──────────────────────────────────────────────────────────────────────────────

def get_doctors() -> list[dict]:
    if not supabase: return []
    try:
        res = supabase.table("doctors").select("*").order("id", desc=False).execute()
        return res.data
    except Exception:
        return []

def add_doctor(name: str, specialty: str, related_services: str = "") -> int:
    if not supabase: return 0
    try:
        res = supabase.table("doctors").insert({
            "name": name,
            "specialty": specialty,
            "related_services": related_services
        }).execute()
        return res.data[0]["id"] if res.data else 0
    except Exception as e:
        logger.error(f"Add doctor error: {e}")
        return 0

def update_doctor(doc_id: int, name: str, specialty: str, related_services: str = "") -> bool:
    if not supabase: return False
    try:
        supabase.table("doctors").update({
            "name": name,
            "specialty": specialty,
            "related_services": related_services
        }).eq("id", doc_id).execute()
        return True
    except Exception:
        return False

def delete_doctor(doc_id: int) -> bool:
    if not supabase: return False
    try:
        supabase.table("doctors").delete().eq("id", doc_id).execute()
        return True
    except Exception:
        return False

def get_services() -> list[dict]:
    if not supabase: return []
    try:
        res = supabase.table("services").select("*, doctors(name)").order("id", desc=False).execute()
        return res.data
    except Exception:
        return []

def add_service(service_name: str, duration_minutes: int, doctor_id: int = None, note: str = "") -> int:
    if not supabase: return 0
    try:
        res = supabase.table("services").insert({
            "service_name": service_name,
            "duration_minutes": duration_minutes,
            "doctor_id": doctor_id,
            "note": note
        }).execute()
        return res.data[0]["id"] if res.data else 0
    except Exception as e:
        logger.error(f"Add service error: {e}")
        return 0

def update_service(srv_id: int, service_name: str, duration_minutes: int, doctor_id: int = None, note: str = "") -> bool:
    if not supabase: return False
    try:
        supabase.table("services").update({
            "service_name": service_name,
            "duration_minutes": duration_minutes,
            "doctor_id": doctor_id,
            "note": note
        }).eq("id", srv_id).execute()
        return True
    except Exception:
        return False

def delete_service(srv_id: int) -> bool:
    if not supabase: return False
    try:
        supabase.table("services").delete().eq("id", srv_id).execute()
        return True
    except Exception:
        return False
