# -*- coding: utf-8 -*-
"""
EAISYDesk — Központi klasszifikációs pipeline (EAISY-241).

3-lépcsős pipeline:
1. Csatorna detektálás (bejön paraméterként)
2. Szándék felismerés (LLM: Gemini 2.5 Flash) → ugytipus + idopont_altipus + detected_types
3. Konfiguráció-vezérelt döntési fa → eredmeny, statusz, teendo

A döntési fa a triage_rules.routing JSONB konfigurációból olvas (nem hardkódolt).
Lásd: migrate_decision_matrix.sql + database.get_triage_rules()

A triage_rules kétféle sort tartalmaz:
  - CORE ügytípusok (Kérdés/Kérés/Panasz/Időpont/Egyéb) — routing JSONB rules-list
    konfiggal, ezeket a _apply_decision_tree olvassa.
  - Kontextus-szabályok (szabad szöveges situation, pl. "Erős fájdalom") — a
    _determine_restriction 1. lépése szöveg-match alapján alkalmazza, a routingjuk
    nem játszik szerepet.

Használat:
    from classifier import classify_interaction
    result = await classify_interaction(message_text="...", channel="whatsapp", ...)
"""

import asyncio
import json
import os
import re
import time
import unicodedata
from pathlib import Path
from loguru import logger
from dotenv import load_dotenv

THIS_DIR = Path(__file__).resolve().parent
load_dotenv(THIS_DIR / ".env")

# ═══════════════════════════════════════════════════════════════════════════════
# CSATORNÁK + PRIORITÁS
# ═══════════════════════════════════════════════════════════════════════════════

# Írásos csatornák (jóváhagyás szükséges alapból; a rules 'channels' filterében
# egyenként is megadhatók)
TEXT_CHANNELS = {"email", "whatsapp", "messenger", "instagram"}

# Csatornák ahol az AI önállóan válaszol (real-time)
REALTIME_CHANNELS = {"telefon", "widget", "phone"}

# EAISY-241 §2.2 — Vegyes ügytípus priorizálás (legmagasabb → legalacsonyabb).
# Ha egy interakció több ügytípust is tartalmaz, a legmagasabb prioritású szerint
# routeoljuk az egészet, de az összes felismert típust visszaadjuk a frontendnek
# (badge-ekhez).
TYPE_PRIORITY = ["Panasz", "Időpont", "Kérés", "Kérdés", "Egyéb"]

# Automation-értékek, amelyek autonóm (emberi jóváhagyás nélküli) végrehajtást
# jelentenek. A voice-agent gating (tools._is_autonomous_allowed) és a
# classify_interaction is ebből dolgozik — single source of truth.
AUTONOMOUS_AUTOMATIONS = ("auto_reply", "auto_booking", "auto_modify", "auto_cancel")

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


def _strip_accents(s: str) -> str:
    """Ékezetek eltávolítása (NFD decompose + non-combining filter) — a keyword
    fallback és a kontextus-szabály match robusztusabbá tételéhez, hogy ragozott /
    ékezet-hibás szövegek is matcheljenek."""
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


# ═══════════════════════════════════════════════════════════════════════════════
# KONFIG CACHE — triage_rules + written_behavior (TTL + explicit invalidálás)
# ═══════════════════════════════════════════════════════════════════════════════

_CONFIG_TTL_SEC = 60
_config_cache: dict = {"triage_rules": (0.0, []), "written_behavior": (0.0, None)}


def invalidate_classifier_cache():
    """A SettingsPage mentés-végpontjai hívják, hogy a következő klasszifikáció
    azonnal friss konfigot lásson (ne a TTL-re kelljen várni)."""
    _config_cache["triage_rules"] = (0.0, [])
    _config_cache["written_behavior"] = (0.0, None)


def _get_triage_rules_cached() -> list[dict]:
    ts, data = _config_cache["triage_rules"]
    if data and (time.monotonic() - ts) < _CONFIG_TTL_SEC:
        return data
    import database as db
    try:
        data = db.get_triage_rules() or []
    except Exception as e:
        logger.error(f"Failed to load triage rules: {e}")
        data = []
    _config_cache["triage_rules"] = (time.monotonic(), data)
    return data


def _get_gemini_api_key() -> str:
    """Gemini API kulcs feloldása (BYOK) — a database.get_gemini_api_key()-re
    delegál (a tenant saját kulcsa a tenant_credentials-ből, különben globális)."""
    import database as db
    return db.get_gemini_api_key()


def _get_written_behavior() -> str:
    ts, val = _config_cache["written_behavior"]
    if val is not None and (time.monotonic() - ts) < _CONFIG_TTL_SEC:
        return val
    import database as db
    try:
        val = db.get_text_config("written_behavior") or ""
    except Exception as e:
        # Fontos: ha a DB nem elérhető, a hívó a normál (nem-override) logikára
        # esik vissza — ezt naplózzuk, mert az admin jóváhagyás-kényszere ilyenkor
        # csendben kikapcsol.
        logger.warning(f"written_behavior lekérés sikertelen (override kihagyva): {e}")
        val = ""
    _config_cache["written_behavior"] = (time.monotonic(), val)
    return val


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
      1. URGENT detektálás — kontextus-szabályok (szöveg-match, ékezet-mentesítve)
         ÉS a típusszabály priority-ja alapján. Az urgent minden mást felülír.
      2. Globális „Írásos kommunikáció" override (text_configs: written_behavior):
         írásos csatornákon approval KÖTELEZŐ — de az urgent így is urgent marad.
      3. Kontextus-alapú EGYEDI szabályok (nem-urgent) — az urgent már kiszűrve,
         a többi közül az első szöveg-match dönt.
      4. Ügytípus szabály (CORE_ISSUE_TYPES) — priority → restriction.
      5. Handover reason (hang-agent átadás).
      6. Csatorna alapú default (írásos → approval, voice → none, ismeretlen → approval).

    Returns: "none" | "approval" | "handover" | "urgent"
    """
    msg_folded = _strip_accents((message_text or "").lower())
    ch = (channel or "").lower()
    CORE_SITUATIONS = {s.lower() for s in SITUATION_BY_TYPE.values()} | {"vegyes ügytípus"}

    # 1. Urgent detektálás — kontextus-szabályok és típusszabály együtt
    urgent = False
    for rule in triage_rules:
        situation = (rule.get("situation") or "").strip()
        if not situation:
            continue
        if _priority_type_to_restriction(rule.get("priority") or "") != "urgent":
            continue
        if situation.lower() in CORE_SITUATIONS:
            # típusszabály: csak ha a felismert ügytípusra vonatkozik
            if ugytipus and situation.lower() == ugytipus.lower():
                urgent = True
                break
        elif _strip_accents(situation.lower()) in msg_folded:
            urgent = True
            break

    # 2. Globális „Írásos kommunikáció" override — de az urgent így is urgent.
    #    (Korábban ez a lépés elnyomta a sürgős kontextus-szabályokat, mert csak a
    #    típusszabályt nézte; most az 1. lépés már mindkét forrást lefedi.)
    if ch in TEXT_CHANNELS:
        wb = _get_written_behavior()
        if wb.lower() in ("approval", "jovahagyas", "jóváhagyás"):
            return "urgent" if urgent else "approval"

    # 3. Urgent minden mást felülír
    if urgent:
        return "urgent"

    # 4. Kontextus-alapú egyedi szabályok (nem-urgent) — első szöveg-match
    for rule in triage_rules:
        situation = (rule.get("situation") or "").strip()
        if not situation or situation.lower() in CORE_SITUATIONS:
            continue
        if _strip_accents(situation.lower()) in msg_folded:
            return _priority_type_to_restriction(rule.get("priority") or "")

    # 5. Ügytípus szabály (a felismert típustól)
    if ugytipus:
        for rule in triage_rules:
            situation = (rule.get("situation") or "").strip()
            if situation.lower() == ugytipus.lower():
                return _priority_type_to_restriction(rule.get("priority") or "")

    # 6. Handover reason
    if handover_reason:
        hr_lower = handover_reason.lower()
        if any(w in hr_lower for w in ("sürgős", "azonnali", "urgent")):
            return "urgent"
        return "handover"

    # 7. Csatorna alapú default
    if ch in TEXT_CHANNELS:
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


def _channel_category(channel: str) -> str:
    """Visszaadja a csatorna kategóriáját a rules 'channels' filteréhez.
    'voice' = telefon/widget/phone; 'text' = írásos; 'unknown' = egyéb."""
    ch = (channel or "").lower()
    if ch in REALTIME_CHANNELS:
        return "voice"
    if ch in TEXT_CHANNELS:
        return "text"
    return "unknown"


def _rule_channel_matches(rule_channels, channel_cat: str, channel: str = "") -> bool:
    """Ellenőrzi, hogy a csatorna beleillik-e a szabály channels filterébe.
    'mind' / üres / hiányzó = minden csatornára illik.
    'voice' = bármely real-time csatorna; 'text' = bármely írásos csatorna;
    konkrét írásos csatorna-név (email/whatsapp/messenger/instagram) = CSAK arra
    a csatornára illik (korábban hibásan minden írásosra illeszkedett)."""
    if not rule_channels:
        return True
    if isinstance(rule_channels, str):
        rule_channels = [rule_channels]
    ch = (channel or "").lower()
    for rc in rule_channels:
        rc = (rc or "").lower()
        if rc in ("mind", "minden", "all", "*", ""):
            return True
        if rc == "voice" and channel_cat == "voice":
            return True
        if rc == channel_cat:
            return True
        if rc in TEXT_CHANNELS:
            if rc == ch:
                return True
    return False


def _rule_kb_matches(rule_kb: str, kb_answered: bool, kb_relevance: str) -> bool:
    """Ellenőrzi a KB-feltétel illeszkedését.
    'any' = bármilyen KB-állapot; 'yes' = KB válaszolt; 'no' = KB nem válaszolt.
    Ha a routing kb_relevance-je 'irrelevant' vagy 'not_applicable', a KB-feltétel
    nem döntési szempont → minden szabály kb-je passzol."""
    if (kb_relevance or "").lower() in ("irrelevant", "not_applicable"):
        return True
    rk = (rule_kb or "any").lower()
    if rk == "any":
        return True
    if rk == "yes":
        return kb_answered
    if rk == "no":
        return not kb_answered
    return True


def _lookup_rule(routing: dict, restriction: str, kb_answered: bool, channel_cat: str, channel: str = "") -> dict | None:
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
        if not _rule_channel_matches(rule.get("channels"), channel_cat, channel):
            continue
        if not _rule_kb_matches(rule.get("kb", "any"), kb_answered, kb_relevance):
            continue
        return rule

    # 2. menet: 'any' restriction-ű szabályok (catch-all)
    for rule in rules:
        r_rest = (rule.get("restriction") or "any").lower()
        if r_rest != "any":
            continue
        if not _rule_channel_matches(rule.get("channels"), channel_cat, channel):
            continue
        if not _rule_kb_matches(rule.get("kb", "any"), kb_answered, kb_relevance):
            continue
        return rule
    return None


_IDOPONT_ALTIPUS_MAP = {
    "uj": "Új",
    "uj idopont": "Új",
    "lemondas": "Lemondás",
    "torles": "Lemondás",
    "modositas": "Módosítás",
    "athelyezes": "Módosítás",
}


def _normalize_altipus(altipus: str | None) -> str | None:
    """Az LLM-től jövő időpont-altípus case/accent-tűrő normalizálása a
    kanonikus Új / Lemondás / Módosítás értékekre (a routing subtypes kulcsai
    case-sensitive-ek, az LLM viszont adhat pl. „új"-t)."""
    if not altipus:
        return None
    key = _strip_accents(altipus.strip().lower())
    return _IDOPONT_ALTIPUS_MAP.get(key)


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
            if routing:  # rules-list struktúra
                rules_container = routing
                # Időpont: altípus-specifikus rules (a subtypes alatt) —
                # az altípust normalizálva keressük (case/accent-tűrő)
                alt_norm = _normalize_altipus(idopont_altipus)
                if ugytipus == "Időpont" and alt_norm and routing.get("subtypes"):
                    sub = routing["subtypes"].get(alt_norm, {})
                    rules_container = sub if sub else routing

                if rules_container.get("rules"):
                    matched = _lookup_rule(rules_container, restriction, kb_answered, channel_cat, channel)
                    if matched:
                        return _rule_to_outcome(matched)

                # Fallback a routing-ban definiált (§6.3)
                if routing.get("fallback"):
                    fb = routing["fallback"]
                    return {"eredmeny": fb.get("eredmeny",""), "statusz": fb.get("statusz",""),
                            "teendo": fb.get("teendo",""), "automation": "handover"}

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
        alt = _normalize_altipus(idopont_altipus)
        if alt == "Új":
            if restriction == "none":
                return {"eredmeny": "Új időpont", "statusz": "Lezárt", "teendo": "Nincs további teendő", "automation": "auto_booking"}
            return {"eredmeny": "Foglalási szándék rögzítve", "statusz": "Nyitott" if restriction != "urgent" else "Sürgős", "teendo": "Időpont véglegesítése", "automation": "handover"}
        if alt == "Módosítás":
            if restriction == "none":
                return {"eredmeny": "Módosított időpont", "statusz": "Lezárt", "teendo": "Nincs további teendő", "automation": "auto_modify"}
            return {"eredmeny": "Módosítási szándék rögzítve", "statusz": "Nyitott" if restriction != "urgent" else "Sürgős", "teendo": "Időpont véglegesítése", "automation": "handover"}
        if alt == "Lemondás":
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


# ═══════════════════════════════════════════════════════════════════════════════
# LLM INTENT DETECTION — Gemini 2.5 Flash
# ═══════════════════════════════════════════════════════════════════════════════

async def _detect_intent_llm(message_text: str) -> dict:
    """
    LLM alapú szándék felismerés.
    Returns: {ugytipus, idopont_altipus, osszefoglalas, detected_types, client_name}
    detected_types: az ÖSSZES felismert ügytípus listája (EAISY-241 §2.2 mixed-type
    prioritáshoz és a frontend badge-megjelenítéshez), ismert típusokra szűrve.

    Bármilyen hiba (hiányzó csomag, hiányzó API-kulcs, Gemini hiba, hibás JSON)
    esetén a kulcsszavas fallback fut — a klasszifikáció sosem omlik össze.
    """
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
    - FONTOS: a FIZIKAI/ORVOSI tünet (fogfájás, erős fájdalom, bölcsességfog-fájdalom,
      duzzanat, vérzés, láz) NEM "Panasz"! A "Panasz" kizárólag a SZOLGÁLTATÁSSAL vagy
      annak minőségével szembeni elégedetlenség (reklamáció), pl. visszatérítési igény,
      panasz a kezelő munkájára.
    - Ha az ügyfél fájdalomra vagy más fizikai tünetre hivatkozva kezelést/időpontot
      kér → ugytipus: "Időpont", idopont_altipus: "Új", és urgens: true.
    - Ha az ügyfél dühös vagy a szolgáltatással elégedetlen (reklamáció), akkor a
      detected_types MINDIG tartalmazza a "Panasz"-t (és az is a domináns ugytipus).
    - Ha az ügyfél csak érdeklődik valami iránt (pl. árak, nyitvatartás), az "Kérdés".
    - MEGLEVŐ IDŐPONTHOZ KAPCSOLÓDÓ TÁJÉKOZTATÓ KÉRDÉS: ha az ügyfél a meglévő/tervezett
      időpontjával kapcsolatban KÉRDEZ (pl. hol található a rendelő, hogyan jut el oda,
      mikor pontosan), és NINCS foglalási, módosítási vagy lemondási szándéka →
      ugytipus: "Kérdés", és a detected_types CSAK ["Kérdés"] legyen — az "Időpont"
      NE szerepeljen, mert nem időpont-akció történt! (257-es ügy tanulsága.)
    - Ha az ügyfél konkrétan kér valamit (pl. visszahívást, leletet), az "Kérés".
    - Egy üzenet lehet több típusú egyszerre: sorold fel mindegyiket a detected_types-ban.
    6. urgens: true | false — true, ha ORVOSI sürgősség van (erős fájdalom, duzzanat,
       vérzés, láz, baleset) vagy az ügyfél sürgősséget jelez ("mihamarabb", "azonnal");
       egyébként false.
    """

    try:
        from google import genai
        from google.genai import types

        api_key = _get_gemini_api_key()
        if not api_key:
            raise ValueError("Missing GEMINI_API_KEY / GOOGLE_API_KEY")

        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            config=types.GenerateContentConfig(
                response_mime_type="application/json"
            ),
            contents=prompt
        )
        # Megengedő parse: a modell alkalmanként érvénytelen escape-t ad (pl. \T),
        # ilyenkor az érvénytelen visszaperjelek eldobásával mentjük a választ.
        try:
            result = json.loads(response.text)
        except json.JSONDecodeError:
            result = json.loads(re.sub(r'\\(?!["\\/bfnrtu])', "", response.text))
        if not isinstance(result, dict):
            raise ValueError(f"LLM intent nem dict-et adott: {type(result)}")
    except Exception as e:
        logger.error(f"LLM Intent detection failed, keyword fallback: {e}")
        return _detect_intent_keyword(message_text)

    # ── Validálás / normalizálás ──
    # detected_types: csak ismert típusok (whitelist) — az LLM által kitalált
    # ismeretlen típus (pl. „Reklamáció") nem szivároghat át a döntési fába.
    detected = result.get("detected_types")
    if not isinstance(detected, list):
        detected = [result.get("ugytipus", "Egyéb")]
    detected = [t for t in detected if t in TYPE_PRIORITY]

    ugytipus = result.get("ugytipus")
    if ugytipus not in TYPE_PRIORITY:
        ugytipus = detected[0] if detected else "Egyéb"
    if not detected:
        detected = [ugytipus]

    result["ugytipus"] = ugytipus
    result["detected_types"] = detected
    result["urgens"] = bool(result.get("urgens"))
    result["idopont_altipus"] = _normalize_altipus(result.get("idopont_altipus")) if ugytipus == "Időpont" else None
    if not isinstance(result.get("client_name"), str) or not result["client_name"].strip():
        result["client_name"] = None
    if not isinstance(result.get("osszefoglalas"), str):
        result["osszefoglalas"] = ""
    return result


# ═══════════════════════════════════════════════════════════════════════════════
# KEYWORD FALLBACK — szóhatáros, ékezet-mentesített matching
# ═══════════════════════════════════════════════════════════════════════════════

def _kw_stems(words_csv: str) -> "re.Pattern":
    """Több szótáras (prefix/stem) matching: a kulcsszó elejére szóhatár kell,
    a végére nem (ragozott alakok is matchelnek: 'panaszkodik', 'fajdalom')."""
    words = [_strip_accents(w.strip()) for w in words_csv.split(",") if w.strip()]
    return re.compile(r"(?<![a-z])(" + "|".join(re.escape(w) for w in words) + r")")


def _kw_exact(words_csv: str) -> "re.Pattern":
    """Teljes szavas matching: mindkét oldalon szóhatár — a veszélyes rövid szavakhoz
    ('faj' → ne matcheljen 'fajl'-ra; 'hol' → ne matcheljen 'holnap'-ra)."""
    words = [_strip_accents(w.strip()) for w in words_csv.split(",") if w.strip()]
    return re.compile(r"(?<![a-z])(" + "|".join(re.escape(w) for w in words) + r")(?![a-z])")


_PANASZ_STEM = _kw_stems("panasz,reklamac,elegedetlen,kifogas,problem,fajdal,elviselhetetlen,panaszkod,complaint")
_PANASZ_EXACT = _kw_exact("baj,faj")
_IDOPONT_STEM = _kw_stems("idopont,booking,naptar,foglalni,foglalna,foglalas,foglalt,lefoglal,befoglal")
_LEMONDAS_STEM = _kw_stems("lemond,torol,cancel,nem tudok menni,megsem,torolne,le szeretnem,le kell mondan,le szeretnem mondan")
_MODOSITAS_STEM = _kw_stems("modosit,athelyez,valtoztat,atrak,mashova,maskor")
# Fizikai/orvosi fájdalom-tünetek — ezek NEM reklamációk (Panasz), hanem sürgős
# időpont-ügyek (ügyfél-visszajelzés, 254-es ügy: "fáj a bölcsességfogam" → Panasz volt).
# Ékezet-mentes tőkék: a "faj" önállóan NEM szerepel, mert a "fajta" hamis találat lenne.
_PAIN_STEM = _kw_stems("fajdal,faj a,faj az,fajos,fogfaj,fejfaj,fogam faj,bolcsesseg,gyullad,duzza,verzes,verzik,verz a,lazas,lazam,elviselhetetlen")
# Valódi, szolgáltatásra vonatkozó reklamáció jelei — ha ezek is megvannak, marad Panasz
_PANASZ_TENYLEGES_STEM = _kw_stems("panasz,reklamac,elegedetlen,kifogas,panaszkod,complaint,visszafizetes,visszaterites")
_KERES_STEM = _kw_stems("szeretnem kerni,szeretnek kerni,kerem,kuldjenek,kuldjuk,visszahiv,hivjanak vissza,intezked,szuksegem lenne")
_KERDES_STEM = _kw_stems("mikor,mennyi,hogyan,miert,kerdez,kerdes")
_KERDES_EXACT = _kw_exact("hol,van-e")


def _detect_intent_keyword(message_text: str) -> dict:
    """
    Kulcsszavas fallback szándék felismerés.
    Returns: {ugytipus, idopont_altipus, osszefoglalas, detected_types, client_name}
    Ékezet-mentesített (_strip_accents), szóhatáros összehasonlítást használ, hogy
    a ragozott/ékezet-hibás szövegek matcheljenek, de a „fájl" ne legyen Panasz.
    """
    t = _strip_accents((message_text or "").lower())
    detected_types = []
    idopont_altipus = None

    # EAISY-241 §2.2 — mindegyik típust függetlenül értékeljük (nem elif), hogy a
    # detected_types tényleg tartalmazza az összes felismertet. A domináns ugytipus
    # a TYPE_PRIORITY (Panasz > Időpont > Kérés > Kérdés > Egyéb) szerint lesz kiválasztva.

    if _PANASZ_STEM.search(t) or _PANASZ_EXACT.search(t):
        detected_types.append("Panasz")

    if _IDOPONT_STEM.search(t):
        detected_types.append("Időpont")
        if _LEMONDAS_STEM.search(t):
            idopont_altipus = "Lemondás"
        elif _MODOSITAS_STEM.search(t):
            idopont_altipus = "Módosítás"
        else:
            idopont_altipus = "Új"

    if _KERES_STEM.search(t):
        detected_types.append("Kérés")

    if "?" in (message_text or "") or _KERDES_STEM.search(t) or _KERDES_EXACT.search(t):
        detected_types.append("Kérdés")

    if not detected_types:
        detected_types = ["Egyéb"]

    # Fizikai/orvosi fájdalom NEM Panasz, hanem sürgős időpont-ügy: a fájdalom-tőkék
    # (fajdal, elviselhetetlen, faj) amúgy Panasznak veszik — ha nincs valódi,
    # szolgáltatásra vonatkozó reklamációs jel, kivesszük és Időpont+Sürgős lesz.
    urgens = bool(_PAIN_STEM.search(t))
    if urgens:
        if "Időpont" not in detected_types:
            detected_types.append("Időpont")
            if idopont_altipus is None:
                idopont_altipus = "Új"
        if "Panasz" in detected_types and not _PANASZ_TENYLEGES_STEM.search(t):
            detected_types.remove("Panasz")

    # Kérdés + Időpont ütközés: ha nincs foglalási ige (foglal/lefoglal/booking…),
    # csak az "időpont" szó szerepel a szövegben, akkor tájékoztató KÉRDÉS-ről van
    # szó — nem időpont-foglalási akcióról (257-es ügy tanulsága).
    if "Kérdés" in detected_types and "Időpont" in detected_types:
        import re as _re_local
        if not _re_local.search(r"foglal|booking|idopontot ker|idopontot szeretn", t):
            detected_types.remove("Időpont")
            idopont_altipus = None

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
        "urgens": urgens,
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

    # 1. Triage szabályok lekérése (60 mp TTL cache — a SettingsPage mentés
    #    invalidálja, így friss konfig is azonnal életbe lép)
    triage_rules = _get_triage_rules_cached()

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

    # Kérdés-dominancia kivétel (257-es ügy): ha a detektálás KÉRDÉST mondott
    # elsődleges típusnak, és az Időpont csak említés szintjén szerepel (pl.
    # "a holnapi időpontommal kapcsolatban hol van a rendelő?") altípus/akció
    # nélkül, akkor a KÉRDÉS marad domináns — nem fordítjuk Időpontra.
    raw_altipus = _normalize_altipus(intent.get("idopont_altipus"))
    if (intent.get("ugytipus") == "Kérdés"
            and "Kérdés" in detected_types and "Időpont" in detected_types
            and not raw_altipus):
        dominant_ugytipus = "Kérdés"

    # Az altípust egy helyen normalizáljuk — a döntési fa és a kimenet is ezt látja
    altipus = raw_altipus if dominant_ugytipus == "Időpont" else None

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
        idopont_altipus=altipus,
    )

    # Fizikai/orvosi sürgősség (fájdalom stb.) + ÚJ időpont-kérés: a cél a mielőbbi
    # időpontadás, nem a lerázás (ügyfél-visszajelzés, 254-es ügy). A sürgősség a
    # STÁTUSZON jelenik meg ("Sürgős"), nem az autonómia letiltásán — ezért az
    # urgent/handover restriction (pl. "Erős fájdalom" kontextus-szabály) itt none-ra
    # oldódik, hogy a döntési fa auto_booking útvonala működhessen.
    urgens = bool(intent.get("urgens"))
    if urgens and dominant_ugytipus == "Időpont" and altipus == "Új" and restriction in ("urgent", "handover"):
        logger.info("🚨 Urgens fizikai panasz + új időpont-kérés: restriction "
                    f"{restriction} → none (mielőbbi időpontadás érdekében)")
        restriction = "none"

    # 5. Döntési fa alkalmazása — konfig-vezérelt (triage_rules.routing)
    decision = _apply_decision_tree(
        ugytipus=dominant_ugytipus,
        idopont_altipus=altipus,
        restriction=restriction,
        kb_answered=kb_answered,
        channel=channel,
        triage_rules=triage_rules,
    )

    # Összefűzés
    result = {
        **intent,
        "ugytipus": dominant_ugytipus,  # domináns típus felülírja az LLM egyetlen tippjét
        "idopont_altipus": altipus,     # normalizált (Új / Lemondás / Módosítás / None)
        "detected_types": detected_types,
        "restriction": restriction,     # EAISY-241 §1.1.2 — none/approval/handover/urgent
        # Autonómia az automation-ből derül ki (nem restriction-ből):
        # auto_* = autonóm (válasz/akció azonnal megy); draft/handover/urgent_handover = nem.
        "autonomous": decision.get("automation", "") in AUTONOMOUS_AUTOMATIONS,
        **{k: v for k, v in decision.items() if k != "automation"},
    }

    # Sürgős fizikai panasz + új időpont-kérés: a státusz "Sürgős" és a teendő a
    # mielőbbi időpontadás — az ügy típusa Időpont marad (nem Panasz, nem lerázás).
    if urgens and dominant_ugytipus == "Időpont" and altipus == "Új":
        result["urgens"] = True
        result["statusz"] = "Sürgős"
        result["eredmeny"] = "Sürgős időpont-kérés"
        result["teendo"] = "Mielőbbi időpont adása"

    logger.info(f"🏷️ Classification [{channel}]: {result}")
    return result
