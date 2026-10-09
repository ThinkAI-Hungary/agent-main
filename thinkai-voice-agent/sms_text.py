# -*- coding: utf-8 -*-
"""SMS-szöveg segédek (WP-E3): GSM-7 / UCS-2 kódolás-detektálás és
szegmensszámítás. Közös modul — az sms_sender és a sablon-validáció is ezt
használja. Pure függvények, sosem dobnak."""
import math
import re

# GSM 03.38 alapkészlet (7 bites alap + bővített karakterek — a bővített
# kettőt foglal: ^{}\[~]|€)
_GSM7_BASIC = (
    "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?"
    "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"
)
_GSM7_EXT = "^{}\\[~]|€"


def is_gsm7(text: str) -> bool:
    """Minden karakter GSM-7-ben kódolható-e (magyar á, í, ó, ú, ő, ű NEM —
    az é, ö, ü igen). Sosem dob."""
    try:
        for ch in text or "":
            if ch in _GSM7_BASIC or ch in _GSM7_EXT:
                continue
            return False
        return True
    except Exception:
        return False


def count_segments(text: str) -> tuple[int, str]:
    """(szegmensszám, kódolás) — 'GSM7' vagy 'UCS2'.
    GSM-7: 160 karakter/szegmens egyben, 153 többszörösében (a bővített
    karakterek kettőt foglalnak — konzervatívan 2 karakternek számítunk).
    UCS-2: 70, illetve 67. Hibás bemenet → (1, 'GSM7')."""
    t = text or ""
    try:
        if is_gsm7(t):
            units = sum(2 if ch in _GSM7_EXT else 1 for ch in t)
            if units <= 160:
                return 1, "GSM7"
            return max(1, math.ceil(units / 153)), "GSM7"
        n = len(t)
        if n <= 70:
            return 1, "UCS2"
        return max(1, math.ceil(n / 67)), "UCS2"
    except Exception:
        return 1, "GSM7"


def validate_template(template: str, max_segments: int = 2) -> tuple[bool, int, str]:
    """Sablon-konfig validáció: max. max_segments szegmens (alapértelmezésben
    2). Vissza: (ok, szegmensszám, ok-ok)."""
    if not template or "{link}" not in template:
        return False, 0, "a sablonnak tartalmaznia kell a {link} helyőrzőt"
    seg, enc = count_segments(template)
    if seg > max_segments:
        return False, seg, f"a sablon {seg} szegmens ({enc}) — maximum {max_segments} megengedett"
    return True, seg, "ok"


# ——— Ékezet-levágás (kampány-SMS költség-optimalizálás, 2026-10-09) ———
# A magyar á/í/ó/ú/ő/ű NEM GSM-7 → UCS-2 (70 kar/szegmens a 160 helyett =
# 2-3-szoros költség). Az ékezet nélküli küldés a meglévő sablonokkal is
# konzisztens (email_confirm_tokens.py).
_ACCENT_MAP = str.maketrans({
    "á": "a", "é": "e", "í": "i", "ó": "o", "ö": "o", "ő": "o",
    "ú": "u", "ü": "u", "ű": "u",
    "Á": "A", "É": "E", "Í": "I", "Ó": "O", "Ö": "O", "Ő": "O",
    "Ú": "U", "Ü": "U", "Ű": "U",
})


def strip_hungarian_accents(text: str) -> str:
    """Ékezetes magyar karakterek GSM-7-barát alakra váltása. Sosem dob."""
    try:
        return (text or "").translate(_ACCENT_MAP)
    except Exception:
        return text or ""


_TYPO_MAP = str.maketrans({
    "—": "-", "–": "-", "‒": "-",
    "\u201c": '"', "\u201d": '"', "\u2018": "'", "\u2019": "'",
    "…": "...",
})


def sms_body_prep(text: str) -> str:
    """Kampány-SMS véglegesítő: ékezet-levágás + tipográfiai karakterek
    (em-dash, okos-idézőjelek,ellipsis) GSM-7-barátra + szóközök rende.
    Vissza: (tiszta_szöveg, szegmensszám, kódolás)."""
    clean = strip_hungarian_accents(text or "").translate(_TYPO_MAP)
    clean = re.sub(r"[ \t]+", " ", clean).strip()
    segs, enc = count_segments(clean)
    return clean, segs, enc
