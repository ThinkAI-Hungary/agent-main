# -*- coding: utf-8 -*-
"""
EAISYDesk — Központi klasszifikációs pipeline (EAISY-241).

3-lépcsős pipeline:
1. Csatorna detektálás (bejön paraméterként)
2. Szándék felismerés (LLM: Gemini 2.5 Flash) → ugytipus + idopont_altipus + detected_types
3. Konfiguráció-vezérelt döntési fa → eredmeny, statusz, teendo

A döntési fa a triage_rules.routing JSONB konfigurációból olvas (nem hardkódolt).
Lásd: migrate_decision_matrix.sql + database.get_decision_matrix()

Használat:
    from classifier import classify_interaction
    result = await classify_interaction(message_text="...", channel="whatsapp", ...)
"""

import asyncio
import json
import os
from pathlib import Path
from loguru import logger
from dotenv import load_dotenv

THIS_DIR = Path(__file__).resolve().parent
load_dotenv(THIS_DIR / ".env")

# ═══════════════════════════════════════════════════════════════════════════════
# CSATORNÁK + PRIORITÁS
# ═══════════════════════════════════════════════════════════════════════════════

# Csatornák ahol jóváhagyás szükséges (text csatornák)
APPROVAL_CHANNELS = {"email", "whatsapp", "messenger", "instagram"}

# Csatornák ahol az AI önállóan válaszol (real-time)
REALTIME_CHANNELS = {"telefon", "widget", "phone"}

# EAISY-241 §2.2 — Vegyes ügytípus priorizálás (legmagasabb → legalacsonyabb).
# Ha egy interakció több ügytípust is tartalmaz, a legmagasabb prioritású szerint
# routeoljuk az egészet, de az összes felismert típust visszaadjuk a frontendnek
# (badge-ekhez).
TYPE_PRIORITY = ["Panasz", "Időpont", "Kérés", "Kérdés", "Egyéb"]

# Ügytípus → triage_rules.situation leképezés (a situation oszlop tartalmazza a típust)
# A kontextus alapú egyedi szabályok (brief 1.1.3) szabad szöveges situation-ök,
# ezek az „alap" típusok azonban a CORE_ISSUE_TYPES-ból jönnek.
SITUATION_BY_TYPE = {
    "Kérdés": "Kérdés",
    "Kérés": "Kérés",
    "Panasz": "Panasz",
    "Időpont": "Időpont",
    "Egyéb": "Egyéb",
}


def _priority_type_to_restriction(priority: str) -> str:
    """
    EAISY-241 §1.1.2 / 1.1.3 — a triage_rules 'eljárás' (priority) értékének
    leképezése korlátozási szintre. Ez a korábban hiányzó bekötés: a SettingsPage
    UI-ban beállított onallo/jovahagyas/ember értékeket a classifier eddig ignorálta.
    """
    p = (priority or "").lower().strip()
    # „eljárás" értékek (SettingsPage CORE_ISSUE_TYPES)
    if p in ("onallo", "önálló", "onallokezeles"):
        return "none"
    if p in ("jovahagyas", "jóváhagyás", "jovahagyas_szukseges"):
        return "approval"
    if p in ("ember", "handoff", "embernek", "átadás", "atadas"):
        return "handover"
    # régi / sürgős értékek (back-compat)
    if p in ("sürgős", "surgos", "kiemelt", "urgent", "eloatadas"):
        return "urgent"
    return "approval"  # ismeretlen → safe default


def _determine_restriction(
    channel: str,
    triage_rules: list[dict],
    message_text: str,
    handover_reason: str = "",
    ugytipus: str = "",
    idopont_altipus: str | None = None,
) -> str:
    """
    EAISY-241 — Meghatározza a korlátozási szintet.

    Sorrend:
      1. Kontextus-alapú EGYEDI szabályok (brief 1.1.3) — ha a szöveg tartalmazza
         egy szabály situation-ét, annak priority-ja dönt. (Csak NEM-alap típusú
         szabályokra, hogy ne írják felül a típusszabályokat.)
      2. Ügytípus szabály (CORE_ISSUE_TYPES) — a felismert ugytipushoz tartozó
         eljárás értéke.
      3. Speciális eset: Időpont Módosítás/Lemondás sosem autonóm (brief 1.1.3)
         akkor sem, ha az Időpont eljárása onallo.
      4. Handover reason (hang-agent átadás).
      5. Csatorna alapú default.

    Returns: "none" | "approval" | "handover" | "urgent"
    """
    msg_lower = (message_text or "").lower()
    ch = (channel or "").lower()

    # 0. EAISY-241: Globális „Írásos kommunikáció beállításai" override.
    # Ha a admin a UI-on „Jóváhagyás szükséges"-re állította (text_configs:
    # written_behavior = 'approval'), akkor az írásos csatornákon (email,
    # messenger, instagram, whatsapp) MINDIG approval legyen, függetlenül
    # attól, hogy a triage_rules-ban az ügytípus onallo-e.
    if ch in APPROVAL_CHANNELS:
        try:
            import database as _db
            wb = _db.get_text_config("written_behavior") or ""
            if wb.lower() in ("approval", "jovahagyas", "jóváhagyás"):
                # Sürgős/urgent még mindig felülírja (panasz pl.)
                for rule in triage_rules:
                    if ((rule.get("situation") or "").strip().lower() == (ugytipus or "").strip().lower()
                        and (rule.get("priority") or "").strip().lower() in ("surgos", "sürgős", "urgent", "kiemelt")):
                        return "urgent"
                return "approval"
        except Exception:
            pass  # ha nem elérhető a DB, tovább a normál logikára

    # 1. Kontextus-alapú egyedi szabályok — csak azokra amik NEM alap ügytípusok
    CORE_SITUATIONS = {s.lower() for s in SITUATION_BY_TYPE.values()} | {"vegyes ügytípus"}
    for rule in triage_rules:
        situation = (rule.get("situation") or "").strip()
        priority = (rule.get("priority") or "").strip()
        situation_lower = situation.lower()
        # Csak konkrét (nem alap-típus) szabály matchelhet szövegre
        if situation_lower in CORE_SITUATIONS:
            continue
        if situation_lower and situation_lower in msg_lower:
            r = _priority_type_to_restriction(priority)
            # sürgős mindig felülír
            if r == "urgent":
                return "urgent"
            # egyéb kontextus-szabály: felülírja a defaultot, de a típusszabály (l. 2.) nem
            # Itt rögtön visszatérünk, mert a kontextus-szabály specifikusabb.
            return r

    # 2. Ügytípus szabály (a felismert típustól)
    if ugytipus:
        for rule in triage_rules:
            situation = (rule.get("situation") or "").strip()
            priority = (rule.get("priority") or "").strip()
            if situation.lower() == ugytipus.lower():
                restriction = _priority_type_to_restriction(priority)

                # Megj.: a korábbi „Módosítás/Lemondás sosem autonóm → none→handover"
                # és „autonomous_allowed=false" kikényszerítések ELAVULTAK a rules-list
                # struktúrával — a rule-matching már a routing.rules listából pontosan
                # feloldja a kimenetet (a subtypes alatt minden altípus külön szabállyal).
                # Itt csak a priority → restriction leképezés történik.

                if restriction == "urgent":
                    return "urgent"
                return restriction

    # 4. Handover reason
    if handover_reason:
        hr_lower = handover_reason.lower()
        if any(w in hr_lower for w in ("sürgős", "azonnali", "urgent")):
            return "urgent"
        return "handover"

    # 5. Csatorna alapú default
    if ch in APPROVAL_CHANNELS:
        return "approval"
    elif ch in REALTIME_CHANNELS:
        return "none"
    else:
        return "approval"  # unknown → safe default


def _normalize_routing(raw) -> dict:
    """A routing mező lehet dict vagy JSON string — normalizálja dict-té."""
    if not raw:
        return {}
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except Exception:
            return {}
    return {}


# Csatorna-kategóriák a §4.1 filterekhez (íráos / voice / minden)
TEXT_CHANNELS = {"email", "whatsapp", "messenger", "instagram"}


def _channel_category(channel: str) -> str:
    """Visszaadja a csatorna kategóriáját a rules 'channels' filteréhez.
    'voice' = telefon/widget/phone; 'text' = írásos; 'unknown' = egyéb."""
    ch = (channel or "").lower()
    if ch in REALTIME_CHANNELS:
        return "voice"
    if ch in TEXT_CHANNELS:
        return "text"
    return "unknown"


def _rule_channel_matches(rule_channels, channel_cat: str) -> bool:
    """Ellenőrzi, hogy a csatorna beleillik-e a szabály channels filterébe.
    'mind' / üres / hiányzó = minden csatornára illik."""
    if not rule_channels:
        return True
    if isinstance(rule_channels, str):
        rule_channels = [rule_channels]
    for rc in rule_channels:
        rc = (rc or "").lower()
        if rc in ("mind", "minden", "all", "*", ""):
            return True
        if rc == "voice" and channel_cat == "voice":
            return True
        if rc == channel_cat:
            return True
        # írásos csatornák egyenként is
        if rc in TEXT_CHANNELS and channel_cat == "text":
            return True
    return False


def _rule_kb_matches(rule_kb: str, kb_answered: bool, kb_relevance: str) -> bool:
    """Ellenőrzi a KB-feltétel illeszkedését.
    'any' = bármilyen KB-állapot (vagy nem döntési feltétel / irreleváns);
    'yes' = KB válaszolt; 'no' = KB nem válaszolt."""
    rk = (rule_kb or "any").lower()
    if rk == "any":
        return True
    if rk == "yes":
        return kb_answered
    if rk == "no":
        return not kb_answered
    return True


def _lookup_rule(routing: dict, restriction: str, kb_answered: bool, channel_cat: str) -> dict | None:
    """
    EAISY-241 (REDUX) — A routing 'rules' listából kiválasztja az illeszkedő szabályt.
    Illeszkedési feltételek: channels filter, kb feltétel, restriction.

    Két menet (specificitás szerint):
      1. menet: konkrét restriction-match (a rule.restriction == a tényleges restriction).
         Az 'any' restriction-ű szabályok itt NEM vesznek részt — így egy konkrét
         'none' szabály nyer az 'any' fölött, ha mindkettő illeszkedik a csatornára.
      2. menet: 'any' restriction-ű szabályok (catch-all fallback).
    Mindkét menetben a channels + kb filtereket ellenőrizzük.
    """
    rules = routing.get("rules") or []
    kb_relevance = routing.get("kb_relevance", "irrelevant")
    target = (restriction or "any").lower()

    # 1. menet: konkrét restriction (rule.restriction == target, kizárva az 'any'-ket)
    for rule in rules:
        r_rest = (rule.get("restriction") or "any").lower()
        if r_rest == "any":
            continue
        if r_rest != target:
            continue
        if not _rule_channel_matches(rule.get("channels"), channel_cat):
            continue
        if not _rule_kb_matches(rule.get("kb", "any"), kb_answered, kb_relevance):
            continue
        return rule

    # 2. menet: 'any' restriction-ű szabályok (catch-all)
    for rule in rules:
        r_rest = (rule.get("restriction") or "any").lower()
        if r_rest != "any":
            continue
        if not _rule_channel_matches(rule.get("channels"), channel_cat):
            continue
        if not _rule_kb_matches(rule.get("kb", "any"), kb_answered, kb_relevance):
            continue
        return rule
    return None


def _rule_to_outcome(rule: dict) -> dict:
    """Egy szabály dict-ből kimenet dict-et csinál: {eredmeny, statusz, teendo, automation}."""
    if not rule:
        return {}
    return {
        "eredmeny": rule.get("eredmeny", ""),
        "statusz": rule.get("statusz", ""),
        "teendo": rule.get("teendo", ""),
        "automation": rule.get("automation", ""),
    }


def _apply_decision_tree(
    ugytipus: str,
    idopont_altipus: str | None,
    restriction: str,
    kb_answered: bool,
    channel: str,
    triage_rules: list[dict] = None,
) -> dict:
    """
    EAISY-241 (REDUX) — Konfiguráció-vezérelt döntési fa a rules-list mátrixból.

    Először a triage_rules.routing 'rules' listájából szabály-illesztéssel
    (ügytípus + altípus + csatorna-filter + KB + korlátozás) feloldja a kimenetet.
    Ha nincs illeszkedő szabály, a routing 'fallback' mezőjét használja (§6.3).
    Ha a routing konfig hiányzik, a hardkódolt if/elif láncra esik vissza (back-compat).

    Returns: {eredmeny, statusz, teendo, automation}
    """
    channel_cat = _channel_category(channel)

    # ── KONFIG-VEZÉRELT ÚTVONAL (rules-list mátrix) ──
    if triage_rules:
        rule_entry = None
        for r in triage_rules:
            if (r.get("situation") or "").strip().lower() == (ugytipus or "").strip().lower():
                rule_entry = r
                break
        if rule_entry:
            routing = _normalize_routing(rule_entry.get("routing"))
            if routing:  # új rules-list struktúra
                rules_container = routing
                # Időpont: altípus-specifikus rules (a subtypes alatt)
                if ugytipus == "Időpont" and idopont_altipus and routing.get("subtypes"):
                    sub = routing["subtypes"].get(idopont_altipus, {})
                    rules_container = sub if sub else routing

                if rules_container.get("rules"):
                    matched = _lookup_rule(rules_container, restriction, kb_answered, channel_cat)
                    if matched:
                        return _rule_to_outcome(matched)

                # Fallback a routing-ban definiált (§6.3)
                if routing.get("fallback"):
                    fb = routing["fallback"]
                    return {"eredmeny": fb.get("eredmeny",""), "statusz": fb.get("statusz",""),
                            "teendo": fb.get("teendo",""), "automation": "handover"}

            # Back-compat: régi outcomes-struktúra (még nem migrált szabályok)
            elif rule_entry.get("routing"):
                kb_required = bool(_normalize_routing(rule_entry.get("routing")).get("kb_required", False))
                outcome = _lookup_outcome_legacy(rule_entry.get("routing"), restriction, kb_answered, kb_required)
                if outcome:
                    return outcome

    # ── HARDKÓDOLT FALLBACK (back-compat: ha nincs routing konfig) ──
    if ugytipus == "Kérdés":
        if kb_answered:
            if restriction == "none":
                return {"eredmeny": "Megválaszolt kérdés", "statusz": "Lezárt", "teendo": "Nincs további teendő", "automation": "auto_reply"}
            elif restriction == "approval" and channel_cat == "text":
                return {"eredmeny": "Válasz előkészítve", "statusz": "Nyitott", "teendo": "Jóváhagyás szükséges", "automation": "draft"}
            elif restriction == "handover":
                return {"eredmeny": "Kérdés rögzítve", "statusz": "Nyitott", "teendo": "Válasz/visszahívás szükséges", "automation": "handover"}
            elif restriction == "urgent":
                return {"eredmeny": "Kérdés rögzítve", "statusz": "Sürgős", "teendo": "Azonnali beavatkozás szükséges", "automation": "urgent_handover"}
        if restriction == "urgent":
            return {"eredmeny": "Kérdés rögzítve", "statusz": "Sürgős", "teendo": "Azonnali beavatkozás szükséges", "automation": "urgent_handover"}
        return {"eredmeny": "Kérdés rögzítve", "statusz": "Nyitott", "teendo": "Válasz/visszahívás szükséges", "automation": "handover"}

    if ugytipus == "Időpont":
        if idopont_altipus == "Új":
            if restriction == "none":
                return {"eredmeny": "Új időpont", "statusz": "Lezárt", "teendo": "Nincs további teendő", "automation": "auto_booking"}
            return {"eredmeny": "Foglalási szándék rögzítve", "statusz": "Nyitott" if restriction != "urgent" else "Sürgős", "teendo": "Időpont véglegesítése", "automation": "handover"}
        if idopont_altipus == "Módosítás":
            if restriction == "none":
                return {"eredmeny": "Módosított időpont", "statusz": "Lezárt", "teendo": "Nincs további teendő", "automation": "auto_modify"}
            return {"eredmeny": "Módosítási szándék rögzítve", "statusz": "Nyitott" if restriction != "urgent" else "Sürgős", "teendo": "Időpont véglegesítése", "automation": "handover"}
        if idopont_altipus == "Lemondás":
            if restriction == "none":
                return {"eredmeny": "Törölt időpont", "statusz": "Lezárt", "teendo": "Nincs további teendő", "automation": "auto_cancel"}
            return {"eredmeny": "Lemondási szándék rögzítve", "statusz": "Nyitott" if restriction != "urgent" else "Sürgős", "teendo": "Időpont véglegesítése", "automation": "handover"}

    if ugytipus == "Panasz":
        return {"eredmeny": "Panasz rögzítve", "statusz": "Sürgős", "teendo": "Azonnali beavatkozás szükséges", "automation": "urgent_handover"}

    if ugytipus == "Kérés":
        if restriction == "urgent":
            return {"eredmeny": "Igény rögzítve", "statusz": "Sürgős", "teendo": "Azonnali beavatkozás szükséges", "automation": "urgent_handover"}
        return {"eredmeny": "Igény rögzítve", "statusz": "Nyitott", "teendo": "Intézkedés", "automation": "handover"}

    if restriction == "urgent":
        return {"eredmeny": "Igény rögzítve", "statusz": "Sürgős", "teendo": "Azonnali beavatkozás szükséges", "automation": "urgent_handover"}
    return {"eredmeny": "Igény rögzítve", "statusz": "Nyitott", "teendo": "Intézkedés", "automation": "handover"}


def _lookup_outcome_legacy(routing_raw, restriction: str, kb_answered: bool, kb_required: bool) -> dict | None:
    """Back-compat: a régi 'outcomes'/{kb_not_answered} struktúra olvasása
    a még nem migrált kontextus-szabályokhoz. Az új rules-list migráció után felesleges."""
    routing = _normalize_routing(routing_raw)
    if not routing:
        return None
    use_section = "outcomes"
    if kb_required and not kb_answered and "kb_not_answered" in routing:
        use_section = "kb_not_answered"
    section = routing.get(use_section) or routing.get("outcomes") or {}
    outcome = section.get(restriction)
    if outcome:
        return outcome
    if restriction != "handover":
        fallback = section.get("handover")
        if fallback:
            return fallback
    return None


# ═══════════════════════════════════════════════════════════════════════════════
# LLM INTENT DETECTION — Gemini 2.5 Flash
# ═══════════════════════════════════════════════════════════════════════════════

async def _detect_intent_llm(message_text: str) -> dict:
    """
    LLM alapú szándék felismerés.
    Returns: {ugytipus, idopont_altipus, osszefoglalas, detected_types}
    detected_types: az ÖSSZES felismert ügytípus listája (EAISY-241 §2.2 mixed-type
    prioritáshoz és a frontend badge-megjelenítéshez).
    """
    from google import genai
    from google.genai import types

    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        raise ValueError("Missing GEMINI_API_KEY / GOOGLE_API_KEY")

    client = genai.Client(api_key=api_key)

    prompt = f"""
    Feladatod egy ügyfélszolgálati üzenet/hívás klasszifikációja.

    Üzenet szövege:
    \"\"\"{message_text}\"\"\"

    Kérlek határozd meg az alábbiakat JSON formátumban:
    1. ugytipus: "Időpont" | "Kérdés" | "Panasz" | "Kérés" | "Egyéb" — a DOMINÁNS típus
    2. idopont_altipus: CSAK ha ugytipus="Időpont", akkor: "Új" | "Lemondás" | "Módosítás". Egyébként null.
    3. detected_types: az ÖSSZES felismert ügytípus listája (tömb). Egy üzenet több
       típust is tartalmazhat (pl. panasz + időpont-kérés). Ha csak egy van, akkor egyelemű lista.
       Lehetséges értékek: "Időpont", "Kérdés", "Panasz", "Kérés", "Egyéb".
    4. osszefoglalas: Rövid, 1 mondatos összefoglalás magyarul.
    5. client_name: A hívó/ügyfél NEVE, ha elhangzott a beszélgetésben (pl. "Balyos Judit").
       Ha nem derült ki a név, akkor null. CSAK a ténylegesen elhangzott nevet add meg,
       ne találj ki!

    Szabályok:
    - Ha az ügyfél dühös, fájdalomra panaszkodik vagy elégedetlen, akkor a detected_types
      MINDIG tartalmazza a "Panasz"-t (és az is a domináns ugytipus).
    - Ha az ügyfél csak érdeklődik valami iránt (pl. árak, nyitvatartás), az "Kérdés".
    - Ha az ügyfél konkrétan kér valamit (pl. visszahívást, leletet), az "Kérés".
    - Egy üzenet lehet több típusú egyszerre: sorold fel mindegyiket a detected_types-ban.
    """

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            config=types.GenerateContentConfig(
                response_mime_type="application/json"
            ),
            contents=prompt
        )
        result = json.loads(response.text)
        # Biztosítsuk, hogy detected_types mindig létezzen
        if "detected_types" not in result:
            result["detected_types"] = [result.get("ugytipus", "Egyéb")]
        elif not isinstance(result["detected_types"], list):
            result["detected_types"] = [result.get("ugytipus", "Egyéb")]
        return result
    except Exception as e:
        logger.error(f"LLM Intent detection failed: {e}")
        return _detect_intent_keyword(message_text)


import unicodedata

def _strip_accents(s: str) -> str:
    """Ékezetek eltávolítása (NFD decompose + non-combining filter) — a keyword
    fallback robusztusabbá tételéhez, hogy ragozott/ékezet-hibás szövegek is matcheljenek."""
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def _detect_intent_keyword(message_text: str) -> dict:
    """
    Kulcsszavas fallback szándék felismerés.
    Returns: {ugytipus, idopont_altipus, osszefoglalas, detected_types}
    Ékezet-mentes összehasonlítást használ (_strip_accents), hogy a ragozott vagy
    hibásan gépelt szövegek is matcheljenek.
    """
    t = _strip_accents((message_text or "").lower())
    detected_types = []
    idopont_altipus = None

    # EAISY-241 §2.2 — mindegyik típust függetlenül értékeljük (nem elif), hogy a
    # detected_types tényleg tartalmazza az összes felismertet. A domináns ugytipus
    # a TYPE_PRIORITY (Panasz > Időpont > Kérés > Kérdés > Egyéb) szerint lesz kiválasztva.

    if any(w in t for w in _strip_accents("panasz,reklamacio,eledetlen,complaint,kifogas,problem,baj,faj,elviselhetetlen,nem vagyok egedetlen").split(",")):
        detected_types.append("Panasz")

    if any(w in t for w in _strip_accents("idopont,foglal,booking,naptar,lemond").split(",")):
        detected_types.append("Időpont")
        if any(w in t for w in _strip_accents("lemond,torol,cancel,nem tudok menni,megsem,torolne,le szeretnem").split(",")):
            idopont_altipus = "Lemondás"
        elif any(w in t for w in _strip_accents("modosit,athelyez,valtoztat,atrak,mashova,maskor").split(",")):
            idopont_altipus = "Módosítás"
        else:
            idopont_altipus = "Új"

    if any(w in t for w in _strip_accents("szeretnek kerni,kerm kuldjk,kuldjenek,visszahivas,hivjanak vissza,intezkedj,kuldjk el,szuksegem lenne,kerm").split(",")):
        detected_types.append("Kérés")

    if "?" in (message_text or "") or any(w in t for w in _strip_accents("mikor,hol,mennyi,hogyan,miert,van-e,kerdez,kerdes").split(",")):
        detected_types.append("Kérdés")

    if not detected_types:
        detected_types = ["Egyéb"]

    # Domináns típus a prioritás szerint
    ugytipus = "Egyéb"
    for t_type in TYPE_PRIORITY:
        if t_type in detected_types:
            ugytipus = t_type
            break

    return {
        "ugytipus": ugytipus,
        "idopont_altipus": idopont_altipus,
        "osszefoglalas": "",  # Fallback can't summarize well
        "detected_types": detected_types,
        "client_name": None,  # Keyword fallback can't extract names
    }


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN ENTRY POINT
# ═══════════════════════════════════════════════════════════════════════════════

async def classify_interaction(
    message_text: str,
    channel: str,
    tool_calls: list[str] | None = None,
    handover_reason: str = "",
    kb_answered: bool | None = None,
) -> dict:
    """
    Az interakció klasszifikációja.
    
    Args:
        message_text: Az interakció szövege / transzkriptje.
        channel: A csatorna (email, whatsapp, messenger, instagram, telefon, widget).
        tool_calls: A hívás során használt eszközök nevei (opcionális).
        handover_reason: Az átadás oka (opcionális).
        kb_answered: Explicit jelzés, hogy a KB alapján megválaszolásra került-e (opcionális).
        
    Returns: {
        ugytipus, idopont_altipus, 
        eredmeny, statusz, teendo, 
        osszefoglalas
    }
    """
    logger.info(f"🔍 Classifying interaction from [{channel}]...")

    # 1. Triage szabályok lekérése
    import database as db
    triage_rules = []
    try:
        triage_rules = db.get_triage_rules()
    except Exception as e:
        logger.error(f"Failed to load triage rules: {e}")

    # 2. Szándék detektálás (LLM vagy keyword fallback)
    intent = await _detect_intent_llm(message_text)

    # EAISY-241 §2.2 — Vegyes ügytípus prioritás: a detected_types-ből a legmagasabb
    # prioritású (Panasz > Időpont > Kérés > Kérdés > Egyéb) szerint routeoljuk az
    # EGESZ interakciót, de az összes felismert típust visszaadjuk a frontendnek.
    detected_types = intent.get("detected_types") or [intent.get("ugytipus", "Egyéb")]
    dominant_ugytipus = intent.get("ugytipus", "Egyéb")
    for t_type in TYPE_PRIORITY:
        if t_type in detected_types:
            dominant_ugytipus = t_type
            break

    # 3. KB-megválaszolhatóság detektálása (tool calls alapján, ha nincs explicit megadva)
    if kb_answered is None:
        kb_answered = False
        if tool_calls:
            if any(tc in ("lookup_info", "book_meeting") for tc in tool_calls):
                kb_answered = True

    # 4. Korlátozások meghatározása — most már ugytipus + idopont_altipus tudatában
    restriction = _determine_restriction(
        channel, triage_rules, message_text, handover_reason,
        ugytipus=dominant_ugytipus,
        idopont_altipus=intent.get("idopont_altipus"),
    )

    # 5. Döntési fa alkalmazása — konfig-vezérelt (triage_rules.routing)
    decision = _apply_decision_tree(
        ugytipus=dominant_ugytipus,
        idopont_altipus=intent.get("idopont_altipus"),
        restriction=restriction,
        kb_answered=kb_answered,
        channel=channel,
        triage_rules=triage_rules,
    )

    # Összefűzés
    result = {
        **intent,
        "ugytipus": dominant_ugytipus,  # domináns típus felülírja az LLM egyetlen tippjét
        "detected_types": detected_types,
        "restriction": restriction,     # EAISY-241 §1.1.2 — none/approval/handover/urgent
        # Autonómia az automation-ből derül ki (nem restriction-ből):
        # auto_* = autonóm (válasz/akció azonnal megy); draft/handover/urgent_handover = nem.
        "autonomous": decision.get("automation", "") in ("auto_reply", "auto_booking", "auto_modify", "auto_cancel"),
        **{k: v for k, v in decision.items() if k != "automation"},
    }

    logger.info(f"🏷️ Classification [{channel}]: {result}")
    return result
