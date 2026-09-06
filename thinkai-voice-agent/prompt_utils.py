import json
from datetime import datetime
from zoneinfo import ZoneInfo

# Budapesti idő + magyar napnevek (a prompt {today} mezőjéhez)
_HU_TZ = ZoneInfo("Europe/Budapest")
_HU_DAYS = ["hétfő", "kedd", "szerda", "csütörtök", "péntek", "szombat", "vasárnap"]
from pathlib import Path
from loguru import logger
import database

THIS_DIR = Path(__file__).resolve().parent

# PROMPT_FILE kept only as a legacy seed source for initial Supabase population
PROMPT_FILE = THIS_DIR / "system_prompt.md"


def load_agent_settings() -> dict:
    """Load agent settings from Supabase."""
    return database.get_agent_settings()

def _load_praxisinfo() -> dict:
    """Load practice info from Supabase."""
    return database.get_business_info()

def _load_knowledge(settings: dict) -> str:
    """Read knowledge content from Supabase."""
    k = database.get_knowledge_base()
    return k.get("content", "{}")



def _format_services() -> str:
    services = database.get_services()
    if not services:
        return "Nincs megadva"
    lines = []
    for s in services:
        name = s.get("service_name", "")
        desc = s.get("description", "")
        dur = s.get("duration_minutes", 30)
        assigned = s.get("assigned_to", "")
        note = s.get("note", "")
        
        line = f"- {name} ({dur} perc)"
        if desc: line += f" — {desc}"
        if assigned: line += f" – Felelős: {assigned}"
        if note: line += f" [Megjegyzés: {note}]"
        lines.append(line)
    return "\n".join(lines) if lines else "Nincs megadva"

def _format_campaigns(campaigns: list) -> str:
    active = []
    for c in campaigns:
        if c.get("active"):
            name = c.get("name", "").strip()
            text = c.get("text", "").strip()
            if name and text:
                active.append(f"{name}: {text}")
            elif text:
                active.append(text)
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
        mod_txt = pi.get("modositas_szoveg", "").strip()
        if mod_txt:
            rules.append(f"Amikor sikeresen lefoglalsz egy időpontot, TÁJÉKOZTASD az ügyfelet a válaszodban: '{mod_txt}'")
    else:
        rules.append("SZIGORÚ SZABÁLY: Időpont módosítása NEM engedélyezett! Ha az ügyfél időpont módosítást kér, tájékoztasd, hogy időpont módosítására sajnos nincs lehetőség, és kérd meg, hogy vegye fel a kapcsolatot egy munkatárssal, vagy mondja le a jelenlegi időpontot és foglaljon újat.")
        
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

    # EAISY-241 §7 — Időpontfoglalási beszélgetés szabályai (lépésenkénti)
    rules.append("""5. BESZÉLGETÉS VEZETÉSE IDŐPONTFOGLALÁSKOR (SZIGORÚ!):
   - Egyszerre CSAK EGY kérdést tegyél fel. SOHA ne sorolj fel több adatot egy mondatban (pl. ne kérdezd egyszerre a szolgáltatást, telefonszámot és e-mailt).
   - Egy megszólalás legfeljebb KÉT rövid mondatból álljon.
   - Mindig várd meg a páciens válaszát, mielőtt továbblépsz.
   - Ha a páciens már megadott egy adatot, NE kérdezd meg újra.
   - A beszélgetés hangzon PÁRBESZÉDNEK, ne adatfelvételi űrlapnak.
   - LÉPÉSEK SORRENDJE:
     a) „Járt már korábban nálunk?" → várd a választ.
     b) Ha IGEN: „Milyen néven találom meg?" → szükség esetén egy azonosító (egyszerre egyet!).
        Ha NEM: „Milyen néven rögzíthetem az időpontot?"
     c) „Milyen szolgáltatásra/időpontra gondolt?" (a szolgáltatás és nap külön-külön, ne egyszerre).
     d) Időpont pontosítása fokozatosan: „Melyik nap?" → „Délelőtt vagy délután?" → max 2-3 konkrét javaslat.
     e) Kapcsolattartási adatok EGYESENKÉNT (csak az időpont után): telefonszám, majd e-mail.
     f) Visszaellenőrzés: röviden foglald össze az egyeztetett adatokat, és csak az összefoglalás után véglegesítsd a foglalást.""")
    rules.append("""6. SZOLGÁLTATÁS PONTOSÍTÁSA: Ha a páciens nem mond konkrét szolgáltatást, NE sorolj fel több kérdést. Egyetlen rövid kérdés: 'Röviden elmondaná, milyen problémával vagy céllal szeretne érkezni?' — a válasz alapján ajánld fel a megfelelő, foglalható szolgáltatást.""")
    rules.append("""7. AZONOSÍTÁSI BIZTONSÁG: A hívószám PSTN-en triviálisan hamisítható — érzékeny adat (betegadat) előtt MINDIG kérj egy második azonosítót (születési dátum, TAJ, vagy a rendszerben tárolt adat).""")

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
    # Read system prompt template: Supabase first, local file as fallback/seed
    template = database.get_text_config("system_prompt")
    if not template:
        if PROMPT_FILE.exists():
            template = PROMPT_FILE.read_text(encoding="utf-8")
            database.update_text_config("system_prompt", template)
        else:
            return "Te egy segítőkész AI vagy."
    pi       = _load_praxisinfo()
    settings = load_agent_settings()
    knowledge_content = _load_knowledge(settings)
    
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
        "today":          (lambda n: f"{n.strftime('%Y.%m.%d.')} ({_HU_DAYS[n.weekday()]}, {n.strftime('%H:%M')})")(datetime.now(_HU_TZ)),
        "practice_name":  pi.get("practice_name", ""),
        "address":        pi.get("address", ""),
        "markanev":       pi.get("markanev", ""),
        "szakterulet":    pi.get("szakterulet", ""),
        "kulcsszavak":    pi.get("kulcsszavak", ""),
        "megkozelites":   pi.get("megkozelites", ""),
        "price_list":     pi.get("price_list", ""),
        "service_description": pi.get("service_description", ""),
        "services_list":  _format_services(),
        "campaigns":      _format_campaigns(pi.get("campaigns", [])),
        "exceptions":     _format_exceptions(pi.get("exceptions", [])),
        "cancellation_policy": _format_cancellation_policy(pi),
        "patient_rules":  _format_patient_rules(pi),
        "faq":            _format_faq(pi.get("faq", [])),
        "knowledge":      _format_knowledge(knowledge_content),
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

    # ── E-mail csatornaszabály: a feladó címét a címzett magától értetődően látja ──
    # Aki emailt ír, annak nyilvánvaló, hogy a címzett látja a feladó címét — a
    # rákérdezés kontraproduktív, a nyilvántartási státusztól függetlenül.
    if channel and channel.lower() == "email":
        result += (
            "\n\n--- E-MAIL CSATORNASZABÁLY ---\n"
            "Az ügyfél EMAIL CÍMÉT SOHA NE KÉRDEZD MEG: minden levél nyilvánvalóan "
            "mutatja, melyik címről érkezett, a rendszer ismeri a feladót. Ez attól "
            "függetlenül érvényes, hogy az ügyfél szerepel-e a nyilvántartásban — "
            "rákérdezni kontraproduktív. A hiányzó, az ügyintézéshez szükséges egyéb "
            "adatokat (pl. teljes név, telefonszám) természetesen el lehet kérni."
        )

    # ── EAISY-241 §1.1.1/§2 — Eljárás-szabályok injektálása a promptba ────────
    # Dinamikusan felépíti a „mit tehet önállóan / mit nem" szabályokat a triage_rules
    # eljárás értékeiből, hogy a hang-agent betartsa a brief non-autonomy követelményeit.
    result += _format_eljaras_rules()

    return result


def _format_eljaras_rules() -> str:
    """
    EAISY-241 — A triage_rules eljárás (onallo/jovahagyas/ember) értékeiből
    felépít egy explicit szabály-blokkot a rendszerprompt számára.
    """
    try:
        rules = database.get_triage_rules()
    except Exception as e:
        logger.error(f"Error loading triage rules for eljaras: {e}")
        return ""

    if not rules:
        return ""

    # Típus → eljárás megjelenítendő név
    ELJARAS_LABEL = {
        "onallo": "önállóan kezelhető",
        "jovahagyas": "jóváhagyást igényel",
        "ember": "embernek továbbítandó",
    }

    lines = ["", "--- EAISY-241 ELJÁRÁS SZABÁLYOK (Szigorú!) ---",
             "Az ügytípusok kezelésének módja a rendszer beállításai szerint:"]
    non_autonomous = []
    for r in rules:
        situation = (r.get("situation") or "").strip()
        priority = (r.get("priority") or "").lower()
        if situation in ("Kérdés", "Kérés", "Panasz", "Időpont", "Egyéb", "Vegyes ügytípus"):
            label = ELJARAS_LABEL.get(priority, priority)
            lines.append(f"- {situation}: {label}")
            if priority in ("ember", "jovahagyas"):
                non_autonomous.append(situation)

    lines.append("")
    lines.append("SZIGORÚ SZABÁLYOK AZ AUTONÓMIAHOZ:")
    if non_autonomous:
        lines.append(
            "- A következő ügytípusoknál SOHA ne adj végleges választ és SOHA ne "
            "intézkedj önállóan (pl. ne foglalj időpontot, ne küldj emailt): "
            + ", ".join(non_autonomous)
            + ". Ezeket az eseteket RÖGZÍTSD (report_alert ha panasz/sürgős), "
            "tájékoztasd az ügyfelet, hogy egy kolléga hamarosan felveszi vele a "
            "kapcsolatot, és adjátok át a beszélgetést embernek."
        )
    lines.append(
        "- PANASZ esetén MINDIG: ne vitatkozz, ne adj ígéreteket, fogadd el a "
        "panaszt, kérj bocsánatot, és azonnal jelezd report_alert('complaint') "
        "címkével, majd add át embernek."
    )
    lines.append(
        "- KÉRÉS esetén (pl. visszahívás, lelet küldése, módosítás): ne teljesítsd "
        "önállóan — rögzítsd és jelezd, hogy egy kolléga intézkedik."
    )
    lines.append("----------------------------------------------------")
    return "\n".join(lines)
