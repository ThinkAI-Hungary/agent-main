# -*- coding: utf-8 -*-
"""WP-E3 MU-1: sms_sender egységtesztek (Twilio REST — SDK nélkül, hálózat nélkül).

A `database` modul sys.modules-stubbal megy (setdefault — más tesztfájlokat
nem tör, és a fixture monkeypatchen keresztül, visszabonthatóan állítja),
az `sms_text` viszont VALÓDI modul (a count_segments-tet NEM stuboljuk).
A HTTP-réteget `ss.requests.post` monkeypatchelt fake-ekkel ellenőrizzük.
"""
import base64
import hashlib
import hmac
import sys
import types
from pathlib import Path
from types import SimpleNamespace

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def _stub(name, **attrs):
    mod = types.ModuleType(name)
    for k, v in attrs.items():
        setattr(mod, k, v)
    sys.modules.setdefault(name, mod)
    return mod


_stub("database")
import sms_sender as ss  # noqa: E402
import sms_text  # noqa: E402  — VALÓDI modul (count_segments nem stubolt)

# A stub database-modul, amin a fixture-ök attribútumokat állítanak
# (setdefault miatt lehet a korábbi tesztek stubja vagy — teljes suite-ban —
# a korábban betöltött valós modul; mindkettővel működik a monkeypatch).
_DB = _stub("database")

# A tesztek determinisztikusan, TISZTA env-ben futnak (semmi .env-szivárgás)
_SMS_ENV = ("SMS_DRY_RUN", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN",
            "TWILIO_MESSAGING_SERVICE_SID", "TWILIO_FROM",
            "PUBLIC_CONFIRM_BASE_URL", "APP_BASE_URL", "SERVER_URL")


class _FakeTable:
    """supabase-py builder-lánc fakója: insert/update → eq → execute.
    Minden művelet capture-elve a rows dictbe (payload + eq-feltétel)."""

    def __init__(self, rows):
        self.rows = rows

    def insert(self, payload):
        self._pending = ("insert", payload)
        return self

    def update(self, payload):
        self._pending = ("update", payload)
        return self

    def eq(self, col, val):
        self._eq = (col, val)
        return self

    def execute(self):
        op, payload = self._pending
        self.rows[op].append({"payload": payload,
                              "eq": getattr(self, "_eq", None)})
        data = [dict(payload, id="row-1")] if op == "insert" else []
        return SimpleNamespace(data=data)


@pytest.fixture(autouse=True)
def tiszta_env(monkeypatch):
    for var in _SMS_ENV:
        monkeypatch.delenv(var, raising=False)


@pytest.fixture()
def logs(monkeypatch):
    """sms_logs-stub: insert/update capture + átlátszó _with_tenant."""
    rows = {"insert": [], "update": []}
    table = _FakeTable(rows)
    monkeypatch.setitem(sys.modules, "database", _DB)
    monkeypatch.setattr(_DB, "_with_tenant",
                        lambda payload, tid=None: dict(payload), raising=False)
    monkeypatch.setattr(_DB, "supabase",
                        SimpleNamespace(table=lambda name: table),
                        raising=False)
    return rows


# ── 1) SMS_DRY_RUN: nincs HTTP-hívás, dry_run sor keletkezik ─────────────────
def test_dry_run_nem_hiv_twiliot(monkeypatch, logs):
    monkeypatch.setenv("SMS_DRY_RUN", "1")

    def _no_post(*a, **k):
        raise AssertionError("dry-run mellett a Twilio REST API NEM hívódhat meg")

    monkeypatch.setattr(ss.requests, "post", _no_post)
    res = ss.send_sms("+36301234567", "Konfirmacio: idopontja rogzitve.",
                      session_id="sess-9", purpose="confirmation")
    assert res["ok"] is True
    assert res["status"] == "dry_run"
    assert res["sid"] is None
    assert res["error"] is None
    assert logs["insert"], "dry_run sor kell az sms_logs-ba"
    ins = logs["insert"][0]["payload"]
    assert ins["status"] == "dry_run"
    assert ins["session_id"] == "sess-9"
    assert ins["to_number"] == "+36301234567"
    assert ins["segments"] >= 1 and ins["encoding"] in ("GSM7", "UCS2")
    assert logs["update"] == []  # dry-run: nincs utólagos update


# ── 2) Twilio-kivétel: fail-open, NINCS dobás, sms_logs "failed" ─────────────
def test_twilio_kivetel_fail_open(monkeypatch, logs):
    monkeypatch.setenv("TWILIO_ACCOUNT_SID", "ACTEST")
    monkeypatch.setenv("TWILIO_AUTH_TOKEN", "token")
    monkeypatch.setenv("TWILIO_FROM", "+36300000000")

    def _boom(*a, **k):
        raise ss.requests.exceptions.ConnectionError("hálózat nincs")

    monkeypatch.setattr(ss.requests, "post", _boom)
    res = ss.send_sms("+36301234567", "Konfirmacio.")  # NEM dobhat
    assert res["ok"] is False
    assert res["status"] == "failed"
    assert res["error"]
    assert logs["insert"], "queued sor kell az sms_logs-ba"
    assert logs["insert"][0]["payload"]["status"] == "queued"
    assert logs["update"] and logs["update"][0]["payload"]["status"] == "failed"


# ── 3) Sikeres válasz (201): ok + sid, sms_logs "sent" ───────────────────────
def test_sikeres_kuldes(monkeypatch, logs):
    monkeypatch.setenv("TWILIO_ACCOUNT_SID", "ACTEST")
    monkeypatch.setenv("TWILIO_AUTH_TOKEN", "token")
    monkeypatch.setenv("TWILIO_MESSAGING_SERVICE_SID", "MGTEST")
    monkeypatch.setenv("PUBLIC_CONFIRM_BASE_URL", "https://crm.pelda.hu")
    calls = []

    def fake_post(url, auth=None, data=None, timeout=None):
        calls.append({"url": url, "auth": auth, "data": data, "timeout": timeout})
        return SimpleNamespace(status_code=201,
                               json=lambda: {"sid": "SM123", "status": "queued"})

    monkeypatch.setattr(ss.requests, "post", fake_post)
    res = ss.send_sms("+36301234567", "Konfirmacio: idopontja rogzitve.",
                      purpose="confirmation")
    assert res == {"ok": True, "sid": "SM123", "status": "sent",
                   "segments": 1, "encoding": "GSM7", "error": None}
    assert len(calls) == 1  # nincs retry 201-re
    call = calls[0]
    assert call["url"] == "https://api.twilio.com/2010-04-01/Accounts/ACTEST/Messages.json"
    assert call["auth"] == ("ACTEST", "token")
    assert call["data"]["MessagingServiceSid"] == "MGTEST"
    assert "From" not in call["data"]  # messaging service mellett nincs From
    assert call["data"]["StatusCallback"] == \
        "https://crm.pelda.hu/api/public/twilio/status"
    assert logs["insert"][0]["payload"]["status"] == "queued"
    upd = logs["update"][0]
    assert upd["payload"]["status"] == "sent"
    assert upd["payload"]["provider_sid"] == "SM123"
    # ÉLŐ-INCIDENS javítás: a beszúrt sor provider_sid-je még NULL → az update
    # a sor-ID alapján fut (a provider_sid-szűrő 0 sort talált volna)
    assert upd["eq"] == ("id", "row-1")


def test_from_fallback_messaging_service_nelkul(monkeypatch, logs):
    """TWILIO_MESSAGING_SERVICE_SID nélkül a TWILIO_FROM-mal küld."""
    monkeypatch.setenv("TWILIO_ACCOUNT_SID", "ACTEST")
    monkeypatch.setenv("TWILIO_AUTH_TOKEN", "token")
    monkeypatch.setenv("TWILIO_FROM", "+36300000000")

    def fake_post(url, auth=None, data=None, timeout=None):
        return SimpleNamespace(status_code=201,
                               json=lambda: {"sid": "SM777", "status": "queued"})

    monkeypatch.setattr(ss.requests, "post", fake_post)
    res = ss.send_sms("+36301234567", "Hello")
    assert res["ok"] is True and res["sid"] == "SM777"
    # a POST data-ját a fake nem rögzítette itt — update-ből ellenőrizzük a sid-et
    assert logs["update"][0]["eq"] == ("id", "row-1")  # sor-ID alapján (élő-incidens javítás)


# ── 4) validate_twilio_signature: függetlenül számolt aláírással ─────────────
_URL = "https://crm.pelda.hu/api/public/twilio/status"
_PARAMS = {"MessageSid": "SM123", "MessageStatus": "delivered",
           "To": "+36301234567", "From": "+36300000000"}
_TOKEN = "authtoken123"


def _sign(url: str, params: dict, token: str) -> str:
    """Független implementáció a spec szerint: rendezett név+érték konkatenáció
    az URL után, HMAC-SHA1 az auth_token kulccsal, base64."""
    data = url + "".join(f"{k}{params[k]}" for k in sorted(params))
    return base64.b64encode(
        hmac.new(token.encode("utf-8"), data.encode("utf-8"), hashlib.sha1)
        .digest()).decode("utf-8")


def test_signature_helyes_alairas():
    sig = _sign(_URL, _PARAMS, _TOKEN)
    assert ss.validate_twilio_signature(_URL, _PARAMS, sig, _TOKEN) is True


def test_signature_rossz_alairas():
    assert ss.validate_twilio_signature(
        _URL, _PARAMS, "rossz-alairas==", _TOKEN) is False


def test_signature_modositott_param():
    sig = _sign(_URL, _PARAMS, _TOKEN)
    tampered = dict(_PARAMS, MessageStatus="undelivered")
    assert ss.validate_twilio_signature(_URL, tampered, sig, _TOKEN) is False


def test_signature_hibas_bevitel_nem_dob():
    # None/érvénytelen bemenetre False, kivétel NEM
    assert ss.validate_twilio_signature(None, None, None, _TOKEN) is False


# ── 5) Nincs SMS_DRY_RUN és nincs SID → "nincs Twilio-konfiguráció" ──────────
def test_nincs_konfiguracio(monkeypatch, logs):
    monkeypatch.setenv("SMS_DRY_RUN", "0")  # explicitly OFF
    for var in ("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN",
                "TWILIO_MESSAGING_SERVICE_SID", "TWILIO_FROM"):
        monkeypatch.delenv(var, raising=False)

    def _no_post(*a, **k):
        raise AssertionError("konfiguráció nélkül a Twilio NEM hívódhat")

    monkeypatch.setattr(ss.requests, "post", _no_post)
    res = ss.send_sms("+36301234567", "Hello")
    assert res["ok"] is False
    assert res["error"] == "nincs Twilio-konfiguráció"
    assert logs["insert"][0]["payload"]["status"] == "failed"
    assert logs["insert"][0]["payload"]["error_message"] == \
        "nincs Twilio-konfiguráció"


# ── Kiegészítő: retry-logika és fail-open fedél ──────────────────────────────
def test_429_egyszer_ujraprobal(monkeypatch, logs):
    monkeypatch.setenv("TWILIO_ACCOUNT_SID", "ACTEST")
    monkeypatch.setenv("TWILIO_AUTH_TOKEN", "token")
    monkeypatch.setenv("TWILIO_FROM", "+36300000000")
    calls = {"n": 0}

    def flaky_post(*a, **k):
        calls["n"] += 1
        if calls["n"] == 1:
            return SimpleNamespace(status_code=429, json=lambda: {})
        return SimpleNamespace(status_code=201,
                               json=lambda: {"sid": "SM999", "status": "queued"})

    monkeypatch.setattr(ss.requests, "post", flaky_post)
    monkeypatch.setattr(ss.time, "sleep", lambda s: None)  # a 2 mp-et kiváltjuk
    res = ss.send_sms("+36301234567", "Hello")
    assert res["ok"] is True and res["sid"] == "SM999"
    assert calls["n"] == 2  # egyetlen retry


def test_4xx_nincs_ujraproba(monkeypatch, logs):
    monkeypatch.setenv("TWILIO_ACCOUNT_SID", "ACTEST")
    monkeypatch.setenv("TWILIO_AUTH_TOKEN", "token")
    monkeypatch.setenv("TWILIO_FROM", "+36300000000")
    calls = {"n": 0}

    def fake_post(*a, **k):
        calls["n"] += 1
        return SimpleNamespace(
            status_code=400,
            json=lambda: {"code": 21211, "message": "Invalid 'To' number"})

    monkeypatch.setattr(ss.requests, "post", fake_post)
    res = ss.send_sms("+36301234567", "Hello")
    assert res["ok"] is False and calls["n"] == 1  # 4xx: nincs retry
    upd = logs["update"][0]["payload"]
    assert upd["status"] == "failed" and upd["error_code"] == 21211
    assert "Invalid 'To' number" in upd["error_message"]


def test_db_hiba_fail_open(monkeypatch):
    """DB-stub felrobban → send_sms attól MÉG visszatér, nem dob."""
    def _robban(*a, **k):
        raise RuntimeError("supabase nincs")

    monkeypatch.setitem(sys.modules, "database", _DB)
    monkeypatch.setattr(_DB, "_with_tenant", lambda p, tid=None: p, raising=False)
    monkeypatch.setattr(_DB, "supabase",
                        SimpleNamespace(table=_robban), raising=False)
    monkeypatch.setenv("SMS_DRY_RUN", "1")
    res = ss.send_sms("+36301234567", "Hello")
    assert res["ok"] is True and res["status"] == "dry_run"


def test_count_segments_import_mukodik():
    # a sms_text VALÓDI modulból jön (nincs stubolva)
    assert sms_text.count_segments("abc") == (1, "GSM7")
    assert sms_text.count_segments("x" * 161) == (2, "GSM7")
    n, enc = ss.count_segments("Rövid üzenet ő-ű karakterekkel")  # ő/ű → UCS2
    assert enc == "UCS2" and n == 1


def test_update_sms_status(monkeypatch, logs):
    monkeypatch.setitem(sys.modules, "database", _DB)
    monkeypatch.setattr(_DB, "_with_tenant",
                        lambda p, tid=None: p, raising=False)
    monkeypatch.setattr(_DB, "supabase",
                        SimpleNamespace(table=lambda name: _FakeTable(logs)),
                        raising=False)
    assert ss.update_sms_status("SM123", "delivered") is True
    upd = logs["update"][0]
    assert upd["payload"]["status"] == "delivered"
    assert upd["eq"] == ("provider_sid", "SM123")
    # ismeretlen status → False, írás nélkül
    assert ss.update_sms_status("SM123", "kakukk") is False
    assert len(logs["update"]) == 1
    # undelivered + error_code → int-ként kerül be
    assert ss.update_sms_status("SM123", "undelivered", "30006") is True
    assert logs["update"][1]["payload"]["error_code"] == 30006


def test_sikeres_kuldes_update_row_id_alapjan(monkeypatch):
    """Élő-incidens regresszió: sikeres küldésnél a 'sent'+provider_sid update
    a sor-ID alapján fusson (a beszúrt sor provider_sid-je még NULL, a
    provider_sid-szűrő 0 sort talált)."""
    calls = {}

    class _Eq:
        def __init__(self, parent, col, val):
            calls.setdefault("eq", []).append((col, val))

        def execute(self):
            return types.SimpleNamespace(data=[{"id": 1}])

    class _Table:
        def update(self, payload):
            calls["payload"] = payload
            return self

        def eq(self, col, val):
            return _Eq(self, col, val)

    import sys as _sys
    stub_db = _sys.modules.get("database")
    monkeypatch.setattr(stub_db, "supabase",
                        types.SimpleNamespace(table=lambda n: _Table()), raising=False)
    monkeypatch.setattr(ss, "_post_twilio",
                        lambda sid, tok, data: (201, {"sid": "SMreg", "status": "queued"}, None),
                        raising=False)
    monkeypatch.setattr(ss, "_insert_sms_log", lambda row: "row-42", raising=False)
    monkeypatch.setattr(ss, "_get_twilio_creds" if hasattr(ss, "_get_twilio_creds") else "_sms_dry_run_enabled",
                        lambda *a, **k: (False and True), raising=False)
    monkeypatch.setenv("SMS_DRY_RUN", "0")
    monkeypatch.setenv("TWILIO_ACCOUNT_SID", "ACtest")
    monkeypatch.setenv("TWILIO_AUTH_TOKEN", "tok")
    monkeypatch.setenv("TWILIO_FROM", "+15005550006")
    res = ss.send_sms("+36709436426", "teszt", session_id="s", purpose="t")
    assert res["ok"] is True
    # az update a SOR-ID-n futott, nem a (még üres) provider_sid-en
    assert ("id", "row-42") in calls["eq"]
