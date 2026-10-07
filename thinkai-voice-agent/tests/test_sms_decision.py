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

    def fake_sms(session_id, tenant_id, bookings, caller_number,
                 candidate_email=None, client_id=None):
        calls.append({"session_id": session_id, "candidate": candidate_email,
                      "phone": caller_number, "client_id": client_id})
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
                      live="live@freemail.hu", stt="stt@freemail.hu",
                      fast_lane=None):
    if fast_lane is None:
        fast_lane = bool(status == "green" and "stt" in present
                         and "audio" in present)
    return {"status": status, "email": {"winner": winner}, "audit": {
        "gate": {"reason": "GREEN_2OF2_KNOWN" if status == "green" else "NG_X",
                 "present": list(present), "known_domain": True, "mx": True,
                 "fast_lane": fast_lane},
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


# ── UNIVERZÁLIS VISSZAIGAZOLÁS: flow=smsfirst + SMS_MODE=all ────────────────
@pytest.fixture()
def all_env(smsfirst_env, monkeypatch):
    """smsfirst + mode='all': minden jogosult hívó SMS-t kap a rögzített
    címmel; a visszaigazoló email CSAK a jóváhagyás után megy ki."""
    monkeypatch.setenv("EMAIL_VERIFY_SMS_MODE", "all")
    return smsfirst_env


def test_all_zold_gyorsitosav_is_sms_megy_email_nem(all_env, monkeypatch):
    # a gyorsítósáv (audio+stt egyezés) is az SMS-jóváhagyáson megy át:
    # SMS a nyertessel, azonnali visszaigazoló email NINCS
    calls = _sms_ok(monkeypatch)
    _run(monkeypatch, _verdict_smsfirst("green", winner="winner@freemail.hu",
                                        present=("audio", "stt"),
                                        audio="winner@freemail.hu",
                                        stt="winner@freemail.hu"))
    assert len(calls) == 1
    assert calls[0]["candidate"] == "winner@freemail.hu"
    assert all_env.confirm == [] and all_env.optin == []
    assert all_env.notes and "függőben" in all_env.notes[0][1]


def test_all_zold_sms_sikertelen_visszaigazolas_azonnal(all_env, monkeypatch):
    # zöld verdikt + SMS nem ment → a gyorsítósáv eredeti viselkedése:
    # visszaigazoló email most a nyertesre (nem opt-in, nem legacy)
    monkeypatch.setattr(evh, "_send_confirm_sms",
                        lambda *a, **k: {"ok": False, "status": "failed"}, raising=False)
    _run(monkeypatch, _verdict_smsfirst("green", winner="winner@freemail.hu",
                                        present=("audio", "stt"),
                                        audio="winner@freemail.hu",
                                        stt="winner@freemail.hu"))
    assert len(all_env.confirm) == 1
    assert all_env.optin == [] and all_env.legacy == []


def test_all_nem_jogosult_zold_email_azonnal(all_env, monkeypatch):
    # nem magyar mobil → nincs SMS-jogosultság → a mai gyorsítósáv: email most
    calls = _sms_ok(monkeypatch)
    _run(monkeypatch, _verdict_smsfirst("green", winner="winner@freemail.hu",
                                        present=("audio", "stt"),
                                        audio="winner@freemail.hu",
                                        stt="winner@freemail.hu"),
         caller="+3611234567")
    assert calls == []
    assert len(all_env.confirm) == 1


def test_all_nongreen_sms_marad(all_env, monkeypatch):
    # nem-zöld + all: ugyanaz, mint az smsfirst nongreen — SMS az audio-olvasattal
    calls = _sms_ok(monkeypatch)
    _run(monkeypatch, _verdict_smsfirst("non_green", winner="winner@freemail.hu",
                                        present=("live", "audio"),
                                        audio="audio@freemail.hu"))
    assert len(calls) == 1
    assert calls[0]["candidate"] == "audio@freemail.hu"
    assert all_env.confirm == []


def test_all_optin_kiserovel_sem_duplaz(all_env, monkeypatch):
    # EMAIL_VERIFY_OPTIN_EMAIL_WITH_SMS=1 univerzálisan NEM küld kísérő opt-int
    # (az email a jóváhagyás után megy, duplán lenne)
    monkeypatch.setenv("EMAIL_VERIFY_OPTIN_EMAIL_WITH_SMS", "1")
    calls = _sms_ok(monkeypatch)
    _run(monkeypatch, _verdict_smsfirst("green", winner="winner@freemail.hu",
                                        present=("audio", "stt"),
                                        audio="winner@freemail.hu",
                                        stt="winner@freemail.hu"))
    assert len(calls) == 1
    assert all_env.optin == []


def test_gate_all_modban_is_regi_viselkedes(env, monkeypatch):
    # flow=gate mellett az 'all' mód NEM aktiválja az univerzális SMS-t
    # (a gate a rollback-ág: green → email most)
    monkeypatch.setenv("EMAIL_VERIFY_SMS_MODE", "all")
    calls = _sms_ok(monkeypatch)
    _run(monkeypatch, _verdict_smsfirst("green", winner="winner@freemail.hu",
                                        present=("audio", "stt"),
                                        audio="winner@freemail.hu",
                                        stt="winner@freemail.hu"))
    assert calls == []
    assert len(env.confirm) == 1


def test_http_triggeres_futtatas_explicit_bookings(env, monkeypatch):
    # 2026-10-08 hotfix: a harness a web_server folyamatban fut HTTP-triggerrel —
    # ott a bookings/caller_number a paraméterben jön, a worker-memória
    # (tools.pop_session_bookings) NEM kerül felhasználásra
    pops = []
    monkeypatch.setattr(TOOLS, "pop_session_bookings",
                        lambda sid: pops.append(sid) or [], raising=False)
    monkeypatch.setattr(TOOLS, "get_caller_phone",
                        lambda: "+36999999999", raising=False)
    calls = _sms_ok(monkeypatch)
    explicit = [{"event_id": 9, "title": "Konzultáció", "date": "2026-10-02",
                 "time": "09:00", "attendee": "HTTP Ügyfél",
                 "attendee_email": "http@freemail.hu"}]
    monkeypatch.setattr(evh, "run_harness", lambda **kw: _verdict("non_green", ""),
                        raising=False)
    asyncio.run(evh.run_and_apply_email_verification(
        "sess-http", caller_number="+36709436426", bookings=explicit))
    assert len(calls) == 1
    assert calls[0]["candidate"] == "http@freemail.hu"  # az explicit foglalásból
    assert calls[0]["phone"] == "+36709436426"          # a paraméterből
    assert pops == []                                   # a pop nem hívódott


def test_http_triggeres_tenant_kontextus_beallitva(env, monkeypatch):
    # PER-TENANT fix (2026-10-09): a HTTP-triggeres futtatás a web_server
    # ambient (default) kontextusában indul — a run_and_apply-nak a kapott
    # tenant_id-ra KELL állítania a kontextust, különben a tenant-szűrt
    # írások (naptár-note, visszaigazoló email event-lekérés) nem-default
    # bérlőknél a default tenantra mentek volna (stagingen a teszt-bérlő
    # egyben a default is volt, ezért nem látszott).
    seen = []
    monkeypatch.setattr(evh.db, "set_current_tenant",
                        lambda tid: seen.append(tid), raising=False)
    monkeypatch.setattr(evh, "run_harness", lambda **kw: _verdict("error", ""),
                        raising=False)
    monkeypatch.setattr(evh, "_send_confirm_sms",
                        lambda *a, **k: {"ok": True, "status": "sent"}, raising=False)
    asyncio.run(evh.run_and_apply_email_verification(
        "sess-tenant", tenant_id="tenant-dentors-uuid"))
    assert "tenant-dentors-uuid" in seen


# ── HANDOFF IGÉNYRÖGZÍTÉS-VISSZAIGAZOLÁS (2026-10-09) ───────────────────────
def _verdict_handoff(winner="handoff@freemail.hu"):
    # handoff-hívás: nincs foglalás, de a harness kiolvasta a diktált címet
    return {"status": "non_green", "email": {"winner": winner}, "audit": {},
            "name": None, "llm": {}}


@pytest.fixture()
def handoff_env(smsfirst_env, monkeypatch):
    """flow=smsfirst + mode=all + booking_mode=handoff (nincs foglalás)."""
    monkeypatch.setattr(evh, "_handoff_mode_active", lambda: True, raising=False)
    # a döntési tábla 'bookings' szűrése: pop üres listát ad (nincs foglalás)
    monkeypatch.setattr(TOOLS, "pop_session_bookings", lambda sid: [], raising=False)
    return smsfirst_env


def test_handoff_sms_megy_optin_nem(handoff_env, monkeypatch):
    # handoff + diktált cím + magyar mobil → handoff-SMS; azonnali opt-in NEM
    calls = []

    def fake_handoff_sms(session_id, tenant_id, caller_number, candidate_email, client_id=None):
        calls.append({"candidate": candidate_email, "phone": caller_number})
        return {"ok": True, "status": "sent"}

    monkeypatch.setattr(evh, "_send_handoff_confirm_sms", fake_handoff_sms, raising=False)
    monkeypatch.setattr(evh, "run_harness", lambda **kw: _verdict_handoff(), raising=False)
    asyncio.run(evh.run_and_apply_email_verification("sess-handoff"))
    assert len(calls) == 1
    assert calls[0]["candidate"] == "handoff@freemail.hu"
    assert calls[0]["phone"] == "+36709436426"
    assert handoff_env.optin == [] and handoff_env.confirm == []


def test_handoff_sms_sikertelen_optin_tartalek(handoff_env, monkeypatch):
    monkeypatch.setattr(evh, "_send_handoff_confirm_sms",
                        lambda *a, **k: {"ok": False, "status": "failed"}, raising=False)
    monkeypatch.setattr(evh, "run_harness", lambda **kw: _verdict_handoff(), raising=False)
    asyncio.run(evh.run_and_apply_email_verification("sess-handoff"))
    assert len(handoff_env.optin) == 1


def test_handoff_nem_elheto_optin_marad(handoff_env, monkeypatch):
    # vezetékes szám → nincs handoff-SMS → a mai opt-in fallback fut
    calls = []
    monkeypatch.setattr(evh, "_send_handoff_confirm_sms",
                        lambda *a, **k: calls.append(1) or {"ok": True}, raising=False)
    monkeypatch.setattr(evh, "run_harness", lambda **kw: _verdict_handoff(), raising=False)
    asyncio.run(evh.run_and_apply_email_verification("sess-handoff", caller_number="+3611234567"))
    assert calls == []
    assert len(handoff_env.optin) == 1


def test_handoff_nincs_cim_semmi_nem_megy(handoff_env, monkeypatch):
    # handoff + nem hangzott el email → se SMS, se levél (csak a teendő készül)
    calls = []
    monkeypatch.setattr(evh, "_send_handoff_confirm_sms",
                        lambda *a, **k: calls.append(1) or {"ok": True}, raising=False)
    monkeypatch.setattr(evh, "run_harness",
                        lambda **kw: _verdict_handoff(winner=""), raising=False)
    BOOKINGS[0]["attendee_email"] = ""
    try:
        asyncio.run(evh.run_and_apply_email_verification("sess-handoff"))
    finally:
        BOOKINGS[0]["attendee_email"] = "live@freemail.hu"
    assert calls == []
    assert handoff_env.optin == [] and handoff_env.legacy == []


def test_handoff_kikapcsolva_regi_tabla(handoff_env, monkeypatch):
    # nem-handoff bérlőnél (nincs foglalás, van cím) a MAI viselkedés: opt-in
    monkeypatch.setattr(evh, "_handoff_mode_active", lambda: False, raising=False)
    monkeypatch.setattr(evh, "run_harness", lambda **kw: _verdict_handoff(), raising=False)
    asyncio.run(evh.run_and_apply_email_verification("sess-norm"))
    assert len(handoff_env.optin) == 1
