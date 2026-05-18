import re

file_path = 'c:/Users/dani pc xd/Desktop/Projectek/agent-main/thinkai-voice-agent/email_processor_live.py'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update the JSON schema prompt
old_schema = '''        "jarmu_tipusa": "autó / hajó / motor / stb. (opcionális)",
        "jarmu_modell": "pontos modell (opcionális)"'''
new_schema = '''        "service_requested": "Milyen szolgáltatást kér vagy javaslunk? (pl. ultrahangos fogkőeltávolítás, általános vizit, bölcsességfog húzás, stb.)",
        "proposed_date": "A levélben kért vagy felajánlott időpont pontosan (pl. 2026-05-19 11:00) ha van ilyen."'''
content = content.replace(old_schema, new_schema)

# 2. Update the logic that saves to kanban details
old_logic = """        if kanban.get("jarmu_tipusa"):
            details["jarmu_tipusa"] = kanban["jarmu_tipusa"]
        if kanban.get("jarmu_modell"):
            details["jarmu_modell"] = kanban["jarmu_modell"]"""
new_logic = """        if kanban.get("service_requested"):
            details["service"] = kanban["service_requested"]
            # Ha orvos nincs megadva, default:
            if "doctor" not in details:
                details["doctor"] = "Bármelyik orvos"
        if kanban.get("proposed_date"):
            details["booked_datetime"] = kanban["proposed_date"]"""
content = content.replace(old_logic, new_logic)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated email_processor_live.py!")
