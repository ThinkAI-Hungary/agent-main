# -*- coding: utf-8 -*-
"""Foglalás-egyeztetési harness tesztjei ('foglaltam'-tool nélkül incidens).

Az LLM-extrakciót és a heavy importokat stuboljuk; a döntési logika (trigger,
parse, kapuk, javítás) marad valódi. A stub-modulok monkeypatch.setitem-mel
mennek (auto-restore — nincs sys.modules-szennyezés a tesztek között).
"""
import sys
import types
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import booking_reconcile as br


CLASS_CLAIM = {"eredmeny": "Új időpont", "ugytipus": "Időpont",
               "idopont_altipus": "Új", "statusz": "Lezárt"}
CLASS_NO_CLAIM = {"eredmeny": "Foglalási szándék rögzítve", "ugytipus": "Időpont",
                  "idopont_altipus": None}


def test_booking_claimed_trigger():
    assert br.booking_claimed(CLASS_CLAIM) is True
    assert br.booking_claimed(CLASS_NO_CLAIM) is False
    assert br.booking_claimed(None) is False
    assert br.booking_claimed({"eredmeny": "Foglalási szándék rögzítve",
                               "ugytipus": "Időpont", "idopont_altipus": "Új"}) is True


def test_parse_extract_konkret_megerosites():
    raw = '{"confirmed": true, "date": "2026-10-13", "time": "14:00", ' \
          '"service": "Konzultáció", "attendee": "Teszt Elek", "email": "a@b.hu"}'
    ext = br.parse_booking_extract(raw)
    assert ext == {"date": "2026-10-13", "time": "14:00", "service": "Konzultáció",
                   "attendee": "Teszt Elek", "email": "a@b.hu"}


def test_parse_extract_nem_konkret():
    assert br.parse_booking_extract('{"confirmed": true, "date": null, "time": null}') is None
    assert br.parse_booking_extract('{"confirmed": false}') is None
    assert br.parse_booking_extract("nem-json") is None
    assert br.parse_booking_extract("") is None


def test_reconcile_disabled_env(monkeypatch):
    monkeypatch.setenv("BOOKING_RECONCILE", "0")
    assert br.reconcile_missing_booking("s", "t", [], CLASS_CLAIM, "+36301234567") is None


def test_reconcile_nem_claim_eset_nincs_llm(monkeypatch):
    monkeypatch.setenv("BOOKING_RECONCILE", "1")
    called = []
    monkeypatch.setattr(br, "_llm_confirm_extract", lambda t: called.append(t) or None)
    assert br.reconcile_missing_booking("s", "t", [], CLASS_NO_CLAIM, "+36301234567") is None
    assert called == []


def test_reconcile_handoff_mod_nem_foglal(monkeypatch):
    monkeypatch.setenv("BOOKING_RECONCILE", "1")
    monkeypatch.setitem(sys.modules, "database", types.ModuleType("database"))
    fake_tools = types.ModuleType("tools")
    fake_tools._booking_mode_gate = lambda op: "IGÉNYRÖGZÍTÉS MÓD"
    monkeypatch.setitem(sys.modules, "tools", fake_tools)
    monkeypatch.setattr(br, "_llm_confirm_extract",
                        lambda t: {"date": "2026-10-13", "time": "14:00",
                                   "service": "K", "attendee": "X", "email": ""})
    assert br.reconcile_missing_booking("s", "t", [], CLASS_CLAIM, "+36301234567") is None


def test_reconcile_multbeli_ido_oszinte_javitas(monkeypatch):
    monkeypatch.setenv("BOOKING_RECONCILE", "1")
    updates = []

    class _Tbl:
        def update(self, payload):
            updates.append(payload)
            return self
        def eq(self, *a, **k):
            return self
        def execute(self):
            return types.SimpleNamespace(data=[])

    dbmod = types.ModuleType("database")
    dbmod.supabase = types.SimpleNamespace(table=lambda t: _Tbl())
    dbmod.get_calendar_events = lambda: []
    monkeypatch.setitem(sys.modules, "database", dbmod)

    fake_tools = types.ModuleType("tools")
    fake_tools._booking_mode_gate = lambda op: None
    fake_tools._is_autonomous_allowed = lambda tipus, altipus: True
    fake_tools.BUDAPEST_TZ = ZoneInfo("Europe/Budapest")
    fake_tools._to_budapest_tz = lambda v: datetime.fromisoformat(v).replace(
        tzinfo=ZoneInfo("Europe/Budapest"))
    monkeypatch.setitem(sys.modules, "tools", fake_tools)

    monkeypatch.setattr(br, "_llm_confirm_extract",
                        lambda t: {"date": "2020-01-01", "time": "10:00",
                                   "service": "K", "attendee": "X", "email": ""})
    res = br.reconcile_missing_booking("s", "t", [], CLASS_CLAIM, "+36301234567",
                                       interaction_id=42)
    assert res is None
    assert updates and updates[0]["classification"]["eredmeny"] == "Foglalási szándék rögzítve"
    assert updates[0]["classification"]["statusz"] == "Nyitott"
    assert updates[0]["classification"]["autonomous"] is False
