# -*- coding: utf-8 -*-
"""WP-E3 MU-2.4: az SMS döntési tábla és a jogosultság tesztjei.

A run_and_apply_email_verification döntéseit stubolt harness-verdictekkel
és küldőkkel ellenőrizzük — hálózat nélkül."""
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
    sys.modules.setdefault(name, mod)
    return mod


# A valódi email_processor/databaseegyüttes kell (a dry_run-minta): a
# database STUBOLVA marad, az email_processor VALÓDI importot kap (a google
# és a classifier stub csak a nehéz függőségei miatt kell)
_STUBBED = ("database", "classifier", "google", "google.genai", "google.genai.types")
_prev_modules = {n: sys.modules.get(n) for n in _STUBBED}
for _n in _STUBBED:
    sys.modules.pop(_n, None)
_stub("database")
_stub("classifier", classify_interaction=lambda *a, **k: None)
google_mod = _stub("google")
genai_mod = _stub("google.genai", Client=lambda **k: None)
types_mod = _stub("google.genai.types")
google_mod.genai = genai_mod
sys.modules["google"] = google_mod
sys.modules["google.genai"] = genai_mod
sys.modules["google.genai.types"] = types_mod

BOOKINGS = [{"event_id": 7, "title": "Konzultáció", "date": "2026-10-01",
             "time": "16:30", "attendee": "Teszt Elek", "attendee_email": "live@freemail.hu"}]

# A valódi tools a livekit-függősége miatt nem importálható a venvben —
# stubot használunk; a sys.modules-t az import ELŐTTI állapotra állítjuk
# vissza (a test_tools_pure a valódi tools-t importálja), a futásidejű
# `import tools` feloldását az autouse fixture végzi tesztenként.
_prev_tools = sys.modules.get("tools")
sys.modules.pop("tools", None)
TOOLS = _stub("tools", pop_session_bookings=lambda sid: list(BOOKINGS),
              get_caller_phone=lambda: "+36709436426",
              send_session_confirmations=None)

import email_verify_harness as evh  # noqa: E402

# a sys.modules-t az import ELŐTTI állapotra állítjuk vissza (a többi
# tesztmodul a saját stubját/valós modulját importálhatja); az evh.db és az
# evh.email_processor referenciái megmaradnak
for _n, _m in _prev_modules.items():
    if _m is not None:
        sys.modules[_n] = _m
    else:
        sys.modules.pop(_n, None)
if _prev_tools is not None:
    sys.modules["tools"] = _prev_tools
else:
    sys.modules.pop("tools", None)


@pytest.fixture(autouse=True)
def _tools_stub(monkeypatch):
    """Futásidejű `import tools` a stubot oldja fel a tesztek alatt."""
    monkeypatch.setitem(sys.modules, "tools", TOOLS)


class _Captures:
    def __init__(self):
        self.sms = []
        self.optin = []
        self.confirm = []
        self.legacy = []
        self.notes = []

    def reset(self):
        self.sms.clear(); self.optin.clear(); self.confirm.clear(); self.legacy.clear()
        self.notes.clear()


CAP = _Captures()


@pytest.fixture()
def env(monkeypatch):
    monkeypatch.setenv("EMAIL_VERIFY_SMS_MODE", "nongreen")
    monkeypatch.setenv("EMAIL_VERIFY_FLOW", "gate")  # a .env dotenv-e ellenére
    # a futásidejű `import database` is a stubot oldja meg (a .env dotenv
    # miatt a valódi database is élne — az élő staginget ne írjuk)
    monkeypatch.setitem(sys.modules, "database", evh.db)
    monkeypatch.delenv("EMAIL_VERIFY_OPTIN_EMAIL_WITH_SMS", raising=False)
    CAP.reset()
    monkeypatch.setattr(evh.db, "session_has_sms", lambda sid: False, raising=False)
    monkeypatch.setattr(evh.db, "update_email_verify_run_sms",
                        lambda sid, sent, status: True, raising=False)
    monkeypatch.setattr(evh.db, "append_calendar_note",
                        lambda eid, line: CAP.notes.append((eid, line)) or True,
                        raising=False)

    async def _optin(**kw):
        CAP.optin.append(kw)

    async def _confirm(**kw):
        CAP.confirm.append(kw)

    async def _legacy(bookings, email):
        CAP.legacy.append(email)

    monkeypatch.setattr(evh.email_processor, "send_email_verification_email", _optin, raising=False)
    monkeypatch.setattr(evh.email_processor, "send_booking_confirmation_email", _confirm, raising=False)
    monkeypatch.setattr(evh, "_send_legacy_confirmations", _legacy, raising=False)
    return CAP


def _verdict(status="non_green", winner="jelolt@citromail.hu"):
    return {"status": status, "email": {"winner": winner}, "audit": {},
            "name": None, "llm": {}}


def _run(monkeypatch, verdict, caller="+36709436426"):
    monkeypatch.setattr(evh, "run_harness", lambda **kw: verdict, raising=False)
    if caller is not None:
        monkeypatch.setattr(TOOLS, "get_caller_phone", lambda: caller, raising=False)
    return asyncio.run(evh.run_and_apply_email_verification("sess-1"))


def _sms_ok(monkeypatch):
    calls = []

    def fake_sms(session_id, tenant_id, bookings, caller_number, candidate_email):
        calls.append({"session_id": session_id, "candidate": candidate_email,
                      "phone": caller_number})
        return {"ok": True, "status": "sent"}

    monkeypatch.setattr(evh, "_send_confirm_sms", fake_sms, raising=False)
    return calls


def test_green_nincs_sms(env, monkeypatch):
    # 2.3: GREEN → mint ma: visszaigazolás azonnal, nincs SMS (nongreen mód)
    _sms_ok(monkeypatch)
    _run(monkeypatch, _verdict("green", "jo@gmail.com"))
    assert len(env.confirm) == 1
    assert env.sms == []


def test_nongreen_jogosult_sms_megy_optin_nem(env, monkeypatch):
    # 2.3: NON-GREEN, van jelölt, jogosult → SMS; opt-in levél NEM megy
    calls = _sms_ok(monkeypatch)
    _run(monkeypatch, _verdict("non_green", "jelolt@citromail.hu"))
    assert len(calls) == 1
    assert calls[0]["candidate"] == "jelolt@citromail.hu"
    assert calls[0]["phone"] == "+36709436426"
    assert env.optin == []
    assert env.notes and "függőben" in env.notes[0][1]  # recepció-jelzés az eseményen


def test_nongreen_nem_jogosult_optin_megy(env, monkeypatch):
    # vezetékes szám → nem jogosult → dupla opt-in levél (mint ma)
    calls = _sms_ok(monkeypatch)
    _run(monkeypatch, _verdict("non_green", "jelolt@citromail.hu"), caller="+3611234567")
    assert calls == []
    assert len(env.optin) == 1


def test_nongreen_sms_sikertelen_optin_tartalek(env, monkeypatch):
    # SMS küldés sikertelen → visszaesés az opt-in levélre
    monkeypatch.setattr(evh, "_send_confirm_sms",
                        lambda *a, **k: {"ok": False, "status": "failed"}, raising=False)
    _run(monkeypatch, _verdict("non_green", "jelolt@citromail.hu"))
    assert len(env.optin) == 1


def test_nincs_email_jogosult_ures_sms(env, monkeypatch):
    # 2.3: nincs email + jogosult → SMS üres email-mezővel, legacy NEM megy
    BOOKINGS[0]["attendee_email"] = ""
    try:
        calls = _sms_ok(monkeypatch)
        _run(monkeypatch, _verdict("non_green", ""), caller="+36709436426")
    finally:
        BOOKINGS[0]["attendee_email"] = "live@freemail.hu"
    assert len(calls) == 1
    assert calls[0]["candidate"] is None
    assert env.legacy == []


def test_nincs_email_nem_jogosult_nincs_kuldes(env, monkeypatch):
    BOOKINGS[0]["attendee_email"] = ""
    try:
        calls = _sms_ok(monkeypatch)
        _run(monkeypatch, _verdict("non_green", ""), caller="+3611234567")
    finally:
        BOOKINGS[0]["attendee_email"] = "live@freemail.hu"
    assert calls == []
    assert env.optin == [] and env.legacy == []


def test_error_jogosult_sms_legacy_nem_megy(env, monkeypatch):
    # 2.3: error/no_recording + jogosult → SMS a foglalási élő címmel előtöltve
    calls = _sms_ok(monkeypatch)
    _run(monkeypatch, _verdict("error", ""), caller="+36709436426")
    assert len(calls) == 1
    assert calls[0]["candidate"] == "live@freemail.hu"  # a foglalási (élő) cím
    assert env.legacy == []


def test_error_nem_jogosult_legacy_megy(env, monkeypatch):
    calls = _sms_ok(monkeypatch)
    _run(monkeypatch, _verdict("error", ""), caller="+3611234567")
    assert len(env.legacy) == 1
    assert calls == []


def test_sms_mode_off_regi_viselkedes(env, monkeypatch):
    # EMAIL_VERIFY_SMS_MODE=off → a mai viselkedés: non-green → opt-in levél
    monkeypatch.setenv("EMAIL_VERIFY_SMS_MODE", "off")
    calls = _sms_ok(monkeypatch)
    _run(monkeypatch, _verdict("non_green", "jelolt@citromail.hu"))
    assert calls == []
    assert len(env.optin) == 1


class TestSmsEligible:
    def test_magyar_mobil_ok(self):
        ok, _ = evh.sms_eligible("+36709436426", BOOKINGS, "sess-1")
        assert ok is True

    def test_vezetekes_nem(self):
        ok, _ = evh.sms_eligible("+3611234567", BOOKINGS, "sess-1")
        assert ok is False

    def test_kulfoldi_nem(self):
        ok, _ = evh.sms_eligible("+4915123456789", BOOKINGS, "sess-1")
        assert ok is False

    def test_rejtett_nem(self):
        for bad in ("", "anonymous", "+", "nincs"):
            ok, _ = evh.sms_eligible(bad, BOOKINGS, "sess-1")
            assert ok is False

    def test_nincs_foglalas_nem(self):
        ok, _ = evh.sms_eligible("+36709436426", [], "sess-1")
        assert ok is False

    def test_idempotencia_masodik_sms_nem_megy(self, monkeypatch):
        monkeypatch.setitem(sys.modules, "database", evh.db)
        monkeypatch.setattr(evh.db, "session_has_sms", lambda sid: True, raising=False)
        ok, reason = evh.sms_eligible("+36709436426", BOOKINGS, "sess-1")
        assert ok is False and "már ment SMS" in reason


# ── CÉLKÉP: EMAIL_VERIFY_FLOW=smsfirst ──────────────────────────────────────
def _verdict_smsfirst(status="green", winner="winner@freemail.hu",
                      present=("stt", "audio"), audio="audio@freemail.hu",
                      live="live@freemail.hu", stt="stt@freemail.hu"):
    return {"status": status, "email": {"winner": winner}, "audit": {
        "gate": {"reason": "GREEN_2OF2_KNOWN" if status == "green" else "NG_X",
                 "present": list(present), "known_domain": True, "mx": True},
        "readings": {"live": live, "stt": stt, "audio": audio,
                     "stt_regex": None, "reconcile": None, "jev": {}},
    }, "name": None, "llm": {}}


@pytest.fixture()
def smsfirst_env(monkeypatch):
    monkeypatch.setenv("EMAIL_VERIFY_SMS_MODE", "nongreen")
    monkeypatch.setenv("EMAIL_VERIFY_FLOW", "smsfirst")
    monkeypatch.delenv("EMAIL_VERIFY_OPTIN_EMAIL_WITH_SMS", raising=False)
    CAP.reset()
    monkeypatch.setattr(evh.db, "session_has_sms", lambda sid: False, raising=False)
    monkeypatch.setattr(evh.db, "update_email_verify_run_sms",
                        lambda sid, sent, status: True, raising=False)
    monkeypatch.setattr(evh.db, "append_calendar_note",
                        lambda eid, line: CAP.notes.append((eid, line)) or True,
                        raising=False)

    async def _optin(**kw):
        CAP.optin.append(kw)

    async def _confirm(**kw):
        CAP.confirm.append(kw)

    async def _legacy(bookings, email):
        CAP.legacy.append(email)

    monkeypatch.setattr(evh.email_processor, "send_email_verification_email", _optin, raising=False)
    monkeypatch.setattr(evh.email_processor, "send_booking_confirmation_email", _confirm, raising=False)
    monkeypatch.setattr(evh, "_send_legacy_confirmations", _legacy, raising=False)
    return CAP


def test_smsfirst_gyorsitosav_audio_stt_egyezik_email_menv(smsfirst_env, monkeypatch):
    # gyorsítósáv: audio + stt független egyezés → email azonnal, NEM megy SMS
    calls = _sms_ok(monkeypatch)
    _run(monkeypatch, _verdict_smsfirst("green", present=("audio", "stt"),
                                        audio="audio@freemail.hu", stt="audio@freemail.hu"))
    assert len(smsfirst_env.confirm) == 1
    assert calls == []


def test_smsfirst_live_vel_zold_de_audio_hianyzik_sms_megy(smsfirst_env, monkeypatch):
    # green live+stt-vel, audio NINCS → NEM gyorsítósáv → SMS, email csak kattintás után
    calls = _sms_ok(monkeypatch)
    _run(monkeypatch, _verdict_smsfirst("green", present=("live", "stt"), audio=None))
    assert len(calls) == 1
    assert smsfirst_env.confirm == []


def test_smsfirst_jelolt_az_audio_olvasat(smsfirst_env, monkeypatch):
    # non-green: az SMS jelöltje az AUDIO olvasat (nem a kapu nyertese)
    calls = _sms_ok(monkeypatch)
    _run(monkeypatch, _verdict_smsfirst("non_green", winner="winner@freemail.hu",
                                        present=("live", "audio"), audio="audio@freemail.hu"))
    assert len(calls) == 1
    assert calls[0]["candidate"] == "audio@freemail.hu"
    assert smsfirst_env.optin == []


def test_smsfirst_sms_sikertelen_optin_tartalek(smsfirst_env, monkeypatch):
    monkeypatch.setattr(evh, "_send_confirm_sms",
                        lambda *a, **k: {"ok": False, "status": "failed"}, raising=False)
    _run(monkeypatch, _verdict_smsfirst("non_green"))
    assert len(smsfirst_env.optin) == 1


def test_smsfirst_jelolt_nelkul_ures_sms(smsfirst_env, monkeypatch):
    # nincs audio/winner/foglalási email → SMS üres email-mezővel ('adja meg a címét')
    BOOKINGS[0]["attendee_email"] = ""
    try:
        calls = _sms_ok(monkeypatch)
        _run(monkeypatch, _verdict_smsfirst("non_green", winner="",
                                            present=("live",), audio=None, live=None, stt=None))
    finally:
        BOOKINGS[0]["attendee_email"] = "live@freemail.hu"
    assert len(calls) == 1
    assert calls[0]["candidate"] is None


def test_gate_flow_alapertelmezett_smaradt(env, monkeypatch):
    # EMAIL_VERIFY_FLOW alapból 'gate' — green → email, viselkedés változatlan
    monkeypatch.delenv("EMAIL_VERIFY_FLOW", raising=False)
    calls = _sms_ok(monkeypatch)
    _run(monkeypatch, _verdict("green", "jo@gmail.com"))
    assert len(env.confirm) == 1
    assert calls == []
