# -*- coding: utf-8 -*-
"""WP-E: hívás utáni email/név ellenőrző harness (STT + LLM + JEV — REDESIGN).

A hívás végén (server.py _run_classification) a rögzített WAV-ot ÚJRA
átírjuk (Soniox async, fallback Scribe v2), ÉS a KÉT átiratot (élő Gemini +
utólagos STT) egy Gemini Flash LLM kiolvassa: a diktált email cím önmagában
a SZÖVEGBŐL értendő — az ügyfél nevével/korábbi elérhetőségével NINCS
összehasonlítás. A jelöltekre JEV dönt (OpenRouter), autonóm korrekció CSAK
a küszöb feletti bizalommal (green):

  - ZÖLD verdict (két független olvasat egyetértenek VAGY JEV-bizalom ≥
    küszöb ÉS az MX nem cárol) → az ügyfél email-je frissíthető, a
    visszazigazoló email most megy ki;
  - NEM-ZÖLD → az ügyfél email-je ÉRINTETLEN marad; dupla opt-in „erősítse
    meg az e-mail címét" levél megy a jelöltre, a tényleges visszaigazolás
    csak a linkre kattintás után (web_server /api/public/verify-email);
  - NÉV: csak akkor írható, ha a foglalás (book_meeting) valóban rögzített
    nevet; az agent-persona név (pl. „Gábor") tiltólistán;
  - MINDEN hiba FAIL-OPEN: a harness soha nem dob a hívó folyamatnak,
    hiba esetén legacy azonnali küldés fut (a visszaigazolás sosem veszik el).

 Aktiválás: EMAIL_VERIFY_MODE=1 env (l. server.py hook és tools.book_meeting).
"""
import asyncio
import io
import json
import math
import os
import re
import socket
import struct
import time
import unicodedata
import wave
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import requests
from loguru import logger

import database as db
import email_processor
from jev_classifier import _post_decisions

# ── Konfiguráció ─────────────────────────────────────────────────────────────
_STT_URL = "https://api.elevenlabs.io/v1/speech-to-text"
_STT_TIMEOUT = 120  # mp — a rögzítés akár ~10 perces is lehet
_STT_RETRY_DELAYS = (2, 5)

# A diktálásban leggyakoribb domainek (MU-1.4: GREEN_2OF2 csak ismert domainnél).
# Env: EMAIL_VERIFY_KNOWN_DOMAINS (vesszőlista) bővíti.
_BASE_KNOWN_DOMAINS = (
    "gmail.com", "freemail.hu", "citromail.hu", "hotmail.com", "hotmail.hu",
    "outlook.com", "outlook.hu", "live.com", "yahoo.com", "icloud.com",
    "t-online.hu", "indamail.hu", "vipmail.hu", "invitel.hu", "chello.hu",
    "upcmail.hu",
)
KNOWN_DOMAINS = tuple(dict.fromkeys(
    list(_BASE_KNOWN_DOMAINS)
    + [d.strip().lower()
       for d in (os.getenv("EMAIL_VERIFY_KNOWN_DOMAINS", "") or "").split(",")
       if d.strip()]
))
# A Scribe keyterms mező PLAIN form-értékeket vár (JSON-lista 400-as hiba),
# és csak betű/szám/pont karaktereket fogad — a "+36" ezért kimaradt
# (a telefon ellenőrzés amúgy is skipped: a SIP caller id a mérvadó).
_KEYTERMS = list(KNOWN_DOMAINS) + ["kukac"]

# Autonóm korrekciós küszöb (JEV-bizalom) — env-ből felülírható
def _confidence_threshold() -> float:
    try:
        return float(os.getenv("EMAIL_VERIFY_CONF_THRESHOLD", "0.99"))
    except (TypeError, ValueError):
        return 0.99


def _pipeline_version() -> str:
    """MU-0.2: az email_verify_runs.pipeline_version címke. A bevetett build
    címkéje — 'baseline' (MU-0) vagy 'wp-e2' (az új kapus pipeline)."""
    return (os.getenv("EMAIL_VERIFY_PIPELINE_VERSION", "wp-e2") or "wp-e2").strip()


def _jev_green_enabled() -> bool:
    """MU-1.6: EMAIL_VERIFY_JEV_GREEN=1 esetén a JEV-konfidencia ÉS-kapcsolatban
    adhat csak zöldet az 1.4-es feltételek mellett; default 0 → a JEV SOHA nem
    ad zöldet, csak a nem-zöld jelöltet rangsorolja."""
    return (os.getenv("EMAIL_VERIFY_JEV_GREEN", "0") or "0").strip() == "1"


def canon_email(s) -> str | None:
    """MU-1.3 kanonizálás: MINDEN forrás-egyeztetés CSAK ezen fut.
    strip+kisbetű → minden whitespace törlése → NFKD + kombináló jelek törlése
    (ékezet-foldolás) → záró írásjel levágása → laza szintaxis-ellenőrzés.
    Érvénytelen → None."""
    if s is None:
        return None
    t = str(s).strip().lower()
    if not t:
        return None
    t = re.sub(r"\s+", "", t)
    folded = unicodedata.normalize("NFKD", t)
    t = "".join(ch for ch in folded if not unicodedata.combining(ch))
    t = t.strip(".,;:")
    return t if EMAIL_SYNTAX_RE.match(t) else None


def majority_reading(readings: dict):
    """MU-1.5: ha ≥2 szavazó forrás UGYANAZT az értéket látja (pl. 2:1
    ellentmondás), az a többségi érték a non-green jelölt."""
    present = [v for v in (readings or {}).values() if v]
    for v in set(present):
        if present.count(v) >= 2:
            return v
    return None


def evaluate_gate(readings: dict, known_domains=None, mx_resolver=None) -> dict:
    """MU-1.4: az új zöld-kapu — CSAK egymástól FÜGGETLEN források
    karakterpontos (kanonizált) egyezése ad zöldet, legalább kettő jelenléte
    mellett; ismeretlen domainnél mind a három kell. Egy kiesett forrás
    (hiba/timeout) nem ellentmondás, csak kevesebb szavazat.
    readings: {"live": canon|None, "stt": canon|None, "audio": canon|None}
    → {"reason", "present", "known_domain", "mx", "top"}; green = reason GREEN-nel kezdődik."""
    kd = known_domains if known_domains is not None else KNOWN_DOMAINS
    mxr = mx_resolver or mx_resolves
    present = {k: v for k, v in (readings or {}).items() if v}
    values = set(present.values())
    out = {"reason": "NG_NO_EMAIL", "present": sorted(present),
           "known_domain": None, "mx": None, "top": None}
    if not present:
        return out
    if len(values) > 1:
        # BÁRMELY két jelen lévő forrás eltér → ellentmondás (a fő mérce:
        # rossz címre SOHA ne menjen — inkább non-green)
        out["reason"] = "NG_CONTRADICTION"
        return out
    if len(present) == 1:
        out["reason"] = "NG_SINGLE_SOURCE"
        return out
    top = next(iter(values))
    out["top"] = top
    if not EMAIL_SYNTAX_RE.match(top):
        out["reason"] = "NG_SYNTAX"
        return out
    dom = top.partition("@")[2]
    mx = mxr(dom)
    out["mx"] = mx
    out["known_domain"] = dom in kd
    if mx is False:
        out["reason"] = "NG_MX_NXDOMAIN"
        return out
    if len(present) == 3:
        out["reason"] = "GREEN_3OF3"
    elif dom in kd:
        out["reason"] = "GREEN_2OF2_KNOWN"
    else:
        out["reason"] = "NG_UNKNOWN_DOMAIN_2OF2"
    return out

# A tools._EMAIL_RE-vel azonos laza szintaxis-szabály
EMAIL_SYNTAX_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
# Kinyeréshez szigorúbb minta (proza pontok ne csaljanak)
_EMAIL_TIGHT_RE = re.compile(r"[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}")

_ACCENT_FOLD = str.maketrans("áéíóöőúüűÁÉÍÓÖŐÚÜŰ", "aeiooouuuAEIOOOUUU")

# ── Magyar bemondás → írás normalizáció ─────────────────────────────────────
# Betűrendben: töltelékszavak → dupla → kukac/pont/kötőjel → számszavak.
# A töltelékszó ELŐTTI írásjel („Kovács, szóval Bertalan") is elnyelődik.
_FILLER_RE = re.compile(
    r"(?<=[a-záéíóöőúüű])[,.!?;:]?\s+(?:izé|vagyok|szóval)\s+(?=[a-záéíóöőúüű])",
    re.IGNORECASE,
)
# „dupla l" → „ll" — a Scribe gyakran ékezetesen írja („duplá E")
_DOUBLE_RE = re.compile(r"\bdupl[áa]?\s+([a-z0-9])\b")
_HU_DIGIT_WORDS = {
    "nulla": "0", "egy": "1", "kettő": "2", "ketto": "2", "három": "3",
    "harom": "3", "négy": "4", "negy": "4", "öt": "5", "ot": "5",
    "hat": "6", "hét": "7", "het": "7", "nyolc": "8", "kilenc": "9",
    "tíz": "10", "tiz": "10",
}
_HU_TENS = {
    "tizen": "10", "húsz": "20", "husz": "20", "huszon": "20",
    "harminc": "30", "negyven": "40", "ötven": "50", "otven": "50",
    "hatvan": "60", "hetven": "70", "nyolcvan": "80", "kilencven": "90",
}
# Egy tokenbe írt összetett tizesek: „harminchat" = harminc + hat → 36
_HU_TENS_COMPOUND_RE = re.compile(
    r"^(tizen|húsz|husz|huszon|harminc|negyven|ötven|otven|hatvan|hetven|"
    r"nyolcvan|kilencven)"
    r"(egy|kettő|ketto|három|harom|négy|negy|öt|ot|hat|hét|het|nyolc|kilenc)$"
)
_DIGIT_WORD_RE = re.compile(
    r"\b(?:nulla|egy|kettő|ketto|három|harom|négy|negy|öt|ot|hat|hét|het|"
    r"nyolc|kilenc|tizen|tíz|tiz|húsz|husz|huszon|harminc|negyven|ötven|"
    r"otven|hatvan|hetven|nyolcvan|kilencven)\b", re.IGNORECASE,
)
_PHONE_TRIGGER_RE = re.compile(
    r"(\+36|0036|\b06\d{1,2}\b|telefon(?:szám|szam)?|hívószám|hivoszam|"
    r"hívjon|hivjon|meghív)",
    re.IGNORECASE,
)


def _is_digit_token(low: str) -> bool:
    return (low in _HU_DIGIT_WORDS or low in _HU_TENS
            or bool(_HU_TENS_COMPOUND_RE.match(low)))


def fold_accents(text: str) -> str:
    """Ékezetek levágása (á→a, ő→o, ű→u… ) — email/nevek egyeztetéséhez."""
    return (text or "").translate(_ACCENT_FOLD)


def _convert_digit_words(text: str) -> str:
    """Számszavak → számjegyek. CSAK telefon-kontextusban hívandó: az 'egy',
    'hat', 'hét' közszavak szabad szövegben mást jelentenek."""
    out = []
    for tok in text.split():
        low = tok.lower()
        m = _HU_TENS_COMPOUND_RE.match(low)
        if m:
            tens = _HU_TENS.get(m.group(1), "")
            unit = _HU_DIGIT_WORDS.get(m.group(2), "")
            # 'harminchat' = 30 + 6 = 36 (kétjegyű tizes + egyjegyű)
            out.append(str(int(tens) + int(unit)) if tens and unit else tok)
            continue
        if low in _HU_TENS:
            out.append(_HU_TENS[low])
        elif low in _HU_DIGIT_WORDS:
            out.append(_HU_DIGIT_WORDS[low])
        else:
            out.append(tok)
    return " ".join(out)


def normalize_spoken_hu(text: str) -> str:
    """Determinisztikus bemondás→írás: kukac→@, pont→., kötőjel→-, aláhúzás→_,
    „dupla x"→xx, töltelékszavak kihagyása, számszavak telefon-kontextusban."""
    t = (text or "").strip().lower()
    if not t:
        return ""
    # Töltelékszavak: csak szóhatáron, betűtokenek KÖZÖTT (konzervatív)
    for _ in range(3):
        if not _FILLER_RE.search(t):
            break
        t = _FILLER_RE.sub(" ", t)
    # „dupla l" → „ll"
    t = _DOUBLE_RE.sub(r"\1\1", t)
    # Speciális formák előbb, aztán a puszta szócsere
    t = t.replace("(kukac)", " @ ").replace("kukac", " @ ")
    t = t.replace(" [at] ", " @ ").replace(" at ", " @ ")
    t = re.sub(r"\bpont\b", " . ", t)
    t = re.sub(r"\bkötőjel\b|\bvonal\b", " - ", t)
    t = re.sub(r"\baláhúzás\b", " _ ", t)
    # Számszavak: telefon-kontextusban (trigger + futam) VAGY ≥3-as számszó-futam
    # (email lokálban diktált számjegyek — pl. „kettő nulla nulla @ …"). A ≥3-as
    # futam önmagában is egyértelmű digit-sorozatjel („egy kettő három" = 1 2 3).
    trig = _PHONE_TRIGGER_RE.search(t)
    run = best = 0
    for tok in t.split():
        if _is_digit_token(tok):
            run += 1
            best = max(best, run)
        else:
            run = 0
    if best >= 3 or (trig and (best >= 2 or trig.group(0).lower() in ("+36", "0036"))):
        t = _convert_digit_words(t)
    # Email-kontextus (@ = diktált cím): OTT is számjegy, ahol számszó áll —
    # „akos tizenharom" → „akos13" (a felvétel-audit mérte: egyetlen számszó
    # email-lokálban word maradt → rossz cím). Az @-kontextusban a szám-
    # közszavak („egy", „hat") félreértelmezési kockázata kicsi a nyereséghez
    # képest.
    if "@" in t:
        t = _convert_digit_words(t)
    return re.sub(r"\s+", " ", t).strip()


# A diktálás körüli kontextus-szavak, amik a jelölthöz ragadhatnak
_KNOWN_TLDS = ("com", "hu", "net", "org", "eu", "info", "gov", "edu")
_LEAD_CONTEXT_WORDS = ("hogy", "tehat", "akkor", "ugy", "szoval")


def _candidate_variants(cand: str) -> list:
    """Jelölt-változatok a diktálás-környék szavainak levágásával:
    - domain: az ISMERT TLD utáni rész levágva („citromail.hu.megjegyezted"
      → „citromail.hu");
    - lokál: az eleji kontextus-szó lehúzva („hogybalazs..." → „balazs...").
    A leginkább tisztított változat áll előre (a felismerés az első
    MX/whitelist-találatnál megáll), az eredeti az utolsó helyen marad."""
    m = re.match(r"^([a-z0-9._%+\-]+)@([a-z0-9.\-]+)$", cand)
    if not m:
        return [cand]
    local, domain = m.group(1), m.group(2)
    cut = None
    for tld in _KNOWN_TLDS:
        marker = "." + tld
        idx = domain.find(marker)
        if idx != -1:
            end = idx + len(marker)
            cut = domain[:end] if (cut is None or end < len(cut)) else cut
    domains = []
    if cut and cut != domain:
        domains.append(cut)
    domains.append(domain)
    variants = []
    for d in domains:
        loc = local
        for w in _LEAD_CONTEXT_WORDS:
            if loc.startswith(w) and len(loc) > len(w) + 2:
                loc = loc[len(w):]
                break
        v = f"{loc}@{d}"
        if v not in variants:
            variants.append(v)
    # Az EREDETI jelölt mindig megmarad (utolsó helyen) — a levágás tévedhet
    if cand not in variants:
        variants.append(cand)
    return variants


def extract_email_candidates(normalized_text: str) -> list:
    """Email-jelöltek kinyerése a normalizált szövegből. A szóközös
    műtermékeket („a @ b . c") is összefűzi, dedup, sorrend-tartó.
    Az összefűzés ÉKEZET-NYÍRT másolaton fut — a „szőke árpád @"-típusú
    lokálokat egyébként az ékezetek szétszakítanák."""
    text = normalized_text or ""
    found = []

    def _scan(t):
        for m in _EMAIL_TIGHT_RE.finditer(t):
            v = m.group(0).strip(".").lower()
            if v and EMAIL_SYNTAX_RE.match(v) and v not in found:
                found.append(v)

    _scan(text)
    # Ékezet-nyírás ITT (a normalizált szöveg neveinek ékezetét megtartja)
    folded = fold_accents(text)
    # Szóközös tagolás összefűzése: „kovacs @ gmail . com" → „kovacs@gmail.com".
    # A lokál NEVÉT is össze kell fűzni („kovacs bertalan @") — de CSAK akkor,
    # ha a @ eredetileg szóközzel separált volt (kukac-diktálás); írásos emailnél
    # („írjon a kovacs@gmail.com") a lokál már kész, ott az összefűzés az
    # előző szót ragasztaná rá.
    squeezed = re.sub(r"\s*([@._])\s*", r"\1", folded)
    if " @" in folded or "@ " in folded:
        merged = squeezed
        for _ in range(3):
            new = re.sub(r"([a-z0-9._%+\-]+) ([a-z0-9._%+\-]+)@", r"\1\2@", merged)
            if new == merged:
                break
            merged = new
        _scan(merged)
    _scan(squeezed)
    # Kontextus-szó variánsok: a tisztított változat ELŐRE („...hu.koszonom",
    # „hogyvalaki@..." típusok), az eredeti az utolsó helyen megmarad.
    expanded = []
    for c in found:
        for v in _candidate_variants(c):
            if v not in expanded:
                expanded.append(v)
    return expanded


def merge_email_candidates(booking_email: str, llm: dict,
                           live_cands: list, scribe_cands: list) -> list:
    """Teljes jelöltlista (REDESIGN): az LLM-olvasat és variánsai ÁLLNAK ELÖL,
    utána a foglalás közbeni élő olvasat és a regulázissal nyert jelöltek
    (ékezet-nyírva, domain-javítva, kereszt-kombinálva). Dedup, sorrend-tartó."""
    scribe_email = scribe_cands[0] if scribe_cands else ""
    cands = generate_email_candidates(booking_email, scribe_email)
    for extra in list(live_cands) + list(scribe_cands):
        for v in (extra, fold_accents(extra)):
            vv = (v or "").strip().lower()
            if vv and EMAIL_SYNTAX_RE.match(vv) and vv not in cands:
                cands.append(vv)
    prioritized = []
    for v in [(llm.get("email") or "")] + list(llm.get("variants") or []):
        vv = (v or "").strip().lower()
        if vv and EMAIL_SYNTAX_RE.match(vv) and vv not in prioritized:
            prioritized.append(vv)
    return prioritized + [c for c in cands if c not in prioritized]


def _levenshtein(a: str, b: str, cap: int = 3) -> int:
    if a == b:
        return 0
    if abs(len(a) - len(b)) > cap:
        return cap + 1
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def _domain_fixes(domain: str) -> list:
    """Whitelist-domain javítások Levenshtein ≤ 2-ig (pl. gmial.com→gmail.com)."""
    d = (domain or "").strip().lower()
    if not d or d in KNOWN_DOMAINS:
        return []
    scored = sorted(
        ((_levenshtein(d, k), k) for k in KNOWN_DOMAINS),
        key=lambda x: x[0],
    )
    return [k for dist, k in scored if dist <= 2]


def generate_email_candidates(live_email: str, scribe_email: str) -> list:
    """Jelöltlista a két STT-menetből: eredetiek + ékezet-nyírt változatok +
    domain-whitelist javítottak + kereszt-lokál@domén kombinációk.
    Dedup, sorrend-tartó (legplauzibilisebb elöl)."""
    bases = []
    for raw in (live_email, scribe_email):
        e = (raw or "").strip().lower()
        if e and "@" in e and e not in bases:
            bases.append(e)

    out = []

    def _add(c):
        c = (c or "").strip().lower()
        if c and EMAIL_SYNTAX_RE.match(c) and c not in out:
            out.append(c)

    for e in bases:
        _add(e)
        f = fold_accents(e)
        _add(f)
        local, _, dom = f.partition("@")
        for d in _domain_fixes(dom):
            _add(f"{local}@{d}")

    # Kereszt-kombináció: az egyik menet lokálja a másik doménjével —
    # ha mindkét oldalon részben sikerült a felismerés
    if len(bases) == 2:
        lf = fold_accents(bases[0])
        sf = fold_accents(bases[1])
        l_local, _, l_dom = lf.partition("@")
        s_local, _, s_dom = sf.partition("@")
        if l_dom != s_dom:
            _add(f"{l_local}@{s_dom}")
            _add(f"{s_local}@{l_dom}")
    return out


def extract_name_candidates(live_name: str, scribe_name: str) -> list:
    """Név-jelöltek: mindkét menet eredeti + ékezet-nyírt változata."""
    out = []
    for raw in (live_name, scribe_name):
        n = (raw or "").strip()
        if not n:
            continue
        for v in (n, fold_accents(n)):
            if v not in out:
                out.append(v)
    return out


# ── LLM-extrakció (REDESIGN: a cím önmagában a SZÖVEGBŐL értendő) ────────────
# USER-szabály: a harness NEM hasonlítja össze a kinyert címet az ügyfél
# nevével vagy korábbi emailjével — a diktált címet a beszédből kell
# értelmezni, LLM-mel (nem csak regexszel), JEV verifikációval.
# MU-1.1/MU-1.2: a források FÜGGETLENSÉGE a kapu alapja — az 'stt' szavazó
# olvasat CSAK a hívó csatorna szövegét kaphatja (élő átirat és agent-beszéd
# NEM mehet bele, különben a live olvasat „hátsó ajtón" szivárogna vissza).
EMAIL_VERIFY_LLM_MODEL = os.getenv("EMAIL_VERIFY_LLM_MODEL", "gemini-3.8-flash")
EMAIL_VERIFY_AUDIO_MODEL = os.getenv("EMAIL_VERIFY_AUDIO_MODEL", "") or EMAIL_VERIFY_LLM_MODEL

# MU-1.2: a teljes diktálási konvenció-lista (mindkét prompttal közös)
_CONVENTIONS = (
    "A diktálás magyar konvenciói: „kukac\" = @, „pont\" = ., „kötőjel\" = -, "
    "„mínusz\" = -, „aláhúzás\" = _, „alulvonás\" = _, „alsóvonás\" = _, "
    "„dupla x\" = xx, „dupla vé\" = w, „ipszilon\" = y, „iksz\" = x, „kú\" = q; "
    "a betűzött betűneveket (bé, cé, dé, gé, há, ká, el, em, en, er, esz, té, "
    "zé stb.) egy-egy betűként értsd; a számdiktálást értelmezni kell "
    "(„tizenhárom\" = 13, „kettő nulla nulla\" = 200); az emailcímet EGYBE "
    "kell írni — a benne lévő szóközök a diktálás műtermékei.\n"
    "Elválasztójelet (pont, kötőjel, aláhúzás) a címbe CSAK akkor írj, ha az "
    "elhangzott. A lokális részt (a kukac előtti részt) SOHA ne „javítsd\" "
    "valószínűbbnek tűnő formára.\n"
)

_LLM_EXTRACT_SYSTEM = (
    "Te egy magyar fogászati rendelő telefonos AI-asszisztensének "
    "UTÓELLENŐRZŐ motorja vagy. Ugyanarról a hívásról két különböző "
    "beszédfelismerő készített átiratot (élő valós idejű és utólagos). "
    "Feladatod: a HÍVÓ (ügyfél) által diktált/közölt EMAIL CÍMET és — ha "
    "elhangzott — a NEVÉT kiolvasni.\n"
    + _CONVENTIONS +
    "CSAK az ügyfél által mondott adatot add meg! Az ASSZISZTENS (az AI-agent) "
    "saját neve, bemutatkozása és mondatai SOHA nem ügyféladatok — ha csak az "
    "agent neve hangzott el, a name legyen null.\n"
    "Ha az ügyfél nem diktált emailcímet → email: null; ha a neve nem hangzott "
    "el → name: null. Semmit nem szabad kitalálni.\n"
    "A variants mező a bemondott cím MINDEN hihető írásformáját tartalmazza "
    "(ékezetes és ékezet nélküli lokál, gyanús domain-változat is).\n"
    "A confidence 0 és 1 közti szám: mennyire vagy biztos a kinyert "
    "értékekben.\n"
    "Válasz KIZÁRÓLAG JSON-objektum: "
    '{"email": string|null, "name": string|null, "variants": [string], '
    '"confidence": number}'
)

# MU-1.2: egyforrású (stt) prompt — a bemenete CSAK a hívó csatorna átirata
_STT_EXTRACT_SYSTEM = (
    "Te egy magyar fogászati rendelő telefonos AI-asszisztensének "
    "UTÓELLENŐRZŐ motorja vagy. Egy beszédfelismerő átírta egy hívás CSAK A "
    "HÍVÓ (ügyfél) SZAVAIT. Feladatod: a hívó által diktált/közölt EMAIL CÍMET "
    "és — ha elhangzott — a NEVÉT kiolvasni az átiratból.\n"
    + _CONVENTIONS +
    "Ha a hívó nem diktált emailcímet → email: null; ha a neve nem hangzott "
    "el → name: null. Semmit nem szabad kitalálni.\n"
    "A variants mező a bemondott cím MINDEN hihető írásformáját tartalmazza "
    "(ékezetes és ékezet nélküli lokál, gyanús domain-változat is).\n"
    "A confidence 0 és 1 közti szám: mennyire vagy biztos a kinyert "
    "értékekben.\n"
    "Válasz KIZÁRÓLAG JSON-objektum: "
    '{"email": string|null, "name": string|null, "variants": [string], '
    '"confidence": number}'
)


def build_llm_extract_prompt(transcript_live: str, transcript_stt: str) -> str:
    """A KÉT-forrású (reconcile) extrakciós prompt összeállítása (pure).
    Ez NEM szavaz a kapuban (MU-1.1) — csak jelölt-rangsorolás + audit."""
    return (
        f"{_LLM_EXTRACT_SYSTEM}\n\n"
        "── ÉLŐ ÁTIRAT ──\n"
        f"{(transcript_live or '').strip()[:6000]}\n\n"
        "── UTÓLAGOS ÁTIRAT ──\n"
        f"{(transcript_stt or '').strip()[:6000]}"
    )


def build_stt_extract_prompt(caller_text: str) -> str:
    """MU-1.2: az 'stt' SZAVAZÓ olvasat promptja — CSAK a hívó csatorna
    szövege mehet bele (élő átirat/agent-beszéd szigorúan tilos)."""
    return (
        f"{_STT_EXTRACT_SYSTEM}\n\n"
        "── HÍVÓ ÁTIRAT ──\n"
        f"{(caller_text or '').strip()[:6000]}"
    )


def parse_llm_extract(raw: str) -> dict:
    """A modell JSON-válaszának értelmezése + szigorú validáció (pure).
    Érvénytelen válasz → {} (fail-open). Az email a variánsok elejére kerül."""
    if not raw:
        return {}
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        data = json.loads(text)
    except (ValueError, TypeError):
        # megengedő: érvénytelen escape-ek eldobása (classifier mintájára)
        try:
            data = json.loads(re.sub(r'\\(?!["\\/bfnrtu])', "", text))
        except (ValueError, TypeError):
            return {}
    if not isinstance(data, dict):
        return {}
    out = {"email": None, "name": None, "variants": [], "confidence": 0.0}
    email = data.get("email")
    if isinstance(email, str) and EMAIL_SYNTAX_RE.match(email.strip().lower()):
        out["email"] = email.strip().lower()
    name = data.get("name")
    if isinstance(name, str) and name.strip():
        out["name"] = name.strip()
    variants = data.get("variants")
    if isinstance(variants, list):
        for v in variants:
            if isinstance(v, str) and EMAIL_SYNTAX_RE.match(v.strip().lower()):
                vv = v.strip().lower()
                if vv not in out["variants"]:
                    out["variants"].append(vv)
    try:
        conf = float(data.get("confidence") or 0.0)
    except (TypeError, ValueError):
        conf = 0.0
    out["confidence"] = min(max(conf, 0.0), 1.0)
    if out["email"] and out["email"] not in out["variants"]:
        out["variants"].insert(0, out["email"])
    return out


def _new_genai_client(timeout_ms: int = 90_000):
    """BYOK Gemini-kliens (classifier mintájára), paraméterezhető timeout-tal.
    Hiba/nincs kulcs → None."""
    try:
        from google import genai
        from google.genai import types

        api_key = db.get_gemini_api_key()
        if not api_key:
            return None
        return genai.Client(
            api_key=api_key,
            http_options=types.HttpOptions(timeout=timeout_ms),
        )
    except Exception as exc:
        logger.warning(f"Gemini kliens indítási hiba: {exc}")
        return None


def _genai_generate_json(prompt: str, timeout_ms: int = 90_000,
                         delays=(0, 6, 15)):
    """Közös szöveg-LLM mag: model = EMAIL_VERIFY_LLM_MODEL,
    response_mime_type = json, 429/5xx-re backoff-fal újrapróbál.
    Sikerre a válasz-szöveg, hibára None (fail-open)."""
    last_err = ""
    for attempt, delay in enumerate(delays):
        try:
            if delay:
                time.sleep(delay)
            client = _new_genai_client(timeout_ms)
            if client is None:
                logger.warning("LLM-hívás kihagyva (nincs Gemini-kulcs)")
                return None
            response = client.models.generate_content(
                model=EMAIL_VERIFY_LLM_MODEL,
                config={"response_mime_type": "application/json"},
                contents=prompt,
            )
            return getattr(response, "text", "") or ""
        except Exception as exc:
            last_err = str(exc)
            if attempt < len(delays) - 1 and _is_retryable_llm_error(last_err):
                continue
            logger.warning(f"LLM-hívás hiba (fail-open): {last_err}")
            return None
    return None


def llm_extract(transcript_live: str, transcript_stt: str) -> dict:
    """KÉT-forrású 'reconcile' olvasat (MU-1.1: NEM szavaz — jelölt-rangsor +
    audit): a KÉT átiratból kiolvassa a diktált emailcímet és a nevet.
    SOSEM dob kivételt — hibánál {} (fail-open)."""
    text = _genai_generate_json(build_llm_extract_prompt(transcript_live, transcript_stt))
    return parse_llm_extract(text or "")


def llm_extract_stt_only(caller_text: str) -> dict:
    """MU-1.2: az 'stt' SZAVAZÓ olvasat — KIZÁRÓLAG a hívó csatorna
    (STT-)szövegéből. Ugyanaz a modell/retry/parse. Fail-open: {}."""
    text = _genai_generate_json(build_stt_extract_prompt(caller_text))
    return parse_llm_extract(text or "")


# ── MU-2: hangalapú olvasat (audio-LLM) ─────────────────────────────────────
# Közvetlenül a hívó csatorna HANGJÁBÓL olvas — nem függ egyetlen STT-től sem.
_EMAIL_SIGNAL_WORD_RE = re.compile(
    r"(kukac|@|" + "|".join(d.replace(".", r"\.") for d in _BASE_KNOWN_DOMAINS) + r"|pont)",
    re.IGNORECASE,
)

# MU-2.3: a prompt szó szerint (munkautalvány)
_AUDIO_EXTRACT_PROMPT = (
    "Egy magyar fogorvosi rendelő telefonhívásának CSAK A HÍVÓ OLDALÁT hallod "
    "(telefonos minőség). Az ügyfél a hívás során egy email címet diktál. Írd "
    "le a diktált email címet karakterről karakterre, KIZÁRÓLAG abból, amit "
    "hallasz.\n"
    "\n"
    "Diktálási konvenciók: „kukac\" = @, „pont\" = ., „kötőjel\" / „mínusz\" "
    "= -, „aláhúzás\" / „alulvonás\" / „alsóvonás\" = _, „dupla vé\" = w, "
    "„ipszilon\" = y, „iksz\" = x, „kú\" = q. A betűzött betűneveket (bé, cé, "
    "dé, gé, há, ká, el, em, en, er, esz, té, zé stb.) egy-egy betűként "
    "érd. A számokat számjegyekkel írd („tizenhárom\" = 13, „kettő nulla "
    "nulla\" = 200). Az ékezeteket hagyd el. A címben nincs szóköz.\n"
    "\n"
    "Elválasztójelet (. - _) CSAK akkor írj, ha elhangzott. Ismert szolgáltató "
    "domainjét (gmail.com, freemail.hu, citromail.hu, hotmail.com, "
    "outlook.com, icloud.com, t-online.hu stb.) a helyes írásmóddal írd, ha "
    "egyértelműen azt hallod; egyébként úgy írd le, ahogy hallod. A lokális "
    "részt (a kukac előtti részt) SOHA ne „javítsd\" valószínűbbnek tűnő "
    "formára.\n"
    "\n"
    "Ha az ügyfél javította magát, a VÉGSŐ változatot add meg. Ha nem diktált "
    "email címet, az email legyen null. Semmit ne találj ki.\n"
    "\n"
    "Válasz KIZÁRÓLAG JSON:\n"
    '{"email": string|null, "heard_raw": string, "spelled": boolean, '
    '"uncertain": [{"segment": string, "alternatives": [string]}], '
    '"confidence": number}\n'
    "ahol heard_raw a cím úgy, ahogy magyar szavakkal elhangzott; spelled = "
    "betűzött-e; uncertain a bizonytalanul hallott szakaszok és hihető "
    "alternatíváik."
)


def _parse_audio_extract(raw: str) -> dict:
    """MU-2.4: az audio-LLM válaszának értelmezése. Az email → canon_email;
    az uncertain alternatívákból kanonizált teljes címek is kijönnek
    (jelöltek lesznek, NEM szavaznak). Érvénytelen válasz → {} (fail-open)."""
    if not raw:
        return {}
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        data = json.loads(text)
    except (ValueError, TypeError):
        try:
            data = json.loads(re.sub(r'\\(?!["\\/bfnrtu])', "", text))
        except (ValueError, TypeError):
            return {}
    if not isinstance(data, dict):
        return {}
    out = {"email": canon_email(data.get("email")),
           "heard_raw": str(data.get("heard_raw") or ""),
           "spelled": bool(data.get("spelled")),
           "uncertain": [], "candidate_emails": [], "confidence": 0.0}
    uncertain = data.get("uncertain")
    if isinstance(uncertain, list):
        for u in uncertain:
            if not isinstance(u, dict):
                continue
            alts = u.get("alternatives")
            entry = {"segment": str(u.get("segment") or ""),
                     "alternatives": [str(a) for a in alts if isinstance(a, str)] if isinstance(alts, list) else []}
            out["uncertain"].append(entry)
            for a in entry["alternatives"]:
                c = canon_email(a)
                if c and c not in out["candidate_emails"]:
                    out["candidate_emails"].append(c)
    try:
        conf = float(data.get("confidence") or 0.0)
    except (TypeError, ValueError):
        conf = 0.0
    out["confidence"] = min(max(conf, 0.0), 1.0)
    return out


def llm_audio_extract(wav_bytes: bytes) -> dict:
    """MU-2: a hívó csatorna hangjából olvassa a diktált címet (inline audio,
    temperature=0, 60 s timeout, 2 próbálkozás 429/5xx-re). Bármilyen hiba →
    {} (audio olvasat kiesik, a pipeline megy tovább). SOSEM dob."""
    if not wav_bytes:
        return {}
    try:
        from google.genai import types

        client = _new_genai_client(60_000)
        if client is None:
            logger.warning("Audio-LLM kihagyva (nincs Gemini-kulcs)")
            return {}
        contents = [
            _AUDIO_EXTRACT_PROMPT,
            types.Part.from_bytes(data=wav_bytes, mime_type="audio/wav"),
        ]
        for attempt, delay in enumerate((0, 6)):
            try:
                if delay:
                    time.sleep(delay)
                response = client.models.generate_content(
                    model=EMAIL_VERIFY_AUDIO_MODEL,
                    config={"response_mime_type": "application/json",
                            "temperature": 0},
                    contents=contents,
                )
                return _parse_audio_extract(getattr(response, "text", "") or "")
            except Exception as exc:
                if attempt == 0 and _is_retryable_llm_error(str(exc)):
                    logger.warning(f"Audio-LLM átmeneti hiba, retry: {str(exc)[:120]}")
                    continue
                logger.warning(f"Audio-LLM hiba (fail-open): {str(exc)[:160]}")
                return {}
        return {}
    except Exception as exc:
        logger.warning(f"Audio-LLM hiba (fail-open): {exc}")
        return {}


def _extract_caller_channel_wav(wav_bytes: bytes) -> bytes:
    """A sztereó WAV 0. csatornája (hívó = BAL) mono WAV-ként. Mono bemenet →
    változatlanul megy tovább; nem 16-bit → szintén (fail-open)."""
    if not wav_bytes:
        return wav_bytes
    try:
        with wave.open(io.BytesIO(wav_bytes), "rb") as w:
            nch, sw, fr, nf = (w.getnchannels(), w.getsampwidth(),
                               w.getframerate(), w.getnframes())
            if nch == 1 or sw != 2:
                return wav_bytes
            frames = w.readframes(nf)
        samples = struct.unpack(f"<{nf * nch}h", frames[:nf * nch * 2])
        caller = samples[0::nch]
        out = io.BytesIO()
        with wave.open(out, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(fr)
            w.writeframes(struct.pack(f"<{len(caller)}h", *caller))
        return out.getvalue()
    except Exception as exc:
        logger.warning(f"Hívó-csatorna kivonás sikertelen (teljes WAV megy): {exc}")
        return wav_bytes


def _wav_duration_s(wav_bytes: bytes) -> float:
    """A WAV hossza másodpercben; hibánál 0.0."""
    try:
        with wave.open(io.BytesIO(wav_bytes or b""), "rb") as w:
            return w.getnframes() / float(w.getframerate() or 1)
    except Exception:
        return 0.0


def _slice_wav(wav_bytes: bytes, start_s: float, end_s: float) -> bytes:
    """WAV-időszelet (frame-pontos); hibánál az eredeti bytes megy."""
    try:
        with wave.open(io.BytesIO(wav_bytes), "rb") as w:
            params = w.getparams()
            fr = params.framerate or 1
            a = max(0, int(start_s * fr))
            b = min(params.nframes, int(end_s * fr))
            w.setpos(a)
            frames = w.readframes(b - a)
        out = io.BytesIO()
        with wave.open(out, "wb") as w:
            w.setnchannels(params.nchannels)
            w.setsampwidth(params.sampwidth)
            w.setframerate(fr)
            w.writeframes(frames)
        return out.getvalue()
    except Exception as exc:
        logger.warning(f"WAV-szeletelés sikertelen (teljes megy): {exc}")
        return wav_bytes


def _email_signal_window_ms(words: list, dur_s: float, max_s: float = 300.0,
                            pad_s: float = 5.0):
    """MU-2.2: a diktálás ablaka a Soniox tokenekből (kukac/@/pont/domain
    jelzőszavak start/end_ms-e) ±5 s — 300 s-nál HOSSZABB hívásokhoz.
    Nincs jelző → (0, max_s)."""
    starts, ends = [], []
    for w in words or []:
        if not isinstance(w, dict):
            continue
        if not _EMAIL_SIGNAL_WORD_RE.search(str(w.get("text") or "")):
            continue
        s, e = w.get("start_ms"), w.get("end_ms")
        if isinstance(s, (int, float)):
            starts.append(s)
        if isinstance(e, (int, float)):
            ends.append(e)
    if not starts:
        return 0.0, max_s
    win_start = max(0.0, (min(starts) / 1000.0) - pad_s)
    win_end = min(dur_s, (max(ends) / 1000.0 if ends else min(starts) / 1000.0 + 30.0) + pad_s)
    if win_end - win_start > max_s:
        win_end = win_start + max_s
    return win_start, win_end


def _caller_audio_window(wav_bytes: bytes, words: list) -> bytes:
    """MU-2.2: a hívó csatorna teljes, ha ≤300 s; hosszabbnál a diktálás
    ablaka (Soniox jelzőtokenek ±5 s), jelzők nélkül az első 300 s."""
    dur = _wav_duration_s(wav_bytes)
    if dur <= 0 or dur <= 300.0:
        return wav_bytes
    start, end = _email_signal_window_ms(words, dur)
    logger.info(f"Hosszú hívás ({dur:.0f} s) — audio-LLM ablak: {start:.0f}–{end:.0f} s")
    return _slice_wav(wav_bytes, start, end)


def _is_retryable_llm_error(err: str) -> bool:
    """429/5xx/terhelés-jellegű hibák újrapróbálhatók (SDK üzenetszövegből)."""
    low = (err or "").lower()
    return ("429" in low or "500" in low or "503" in low
            or "unavailable" in low or "rate" in low
            or "deadline" in low or "timeout" in low)


def _live_transcript_text(turns: list) -> str:
    """A recorder turnusaiból beszélő-címkézett szöveg (user/ai) — az LLM így
    látja, melyik mondat kié (az agent-mondatok nem ügyféladatok)."""
    parts = []
    for t in turns or []:
        if not isinstance(t, dict):
            continue
        txt = (t.get("text") or "").strip()
        if not txt:
            continue
        role = (t.get("role") or "ismeretlen").strip()
        parts.append(f"{role}: {txt}")
    return "\n".join(parts)


# ── JEV döntetlen-feloldás ───────────────────────────────────────────────────
_JEV_INSTRUCTIONS = (
    "Egy magyar telefonos email/név-diktálást több olvasat írt le: élő "
    "valós idejű beszédfelismerő, utólagos beszédfelismerő és egy LLM-"
    "kiolvasás. Döntsd el, melyik jelölt a hívó által valójában bemondott "
    "érték. Vegye figyelembe: a magyar nevek ékezetesek lehetnek, az email "
    "címekben a kukac/pont kimondása és a gyakori domainek (gmail.com, "
    "freemail.hu, citromail.hu, indamail.hu, outlook.com, hotmail.com, "
    "yahoo.com) a mérvadóak."
)


def arbitrate(candidates: list, context: dict = None) -> dict:
    """Jelöltek közül a nyertes: {choice, confidence, source}.
    source: agree (a két menet egyezik, conf 1.0) | single (egy jelölt,
    conf 0.5) | jev (OpenRouter döntés) | error (fail-open: első jelölt,
    conf 0.0 — így a hívás soha nem akad el a döntetlenen)."""
    context = context or {}
    live = (context.get("live") or "").strip().lower()
    scribe = (context.get("scribe") or "").strip().lower()
    cands = [c for c in candidates if (c or "").strip()]
    if not cands:
        return {"choice": "", "confidence": 0.0, "source": "empty"}
    # A két menet megegyezik → ez a legmagasabb bizonyosság
    if live and scribe and live == scribe:
        match = next((c for c in cands if c.strip().lower() == live), cands[0])
        return {"choice": match, "confidence": 1.0, "source": "agree"}
    if len(cands) == 1:
        return {"choice": cands[0], "confidence": 0.5, "source": "single"}

    try:
        payload = {
            "model": os.getenv("OPENROUTER_JEV_MODEL", "typesafe/jev-1.13"),
            "state": {
                "kind": context.get("kind", ""),
                "live_value": context.get("live", ""),
                "scribe_value": context.get("scribe", ""),
                "llm_value": context.get("llm_value", ""),
                "llm_confidence": context.get("llm_confidence", ""),
                "transcript_live": (context.get("transcript_live") or "")[:800],
                "transcript_scribe": (context.get("transcript_scribe") or "")[:800],
                "note": "magyarul diktált email cím vagy név, több STT/LLM-olvasat eltér",
            },
            "questions": {
                "pick": {
                    "type": "choice",
                    "instructions": _JEV_INSTRUCTIONS,
                    "criteria": {c: c for c in cands},
                }
            },
        }
        status, data = _post_decisions(payload)
        answers = data.get("answers") if isinstance(data, dict) else None
        pick = answers.get("pick") if isinstance(answers, dict) else None
        if status == 200 and isinstance(pick, dict):
            choice = str(pick.get("choice") or "").strip()
            try:
                conf = float(pick.get("confidence") or 0.0)
            except (TypeError, ValueError):
                conf = 0.0
            match = next((c for c in cands if c.strip().lower() == choice.lower()), None)
            if match:
                return {"choice": match, "confidence": conf, "source": "jev"}
        logger.warning(f"JEV döntetlen-feloldás: érvénytelen válasz (HTTP {status}) — fail-open")
    except Exception as exc:
        logger.warning(f"JEV döntetlen-feloldás hiba (fail-open): {exc}")
    return {"choice": cands[0], "confidence": 0.0, "source": "error"}


# ── MX / domain validáció ────────────────────────────────────────────────────
def mx_resolves(domain: str):
    """True = van MX/A rekord; False = a domainnek nincs semmilyen rekordja;
    None = ismeretlen (timeout/nincs resolver). Soha nem dob kivételt."""
    d = (domain or "").strip().lower().strip(".")
    if not d:
        return None
    # 1. MX rekord (dnspython, ha telepítve van)
    try:
        import dns.resolver
        try:
            answers = dns.resolver.resolve(d, "MX", lifetime=5)
            if answers:
                return True
        except dns.resolver.NXDOMAIN:
            return False
        except (dns.resolver.NoAnswer, dns.resolver.NoNameservers):
            pass  # MX nincs / DNS-zavar — A-rekord dönt
        except Exception:
            pass
    except ImportError:
        pass
    except Exception:
        pass
    # 2. Fallback: A rekord (socket) — MX nélküli, de létező domainekhez
    try:
        socket.setdefaulttimeout(5)
        socket.getaddrinfo(d, None)
        return True
    except socket.gaierror as exc:
        # Nincs névfeloldás — de az ideiglenes resolver-hiba ne cároljon
        return False if "Name or service not known" in str(exc) else None
    except OSError:
        return None


def validate_email(email: str) -> dict:
    e = (email or "").strip().lower()
    syntax = bool(EMAIL_SYNTAX_RE.match(e))
    domain = e.partition("@")[2].strip() if "@" in e else ""
    return {
        "syntax": syntax,
        "mx": mx_resolves(domain) if (syntax and domain) else None,
        "known_domain": domain in KNOWN_DOMAINS,
    }


def email_is_green(winner: str, validation: dict, passes_agree: bool, confidence: float) -> bool:
    """A zöld/non-zöld kapu: érvényes szintaxis ÉS (a két menet egyezik VAGY
    a JEV-bizalom eléri a küszöböt) ÉS az MX nem cárolja a domaint.
    mx=None (ismeretlen) NEM blokkol — a hálózati hiba ne küldjön dupla opt-nt."""
    return bool(
        (winner or "").strip()
        and validation.get("syntax")
        and (passes_agree or float(confidence or 0.0) >= _confidence_threshold())
        and validation.get("mx") is not False
    )


# ── ElevenLabs Scribe kliens (fallback motor) ────────────────────────────────
def _transcribe_scribe(data: bytes) -> dict:
    """Szinkron Scribe v2 STT-hívás. Soha nem dob kivételt — hibánál {}.
    Multichannel (hívó BAL / agent JOBB) → válaszban 'transcripts' lista."""
    api_key = os.getenv("ELEVENLABS_API_KEY", "")
    if not api_key or not data:
        logger.warning("Scribe STT kihagyva (nincs kulcs vagy hanganyag)")
        return {}
    form = [
        ("model_id", (None, "scribe_v2")),
        ("language_code", (None, "hu")),
        ("timestamps_granularity", (None, "word")),
        ("use_multi_channel", (None, "true")),
        # keyterms: SORONKÉNTI plain mezők (JSON-lista invalid_keyword 400-at ad)
        *[("keyterms", (None, kt)) for kt in _KEYTERMS],
        ("file", ("audio.wav", data, "audio/wav")),
    ]
    last_error = ""
    for attempt in range(len(_STT_RETRY_DELAYS) + 1):
        try:
            resp = requests.post(
                _STT_URL, headers={"xi-api-key": api_key},
                files=form, timeout=_STT_TIMEOUT,
            )
            if resp.status_code == 200:
                try:
                    return resp.json()
                except ValueError:
                    logger.warning("Scribe STT: nem JSON válasz")
                    return {}
            if resp.status_code == 429 or resp.status_code >= 500:
                last_error = f"HTTP {resp.status_code}"  # újrapróbálható
            else:
                logger.warning(f"Scribe STT hiba: HTTP {resp.status_code} — nem újrapróbálható")
                return {}
        except requests.RequestException as exc:
            last_error = type(exc).__name__
        if attempt < len(_STT_RETRY_DELAYS):
            time.sleep(_STT_RETRY_DELAYS[attempt])
    logger.warning(f"Scribe STT sikertelen ({last_error})")
    return {}


# ── Soniox kliens (főmotor) — async fájl-átirat ─────────────────────────────
_SONIOX_API = "https://api.soniox.com"
_SONIOX_ASYNC_MODELS = ("stt-async-v5", "stt-async-v4")
_SONIOX_POLL_INTERVAL_S = 3
_SONIOX_POLL_MAX = 60          # ~3 perc — az átirat jellemzően 1-2 percen belül kész


def _soniox_headers():
    key = os.getenv("SONIOX_API_KEY", "")
    return {"Authorization": f"Bearer {key}"} if key else None


def _soniox_tokens_to_words(tokens: list) -> list:
    """Soniox async tokenek (szub-szavas fragmentek, a szóhatár a token
    szövegének vezető szóközében) → szó-lista ({text, logprob, start_ms,
    end_ms}). Konfidencia nélküli token → -0,7 (semleges logprob).
    Az időbélyegek (ha vannak) a hosszú-hívás audio-ablakhoz kellenek (MU-2.2)."""
    words = []
    buf = ""
    buf_lp = None
    buf_start = None
    buf_end = None

    def _flush():
        nonlocal buf, buf_lp, buf_start, buf_end
        if buf:
            entry = {"text": buf,
                     "logprob": buf_lp if buf_lp is not None else -0.7}
            if buf_start is not None:
                entry["start_ms"] = buf_start
            if buf_end is not None:
                entry["end_ms"] = buf_end
            words.append(entry)
        buf = ""
        buf_lp = None
        buf_start = None
        buf_end = None

    for t in tokens:
        if not isinstance(t, dict):
            continue
        tt = str(t.get("text") or "")
        if not tt or tt in ("<end>", "<fin>"):
            continue
        conf = t.get("confidence")
        try:
            lp = math.log(max(float(conf), 1e-6)) if conf is not None else -0.7
        except (TypeError, ValueError):
            lp = -0.7
        s_ms = t.get("start_ms")
        e_ms = t.get("end_ms")
        parts = tt.split(" ")
        for j, part in enumerate(parts):
            if j > 0:
                _flush()
            if part:
                buf += part
                buf_lp = min(buf_lp, lp) if buf_lp is not None else lp
                if isinstance(s_ms, (int, float)) and buf_start is None:
                    buf_start = s_ms
                if isinstance(e_ms, (int, float)):
                    buf_end = e_ms
    _flush()
    return words


def _transcribe_soniox(data: bytes) -> dict:
    """Soniox async fájl-átirat: WAV feltöltés → transcription job → poll →
    tokenek. Scribe-kompatibilis dict ({words: [...], text}) — hibánál {}
    (fail-open). SOSEM dob kivételt."""
    H = _soniox_headers()
    if not H or not data:
        logger.warning("Soniox STT kihagyva (nincs kulcs vagy hanganyag)")
        return {}

    # 1) fájl feltöltés
    try:
        r = requests.post(_SONIOX_API + "/v1/files", headers=H,
                          files={"file": ("audio.wav", data, "audio/wav")},
                          timeout=120)
        if r.status_code not in (200, 201):
            logger.warning(f"Soniox file upload hiba: HTTP {r.status_code} {r.text[:150]}")
            return {}
        file_id = r.json().get("id")
    except requests.RequestException as exc:
        logger.warning(f"Soniox file upload hiba: {exc}")
        return {}
    if not file_id:
        logger.warning("Soniox file upload: nincs file_id a válaszban")
        return {}

    # 2) transcription job (modell-verzió fallback: v5 → v4)
    tr_id = None
    last_err = ""
    for model in _SONIOX_ASYNC_MODELS:
        try:
            r = requests.post(_SONIOX_API + "/v1/transcriptions", headers=H,
                              json={"file_id": file_id, "model": model,
                                    "language_hints": ["hu"]},
                              timeout=60)
        except requests.RequestException as exc:
            last_err = str(exc)
            continue
        if r.status_code in (200, 201):
            tr_id = (r.json() or {}).get("id")
            break
        last_err = f"HTTP {r.status_code} {r.text[:120]}"
    if not tr_id:
        logger.warning(f"Soniox transcription create sikertelen: {last_err}")
        return {}

    # 3) poll: completed → transcript letöltés
    tokens = None
    for _ in range(_SONIOX_POLL_MAX):
        time.sleep(_SONIOX_POLL_INTERVAL_S)
        try:
            r = requests.get(_SONIOX_API + f"/v1/transcriptions/{tr_id}",
                             headers=H, timeout=30)
            status = (r.json() or {}).get("status")
        except Exception as exc:
            logger.warning(f"Soniox poll hiba: {exc}")
            continue
        if status == "completed":
            try:
                r2 = requests.get(_SONIOX_API + f"/v1/transcriptions/{tr_id}/transcript",
                                  headers=H, timeout=60)
                tr_json = r2.json() or {}
                tokens = tr_json.get("tokens")
                transcript_text = tr_json.get("text")
            except Exception as exc:
                logger.warning(f"Soniox transcript letöltés hiba: {exc}")
            break
        if status in ("error", "failed"):
            logger.warning("Soniox transcription error státusz")
            break

    # 4) fiók-rendezés: transcription + file törlése (a tartalom már nálunk)
    for path in (f"/v1/transcriptions/{tr_id}", f"/v1/files/{file_id}"):
        try:
            requests.delete(_SONIOX_API + path, headers=H, timeout=30)
        except Exception:
            pass

    words = _soniox_tokens_to_words(tokens or [])
    if not words:
        logger.warning("Soniox STT: üres átirat")
        return {}
    text = (transcript_text or "").strip() or \
        re.sub(r"\s+", " ", " ".join(w["text"] for w in words)).strip()
    return {"text": text, "words": words}


def transcribe_wav_bytes(data: bytes) -> dict:
    """STT diszpécser: HARNESS_STT_ENGINE (default 'soniox') az elsődleges
    motor; ha üres eredményt ad, a másik (Scribe) fallback fut."""
    engine = (os.getenv("HARNESS_STT_ENGINE", "soniox") or "soniox").strip().lower()
    primary, fallback = (
        (_transcribe_soniox, _transcribe_scribe)
        if engine == "soniox" else (_transcribe_scribe, _transcribe_soniox)
    )
    try:
        result = primary(data) or {}
    except Exception as exc:
        logger.warning(f"Elsődleges STT ({engine}) hiba: {exc}")
        result = {}
    if result:
        return result
    logger.warning(f"Elsődleges STT ({engine}) nem adott eredményt — fallback")
    try:
        return fallback(data) or {}
    except Exception as exc:
        logger.warning(f"Fallback STT hiba: {exc}")
        return {}


def _words_join(words: list) -> tuple:
    """Scribe word-tokenek → (sima szöveg, [(start, end, token)] span-lista).
    'word' tokenek szóközzel fűzve, 'spacing' (írásjel/szóköz) változatlanul,
    'audio_event' kihagyva."""
    parts = []
    for w in words or []:
        if not isinstance(w, dict):
            continue
        wtype = w.get("type") or "word"
        text = str(w.get("text") or "")
        if not text:
            continue
        if wtype == "word":
            parts.append((" " if parts else "") + text)
        elif wtype == "spacing":
            parts.append(text)
    text = re.sub(r"\s+", " ", "".join(parts)).strip()
    # Span-építés: a 'word' tokenek szövegbeli helyének soros keresése
    spans = []
    pos = 0
    for w in words or []:
        if not isinstance(w, dict) or (w.get("type") or "word") != "word":
            continue
        t = str(w.get("text") or "")
        if not t:
            continue
        idx = text.find(t, pos)
        if idx < 0:
            continue
        spans.append((idx, idx + len(t), w))
        pos = idx + len(t)
    return text, spans


def _channel_texts(scribe: dict) -> dict:
    """csatorna_index → szöveg. Multichannel: 'transcripts' lista (mindben
    channel_index-es word-ök); egycsatornás: 'words' a gyökérben."""
    channels = {}
    transcripts = scribe.get("transcripts")
    if isinstance(transcripts, list) and transcripts:
        for idx, tr in enumerate(transcripts):
            words = (tr or {}).get("words") or []
            ch = None
            for w in words:
                if isinstance(w, dict) and w.get("channel_index") is not None:
                    ch = int(w["channel_index"])
                    break
            text, _spans = _words_join(words)
            channels[ch if ch is not None else idx] = text
    else:
        text, _spans = _words_join(scribe.get("words") or [])
        channels[0] = text
    return channels


# Email-span a nyers token-összefűzésben is (a 'word' tokenek közt szóköz van)
_EMAIL_SPAN_RE = re.compile(r"[a-z0-9._%+\-]+\s*@\s*[a-z0-9.\-]+\s*\.\s*[a-z]{2,}")


def _min_logprob_for_email(words: list, text: str):
    """A kinyert email-jelölt tokenjeinek MINIMÁLIS logprobja (a felismerés
    bizonytalanságának mértéke). Nincs adat → None."""
    m = _EMAIL_SPAN_RE.search(text or "")
    if not m:
        return None
    _text, spans = _words_join(words or [])
    lps = [
        float(w["logprob"])
        for s, e, w in spans
        if s < m.end() and e > m.start() and isinstance(w.get("logprob"), (int, float))
    ]
    return min(lps) if lps else None


_NAME_CAPITALIZED_RES = (
    # „a nevem Kovács Béla" / „nevem Kovács"
    re.compile(r"\b(?:a\s+)?nevem\s+([A-ZÁÉÍÓÖŐÚÜŰ][\wáéíóöőúüű\-]+(?:\s+[A-ZÁÉÍÓÖŐÚÜŰ][\wáéíóöőúüű\-]+)?)"),
    # „Kovács Béla vagyok"
    re.compile(r"\b([A-ZÁÉÍÓÖŐÚÜŰ][\wáéíóöőúüű\-]+(?:\s+[A-ZÁÉÍÓÖŐÚÜŰ][\wáéíóöőúüű\-]+)?)\s+vagyok\b"),
)
_NAME_LOWER_RE = re.compile(
    r"\b(?:a\s+)?nevem\s+([a-záéíóöőúüű][\wáéíóöőúüű\-]+(?:\s+[a-záéíóöőúüű][\wáéíóöőúüű\-]+)?)"
)


def extract_scribe_name(caller_text: str) -> str:
    """Név-heurisztika a HÍVÓ csatorna szövegéből: „a nevem X" / „X vagyok".
    Üres string, ha nincs találat."""
    t = (caller_text or "").strip()
    if not t:
        return ""
    for pat in _NAME_CAPITALIZED_RES:
        m = pat.search(t)
        if m:
            return m.group(1).strip()
    m = _NAME_LOWER_RE.search(t)
    if m:
        return m.group(1).strip().title()
    return ""


# ── Orchisztrátor ────────────────────────────────────────────────────────────
def run_harness(session_id: str, tenant_id=None, interaction_id=None, turns=None,
                booking_email: str = "", booking_name: str = "", client_id=None,
                caller_number: str = "", wav_bytes=None,
                apply_side_effects: bool = True, mode: str = "live",
                ground_truth=None) -> dict:
    """A teljes ellenőrzési folyamat. SOHA nem dob kivételt — hiba esetén
    {"status": "error"} (a hívó fail-open legacy küldésre vált).
    wav_bytes: előre letöltött rögzítés (replay); None → bucketből tölt.
    apply_side_effects=False (replay): NINCS ügyfél/event/név-írás, NINCS
    futás-sor — csak a verdikt + audit."""
    try:
        return _run_harness_inner(
            session_id, tenant_id=tenant_id, interaction_id=interaction_id,
            turns=turns or [], booking_email=booking_email,
            booking_name=booking_name, client_id=client_id,
            caller_number=caller_number, wav_bytes=wav_bytes,
            apply_side_effects=apply_side_effects, mode=mode,
            ground_truth=ground_truth,
        )
    except Exception as exc:
        logger.warning(f"Email-ellenőrző harness hiba (fail-open): {exc}")
        return {"status": "error"}


def run_harness_offline(session_id: str, wav_bytes: bytes, turns=None,
                        booking_email: str = "", booking_name: str = "",
                        tenant_id=None) -> dict:
    """MU-3.2: replay-belépő — ugyanaz a pipeline NULLA mellékhatással (nincs
    ügyfél/event írás, nincs email; a replay-sorokat a szkript írja a
    ground_truth-val együtt)."""
    return run_harness(session_id, tenant_id=tenant_id, interaction_id=None,
                       turns=turns, booking_email=booking_email,
                       booking_name=booking_name, client_id=None,
                       caller_number="", wav_bytes=wav_bytes,
                       apply_side_effects=False, mode="replay")


def _timed(fn, *args):
    """(eredmény, eltelt_ms) — a futásidő-mérés az audit-timingshez."""
    t = time.monotonic()
    try:
        res = fn(*args)
    except Exception as exc:
        logger.warning(f"Mért hívás hiba (fail-open): {exc}")
        res = {}
    return res, int((time.monotonic() - t) * 1000)


def _run_harness_inner(session_id, tenant_id, interaction_id, turns,
                       booking_email, booking_name, client_id,
                       caller_number="", wav_bytes=None,
                       apply_side_effects=True, mode="live",
                       ground_truth=None) -> dict:
    _t_start = time.monotonic()
    # MU-2.1: belső határidő a külső 240 s-os wait_for alatt
    deadline = _t_start + 220.0
    if tenant_id:
        try:
            db.set_current_tenant(tenant_id)
        except Exception:
            pass

    # a) Rögzítés: bucketből (élő) vagy kapott bytes-ből (replay)
    started_at = None
    if wav_bytes:
        data = wav_bytes
    else:
        path = None
        try:
            res = db._tenant_eq(
                db.supabase.table("sessions").select("recording_url,started_at")
            ).eq("session_id", session_id).limit(1).execute()
            row = (res.data or [{}])[0]
            path = row.get("recording_url")
            started_at = row.get("started_at")
        except Exception as exc:
            logger.warning(f"Session/recording lekérdezés sikertelen ({session_id}): {exc}")
        if not path:
            return {"status": "no_recording"}
        try:
            data = db.supabase.storage.from_("recordings").download(path)
        except Exception as exc:
            logger.warning(f"Rögzítés letöltés sikertelen ({path}): {exc}")
            return {"status": "no_recording"}
        if not data or isinstance(data, dict):
            return {"status": "no_recording"}

    # b) CSATORNASZÉPARÁTÁS + párhuzamos olvasatok (MU-1.1/MU-2.1)
    caller_wav = _extract_caller_channel_wav(data)
    audio_deferred = _wav_duration_s(caller_wav) > 300.0
    with ThreadPoolExecutor(max_workers=2) as pool:
        stt_fut = pool.submit(_timed, transcribe_wav_bytes, caller_wav)
        audio_fut = (None if audio_deferred
                     else pool.submit(_timed, llm_audio_extract, caller_wav))
        scribe, _stt_ms = stt_fut.result()
        audio_res, _audio_ms = (audio_fut.result() if audio_fut else ({}, 0))
    if not scribe:
        if apply_side_effects:
            db.log_email_verify_run(
                session_id, tenant_id=tenant_id, caller_number=caller_number,
                mode=mode, pipeline_version=_pipeline_version(),
                readings={}, verdict="error", winner="")
        return {"status": "error"}
    if audio_deferred:
        # 300 s-nál hosszabb hívás: az ablak a Soniox jelzőtokenjeiből (MU-2.2)
        audio_res, _audio_ms = _timed(
            llm_audio_extract,
            _caller_audio_window(caller_wav, scribe.get("words") or []))

    channels = _channel_texts(scribe)
    caller_key = min(channels) if channels else 0
    caller_text = channels.get(caller_key, "")
    caller_words = []
    for tr in (scribe.get("transcripts") or []):
        wl = (tr or {}).get("words") or []
        ch = next((int(w["channel_index"]) for w in wl
                   if isinstance(w, dict) and w.get("channel_index") is not None), None)
        if ch is None or ch == caller_key:
            caller_words = wl
            break
    if not caller_words:
        caller_words = scribe.get("words") or []

    # c) Normalizáció (regex-út) + élő átirat
    norm_scribe_caller = normalize_spoken_hu(caller_text)
    live_text = " ".join((t.get("text") or "") for t in turns if isinstance(t, dict))
    norm_live = normalize_spoken_hu(live_text)

    # d) OLVASATOK — a 'live' a foglalási élő olvasat; ha nincs, regex a live
    # átirat user turnusaiból (MU-1.1)
    live_email = (booking_email or "").strip().lower()
    if not live_email:
        live_user_text = " ".join((t.get("text") or "") for t in turns
                                  if isinstance(t, dict) and (t.get("role") or "") == "user")
        _lc = extract_email_candidates(normalize_spoken_hu(live_user_text))
        live_email = _lc[0] if _lc else ""

    # 'stt' szavazó olvasat — KIZÁRÓLAG a hívó csatorna szövegéből (MU-1.2)
    stt_llm, _stt_llm_ms = ({}, 0)
    if time.monotonic() < deadline - 30:
        stt_llm, _stt_llm_ms = _timed(llm_extract_stt_only, caller_text)

    # 'reconcile' NEM szavazó olvasat — a KÉT átirat együtt (rangsor + audit)
    reconcile, _recon_ms = ({}, 0)
    if time.monotonic() < deadline - 20:
        reconcile, _recon_ms = _timed(
            llm_extract, _live_transcript_text(turns), caller_text)

    readings = {
        "live": canon_email(live_email),
        "stt": canon_email(stt_llm.get("email")),
        "audio": canon_email(audio_res.get("email")),
    }

    # e) AZ ÚJ KAPU (MU-1.4) + JEV-rangsorolás
    gate = evaluate_gate(readings)
    gate_green = gate["reason"].startswith("GREEN")

    stt_regex_cands = extract_email_candidates(norm_scribe_caller)
    live_cands = extract_email_candidates(norm_live)
    scribe_email = stt_regex_cands[0] if stt_regex_cands else ""
    cands = merge_email_candidates(live_email, reconcile, live_cands, stt_regex_cands)
    # az stt/audio olvasat + variánsok és az audio-uncertain jelöltek ELŐRE (MU-1.5)
    front = []
    for v in ([readings["stt"], readings["audio"]]
              + [canon_email(x) for x in (stt_llm.get("variants") or [])]
              + list(audio_res.get("candidate_emails") or [])):
        if v and v not in front:
            front.append(v)
    cands = front + [c for c in cands if c not in front]

    arb = arbitrate(cands, context={
        "kind": "email",
        "live": live_email,
        "scribe": scribe_email,
        "llm_value": (reconcile.get("email") or ""),
        "llm_confidence": reconcile.get("confidence", 0.0),
        "transcript_live": norm_live[:600],
        "transcript_scribe": norm_scribe_caller[:600],
    })

    green = gate_green
    if gate_green and _jev_green_enabled() \
            and float(arb.get("confidence") or 0.0) < _confidence_threshold():
        green = False
        gate = dict(gate, reason="NG_JEV_CONFIDENCE")

    # EMAIL_VERIFY_FLOW (célkép): smsfirst módban a gyorsítósáv CSAK akkor,
    # ha az audio ÉS az stt olvasat (két független utólagos forrás) egyezett
    # ÉS ismert domain — a live-olvasat önmagában nem adhat zöldet. Nem
    # gyorsítósávú green → SMS-first, az ügyfél-írás is csak megerősítés után.
    flow = _verify_flow()
    if flow == "smsfirst":
        fast_lane = bool(green and "stt" in gate.get("present", [])
                         and "audio" in gate.get("present", [])
                         and gate.get("known_domain") is True)
    else:
        fast_lane = bool(green)
    green_effective = fast_lane

    # Nyertes (MU-1.5): green → a kapu top értéke; 2:1 többség → a többségi;
    # különben a JEV dönt a jelöltek közt
    if gate_green:
        winner = gate["top"] or ""
        winner_source = "gate"
    else:
        maj = majority_reading(readings)
        if maj:
            winner = maj
            winner_source = "majority"
        else:
            winner = (arb.get("choice") or "").strip().lower()
            winner_source = arb.get("source", "")
    validation = validate_email(winner) if winner else {"syntax": False, "mx": None, "known_domain": False}

    # f) AUDIT (MU-1.7)
    total_ms = int((time.monotonic() - _t_start) * 1000)
    audit = {
        "readings": {
            "live": readings["live"], "stt": readings["stt"], "audio": readings["audio"],
            "stt_regex": canon_email(scribe_email),
            "reconcile": canon_email(reconcile.get("email")),
            "jev": {"choice": (arb.get("choice") or "").strip().lower(),
                    "confidence": arb.get("confidence", 0.0)},
        },
        "audio_detail": {
            "heard_raw": audio_res.get("heard_raw", ""),
            "spelled": bool(audio_res.get("spelled")),
            "uncertain": audio_res.get("uncertain") or [],
        },
        "gate": {"reason": gate["reason"], "present": gate["present"],
                 "known_domain": gate["known_domain"], "mx": gate["mx"]},
        "stt_engine": (os.getenv("HARNESS_STT_ENGINE", "soniox") or "soniox"),
        "timings_ms": {"soniox": _stt_ms, "stt_llm": _stt_llm_ms,
                       "audio_llm": _audio_ms, "reconcile_llm": _recon_ms,
                       "total": total_ms},
    }

    # g) Mellékhatások — CSAK élő módban (a replay NULLA írást végez)
    stored_email, client_row = ("", None)
    changed = False
    new_email = winner
    name_result = None
    if apply_side_effects:
        stored_email, client_row = _stored_email(client_id)
        # smsfirst: a nem-gyorsítósávos green NEM ír autonom módon (SMS-first —
        # az ügyfél e-mail-je a megerősítés után íródik)
        changed = bool(green_effective and winner and stored_email
                       and winner != stored_email.strip().lower())
        new_email = winner if (winner and (changed or not stored_email)) \
            else (stored_email or winner)
        status = ("corrected" if changed else "green") if green_effective else "non_green"
        _apply_email_correction(
            client_row, stored_email, new_email, audit, status,
            changed=changed, interaction_id=interaction_id, apply=green_effective,
        )
        if changed and stored_email:
            _update_session_events_email(stored_email, new_email, started_at)
        name_result = _verify_name(
            booking_name, caller_text, norm_live, norm_scribe_caller,
            llm_name=(reconcile.get("name") or ""),
            client_id=client_id, interaction_id=interaction_id,
        )
        db.log_email_verify_run(
            session_id, tenant_id=tenant_id, caller_number=caller_number,
            mode=mode, pipeline_version=_pipeline_version(),
            readings=audit["readings"], gate=audit["gate"],
            audio_detail=audit["audio_detail"], timings_ms=audit["timings_ms"],
            winner=new_email or "",
            verdict="green" if green_effective else "non_green",
            ground_truth=ground_truth,
        )

    scribe_lp = None
    try:
        scribe_lp = _min_logprob_for_email(caller_words, caller_text)
    except Exception:
        pass

    audit["gate"]["fast_lane"] = fast_lane
    return {
        "status": "green" if green_effective else "non_green",
        "email": {
            "winner": new_email or "",
            "previous": stored_email or "",
            "changed": changed,
            "confidence": arb.get("confidence", 0.0),
            "source": winner_source,
            "validation": validation,
        },
        "audit": audit,
        "llm": {
            "email": (reconcile.get("email") or ""),
            "name": (reconcile.get("name") or ""),
            "confidence": reconcile.get("confidence", 0.0),
            "model": EMAIL_VERIFY_LLM_MODEL,
        },
        "name": name_result,
        "scribe_logprob_min_email": scribe_lp,
    }


def _stored_email(client_id):
    """Az ügyfél TÁROLT emailje (oszlop, majd custom_data) + a teljes sor."""
    if not client_id:
        return "", None
    try:
        res = db._tenant_eq(db.supabase.table("clients").select("*")).eq("id", client_id).limit(1).execute()
        row = res.data[0] if res.data else None
    except Exception as exc:
        logger.warning(f"Ügyfél-lekérdezés sikertelen (#{client_id}): {exc}")
        return "", None
    if not row:
        return "", None
    cd = row.get("custom_data") or {}
    if isinstance(cd, str):
        try:
            cd = json.loads(cd)
        except (ValueError, TypeError):
            cd = {}
    stored = (row.get("email") or (cd or {}).get("email") or "").strip()
    return stored, row


def _apply_email_correction(client_row, stored_email, new_email, audit, audit_status,
                            changed, interaction_id, apply=True):
    """Ügyfél email frissítése + audit-nyomvonal (custom_data.email_verification).
    A régi érték SOHA nem törlődik el hallgatagon: previous mező + interakció.
    apply=False (non-green): az email-oszlop ÉRINTETLEN marad — csak az audit
    íródik (a jelölt nem kerül autonom módon az ügyfélre).
    audit: az MU-1.7 szerkezet (readings/audio_detail/gate/stt_engine/timings)."""
    if not client_row:
        return
    try:
        audit = audit if isinstance(audit, dict) else {}
        jev = (audit.get("readings") or {}).get("jev") or {}
        cd = client_row.get("custom_data") or {}
        if isinstance(cd, str):
            try:
                cd = json.loads(cd)
            except (ValueError, TypeError):
                cd = {}
        cd = dict(cd or {})
        already = isinstance(cd.get("email_verification"), dict)
        if not changed and already:
            return  # változatlan + már auditált — felesleges írás elkerülése
        cd["email_verification"] = {
            **audit,
            "previous": stored_email or "",
            "value": new_email or "",
            "confidence": jev.get("confidence", 0.0),
            "source": jev.get("source", ""),
            "status": audit_status,
            "applied": bool(apply),
            "ts": datetime.now(timezone.utc).isoformat(),
        }
        update = {
            "name": client_row.get("name") or cd.get("name") or "Névtelen",
            "email": (new_email or client_row.get("email") or "") if apply
            else (client_row.get("email") or cd.get("email") or ""),
            "phone": client_row.get("phone") or "",
            "custom_data": cd,
        }
        db.edit_client_details(client_row["id"], update)
        if changed:
            db.log_interaction(
                type="email",
                topic="Email cím automatikus javítása (hívás utáni ellenőrzés)",
                summary=f"{stored_email} → {new_email} (gate: {audit.get('gate', {}).get('reason')})",
                result=audit_status,
                tool_name="email_verify_harness",
                funnel_stage="relevant",
                direction="inbound",
                approval_status="approved",
                client_id=client_row.get("id"),
                session_id=None,
            )
    except Exception as exc:
        logger.warning(f"Email-korrekció írása sikertelen (#{client_row.get('id')}): {exc}")


def _update_session_events_email(old_email, new_email, started_at):
    """A hívás során keletkezett események attendee_email mezőjének frissítése
    (created_at >= session kezdete — régebbi eseményeket soha nem nyúlunk)."""
    try:
        cutoff = started_at or (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
        db._tenant_eq(
            db.supabase.table("calendar_events").update({"attendee_email": new_email})
        ).eq("attendee_email", old_email).gte("created_at", cutoff).execute()
    except Exception as exc:
        logger.warning(f"Esemény email-frissítés sikertelen ({old_email} → {new_email}): {exc}")


def _verify_name(booking_name, caller_text, norm_live, norm_scribe_caller,
                 llm_name="", client_id=None, interaction_id=None):
    """Név-jelöltek döntetlen-feloldása + autokorrekció. USER-SZABÁLY (élő
    incidens: az agent bemutatkozóneve került ügyfél-névnek): ha a foglalás
    NEM rögzített nevet, a harness NEM ír nevet — booking-név nélkül nincs
    mit ellenőrizni, és a kinyért „név" az agent beszéde lehet."""
    try:
        live_name = (booking_name or "").strip()
        if not live_name:
            return None
        scribe_name = extract_scribe_name(caller_text)
        cands = extract_name_candidates(live_name, scribe_name)
        if llm_name:
            for v in (llm_name, fold_accents(llm_name)):
                if v and v not in cands:
                    cands.append(v)
        if not cands:
            return None
        arb = arbitrate(cands, context={
            "kind": "name",
            "live": live_name,
            "scribe": scribe_name,
            "llm_value": (llm_name or "").strip(),
            "transcript_live": norm_live[:600],
            "transcript_scribe": norm_scribe_caller[:600],
        })
        winner = (arb.get("choice") or "").strip()
        conf = float(arb.get("confidence") or 0.0)
        changed = False
        if (client_id and winner
                and winner.lower() != live_name.lower()
                and db.is_valid_client_name(winner)):
            changed = _apply_name_correction(client_id, live_name, winner, arb)
        return {
            "winner": winner,
            "previous": live_name,
            "changed": changed,
            "confidence": conf,
            "source": arb.get("source", ""),
            "green": conf >= _confidence_threshold(),
        }
    except Exception as exc:
        logger.warning(f"Név-ellenőrzés hiba (kihagyva): {exc}")
        return None


def _apply_name_correction(client_id, old_name, new_name, arb) -> bool:
    """Név felülírása az ügyfélen (audit: custom_data.name_verification)."""
    try:
        res = db._tenant_eq(db.supabase.table("clients").select("*")).eq("id", client_id).limit(1).execute()
        row = res.data[0] if res.data else None
        if not row:
            return False
        cd = row.get("custom_data") or {}
        if isinstance(cd, str):
            try:
                cd = json.loads(cd)
            except (ValueError, TypeError):
                cd = {}
        cd = dict(cd or {})
        cd["name_verification"] = {
            "previous": old_name or "",
            "value": new_name,
            "confidence": arb.get("confidence", 0.0),
            "source": arb.get("source", ""),
            "ts": datetime.now(timezone.utc).isoformat(),
        }
        return db.edit_client_details(client_id, {
            "name": new_name,
            "email": row.get("email") or cd.get("email") or "",
            "phone": row.get("phone") or "",
            "custom_data": cd,
        })
    except Exception as exc:
        logger.warning(f"Név-korrekció írása sikertelen (#{client_id}): {exc}")
        return False


# ── Async belépési pont (server.py _spawn-ból) ───────────────────────────────
# ── WP-E3 MU-2: SMS-megerősítés döntési logika ───────────────────────────────
_HU_MOBILE_PREFIXES = ("+3620", "+3630", "+3631", "+3650", "+3670")


def _sms_mode() -> str:
    """EMAIL_VERIFY_SMS_MODE: 'off' = mai viselkedés (nincs SMS);
    'nongreen' (default) = SMS nem-zöld verdiktnél és email nélkül;
    'all' (P1) egyelőre 'nongreen'-ként viselkedik."""
    mode = (os.getenv("EMAIL_VERIFY_SMS_MODE", "nongreen") or "nongreen").strip().lower()
    return mode if mode in ("off", "nongreen", "all") else "nongreen"


def _verify_flow() -> str:
    """EMAIL_VERIFY_FLOW: 'gate' (default) — a kapu dönt az e-mailről;
    'smsfirst' — gyorsítósáv csak audio+stt egyezéssel, minden más SMS-first."""
    flow = (os.getenv("EMAIL_VERIFY_FLOW", "gate") or "gate").strip().lower()
    return flow if flow in ("gate", "smsfirst") else "gate"


def sms_eligible(caller_number: str, bookings: list, session_id: str) -> tuple[bool, str]:
    """MU-2.2 jogosultság: E.164 magyar mobil (+3620/30/31/50/70), van foglalás
    a hívásban, és ehhez a sessionhöz még nem ment SMS (idempotencia).
    Vissza: (jogosult, ok). Sosem dob."""
    p = (caller_number or "").strip()
    if not p or not p.startswith("+") or p.lower().startswith("+0"):
        return False, "nem E.164 / rejtett vagy anonim szám"
    if not p.startswith(_HU_MOBILE_PREFIXES):
        return False, "nem magyar mobilszám"
    if not bookings:
        return False, "nincs foglalás a hívásban"
    try:
        import database as db
        if db.session_has_sms(session_id):
            return False, "ehhez a sessionhöz már ment SMS"
    except Exception:
        pass
    return True, "ok"


def _rendelo_name() -> str:
    """Az SMS {rendelo} helyettesítője: RENDELO_NAME env → tenants.name →
    'Rendelo' (ugyanaz a lánc, mint a confirm oldalon). Fail-open."""
    try:
        env_name = (os.getenv("RENDELO_NAME") or "").strip()
        if env_name:
            return env_name
        import database as _db
        tid = _db.get_current_tenant()
        if tid:
            res = (_db.supabase.table("tenants").select("name")
                   .eq("id", tid).limit(1).execute())
            rows = getattr(res, "data", None) or []
            name = (rows[0].get("name") or "").strip() if rows else ""
            if name:
                return name
    except Exception:
        pass
    return "Rendelo"


def _send_confirm_sms(session_id: str, tenant_id, bookings: list,
                      caller_number: str, candidate_email,
                      client_id=None) -> dict:
    """MU-2.3: megerősítő SMS küldése token-linkkel (candidate előtöltve, vagy
    üres email-mező ha nincs jelölt). Vissza: {"ok": ..., "status": ...} — sosem dob."""
    try:
        from sms_sender import send_sms
        from email_confirm_tokens import create_confirm_token, build_sms_text

        first_start = None
        try:
            b0 = bookings[0] if bookings else {}
            if b0.get("date") and b0.get("time"):
                first_start = datetime.fromisoformat(
                    f"{b0['date']}T{b0['time']}:00").replace(
                    tzinfo=ZoneInfo("Europe/Budapest"))
        except Exception:
            first_start = None
        tok = create_confirm_token(
            session_id=session_id, tenant_id=tenant_id,
            event_ids=[b.get("event_id") for b in bookings if b.get("event_id")],
            phone=caller_number, candidate_email=(candidate_email or None),
            first_booking_start=first_start, client_id=client_id,
        )
        if not tok.get("ok"):
            return {"ok": False, "status": "failed", "error": tok.get("error")}
        base = (os.getenv("PUBLIC_CONFIRM_BASE_URL")
                or os.getenv("APP_BASE_URL")
                or os.getenv("SERVER_URL") or "").rstrip("/")
        link = f"{base}/e/{tok['token']}"
        b0 = bookings[0] if bookings else {}
        body = build_sms_text(link=link, rendelo=_rendelo_name(),
                              datum=b0.get("date", ""), ido=b0.get("time", ""),
                              has_candidate=bool(candidate_email))
        res = send_sms(caller_number, body, session_id=session_id,
                       tenant_id=tenant_id, purpose="email_confirm")
        return res
    except Exception as exc:
        logger.warning(f"Megerősítő SMS küldés hiba (fail-open): {exc}")
        return {"ok": False, "status": "failed", "error": str(exc)}


async def run_and_apply_email_verification(session_id: str, tenant_id=None,
                                           interaction_id=None, turns=None,
                                           client_id=None) -> dict:
    """A hívás végén futó vezérlő: harness verdict → email-küldés.
    green → visszaigazolás MOST; non_green → dupla opt-in; error/no_recording →
    legacy azonnali küldés (fail-open). A booking-adatokat a
    tools.SESSION_BOOKING_DATA-ból veszi (book_meeting tölti, verify módban)."""
    import tools  # lazy: a livekit-függő modult csak futásidőben érintjük

    bookings = tools.pop_session_bookings(session_id)
    booking_email = (bookings[0].get("attendee_email") or "") if bookings else ""
    booking_name = (bookings[0].get("attendee") or "") if bookings else ""

    try:
        # A Scribe/DB/ JE V hívások szinkronok — thread-ben futtatjuk, hogy a
        # worker event loopja ne álljon le akár 2 percre
        verdict = await asyncio.to_thread(
            run_harness,
            session_id=session_id,
            tenant_id=tenant_id,
            interaction_id=interaction_id,
            turns=turns or [],
            booking_email=booking_email,
            booking_name=booking_name,
            client_id=client_id,
            caller_number=(tools.get_caller_phone() or ""),
        )
    except Exception as exc:
        logger.warning(f"Email-ellenőrző harness hiba (fail-open): {exc}")
        verdict = {"status": "error"}

    status = verdict.get("status")
    winner = ((verdict.get("email") or {}).get("winner") or "").strip().lower()
    caller_number = (tools.get_caller_phone() or "")

    # ── WP-E3 MU-2.3: SMS döntési tábla + EMAIL_VERIFY_FLOW ──
    # flow='gate' (default): a kapu green-je → email azonnal (mai viselkedés).
    # flow='smsfirst' (célkép): gyorsítósáv CSAK ha az audio ÉS az stt
    # olvasat (két FÜGGETLEN utólagos forrás) egyezett → email azonnal;
    # minden más eset → SMS a hívónak a jelölttel, email CSAK a kattintás
    # után (a jó ember a jó címet erősíti meg).
    sms_mode = _sms_mode()
    flow = (os.getenv("EMAIL_VERIFY_FLOW", "gate") or "gate").strip().lower()
    sms_on = sms_mode != "off"
    eligible = False
    if sms_on:
        eligible, _elig_reason = sms_eligible(caller_number, bookings, session_id)
    optin_with_sms = (os.getenv("EMAIL_VERIFY_OPTIN_EMAIL_WITH_SMS", "0") or "0") == "1"

    audit = verdict.get("audit") or {}
    gate_audit = (audit.get("gate") or {})
    gate_present = gate_audit.get("present") or []
    readings = audit.get("readings") or {}
    # a gyorsítósáv-döntés a harnessben született (audit); hiányában fallback
    fast_lane = gate_audit.get("fast_lane")
    if fast_lane is None:
        fast_lane = status == "green"
    if flow == "smsfirst":
        sms_candidate = (readings.get("audio") or winner or "").strip().lower() or None
    else:
        sms_candidate = None

    async def _send_optin_email(candidate: str):
        try:
            await email_processor.send_email_verification_email(
                session_id=session_id,
                event_ids=[b.get("event_id") for b in bookings if b.get("event_id")],
                attendee_email=candidate,
                attendee=booking_name,
            )
        except Exception as exc:
            # A dupla opt-in sem ment ki → legacy azonnali küldés (fail-open)
            logger.warning(f"Dupla opt-in küldés hiba (fail-open legacy): {exc}")
            await _send_legacy_confirmations(bookings, candidate)

    if fast_lane:
        for b in bookings:
            try:
                await email_processor.send_booking_confirmation_email(
                    event_id=b.get("event_id"),
                    title=b.get("title", "Konzultáció"),
                    date=b.get("date", ""),
                    time=b.get("time", ""),
                    attendee=b.get("attendee", "Ügyfél"),
                    attendee_email=winner or b.get("attendee_email", ""),
                )
            except Exception as exc:
                logger.warning(f"Visszaigazoló küldés hiba ({b.get('attendee_email')}): {exc}")
    elif sms_on and eligible:
        # SMS-út: jelölt = smsfirst-ben az audio-olvasat, különben a kapu nyertese;
        # jelölt nélkül (smsfirst) is megy — 'adja meg a címét' üres mezővel
        cand = sms_candidate if sms_candidate else (winner or booking_email or None)
        send_empty = flow == "smsfirst" or not (winner or booking_email)
        if cand or send_empty:
            sms = _send_confirm_sms(session_id, tenant_id, bookings,
                                    caller_number, candidate_email=cand,
                                    client_id=client_id)
            db.update_email_verify_run_sms(session_id, bool(sms.get("ok")),
                                           sms.get("status", "failed"))
            if sms.get("ok"):
                logger.info(f"Megerősítő SMS elküldve ({caller_number}), email a megerősítés után")
                # Recepció-jelzés az eseményen: megerősítés függőben (WP-E3)
                for b in bookings:
                    if b.get("event_id"):
                        db.append_calendar_note(
                            b["event_id"],
                            "📧 E-mail megerősítés függőben — SMS kiküldve az ügyfélnek. "
                            "Megerősítés után ez a sor frissül.")
                if optin_with_sms and winner:
                    await _send_optin_email(winner)
            elif winner:
                # SMS sikertelen → visszaesés az opt-in levélre (MU-2.3)
                await _send_optin_email(winner)
            else:
                await _send_legacy_confirmations(bookings, booking_email)
        elif winner:
            await _send_optin_email(winner)
        else:
            await _send_legacy_confirmations(bookings, booking_email)
    else:
        # SMS ki-/nem jogosult — a régi tábla
        if winner:
            await _send_optin_email(winner)
        elif not booking_email:
            pass  # nincs email, nincs SMS-jogosultság → nincs küldés
        else:
            await _send_legacy_confirmations(bookings, booking_email)
    return verdict


async def _send_legacy_confirmations(bookings, email: str):
    for b in bookings:
        try:
            await email_processor.send_booking_confirmation_email(
                event_id=b.get("event_id"),
                title=b.get("title", "Konzultáció"),
                date=b.get("date", ""),
                time=b.get("time", ""),
                attendee=b.get("attendee", "Ügyfél"),
                attendee_email=email or b.get("attendee_email", ""),
            )
        except Exception as exc:
            logger.warning(f"Legacy visszaigazoló küldés hiba ({b.get('attendee_email')}): {exc}")
