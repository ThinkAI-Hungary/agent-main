import os
import json
import uuid
import database as db

# 10 Test Cases
cases = [
    {
        "from_email": "kovacs.tamas@example.hu",
        "from_name": "Kovács Tamás",
        "subject": "Időpontfoglalás érdeklődés",
        "body": "Tisztelt Kovács Tamás!\n\nKöszönjük megkeresését! Örömmel tájékoztatjuk, hogy a fogkőeltávolításra a jövő héten kedden 14:00-kor, illetve csütörtökön 10:00-kor tudunk időpontot biztosítani.\n\nKérjük, jelezze, melyik lenne megfelelő Önnek!\n\nÜdvözlettel,\nBégé Design Kft. (ThinkAI Asszisztens)",
        "f_stage": "ajanlat",
        "alert_tags": [],
        "handover": None
    },
    {
        "from_email": "marketing@spammer.com",
        "from_name": "SEO Marketing Team",
        "subject": "Növelje bevételeit velünk!",
        "body": "Tisztelt SEO Marketing Team!\n\nKöszönjük megkeresését, de jelenleg nem kívánunk élni a felajánlott marketing szolgáltatásokkal. Kérjük, távolítsák el a címünket a címlistájukról.\n\nÜdvözlettel,\nBégé Design Kft.",
        "f_stage": "irrelevant",
        "alert_tags": [],
        "handover": None
    },
    {
        "from_email": "varga.julianna@example.hu",
        "from_name": "Varga Julianna",
        "subject": "Erős fogfájás - SÜRGŐS!",
        "body": "Kedves Varga Julianna!\n\nSajnálattal halljuk, hogy fájdalmai vannak! Az ilyen eseteket soron kívül kezeljük. Kérem, azonnal hívja a rendelőnket a +36 30 123 4567-es számon, hogy a mai napon fogadhassuk!\n\nJobbulást kívánunk,\nBégé Design Kft.",
        "f_stage": "valaszolt",
        "alert_tags": ["urgent"],
        "handover": "Sürgős / triázs"
    },
    {
        "from_email": "kiss.peter@freemail.hu",
        "from_name": "Kiss Péter",
        "subject": "Időpont módosítása",
        "body": "Kedves Kiss Péter!\n\nRendben, a szerdai 15:00 órás időpontját töröltük. Helyette pénteken 11:30-ra tudunk új időpontot felajánlani. Kérem erősítse meg, ha megfelel!\n\nÜdvözlettel,\nThinkAI Asszisztens",
        "f_stage": "foglalt",
        "alert_tags": [],
        "handover": None
    },
    {
        "from_email": "nagy.eva@gmail.com",
        "from_name": "Nagy Éva",
        "subject": "Árajánlat kérés implantátumra",
        "body": "Tisztelt Nagy Éva!\n\nAz implantátum beültetésének ára átlagosan 150.000 Ft-tól kezdődik, de pontos árajánlatot csak egy személyes konzultáció és panorámaröntgen után tudunk adni. Szeretne időpontot foglalni egy állapotfelmérésre?\n\nÜdvözlettel,\nBégé Design Kft.",
        "f_stage": "ajanlat",
        "alert_tags": [],
        "handover": None
    },
    {
        "from_email": "toth.bela@indamail.hu",
        "from_name": "Tóth Béla",
        "subject": "Panasz a tegnapi kezelés után",
        "body": "Tisztelt Tóth Béla!\n\nNagyon sajnáljuk, ha a tegnapi kezelés után kellemetlenséget tapasztalt. Kollégánk hamarosan személyesen is felveszi Önnel a kapcsolatot, hogy kivizsgáljuk az esetet!\n\nÜdvözlettel,\nVezetőség",
        "f_stage": "valaszolt",
        "alert_tags": ["complaint"],
        "handover": "Emberi döntés"
    },
    {
        "from_email": "szabo.katalin@example.hu",
        "from_name": "Szabó Katalin",
        "subject": "Rendszeres éves ellenőrzés",
        "body": "Kedves Szabó Katalin!\n\nIgen, emlékszünk Önre! Az éves ellenőrzéshez a jövő hét szerdán 16:15-kor van egy szabad helyünk. Lefoglalhatjuk Önnek ezt az időpontot?\n\nÜdvözlettel,\nThinkAI",
        "f_stage": "relevant",
        "alert_tags": [],
        "handover": None
    },
    {
        "from_email": "farkas.zoltan@example.com",
        "from_name": "Farkas Zoltán",
        "subject": "Rendelési idő",
        "body": "Kedves Farkas Zoltán!\n\nRendelőnk hétfőtől péntekig 08:00 és 18:00 óra között tart nyitva. Hétvégén zárva vagyunk.\n\nÜdvözlettel,\nBégé Design Kft.",
        "f_stage": "valaszolt",
        "alert_tags": [],
        "handover": None
    },
    {
        "from_email": "horvath.anna@example.hu",
        "from_name": "Horváth Anna",
        "subject": "Röntgen lelet elküldése",
        "body": "Kedves Horváth Anna!\n\nMegkaptuk a leletet, köszönjük! Ahhoz viszont, hogy a doktor úr érdemben tudjon véleményt mondani, szükség lenne még arra is, hogy jelezze: pontosan melyik foga érzékeny jelenleg?\n\nÜdvözlettel,\nThinkAI Asszisztens",
        "f_stage": "relevant",
        "alert_tags": [],
        "handover": "Hiányzó info"
    },
    {
        "from_email": "feher.laszlo@example.com",
        "from_name": "Fehér László",
        "subject": "Hiba az űrlappal",
        "body": "Tisztelt Fehér László!\n\nElnézést kérünk a technikai kellemetlenségért! Kollégánk értesítve lett a hibáról, és hamarosan jelentkezünk a megoldással.\n\nÜdvözlettel,\nÜgyfélszolgálat",
        "f_stage": "relevant",
        "alert_tags": ["stuck"],
        "handover": "Technikai hiba"
    }
]

for c in cases:
    session_id = f"email_{c['from_email']}"
    db.create_session(session_id=session_id, room_name="Email Chat", participant=c['from_name'])
    
    draft_payload = {
        "channel": "Email",
        "to_email": c["from_email"],
        "to_name": c["from_name"],
        "subject": f"Re: {c['subject']}",
        "body": c["body"]
    }
    draft_json = json.dumps(draft_payload)
    
    db.log_interaction(
        type="email",
        topic=c["subject"],
        summary=f"Bejövő e-mail {c['from_email']} címről",
        result="Piszkozat mentve",
        tool_name="imap_worker_ai",
        session_id=session_id,
        funnel_stage=c["f_stage"],
        alert_tags=c["alert_tags"],
        handover_reason=c["handover"],
        approval_status="pending",
        ai_draft_response=draft_json
    )

print("Sikeresen beillesztve 10 db teszt e-mail!")
