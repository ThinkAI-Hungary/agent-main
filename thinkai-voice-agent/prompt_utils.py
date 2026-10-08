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
        dur = s.get("duration_minutes", 30)
        assigned = s.get("assigned_to", "")
        note = s.get("note", "")

        line = f"- {name} ({dur} perc)"
        if assigned: line += f" – Felelős: {assigned}"
        if note: line += f" [Foglalási szabály: {note}]"
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

def _booking_self_ops(pi: dict) -> set:
    """A booking_mode szerinti ÖNÁLLÓ műveletek halmaza.
    auto → mind; none/handoff → üres; custom → a booking_custom self-jelű műveletei."""
    mode = (pi.get("booking_mode") or "auto").strip().lower()
    if mode == "auto":
        return {"book", "modify", "delete"}
    if mode == "custom":
        custom = pi.get("booking_custom") or {}
        if isinstance(custom, dict):
            return {k for k in ("book", "modify", "delete") if custom.get(k) == "self"}
        return set()
    return set()


def _format_cancellation_policy(pi: dict) -> str:
    """Módosítási/lemondási tájékoztatók — 2026-09-13-től TEXT-VEZÉRELT.

    2026-09-23: csak akkor renderelődik, ha a booking_mode enged önálló
    foglalást (user-döntés: a szövegeknek csak önálló időpontkezelésnél van
    értelme — a UI-ban is csak ekkor láthatók)."""
    if "book" not in _booking_self_ops(pi) and "modify" not in _booking_self_ops(pi):
        return "Nincs külön lemondási/módosítási szabály."

    rules = []

    mod_txt = (pi.get("modositas_szoveg") or "").strip()
    if mod_txt:
        rules.append(f"Időpontfoglaláskor és időpont-módosításkor TÁJÉKOZTASD az ügyfelet a módosítás feltételeiről ezzel a szöveggel: '{mod_txt}'")

    figy_txt = (pi.get("figyelmezteto_szoveg") or "").strip()
    if figy_txt:
        rules.append(f"24 órán belüli lemondás vagy módosítás esetén (illetve már foglaláskor megelőlegezve) FIGYELMEZTESD az ügyfelet ezzel a szöveggel: '{figy_txt}'")

    return "\n".join(f"- {r}" for r in rules) if rules else "Nincs külön lemondási/módosítási szabály."

def _format_patient_rules(pi: dict) -> str:
    rules = []

    # ── Foglalási mód (2026-09-23): a FŐ KAPCSOLÓ — a többi szabály elé ──
    self_ops = _booking_self_ops(pi)
    mode = (pi.get("booking_mode") or "auto").strip().lower()
    if mode == "none":
        return ("0. FOGLALÁS NEM KÉRHETŐ: ebben a rendszerben időpontot NEM kezelsz — "
                "konkrét időpontot NE AJÁNLJ FEL, ne foglalj és ne erősíts meg. Udvariasan közöld, "
                "hogy időpontfoglalás ezen a csatornán nem érhető el, és ajánld fel, hogy "
                "üzenetet rögzítesz a munkatársaknak. A hívó/író által említett meglévő "
                "időpontokat (dátum, óra, szolgáltatás) NE igazold vissza és NE erősítsd meg — "
                "külső naptárat használnak, annak tartalmát nem ismerheted; az ilyen igényt "
                "szó szerint rögzítsd és add át embernek.")
    if mode == "handoff":
        _need_std = {"date": "preferált dátum", "daypart": "preferált napszak", "colleague": "preferált munkatárs"}
        _needs = pi.get("booking_needs")
        if isinstance(_needs, dict):
            _parts = [_need_std[k] for k in (_needs.get("standard") or []) if k in _need_std] \
                + [str(t) for t in (_needs.get("other") or []) if str(t).strip()]
        elif isinstance(_needs, list):
            _parts = [str(t) for t in _needs]
        else:
            _parts = []
        needs_txt = ", ".join(_parts) if _parts else "preferált dátum, napszak"
        # 2026-10-08: a név + email ALWAYS-kérés — a visszaigazoló SMS/email ezekre megy
        needs_txt = "a hívó NEVE és E-MAIL CÍME (a visszaigazoláshoz kellenek), továbbá: " + needs_txt
        return ("0. CSAK IGÉNYRÖGZÍTÉS ÉS ÁTADÁS: konkrét szabad időpontot NE AJÁNLJ FEL, "
                "időpontot SOHA ne foglalj, ne erősíts meg, és NE ígérj visszaigazolást "
                "(még preferált időpont megjelölését se erősítsd meg — a naptárhoz a te "
                "döntésedhez NINCS hozzáférésed, az időpontot a munkatárs egyezteti)! "
                "A HÍVÓ/ÍRÓ ÁLTAL EMLEGETETT MEGLÉVŐ IDŐPONTOKAT (dátum, óra, szolgáltatás) "
                "NE IGAZOLD VISSZA és NE ERŐSÍTSD MEG — a fogadó külső naptárat használ, "
                "annak tartalmát nem ismerheted, úgy kezeld, mintha vak lennél: az ilyen "
                "igényt szó szerint rögzítsd, pl. 'Foglalási szándékát ezzel együtt "
                "rögzítem: a meglévő pénteki időpontján a fogkőeltávolítás helyett "
                "szeretné, ha a letört szemfogát kezelnék.' Az átütemezésről kollégáid "
                "döntenek — soha ne mondd, hogy 'a naptárhoz nincs hozzáférésem'; "
                "helyette: 'az időpontok véglegesítéséről kollégáim döntenek'. "
                "SOHA ne feddd fel és ne magyarázd el a háttérben beállított működési módot "
                "vagy beállítást (az ügyfélnek csak az látszik, hogy az igényét rögzítetted). "
                "Magadra E/1-ben, virtuális munkatársként hivatkozz ('rögzítettem', "
                "'kollégáim felveszik Önnel a kapcsolatot'), NEM többes számban "
                "('rögzítettük' helyett 'rögzítettem'). A kapcsolatfelvétel-ígéret "
                "FELTÉTEL NÉLKÜLI: a kollégák a preferenciáktól FÜGGETLENÜL felveszik a "
                "kapcsolatot — a preferencia-bekérés csak opcionális kiegészítés, sosem "
                "feltétele a visszajelzésnek (TILOS: 'amint megkaptuk a preferenciáit…'). "
                "A kapcsolatfelvételi ígéret formulája: SÜRGŐS ügyben (pl. fájdalom, "
                "vérzés, duzzanat) IDŐPONT-igénynél így szólj — 'Sürgős ügyként rögzítem "
                "időpontfoglalási szándékát, kollégáim mihamarabb visszahívják Önt a "
                "legkorábbi időpont egyeztetése céljából'; sürgős, NEM időpont-igénynél — "
                "'Sürgős ügyként rögzítem, kollégáim mihamarabb felveszik Önnel a "
                "kapcsolatot'; nem sürgős ügyben — 'kollégáim hamarosan felveszik Önnel "
                "a kapcsolatot'. ÉLŐ ÁTKAPCSOLÁS NINCS: soha ne mondd, hogy 'tartsa a "
                "vonalat', 'most kapcsolom' vagy 'várja a hívást' — a kolléga később, "
                "saját telefonszámról hívja vissza az ügyfelet. "
                f"A válaszban kérdezz rá a HIÁNYZÓ igényfelmérési adatokra ({needs_txt}) — "
                "amit az ügyfél a levelében már megadott, azt NE kérdezd újra (pl. ha megadta a "
                "napot, csak a napsakot kérdezd). Formulád legyen könnyed és opcionális: pl. "
                "'Addig is, ha van elképzelése arról, hogy melyik napon, illetve délelőtt vagy "
                "délután szeretne érkezni, kérjük, írja meg nekünk.' A kapcsolatfelvételi ígéret "
                "mindig ÖNMAGÁBAN álljon, a preferencia-kérdés csak utána, külön mondatban jöjjön. "
                "E-MAIL CÍM A RÖGZÍTÉSHEZ: a beszélgetés végén — ha még nem tudod — kérd el az "
                "ügyfél e-mail címét ('Hová küldhetjük a megerősítést?'), mert a rendszer SMS-ben "
                "visszaigazolja a rögzítést; a címet NE kérj betűzésenként, NE ismételd vissza, "
                "NE igazoltasd vissza szó szerint — a rendszer a hívás után automatikusan "
                "ellenőrzi és SMS-ben erősíti meg.")
    if mode == "custom":
        _hun = {"book": "időpontFOGLALÁS", "modify": "időpont-MÓDOSÍTÁS", "delete": "időpont-LEMONDÁS"}
        _lines = [f"   - {_hun[op]}: {'önállóan kezelheted' if op in self_ops else 'NE kezeld önállóan — rögzítsd az igényt és jelezd, hogy munkatársunk felveszi a kapcsolatot'}" for op in ("book", "modify", "delete")]
        rules.append("0. EGYEDI IDŐPONTKEZELÉS — műveletenként:\n" + "\n".join(_lines))
        if "book" not in self_ops:
            rules.append("   (Foglalni tehát NEM foglalsz önállóan — a többi foglalási lépésszabály csak az önálló műveletekre érvényes.)")

    # Kérdés a beazonosításra
    question = pi.get("pacient_id_question", "Korábban járt már a rendelőnkben?")
    if question:
        rules.append(f"1. A beszélgetés elején — a find_client eredménye alapján — tedd fel a következő kérdést az ügyfél beazonosításához, ha még szükséges: '{question}'")
    else:
        rules.append("1. A beszélgetés elején derítsd ki, hogy az ügyfél járt-e már a rendelőben (új vagy visszatérő páciens) — a find_client eredménye alapján.")

    # Új páciens szabályok
    new_req = pi.get("new_patient_required", "Születési dátum, teljes név")
    rules.append(f"2. HA AZ ÜGYFÉL ÚJ PÁCIENS: Kötelezően kérd be a következő adatokat: '{new_req}'. Minden esetben kötelezően kérd be az e-mail címét is!")
    
    if pi.get("new_patient_auto_visit", True):
        rules.append("   - SZIGORÚ SZABÁLY: Mivel ő egy ÚJ páciens, az első alkalommal KIZÁRÓLAG állapotfelmérésre / általános vizitre (pl. Konzultáció) foglalhatsz neki időpontot! Semmilyen más konkrét kezelésre (pl. tömés, foghúzás) NEM adhatsz időpontot látatlanban. Mondd el neki, hogy az első alkalommal mindenképp egy állapotfelmérésre van szükség.")
        rules.append("   - KIVÉTEL-ELSŐBBLISSÉG: a szolgáltatás-listában az egyes szolgáltatásokhoz fűzött [Foglalási szabály: ...] megjegyzések EZT az általános szabályt FELÜLÍRHATJÁK (pl. ha egy kezelésnél a megjegyzés szerint nincs szükség előzetes konzultációra, akkor új páciensnek is közvetlenül foglalhatsz). A szolgáltatás-specifikus megjegyzés mindig erősebb, mint az általános szabály.")

    # (A visszatérő-páciens bekérő sor 2026-09-23-án kivezetve: a mockup
    # „Új ügyfelek kezelése" blokkja már nem tartalmazza, és a szerveroldali
    # csendes azonosítás (profil-hint) fedi a funkciót.)

    # Meglévő időpont nem tiltó (ugyanarról a számról ismételt hívás)
    rules.append("3b. HA A HÍVÓNAK MÁR VAN KÖZELGŐ IDŐPONTJA (find_client vagy naptár szerint): ezt CSAK TÁJÉKOZTATÁSKÉPPEN említsd ('Látom, várjuk kedden 16:30-kor — foglaljak még egy időpontot?'), és az ÚJ foglalást SOHA ne utasítsd el, ne kérdőjelezd meg, és ne hivatkozz rá a beszélgetés visszaterelésére! Ütközéses időpontnál ajánld fel a tool által javasolt szabad időpontot.")

    # Email bekérése kötelező
    rules.append("4. IDŐPONTFOGLALÁS ESETÉN: Szigorúan kötelező elkérned az ügyfél e-mail címét a foglalás véglegesítése előtt. Tájékoztasd őt róla, hogy erre az e-mail címre fogjuk küldeni a hivatalos visszaigazolást, ami tartalmazza a naptárfájlt és az esetleges lemondáshoz szükséges linket is! AZ E-MAIL CÍMET TERMÉSZETESEN KÉRD BE: NE kérj betűzésenkénti diktálást, NE mondatd vissza betűnként vagy részenként, és NE igazoltasd vissza szó szerint — a rendszer a hívás után automatikusan ellenőrzi a címet. Csak akkor kérj pontosítást, ha a hívó maga javít, vagy amit mondott, annyira érthetetlen, hogy teljes egészében kimaradt. A RÖGZÍTÉS UTÁN NE ISMÉTELD VISSZA a bemondott címet vagy más adatokat (név, telefonszám, időpont) ellenőrzésképpen — elég egy rövid, udvarias igazolás; a pontos ellenőrzést a rendszer végzi el a hívás után. A HÍVÓT TÁJÉKOZTATD az SMS-jóváhagyásról: foglalás után a rendszer SMS-ben elküldi a rögzített e-mail címet, és az SMS-ben lévő linken egy kattintással jóvá tudja hagyni vagy ki tudja javítani — pl. 'Rögzítettem az adatait; e-mail címét SMS-ben elküldjük, ott egy kattintással tudja jóváhagyni, és a visszaigazolás garantáltan a helyes címre érkezik.'")

    # EAISY-241 §7 — Időpontfoglalási beszélgetés szabályai (lépésenkénti)
    rules.append("""7. AZONOSÍTÁSI BIZTONSÁG: A hívószám PSTN-en triviálisan hamisítható — érzékeny adat (betegadat) előtt MINDIG kérj egy második azonosítót (születési dátum, TAJ, vagy a rendszerben tárolt adat).""")
    # 09-21 voice-teszt: az agent ÚGY erősítette meg a foglalást, hogy SOHA nem
    # hívta a book_meeting eszközt (a naptárban semmi nem jött létre) — ezt
    # kell megakadályozni a legszigorúbban:

    rules.append("""9. IDŐPONT MÓDOSÍTÁSA ÉS LEMONDÁSA (SZIGORÚ BIZTONSÁGI SZABÁLYOK):
   - A módosításhoz/lemondáshoz az eseményt az ügyfél EMAIL CÍMÉVEL azonosítod! Ha még nem ismered, KÉRD EL előbb — a tool enélkül visszautasít.
   - Ha a tool TÖBB egyező időpontot ad vissza jelöltekkel (dátum + szolgáltatás + ID): SOHA ne találgasd, melyik az — OLVASD FEL a jelölteket az ügyfélnek, KÉRDEZD RÁ melyiket módosítsa/mondja le, és csak a válasz után hívd újra a toolt a kiválasztott event_id-vel!
   - Ha a tool azt mondja, hogy nem találja az időpontot: NE próbáld más ügyfél eseményével — mondd el az ügyfélnek, és kérj pontosítást (dátum, szolgáltatás).
   - Ütközés vagy zárva tartás esetén NEM módosíthatsz — ajánld fel a tool által javasolt szabad időpontot.""")

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
            "adatokat (pl. teljes név, telefonszám) természetesen el lehet kérni.\n"
            "A „JÁRT MÁR NÁLUNK KORÁBBAN?” KÉRDÉST IS SOHA NE TEDD FEL írásos "
            "kommunikációban: a rendszer a nyilvántartásból és a korábbi levelezésekből "
            "pontosan tudja, az ügyfél új vagy visszatérő vendég — rákérdezni "
            "kontraproduktív és bizalmatlanságot sugall (264-es ügy)."
        )

    # ── VOICE csatorna: kiejtés + beszélgetés-folyam (2026-10-08, user-spec) ──
    if channel and channel.lower() in ("voice", "telefon", "phone"):
        result += (
            "\n\n--- BESZÉD ÉS BESZÉLGETÉS-FOLYAM (hang) ---\n"
            "1. KIEJTÉS: Beszélj természetes, anyanyelvi magyar kiejtéssel. A magyar „s” "
            "hangot az angol „sh” hangnak megfelelően ejtsd, a magyar „sz” hangot pedig az "
            "angol „s” hangnak megfelelően. Erre különösen figyelj a nyitó „Miben segíthetek?” "
            "kérdésben. A kiejtési utasítást soha ne mondd ki.\n"
            "2. AZ ÜDVÖZLŐSZÖVEG UTÁN a hívó problémájára koncentrálj: engedd, hogy elmondja, "
            "mit szeretne — még mielőtt bármilyen adatot bekérnél.\n"
            "3. ADATBEKÉRÉS csak akkor, amikor az ügytípus és a megoldás már tisztázott. "
            "Ekkor pl.: „Rögzítettem időpontfoglalási szándékát, kollégáim hamarosan keresni "
            "fogják időpontjának véglegesítése céljából. Ehhez szükségem van pár adatra: "
            "megadná kérem a nevét (csak ha eddig nem mondta), telefonszámát és e-mail címét?” "
            "Az e-mail címet NE olvasd vissza — csak ennyit jelezz: „E-mail címének "
            "megerősítéséről SMS-t fog kapni, kérjük, igazolja vissza, hogy helyesen "
            "rögzítettük-e.” Lezárás: „Tehetek még valamit Önért?”"
        )

    # ── EAISY-241 §1.1.1/§2 — Eljárás-szabályok injektálása a promptba ────────
    # Dinamikusan felépíti a „mit tehet önállóan / mit nem" szabályokat a triage_rules
    # eljárás értékeiből, hogy a hang-agent betartsa a brief non-autonomy követelményeit.
    result += _format_eljaras_rules(pi, channel=channel)

    return result


def _format_eljaras_rules(pi: dict | None = None, channel: str | None = None) -> str:
    """
    EAISY-241 — A triage_rules eljárás (onallo/jovahagyas/ember) értékeiből
    felépít egy explicit szabály-blokkot a rendszerprompt számára.

    2026-10-06: a booking_mode FELÜLÍRJA az „Időpont" sort (a két igazságforrás
    korábban ellentmondott egymásnak: a prompt eleje „csak igényrögzítés",
    a végén ez a blokk „önállóan kezelhető" — a modell a vége felé nyert).
    handoff/none → az Időpont átkerül a NEM autonóm listába; custom → a
    műveletenkénti bontás a mód-blokkban (patient_rules eleje) látható.
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
    _mode = ((pi or {}).get("booking_mode") or "auto").strip().lower()
    # A mátrix (2026-10-06 user): az Időpont-ügy viselkedése = booking_mode ×
    # írásos kommunikáció (written_behavior). A written-tengely csak ÍRÁSOS
    # csatornákon értelmezett (a voice-ban nincs jóváhagyás-fogalom).
    _is_text = bool(channel) and channel.lower() not in ("voice", "telefon", "phone")
    _written = ""
    if _is_text:
        try:
            _written = (database.get_text_config("written_behavior") or "autonomous").strip()
        except Exception:
            _written = "autonomous"
    for r in rules:
        situation = (r.get("situation") or "").strip()
        priority = (r.get("priority") or "").lower()
        if situation in ("Kérdés", "Kérés", "Panasz", "Időpont", "Egyéb", "Vegyes ügytípus"):
            # booking_mode felülírás az Időpont sorra (mesterkapcsoló a triage fölött)
            if situation == "Időpont":
                if _mode in ("handoff", "none"):
                    label = "NEM autonóm — csak igényrögzítés, átadás embernek (a foglalási mód felülírja)"
                    lines.append(f"- {situation}: {label}")
                    non_autonomous.append(situation)
                    continue
                if _mode == "custom":
                    label = "EGYEDI: műveletenként (foglalás/módosítás/lemondás) a foglalási szabályok szerinti bontásban — a prompt eleji mód-blokk az irányadó"
                    lines.append(f"- {situation}: {label}")
                    continue
                if _is_text and _written == "approval":
                    label = ("naptár-hozzáférés és időpont-felajánlás ENGEDÉLYEZETT, de a válaszlevél "
                             "jóváhagyásra kerül, és a VÉGLEGES befoglalás csak az ügyfél visszaigazoló "
                             "válasza után történik (függő foglalás, 24 órás fenntartás)")
                    lines.append(f"- {situation}: {label}")
                    continue
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
        "- VISSZAHÍVÁSI ÍGÉRET formulája: SÜRGŐS ügyben (pl. fájdalom, vérzés, "
        "duzzanat) IDŐPONT-igénynél így szólj: 'Sürgős ügyként rögzítem "
        "időpontfoglalási szándékát, kollégáim mihamarabb visszahívják Önt a "
        "legkorábbi időpont egyeztetése céljából'; sürgős, NEM időpont-igénynél: "
        "'Sürgős ügyként rögzítem, kollégáim mihamarabb felveszik Önnel a "
        "kapcsolatot'; nem sürgős ügyben: 'kollégáim hamarosan felveszik Önnel a "
        "kapcsolatot'. ÉLŐ ÁTKAPCSOLÁS NINCS: soha ne mondd, hogy 'tartsa a "
        "vonalat', 'most kapcsolom' vagy 'várja a hívást' — a kolléga később, "
        "saját telefonszámról hívja vissza az ügyfelet."
    )
    lines.append(
        "- KAPCSOLATADAT-BEKÉRÉS igényrögzítéskor (2026-10-08): amikor az igényt "
        "rögzíted és átadsd embernek, a hívó NEVÉT, TELEFONSZÁMÁT és E-MAIL CÍMÉT "
        "mindig kérdezd meg, ha még nincsenek meg — a visszaigazoló SMS és email "
        "ezekre az adatokra megy. Az e-mail címet NE olvasd vissza: csak ennyit "
        "jelizz — 'E-mail címének megerősítéséről SMS-t fog kapni, kérjük, igazolja "
        "vissza, hogy helyesen rögzítettük-e.' Név, telefonszám vagy érvényes "
        "e-mail cím nélkül NE zárd le az igényt."
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
