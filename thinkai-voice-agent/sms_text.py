# -*- coding: utf-8 -*-
"""SMS-szöveg segédek (WP-E3): GSM-7 / UCS-2 kódolás-detektálás és
szegmensszámítás. Közös modul — az sms_sender és a sablon-validáció is ezt
használja. Pure függvények, sosem dobnak."""
import math

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
