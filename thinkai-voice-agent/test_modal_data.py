"""
Teszt script: Ellenőrzi és frissíti a Daniel Nagy ügyfél adatait,
hogy a modal popup-ban a helyes adatok jelenjenek meg:
- booked_datetime → szép formátum
- doctor → kitöltve
- reminder_sent_at → kitöltve
- service → kitöltve
"""
import os, sys
from pathlib import Path
from dotenv import load_dotenv
from datetime import datetime

THIS_DIR = Path(__file__).resolve().parent
load_dotenv(THIS_DIR / ".env")

sys.path.insert(0, str(THIS_DIR))
import database as db

db.init_db()

# 1. Keressük meg a Daniel Nagy ügyfelet
print("=" * 60)
print("1. Daniel Nagy ügyfél keresése...")
print("=" * 60)

clients = db.get_clients(limit=500)
daniel = None
for c in clients:
    cd = c.get("custom_data", {})
    if isinstance(cd, str):
        import json
        try: cd = json.loads(cd)
        except: cd = {}
    name = cd.get("name", "") or cd.get("nev", "") or cd.get("név", "") or c.get("name", "")
    if "daniel" in name.lower() or "dániel" in name.lower():
        daniel = c
        break

if not daniel:
    print("❌ Daniel Nagy ügyfél nem található!")
    print("Elérhető ügyfelek:")
    for c in clients[:10]:
        cd = c.get("custom_data", {})
        if isinstance(cd, str):
            import json
            try: cd = json.loads(cd)
            except: cd = {}
        print(f"  - ID={c['id']} | name={c.get('name', '?')} | cd.name={cd.get('name', '?')}")
    sys.exit(1)

print(f"✅ Megtalálva! ID={daniel['id']}, name={daniel.get('name', '?')}")

# 2. Ellenőrizzük a custom_data mezőket
cd = daniel.get("custom_data", {})
if isinstance(cd, str):
    import json
    try: cd = json.loads(cd)
    except: cd = {}

print("\n" + "=" * 60)
print("2. Jelenlegi custom_data mezők:")
print("=" * 60)
print(f"  booked_datetime: {cd.get('booked_datetime', 'NINCS')}")
print(f"  service:         {cd.get('service', 'NINCS')}")
print(f"  doctor:          {cd.get('doctor', 'NINCS')}")
print(f"  reminder_sent_at:{cd.get('reminder_sent_at', 'NINCS')}")
print(f"  name:            {cd.get('name', 'NINCS')}")
print(f"  email:           {cd.get('email', 'NINCS')}")
print(f"  phone:           {cd.get('phone', 'NINCS')}")

# 3. Ha hiányzik valami, frissítsük
needs_update = False
now_str = datetime.now().strftime("%Y-%m-%d %H:%M")

if not cd.get("booked_datetime"):
    cd["booked_datetime"] = "2026-06-08 10:00"
    needs_update = True
    print("\n⚠️  booked_datetime hiányzott → beállítva: 2026-06-08 10:00")

if not cd.get("service") or cd.get("service") == "-":
    cd["service"] = "Konzultáció"
    needs_update = True
    print("⚠️  service hiányzott → beállítva: Konzultáció")

if not cd.get("doctor") or cd.get("doctor") == "-":
    # Próbáljuk meg lekérni az orvos nevet az orvos táblából
    doctors = db.get_doctors()
    if doctors:
        cd["doctor"] = doctors[0].get("name", "Dr. Teszt Orvos")
        print(f"⚠️  doctor hiányzott → beállítva: {cd['doctor']} (első orvos az adatbázisból)")
    else:
        cd["doctor"] = "Dr. Teszt Orvos"
        print("⚠️  doctor hiányzott → beállítva: Dr. Teszt Orvos")
    needs_update = True

if not cd.get("reminder_sent_at") or cd.get("reminder_sent_at") == "-":
    cd["reminder_sent_at"] = now_str
    needs_update = True
    print(f"⚠️  reminder_sent_at hiányzott → beállítva: {now_str}")

if needs_update:
    print("\n" + "=" * 60)
    print("3. Custom_data frissítése...")
    print("=" * 60)
    ok = db.edit_client_details(daniel["id"], cd)
    if ok:
        print("✅ Sikeres frissítés!")
    else:
        print("❌ Frissítés sikertelen!")
else:
    print("\n✅ Minden mező ki van töltve, nem kell frissíteni!")

# 4. Végső állapot
print("\n" + "=" * 60)
print("4. Végleges adatok a modal popup-ban:")
print("=" * 60)
print(f"  Befoglalt időpont: {cd.get('booked_datetime', '-')}")
print(f"  Szolgáltatás:      {cd.get('service', '-')}")
print(f"  Orvos:             {cd.get('doctor', '-')}")
print(f"  Emlékeztető:       {cd.get('reminder_sent_at', '-')}")
print()
print("🎯 Az admin felületen (localhost:8000/admin) most nyisd meg")
print("   az Interakciós listát és kattints a Daniel Nagy sorára.")
print("   A popup-ban a fenti adatoknak kell megjelenniük szép formátumban!")
