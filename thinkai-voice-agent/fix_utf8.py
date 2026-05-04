import codecs

with codecs.open('database.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

replacement_1 = """def map_topic_category(raw_topic: str) -> str:
    if not raw_topic: return "Egyéb"
    t = str(raw_topic).lower()
    
    if any(x in t for x in ["sürgős", "fáj", "panasz", "gyulladás", "vérzik", "letört", "kiesett", "sürgősségi", "duzzanat"]):
        return "Sürgős panasz"
    if any(x in t for x in ["kontroll", "varratszedés", "visszarendelés", "későbbi", "folytatás"]):
        return "Kontroll időpont"
    if any(x in t for x in ["időpont", "foglalás", "bejelentkezés", "lemondás", "módosítás", "booking"]):
        return "Időpontfoglalás"
    if any(x in t for x in ["ár", "mennyi", "költség", "ajánlat", "fizetés", "akció", "részletfizetés"]):
        return "Árkérdés"
    if any(x in t for x in ["nyitva", "óra", "mikor", "rendelési idő", "rendelés"]):
        return "Nyitvatartás"
    if "email" in t or "e-mail" in t or "marketing" in t or "növelje" in t or "hírlevél" in t:
        return "E-mail megkeresés"
    
    return "Általános érdeklődés"
"""

replacement_2 = """        handover_counts = {
            "Összetett kérdés": 0,
            "Sürgős / triázs": 0,
            "Hiányzó info": 0,
            "Foglalási kivétel": 0,
            "Emberi döntés": 0
        }
"""

lines[407:425] = [replacement_1]
lines[457:464] = [replacement_2]

with codecs.open('database.py', 'w', encoding='utf-8') as f:
    f.writelines(lines)
