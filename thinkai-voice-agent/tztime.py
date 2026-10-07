# -*- coding: utf-8 -*-
"""Közös Budapest-idő segéd — az EGYSÉGES időkonvenció megvalósítója.

KONVENCIÓ (2026-10-08-tól ez az egyetlen elfogadott minta):
  - TÁROLÁS: Postgres timestamptz, PostgREST ISO UTC-ben szolgálja ki.
  - MEGJELENÍTÉS: mindig Europe/Budapest, KÖZPONTI segéddel — SOHA nyers
    ISO-szelet (start_dt[:16] / [11:16]), SOHA a böngésző/gép lokális
    időzónájára bízva. A nyers szelet 09:00 budapesti időpontot 07:00-ként
    mutatott a visszaigazoló emailben és az SMS-megerősítő oldalon.
"""
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

BUDAPEST = ZoneInfo("Europe/Budapest")


def to_budapest(value):
    """ISO-string | datetime → Budapest-aware datetime, vagy None (hibánál —
    a hívó dönt a fallbackről). Naive datetime UTC-nek tekintendő (a
    PostgREST-válasz konvenciója)."""
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        dt = value
    else:
        try:
            dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except (ValueError, TypeError):
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    try:
        return dt.astimezone(BUDAPEST)
    except Exception:
        return None


def local_date(value) -> str:
    """'2026-10-13' alak — a send_booking_confirmation_email date mezőjéhez."""
    dt = to_budapest(value)
    return dt.strftime("%Y-%m-%d") if dt else ""


def local_time(value) -> str:
    """'09:00' alak — a send_booking_confirmation_email time mezőjéhez."""
    dt = to_budapest(value)
    return dt.strftime("%H:%M") if dt else ""


def local_label(value) -> str:
    """'2026.10.13. 09:00' emberi olvasat (naplók, sorok)."""
    dt = to_budapest(value)
    return dt.strftime("%Y.%m.%d. %H:%M") if dt else ""
