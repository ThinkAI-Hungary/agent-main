# -*- coding: utf-8 -*-
"""tztime — az egységes Budapest-időkonvenció tesztjei.

2026-10-08: a visszaigazoló email és az SMS-megerősítő oldal a start_dt
NERS UTC-szeletét mutatta (07:00 a 09:00 helyett). A konvenció: tárolás UTC,
megjelenítés mindig Europe/Budapest a közös tztime segéddel.
"""
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from tztime import to_budapest, local_date, local_time, local_label


UTC_ISO = "2026-10-13T07:00:00+00:00"   # = 09:00 Budapest (CEST, UTC+2)


def test_to_budapest_utc_iso_9_orat_mutat():
    dt = to_budapest(UTC_ISO)
    assert dt is not None
    assert dt.hour == 9 and dt.minute == 0
    assert dt.day == 13


def test_to_budapest_z_utofix_es_naive_is_utc():
    assert to_budapest("2026-10-13T07:00:00Z").hour == 9
    # naive → UTC-nek tekintendő (PostgREST-konvenció)
    assert to_budapest("2026-10-13T07:00:00").hour == 9
    # datetime bemenet is megy
    assert to_budapest(datetime(2026, 10, 13, 7, 0)).hour == 9


def test_to_budapest_telente_vagy_hibas_none():
    assert to_budapest("") is None
    assert to_budapest(None) is None
    assert to_budapest("nem-dátum") is None


def test_local_date_time_a_visszaigazolo_email_szamara():
    # EZ volt a hiba: start[:10] + start[11:16] → ("2026-10-13", "07:00")
    assert local_date(UTC_ISO) == "2026-10-13"
    assert local_time(UTC_ISO) == "09:00"


def test_local_label_emberi_olvasat():
    assert local_label(UTC_ISO) == "2026.10.13. 09:00"


def test_hibas_bemenet_ures_stringek():
    assert local_date("nem-dátum") == ""
    assert local_time("") == ""


def test_teli_event_line_fogyasztja():
    """Az SMS-megerősítő oldal _event_line-ja a Budapest-időt mutatja."""
    import email_confirm_page as ecp
    line = ecp._event_line([{"start_dt": UTC_ISO, "title": "Implantációs konzultáció"}])
    assert "09:00" in line and "07:00" not in line
    assert "2026-10-13" in line
