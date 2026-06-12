import json
from datetime import datetime
from pathlib import Path
from loguru import logger
import database

THIS_DIR = Path(__file__).resolve().parent
PROMPT_FILE      = THIS_DIR / "system_prompt.md"
PRAXISINFO_FILE  = THIS_DIR / "praxisinfo.json"
SETTINGS_FILE    = THIS_DIR / "agent_settings.json"

def load_agent_settings() -> dict:
    """Load agent_settings.json — override .env values at runtime."""
    if SETTINGS_FILE.exists():
        try:
            return json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
        except Exception as e:
            logger.warning(f"Could not read agent_settings.json: {e}")
    return {}

def _load_praxisinfo() -> dict:
    """Load praxisinfo.json — practice metadata managed from admin UI."""
    if PRAXISINFO_FILE.exists():
        try:
            return json.loads(PRAXISINFO_FILE.read_text(encoding="utf-8"))
        except Exception as e:
            logger.warning(f"Could not read praxisinfo.json: {e}")
    return {}

def _format_doctors() -> str:
    doctors = database.get_doctors()
    if not doctors:
        return "Nincs megadva"
    lines = []
    for d in doctors:
        name = d.get("name", "")
        spec = d.get("specialty", "")
        line = name
        if spec: line += f" ({spec})"
        if line: lines.append(line)
    return "\n".join(f"- {l}" for l in lines) if lines else "Nincs megadva"

def _format_services() -> str:
    services = database.get_services()
    if not services:
        return "Nincs megadva"
    lines = []
    for s in services:
        name = s.get("service_name", "")
        dur = s.get("duration_minutes", 30)
        doc = s.get("doctors")
        doc_name = doc.get("name") if isinstance(doc, dict) else "Bárki (Mind)"
        note = s.get("note", "")
        
        line = f"- {name} ({dur} perc) – Orvos: {doc_name}"
        if note: line += f" [Megjegyzés: {note}]"
        lines.append(line)
    return "\n".join(lines) if lines else "Nincs megadva"

def _format_campaigns(campaigns: list) -> str:
    active = [c.get("text", "").strip() for c in campaigns if c.get("active") and c.get("text")]
    return "\n".join(f"- {t}" for t in active) if active else "Nincs aktív kampány"

def _format_exceptions(exceptions: list) -> str:
    valid_exc = [e.strip() for e in exceptions if e.strip()]
    return "\n".join(f"- {e}" for e in valid_exc) if valid_exc else "Nincs megadva kivétel"

def _format_knowledge(raw: str) -> str:
    """Convert knowledge JSON (Q&A dict) to readable K:/V: pairs for the prompt."""
    try:
        pairs = json.loads(raw) if isinstance(raw, str) else raw
        if isinstance(pairs, dict) and pairs:
            return "\n\n".join(f"K: {q}\nV: {a}" for q, a in pairs.items())
    except Exception:
        pass
    return raw or ""

def _format_cancellation_policy(pi: dict) -> str:
    rules = []
    
    # Módosítás
    if pi.get("modositas_eng", "igen") == "igen":
        rules.append("Amikor sikeresen lefoglalsz egy időpontot, TÁJÉKOZTASD az ügyfelet a válaszodban: 'Időpont módosítására az időpont előtti 48 órával van lehetőség.'")
        
    # Lemondás (24 órán belül)
    lem_24h = pi.get("lemondas_24h", "figyelmeztetoSzoveggel")
    figy_txt = pi.get("figyelmezteto_szoveg", "")
    
    if lem_24h == "elfogadhato":
        rules.append("Amikor sikeresen lefoglalsz egy időpontot, TÁJÉKOZTASD az ügyfelet a válaszodban, hogy 24 órán belül lemondhatja az időpontot.")
    elif lem_24h == "figyelmeztetoSzoveggel" and figy_txt:
        rules.append(f"Amikor sikeresen lefoglalsz egy időpontot, TÁJÉKOZTASD az ügyfelet ezzel a szöveggel a válaszodban: '{figy_txt}'")
    elif lem_24h == "eloAtadas":
        rules.append("SZIGORÚ SZABÁLY: Amint az ügyfél egy időpont lemondásáról beszél (lemondásról van szó), AZONNAL adja át a beszélgetést egy élő munkatársnak! Ne próbáld te törölni. Kérj emberi átadást a handover_reason vagy report_alert('urgent') segítségével.")

    return "\n".join(f"- {r}" for r in rules) if rules else "Nincs külön lemondási/módosítási szabály."

def _format_patient_rules(pi: dict) -> str:
    rules = []
    
    # Kérdés a beazonosításra
    question = pi.get("pacient_id_question", "Korábban járt már a rendelőnkben?")
    if question:
        rules.append(f"1. A beszélgetés elején, amint lehetőség van rá, tedd fel a következő kérdést az ügyfél beazonosításához: '{question}'")
    else:
        rules.append("1. A beszélgetés elején derítsd ki, hogy az ügyfél járt-e már a rendelőben (új vagy visszatérő páciens).")

    # Új páciens szabályok
    new_req = pi.get("new_patient_required", "Születési dátum, teljes név")
    rules.append(f"2. HA AZ ÜGYFÉL ÚJ PÁCIENS: Kötelezően kérd be a következő adatokat: '{new_req}'. Minden esetben kötelezően kérd be az e-mail címét is!")
    
    if pi.get("new_patient_auto_visit", True):
        rules.append("   - SZIGORÚ SZABÁLY: Mivel ő egy ÚJ páciens, az első alkalommal KIZÁRÓLAG állapotfelmérésre / általános vizitre (pl. Konzultáció) foglalhatsz neki időpontot! Semmilyen más konkrét kezelésre (pl. tömés, foghúzás) NEM adhatsz időpontot látatlanban. Mondd el neki, hogy az első alkalommal mindenképp egy állapotfelmérésre van szükség.")

    # Visszatérő páciens szabályok
    ret_req = pi.get("returning_patient_required", "Páciens azonosító vagy telefonszám")
    rules.append(f"3. HA AZ ÜGYFÉL VISSZATÉRŐ PÁCIENS: Kötelezően kérd be a következő adatokat az azonosításhoz: '{ret_req}'. Szintén kötelezően kérd be az e-mail címét is!")

    # Email bekérése kötelező
    rules.append("4. IDŐPONTFOGLALÁS ESETÉN: Szigorúan kötelező elkérned az ügyfél e-mail címét a foglalás véglegesítése előtt. Tájékoztasd őt róla, hogy erre az e-mail címre fogjuk küldeni a hivatalos visszaigazolást, ami tartalmazza a naptárfájlt és az esetleges lemondáshoz szükséges linket is!")

    return "\n".join(rules)

def _format_faq(faq: list) -> str:
    if not faq:
        return "Nincs megadva külön GYIK."
    lines = ["SZIGORÚ SZABÁLY: Az alábbi Gyakran Ismételt Kérdések (GYIK) alapján válaszolj! Ha a felhasználó kérdése tartalmilag/jelentésben megegyezik valamelyik Kérdéssel, akkor KÖTELEZŐEN a hozzá tartozó Választ kell adnod, lényegi változtatás nélkül!"]
    for idx, item in enumerate(faq, 1):
        q = item.get("question", "").strip()
        a = item.get("answer", "").strip()
        if q and a:
            lines.append(f"Kérdés #{idx}: {q}\nVálasz #{idx}: {a}\n")
    return "\n".join(lines)

def _format_business_hours(settings: dict) -> str:
    bh = settings.get("business_hours")
    if not bh:
        return "Nincs megadva nyitvatartás."
    
    en_to_hu = {
        "monday": "Hétfő", "tuesday": "Kedd", "wednesday": "Szerda",
        "thursday": "Csütörtök", "friday": "Péntek",
        "saturday": "Szombat", "sunday": "Vasárnap"
    }
    
    lines = []
    for en_day, hu_day in en_to_hu.items():
        day_data = bh.get(en_day, {})
        if day_data.get("enabled"):
            o = day_data.get("open", "08:00")
            c = day_data.get("close", "16:00")
            lines.append(f"- {hu_day}: {o} - {c}")
        else:
            lines.append(f"- {hu_day}: Zárva")
            
    return "\n".join(lines)


LANGUAGE_NAMES = {
    "hu": "magyar", "en": "English", "de": "Deutsch", "sk": "slovenčina",
    "ro": "română", "sr": "srpski", "hr": "hrvatski", "fr": "français",
    "es": "español", "it": "italiano",
}

# Strong per-language instruction written IN the target language
LANGUAGE_INSTRUCTIONS = {
    "en": "STRICT RULE: You MUST respond ONLY in English. All your replies — greetings, information, questions — must be in English. NEVER reply in Hungarian!",
    "de": "STRENGE REGEL: Du MUSST ausschließlich auf Deutsch antworten. Alle deine Antworten — Begrüßungen, Informationen, Fragen — müssen auf Deutsch sein. Antworte NIEMALS auf Ungarisch!",
    "sk": "PRÍSNE PRAVIDLO: MUSÍŠ odpovedať VÝLUČNE po slovensky. Všetky tvoje odpovede — pozdravy, informácie, otázky — musia byť po slovensky. NIKDY neodpovedaj po maďarsky!",
    "ro": "REGULĂ STRICTĂ: TREBUIE să răspunzi DOAR în limba română. Toate răspunsurile tale — salutări, informații, întrebări — trebuie să fie în română. NU răspunde NICIODATĂ în maghiară!",
    "sr": "СТРОГО ПРАВИЛО: МОРАШ одговарати ИСКЉУЧИВО на српском. Сви твоји одговори — поздрави, информације, питања — морају бити на српском. НИКАДА не одговарај на мађарском!",
    "hr": "STROGO PRAVILO: MORAŠ odgovarati ISKLJUČIVO na hrvatskom. Svi tvoji odgovori — pozdravi, informacije, pitanja — moraju biti na hrvatskom. NIKADA ne odgovaraj na mađarskom!",
    "fr": "RÈGLE STRICTE: Tu DOIS répondre UNIQUEMENT en français. Toutes tes réponses — salutations, informations, questions — doivent être en français. NE réponds JAMAIS en hongrois!",
    "es": "REGLA ESTRICTA: DEBES responder ÚNICAMENTE en español. Todas tus respuestas — saludos, información, preguntas — deben ser en español. ¡NUNCA respondas en húngaro!",
    "it": "REGOLA RIGIDA: DEVI rispondere ESCLUSIVAMENTE in italiano. Tutte le tue risposte — saluti, informazioni, domande — devono essere in italiano. NON rispondere MAI in ungherese!",
}

def get_system_prompt(channel: str = None) -> str:
    """Load system prompt from system_prompt.md and inject runtime variables.
    
    Args:
        channel: Optional channel name (e.g. 'email', 'messenger', 'whatsapp', 'instagram').
                 If provided and not 'voice'/'telefon', the language setting is injected.
                 Voice agent always stays Hungarian.
    """
    if not PROMPT_FILE.exists():
        return "Te egy segítőkész AI vagy."
        
    template = PROMPT_FILE.read_text(encoding="utf-8")
    pi       = _load_praxisinfo()
    settings = load_agent_settings()
    
    # ── Determine language ──
    is_text_channel = channel and channel.lower() not in ("voice", "telefon", "phone")
    lang_code = settings.get("language", "hu") if is_text_channel else "hu"
    if not lang_code:
        lang_code = "hu"

    # Build the language_rule for the {language_rule} template variable
    if lang_code == "hu":
        language_rule = "Mindig magyarul kommunikálj, udvariasan és segítőkészen."
    else:
        lang_name = LANGUAGE_NAMES.get(lang_code, lang_code)
        language_rule = f"Always communicate in {lang_name}, politely and helpfully. NEVER respond in Hungarian."

    # Telephelyek lekérdezése
    clinics_str = ""
    try:
        clinics = database.get_clinics()
        if clinics:
            clinic_lines = []
            for c in clinics:
                dir_str = f" - Megközelítés: {c.get('access_info', '')}" if c.get('access_info') else ""
                clinic_lines.append(f"- {c['name_and_address']}{dir_str} (Belső ID: {c['id']})")
            clinics_text = "\n".join(clinic_lines)
            
            clinics_str = f"\n\n--- TELEPHELYEK ---\nElérhető telephelyeink:\n{clinics_text}\n\n"
            if len(clinics) > 1:
                clinics_str += "Ha az ügyfél időpontot foglal, KÖTELEZŐ megkérdezned, hogy melyik telephelyet választja! A választott telephely Belső ID-ját a JSON-ben add meg! "
            clinics_str += "SZIGORÚ SZABÁLY: A válasz szövegébe SOHA ne írd bele az ID számokat (tehát TILOS olyat írni, hogy 'ID: 1' vagy '1-es azonosító')! Ha az ügyfél a megközelítésről kérdez, bátran használd a fenti megközelítési infókat.\n----------------------------------------------------"
    except Exception as e:
        logger.error(f"Error loading clinics for prompt: {e}")

    variables = {
        "today":          datetime.now().strftime("%Y-%m-%d (%A)"),
        "practice_name":  pi.get("practice_name", ""),
        "address":        pi.get("address", ""),
        "markanev":       pi.get("markanev", ""),
        "szakterulet":    pi.get("szakterulet", ""),
        "kulcsszavak":    pi.get("kulcsszavak", ""),
        "megkozelites":   pi.get("megkozelites", ""),
        "price_list":     pi.get("price_list", ""),
        "doctors":        _format_doctors(),
        "services_list":  _format_services(),
        "campaigns":      _format_campaigns(pi.get("campaigns", [])),
        "exceptions":     _format_exceptions(pi.get("exceptions", [])),
        "cancellation_policy": _format_cancellation_policy(pi),
        "patient_rules":  _format_patient_rules(pi),
        "faq":            _format_faq(pi.get("faq", [])),
        "knowledge":      _format_knowledge(settings.get("knowledge_content", "")),
        "tone":           settings.get("tone", ""),
        "business_hours": _format_business_hours(settings),
        "clinics_prompt": clinics_str,
        "language_rule":  language_rule,
    }

    try:
        result = template.format(**variables)
    except KeyError as e:
        # Unknown variable in template — replace only the known ones to avoid crash
        logger.warning(f"Unknown variable in system prompt template: {e}")
        result = template
        for key, val in variables.items():
            result = result.replace("{" + key + "}", str(val))

    # ── Strong language prepend at TOP for non-Hungarian text channels ──
    if is_text_channel and lang_code != "hu":
        lang_instruction = LANGUAGE_INSTRUCTIONS.get(lang_code)
        if not lang_instruction:
            lang_name = LANGUAGE_NAMES.get(lang_code, lang_code)
            lang_instruction = f"STRICT RULE: You MUST respond ONLY in {lang_name}. NEVER reply in Hungarian!"
        result = f"[LANGUAGE OVERRIDE] {lang_instruction}\n\n{result}"

    return result
