# -*- coding: utf-8 -*-
"""MU-0.1: EMAIL_DRY_RUN — a Brevo-kliens NEM hívódhat meg dry-run mellett,
mindhárom útra (visszaigazoló, dupla opt-in, emlékeztető)."""
import asyncio
import sys
import types
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def _stub(name, **attrs):
    mod = types.ModuleType(name)
    for k, v in attrs.items():
        setattr(mod, k, v)
    sys.modules[name] = mod
    return mod


# A harness-tesztek üres stubokat hagynak a sys.modules-ban — azokat el kell
# távolítani, hogy az email_processor VALÓDI modulja töltődjön be. Csak a
# nehéz/DB függőségek stubok (jev_classifier, classifier, call_recorder és a
# http-kliensek valósan importálódnak).
_STUBBED = ("database", "classifier", "google", "google.genai",
            "google.genai.types")
_prev_modules = {n: sys.modules.get(n) for n in _STUBBED}
for _m in _STUBBED:
    sys.modules.pop(_m, None)

_stub("database")
_stub("classifier", classify_interaction=lambda *a, **k: None)
google_mod = _stub("google")
genai_mod = _stub("google.genai", Client=lambda **k: None)
types_mod = _stub("google.genai.types")
google_mod.genai = genai_mod
sys.modules["google"] = google_mod
sys.modules["google.genai"] = genai_mod
sys.modules["google.genai.types"] = types_mod

import email_processor as ep

# A stubok NE szivárgjanak a többi tesztmodulba: az `ep.db` és a többi modul-
# referencia megmarad az email_processorban, a sys.modules viszont pontosan
# az import ELŐTTI állapotba áll vissza (a korábban betöltött valós modulokkal).
for _n, _mod in _prev_modules.items():
    if _mod is not None:
        sys.modules[_n] = _mod
    else:
        sys.modules.pop(_n, None)


@pytest.fixture()
def dry(monkeypatch):
    monkeypatch.setenv("EMAIL_DRY_RUN", "1")
    logs = []
    monkeypatch.setattr(ep.db, "add_email_log",
                        lambda *a, **k: logs.append((list(a), dict(k))) or None,
                        raising=False)
    monkeypatch.setattr(ep, "_get_brevo_api_key", lambda: "xkeysib-fake", raising=False)

    class _NoHttpx:
        def __enter__(self):
            raise AssertionError("dry-run mellett a Brevo-kliens NEM hívódhat meg")

        def __exit__(self, *a):
            return False

    import httpx as _httpx
    monkeypatch.setattr(_httpx, "AsyncClient", lambda *a, **k: _NoHttpx())
    return {"logs": logs}


def test_visszaigazolo_nem_megy_ki(dry, monkeypatch):
    # send_booking_confirmation_email: a POST előtt kilép dry-run-nal
    monkeypatch.setattr(ep, "_get_sender",
                        lambda: {"name": "Teszt", "email": "t@t.hu"}, raising=False)
    monkeypatch.setattr(ep.db, "get_reminder_settings", lambda: {}, raising=False)
    monkeypatch.setattr(ep.db, "supabase", None, raising=False)
    monkeypatch.setattr(ep, "_build_ics", lambda **k: None, raising=False)
    monkeypatch.setattr(ep, "_notification_vars", lambda *a, **k: {}, raising=False)
    monkeypatch.setattr(ep, "_render_notification",
                        lambda *a, **k: ("tárgy", "<html>", "plain"), raising=False)
    monkeypatch.setattr(ep, "log_outbound_message", lambda *a, **k: None, raising=False)
    asyncio.run(ep.send_booking_confirmation_email(
        event_id=1, title="Konzultáció", date="2026-09-30", time="10:00",
        attendee="Teszt Elek", attendee_email="kitalalt@pelda.hu"))
    assert dry["logs"], "dry_run sor kell az email_logs-ba"
    args = dry["logs"][0][0]
    assert args[2] == "tárgy"          # subject
    assert args[4] == "dry_run"        # status


def test_dupla_optin_nem_megy_ki(dry):
    asyncio.run(ep.send_email_verification_email(
        session_id="sess-1", event_ids=[7],
        attendee_email="kitalalt@pelda.hu", attendee="Teszt Elek"))
    assert dry["logs"], "dry_run sor kell az email_logs-ba"
    args, kwargs = dry["logs"][0]
    assert args[4] == "dry_run"
    assert kwargs.get("session_id") == "sess-1"   # session_id átíródott


def test_emlekezteto_nem_megy_ki(dry):
    ok = asyncio.run(ep.send_reminder_email("kitalalt@pelda.hu", "tárgy", "<html>"))
    assert ok is True
    assert dry["logs"] and dry["logs"][0][0][4] == "dry_run"


def test_dry_run_offlen_kapu_nem_lep(monkeypatch):
    # regresszió: EMAIL_DRY_RUN=0 → a dry-run kapu NEM lép
    monkeypatch.setenv("EMAIL_DRY_RUN", "0")
    assert ep._email_dry_run_enabled() is False
