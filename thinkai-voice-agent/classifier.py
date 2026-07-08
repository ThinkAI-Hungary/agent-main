# -*- coding: utf-8 -*-
"""
EAISYDesk — Központi klasszifikációs pipeline.

3-lépcsős pipeline:
1. Csatorna detektálás (bejön paraméterként)
2. Szándék felismerés (LLM: Gemini 2.5 Flash) → ugytipus + idopont_altipus
3. Determinisztikus döntési fa → eredmeny, statusz, teendo

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
# DECISION TREE — determinisztikus logika a spec alapján
# ═══════════════════════════════════════════════════════════════════════════════

# Csatornák ahol jóváhagyás szükséges (text csatornák)
APPROVAL_CHANNELS = {"email", "whatsapp", "messenger", "instagram"}

# Csatornák ahol az AI önállóan válaszol (real-time)
REALTIME_CHANNELS = {"telefon", "widget", "phone"}


def _determine_restriction(
    channel: str,
    triage_rules: list[dict],
    message_text: str,
    handover_reason: str = "",
) -> str:
    """
    Meghatározza a korlátozási szintet a triage szabályok és csatorna alapján.

    Returns: "none" | "approval" | "handover" | "urgent"
    """
    msg_lower = (message_text or "").lower()

    # 1. Triage szabályok ellenőrzése — ha bármelyik sürgős szabály matchel
    for rule in triage_rules:
        situation = (rule.get("situation") or "").lower()
        priority = (rule.get("priority") or "").lower()
        if situation and situation in msg_lower:
            if priority in ("sürgős", "surgos", "kiemelt", "urgent"):
                return "urgent"

    # 2. Handover reason ellenőrzése
    if handover_reason:
        hr_lower = handover_reason.lower()
        if any(w in hr_lower for w in ("sürgős", "azonnali", "urgent")):
            return "urgent"
        return "handover"

    # 3. Csatorna alapú default
    ch = (channel or "").lower()
    if ch in APPROVAL_CHANNELS:
        return "approval"
    elif ch in REALTIME_CHANNELS:
        return "none"
    else:
        return "approval"  # unknown → safe default


def _apply_decision_tree(
    ugytipus: str,
    idopont_altipus: str | None,
    restriction: str,
    kb_answered: bool,
    channel: str,
) -> dict:
    """
    Alkalmazza a determinisztikus döntési fát.

    Returns: {eredmeny, statusz, teendo}
    """
    ch = (channel or "").lower()

    # ── KÉRDÉS ──
    if ugytipus == "Kérdés":
        if kb_answered:
            if restriction == "none":
                return {"eredmeny": "Megválaszolt kérdés", "statusz": "Lezárt", "teendo": "Nincs további teendő"}
            elif restriction == "approval":
                return {"eredmeny": "Válasz előkészítve", "statusz": "Nyitott", "teendo": "Jóváhagyás"}
            elif restriction == "handover":
                return {"eredmeny": "Kérdés rögzítve", "statusz": "Nyitott", "teendo": "Visszahívás"}
            elif restriction == "urgent":
                return {"eredmeny": "Kérdés rögzítve", "statusz": "Sürgős", "teendo": "Élő átvétel / visszahívás"}
        else:
            # KB nem tudta megválaszolni
            if restriction == "urgent":
                return {"eredmeny": "Kérdés rögzítve (nincs válasz)", "statusz": "Sürgős", "teendo": "Élő átvétel / visszahívás"}
            return {"eredmeny": "Kérdés rögzítve (nincs válasz)", "statusz": "Nyitott", "teendo": "Visszahívás / ügyintézés"}

    # ── IDŐPONT ──
    if ugytipus == "Időpont":
        if idopont_altipus == "Új":
            # Voice agent sikeres foglalás (book_meeting tool hívva) - kb_answered-et használjuk proxyként a server.py-ból
            if kb_answered and ch in REALTIME_CHANNELS:
                return {"eredmeny": "Új időpont", "statusz": "Lezárt", "teendo": "Nincs további teendő"}
            
            if restriction == "none":
                return {"eredmeny": "Foglalási szándék rögzítve", "statusz": "Nyitott", "teendo": "Időpont véglegesítése"}
            elif restriction == "approval":
                return {"eredmeny": "Foglalási szándék rögzítve", "statusz": "Nyitott", "teendo": "Időpont véglegesítése"}
            elif restriction == "handover":
                return {"eredmeny": "Időpont igény rögzítve", "statusz": "Nyitott", "teendo": "Visszahívás"}
            elif restriction == "urgent":
                return {"eredmeny": "Időpont igény rögzítve", "statusz": "Sürgős", "teendo": "Azonnali beavatkozás"}

        elif idopont_altipus == "Lemondás":
            if restriction == "urgent":
                 return {"eredmeny": "Lemondási szándék rögzítve", "statusz": "Sürgős", "teendo": "Intézkedés szükséges"}
            return {"eredmeny": "Lemondási szándék rögzítve", "statusz": "Nyitott", "teendo": "Törlés a naptárból"}

        elif idopont_altipus == "Módosítás":
            if restriction == "urgent":
                 return {"eredmeny": "Módosítási szándék rögzítve", "statusz": "Sürgős", "teendo": "Intézkedés szükséges"}
            return {"eredmeny": "Módosítási szándék rögzítve", "statusz": "Nyitott", "teendo": "Áthelyezés a naptárban"}

    # ── PANASZ ──
    if ugytipus == "Panasz":
        # Panasz alapértelmezetten sürgős, kivéve ha a restriction felülírja
        if restriction == "urgent" or restriction == "handover":
            return {"eredmeny": "Panasz rögzítve", "statusz": "Sürgős", "teendo": "Azonnali beavatkozás"}
        return {"eredmeny": "Panasz rögzítve", "statusz": "Sürgős", "teendo": "Visszahívás / kivizsgálás"}

    # ── KÉRÉS ──
    if ugytipus == "Kérés":
        if restriction == "urgent":
            return {"eredmeny": "Igény rögzítve", "statusz": "Sürgős", "teendo": "Azonnali beavatkozás"}
        return {"eredmeny": "Igény rögzítve", "statusz": "Nyitott", "teendo": "Intézkedés"}

    # ── EGYÉB / FALLBACK ──
    if restriction == "urgent":
        return {"eredmeny": "Igény rögzítve", "statusz": "Sürgős", "teendo": "Azonnali beavatkozás"}
    return {"eredmeny": "Igény rögzítve", "statusz": "Nyitott", "teendo": "Intézkedés"}


# ═══════════════════════════════════════════════════════════════════════════════
# LLM INTENT DETECTION — Gemini 2.5 Flash
# ═══════════════════════════════════════════════════════════════════════════════

async def _detect_intent_llm(message_text: str) -> dict:
    """
    LLM alapú szándék felismerés.
    Returns: {ugytipus, idopont_altipus, osszefoglalas}
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
    1. ugytipus: "Időpont" | "Kérdés" | "Panasz" | "Kérés" | "Egyéb"
    2. idopont_altipus: CSAK ha ugytipus="Időpont", akkor: "Új" | "Lemondás" | "Módosítás". Egyébként null.
    3. osszefoglalas: Rövid, 1 mondatos összefoglalás magyarul.

    Szabályok:
    - Ha az ügyfél dühös, fájdalomra panaszkodik vagy elégedetlen, akkor az ugytipus MINDIG "Panasz".
    - Ha az ügyfél csak érdeklődik valami iránt (pl. árak, nyitvatartás), az "Kérdés".
    - Ha az ügyfél konkrétan kér valamit (pl. visszahívást, leletet), az "Kérés".
    """

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash", 
            config=types.GenerateContentConfig(
                response_mime_type="application/json"
            ),
            contents=prompt
        )
        return json.loads(response.text)
    except Exception as e:
        logger.error(f"LLM Intent detection failed: {e}")
        return _detect_intent_keyword(message_text)


def _detect_intent_keyword(message_text: str) -> dict:
    """
    Kulcsszavas fallback szándék felismerés.
    """
    t = (message_text or "").lower()
    ugytipus = "Egyéb"
    idopont_altipus = None

    # Panasz (Higher priority in keywords too)
    if any(w in t for w in ("panasz", "reklamáció", "elégedetlen", "complaint", "kifogás", "probléma volt", "rossz tapasztalat", "fáj", "elviselhetetlen", "nem vagyok elégedett", "baj van")):
        ugytipus = "Panasz"

    # Időpont (check subtypes BEFORE setting main type to avoid priority issues)
    elif any(w in t for w in ("időpont", "foglal", "booking", "naptár", "idöpont", "lemond")):
        ugytipus = "Időpont"
        if any(w in t for w in ("lemond", "töröl", "cancel", "nem tudok menni", "mégsem", "törölne", "le szeretném")):
            idopont_altipus = "Lemondás"
        elif any(w in t for w in ("módosít", "áthelyez", "változtat", "átrak", "máshova", "máskor")):
            idopont_altipus = "Módosítás"
        else:
            idopont_altipus = "Új"

    # Kérés
    elif any(w in t for w in ("szeretnék kérni", "kérem küldjék", "küldjenek", "visszahívás", "hívjanak vissza", "intézkedj", "küldjék el", "szükségem lenne", "kérem")):
        ugytipus = "Kérés"

    # Kérdés
    elif "?" in t or any(w in t for w in ("mikor", "hol", "mennyi", "hogyan", "miért", "van-e", "kérdez")):
        ugytipus = "Kérdés"

    return {
        "ugytipus": ugytipus,
        "idopont_altipus": idopont_altipus,
        "osszefoglalas": "" # Fallback can't summarize well
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
    
    # 3. KB-megválaszolhatóság detektálása (tool calls alapján, ha nincs explicit megadva)
    if kb_answered is None:
        kb_answered = False
        if tool_calls:
            if any(tc in ("lookup_info", "book_meeting") for tc in tool_calls):
                kb_answered = True
            
    # 4. Korlátozások meghatározása
    restriction = _determine_restriction(channel, triage_rules, message_text, handover_reason)
    
    # 5. Döntési fa alkalmazása
    decision = _apply_decision_tree(
        ugytipus=intent.get("ugytipus", "Egyéb"),
        idopont_altipus=intent.get("idopont_altipus"),
        restriction=restriction,
        kb_answered=kb_answered,
        channel=channel
    )
    
    # Összefűzés
    result = {
        **intent,
        **decision
    }
    
    logger.info(f"🏷️ Classification [{channel}]: {result}")
    return result
