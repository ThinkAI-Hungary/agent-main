import sys
import logging

logger = logging.getLogger(__name__)

with open('database.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Chunk 1
old1 = 'all_inters = supabase.table("interactions").select("session_id, direction, funnel_stage, handover_reason, created_at, type, clinic_id").gte("created_at", start_dt.isoformat()).execute()'
new1 = 'all_inters = supabase.table("interactions").select("session_id, direction, funnel_stage, handover_reason, created_at, type, clinic_id, topic").gte("created_at", start_dt.isoformat()).execute()'
content = content.replace(old1, new1)

# Chunk 2
old2 = '''        # also count interactions without session_id that are outbound
        total_outbound = 0
        
        for i in all_inters.data:'''
new2 = '''        # also count interactions without session_id that are outbound
        total_outbound = 0
        
        activities = {
            'Visszahívás': 0,
            'Emlékeztető': 0,
            'Utánkövetés': 0,
            'Kampány': 0,
            'Kontroll': 0,
            'Passzív': 0
        }
        
        for i in all_inters.data:'''
content = content.replace(old2, new2)

# Chunk 3
old3 = '''            d = i.get("direction", "inbound") or "inbound"
            if d == "outbound":
                total_outbound += 1
                
            sid = i.get("session_id")'''
new3 = '''            d = i.get("direction", "inbound") or "inbound"
            if d == "outbound":
                total_outbound += 1
                
                t_lower = str(i.get("topic", "")).lower() + " " + str(i.get("type", "")).lower()
                if "emlékeztető" in t_lower:
                    activities['Emlékeztető'] += 1
                elif "visszahívás" in t_lower or ("hív" in t_lower and "sip" in t_lower):
                    activities['Visszahívás'] += 1
                elif "utánkövetés" in t_lower:
                    activities['Utánkövetés'] += 1
                elif "kampány" in t_lower:
                    activities['Kampány'] += 1
                elif "kontroll" in t_lower:
                    activities['Kontroll'] += 1
                else:
                    activities['Passzív'] += 1
                
            sid = i.get("session_id")'''
content = content.replace(old3, new3)

# Chunk 4
old4 = '''            "open_followup": open_followup
        }
    except Exception as e:
        logger.error(f"Outbound stats error: {e}")
        return {"total_outbound": 0, "reached_rate": 0, "booked_count": 0, "booked_rate": 0, "open_followup": 0}'''
new4 = '''            "open_followup": open_followup,
            "activities": activities
        }
    except Exception as e:
        logger.error(f"Outbound stats error: {e}")
        return {"total_outbound": 0, "reached_rate": 0, "booked_count": 0, "booked_rate": 0, "open_followup": 0, "activities": {}}'''
content = content.replace(old4, new4)

with open('database.py', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done modifying database.py')
