# -*- coding: utf-8 -*-
"""JEV küldő-osztályozó (OpenRouter decisions API, 2026-09-24).

Nem-ügyfél feladók (munkatárs, szolgáltató, marketing) kiszűrése még az
ügyfél-létrehozás és az AI-válasz ELŐTT. A hívás mindig FAIL-OPEN: hiba,
timeout vagy hiányzó kulcs esetén „paciens" az eredmény, hogy legitim
ügyféllevelet soha ne szűrjünk el technikai hiba miatt.
"""
import os
import time

import requests
from loguru import logger

_DECISIONS_URL = "https://openrouter.ai/api/alpha/decisions"

# 1 próba + 2 újrapróbálás; a várakozások másodpercben
_RETRY_DELAYS = (1, 3)
_BODY_HEAD_LEN = 1500
_sleep = time.sleep  # tesztelhetőség: a tesztek ezt cserélik ki

# Magyar címkék a naplózáshoz / interakció-témához
LABEL_HU = {
    "paciens": "Páciens",
    "munkatars": "Munkatárs",
    "szolgaltato": "Szolgáltató",
    "marketing": "Marketing",
}

_INSTRUCTIONS = (
    "Döntsd el, hogy ennek az e-mailnek a FELADÓJA (nem a levélben említett "
    "személyek) melyik kategóriába tartozik egy fogászati rendelő szemszögéből."
)

_CRITERIA = {
    "paciens": (
        "Páciens vagy hozzátartozója, aki SAJÁT ügyében ír: időpont-kérés vagy "
        "módosítás, egészségügyi kérdés, fájdalom, ár- vagy szolgáltatás-érdeklődés, panasz."
    ),
    "munkatars": (
        "A rendelő SAJÁT munkatársa vagy belső kolléga: belső ügyintézés, "
        "műszakbeosztás, belső egyeztetés, irodai levél."
    ),
    "szolgaltato": (
        "B2B partner, beszállító vagy szolgáltató: számlázás, IT, karbantartás, "
        "dental labor, marketing ügynökség, alvállalkozó, hivatalos levelezés cégek között."
    ),
    "marketing": (
        "Marketing, hírlevél, promóció vagy automatikus tömeges küldemény "
        "(newsletter, noreply-feladó, értesítő robot, reklám)."
    ),
}


def _fail_open(reason: str, raw=None) -> dict:
    return {"label": "paciens", "confidence": 0.0, "probabilities": {}, "raw": raw, "error": reason}


def _post_decisions(payload: dict) -> tuple:
    """Egyetlen POST a decisions endpointra; (status_code, json-vagy-None).
    Az újrapróbálást a classify_sender kezeli. A kulcs soha nem kerül naplóba."""
    headers = {
        "Authorization": f"Bearer {os.getenv('OPENROUTER_API_KEY', '')}",
        "Content-Type": "application/json",
    }
    resp = requests.post(_DECISIONS_URL, json=payload, headers=headers, timeout=10)
    try:
        data = resp.json()
    except ValueError:
        data = None
    return resp.status_code, data


def _parse_decision(data) -> dict:
    """A decisions-válasz answers.sender_class mezőjének védett kibontása."""
    if not isinstance(data, dict):
        return _fail_open("Értelmezhetetlen válasz", raw=None)
    answers = data.get("answers")
    sender_class = answers.get("sender_class") if isinstance(answers, dict) else None
    if not isinstance(sender_class, dict):
        return _fail_open("Hiányzó sender_class válasz", raw=data)
    choice = str(sender_class.get("choice") or "").strip().lower()
    try:
        confidence = float(sender_class.get("confidence") or 0.0)
    except (TypeError, ValueError):
        confidence = 0.0
    probabilities = sender_class.get("probabilities")
    if not isinstance(probabilities, dict):
        probabilities = {}
    if choice not in LABEL_HU:
        return _fail_open(f"Ismeretlen kategória: {choice or 'üres'}", raw=data)
    return {"label": choice, "confidence": confidence, "probabilities": probabilities, "raw": data, "error": ""}


def classify_sender(from_email: str, from_name: str, subject: str, text_content: str) -> dict:
    """A feladó JEV-osztályozása. SOHA nem dob kivételt — hibánál fail-open paciens."""
    api_key = os.getenv("OPENROUTER_API_KEY", "")
    if not api_key:
        logger.warning("JEV küldő-szűrő: nincs OPENROUTER_API_KEY — fail-open (paciens)")
        return _fail_open("Nincs OPENROUTER_API_KEY")

    payload = {
        "model": os.getenv("OPENROUTER_JEV_MODEL", "typesafe/jev-1.13"),
        "state": {
            "from_email": from_email or "",
            "from_name": from_name or "",
            "subject": subject or "",
            "body_head": (text_content or "")[:_BODY_HEAD_LEN],
        },
        "questions": {
            "sender_class": {
                "type": "choice",
                "instructions": _INSTRUCTIONS,
                "criteria": _CRITERIA,
            }
        },
    }

    last_error = ""
    for attempt in range(len(_RETRY_DELAYS) + 1):
        try:
            status, data = _post_decisions(payload)
            if status == 200:
                return _parse_decision(data)
            if status == 429 or status >= 500:
                last_error = f"HTTP {status}"  # újrapróbálható
            else:
                return _fail_open(f"HTTP {status}")  # kliens-hiba: nincs újrapróbálás
        except requests.RequestException as exc:
            # Timeout/ConnectionError és bármilyen szállítási hiba: fail-open,
            # a classify_sender soha nem dob kivételt a hívónak.
            last_error = type(exc).__name__
        if attempt < len(_RETRY_DELAYS):
            _sleep(_RETRY_DELAYS[attempt])

    logger.warning(f"JEV küldő-szűrő sikertelen ({last_error}) — fail-open (paciens)")
    return _fail_open(last_error or "Ismeretlen hiba")


def _get_threshold() -> float:
    raw = os.getenv("SENDER_FILTER_THRESHOLD", "")
    try:
        return float(raw)
    except (TypeError, ValueError):
        return 0.8


def should_filter(classification: dict) -> bool:
    """True csak akkor: nincs hiba, a címke ISMERT nem-paciens kategória, és a
    confidence eléri a SENDER_FILTER_THRESHOLD küszöbet (env-ből, híváskor olvasva)."""
    if not isinstance(classification, dict) or classification.get("error"):
        return False
    label = classification.get("label")
    # Ismeretlen/üres címke soha ne szűrjön — csak a definiált nem-paciens kategóriák.
    if label not in LABEL_HU or label == "paciens":
        return False
    try:
        confidence = float(classification.get("confidence") or 0.0)
    except (TypeError, ValueError):
        return False
    return confidence >= _get_threshold()
