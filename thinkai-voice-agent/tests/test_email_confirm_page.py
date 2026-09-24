# -*- coding: utf-8 -*-
"""WP-E3 MU-4/MU-5 tesztek: az /e/{token} e-mail-megerősítő oldal logikája.

A `database` és `email_processor` modulokat sys.modules.setdefault-csel
stubolni KELL az `email_confirm_page` importja ELŐTT (az email_verify_harness
modul-szinten importálja őket; a teszt-venvben nincs supabase/fastapi).
Az email_verify_harness-t NEM stuboljuk (a venvben importálható) — az MX-hívás
viszont determinizmusért monkeypatch-elve van.
"""
import sys
import types
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

TOK = "tok123456789"


def _stub(name, **attrs):
    mod = types.ModuleType(name)
    for k, v in attrs.items():
        setattr(mod, k, v)
    sys.modules.setdefault(name, mod)
    return mod


# ── email_processor stub: az async küldés rögzítése ─────────────────────────
_SENT: list = []


async def _fake_send_booking(**kwargs):
    _SENT.append(dict(kwargs))


_ep = _stub("email_processor",
            send_booking_confirmation_email=_fake_send_booking)


# ── Supabase-stub: szűrőket ÉRTÉTELMEZő, állapotváltozó table-lánc ──────────
def _matches(row, filters):
    for kind, col, val in filters:
        if kind == "eq":
            if row.get(col) != val:
                return False
        elif kind == "is":
            if (row.get(col) is None) != (val == "null"):
                return False
    return True


class _Result:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, state, table):
        self._s, self._t = state, table
        self._op, self._payload, self._filters = None, None, []

    def select(self, *cols):
        self._op = "select"
        return self

    def insert(self, p):
        self._op, self._payload = "insert", p
        return self

    def update(self, p):
        self._op, self._payload = "update", p
        return self

    def eq(self, c, v):
        self._filters.append(("eq", c, v))
        return self

    def is_(self, c, v):
        self._filters.append(("is", c, v))
        return self

    def limit(self, n):
        return self

    def execute(self):
        rows = self._s["tables"].setdefault(self._t, [])
        if self._op == "select":
            return _Result([dict(r) for r in rows if _matches(r, self._filters)])
        if self._op == "update":
            hits = []
            for r in rows:
                if _matches(r, self._filters):
                    r.update(self._payload)
                    hits.append(dict(r))
            self._s["updates"].append(
                (self._t, dict(self._payload), list(self._filters)))
            return _Result(hits)
        return _Result([dict(self._payload)] if self._payload else [])


class _Supabase:
    def __init__(self, state):
        self._s = state

    def table(self, name):
        return _Query(self._s, name)


STATE = {"tables": {}, "clients": [], "client_updates": [], "updates": []}


def _get_calendar_event(eid):
    for r in STATE["tables"].get("calendar_events", []):
        if str(r.get("id")) == str(eid):
            return dict(r)
    return None


def _find_client_by_contact(email="", **kw):
    for c in STATE["clients"]:
        if (c.get("email") or "") == (email or ""):
            return dict(c)
    return None


def _edit_client_details(client_id, data):
    STATE["client_updates"].append((client_id, data))
    return True


# Saját `database` stub (import ELŐTT a sys.modules-ba, mint a
# tests/test_email_confirm_tokens.py).
_db = _stub("database")
_db.supabase = _Supabase(STATE)
_db._tenant_eq = lambda q, tid=None: q
_db.get_current_tenant = lambda: "t-1"
_db.get_calendar_event = _get_calendar_event
_db.find_client_by_contact = _find_client_by_contact
_db.edit_client_details = _edit_client_details

import email_confirm_page as ecp  # noqa: E402


def _token_row(**over):
    base = {
        "token": TOK, "session_id": "sess-1", "tenant_id": "t-1",
        "event_ids": ["ev-1"], "phone": "+36301234567",
        "candidate_email": "regi@pelda.hu",
        "created_at": "2026-09-24T09:00:00+00:00",
        "expires_at": (datetime.now(timezone.utc)
                       + timedelta(hours=72)).isoformat(),
        "confirmed_at": None, "confirmed_email": None, "action": None,
    }
    base.update(over)
    return base


def _event_row(eid="ev-1", email="regi@pelda.hu"):
    return {"id": eid, "title": "Konzultáció",
            "start_dt": "2026-09-30T10:00:00", "attendee": "Teszt Elek",
            "attendee_email": email, "tenant_id": "t-1"}


def _client_row():
    return {"id": 26, "name": "Teszt Elek", "email": "regi@pelda.hu",
            "phone": "+36 30 123 4567", "custom_data": {"jegy": 1}}


@pytest.fixture(autouse=True)
def _tiszta_kornyezet(monkeypatch):
    """Minden teszt frissített DB-stubot, üres capture-t és MX-stubot kap."""
    STATE.update({
        "tables": {
            "email_confirm_tokens": [_token_row()],
            "calendar_events": [_event_row()],
            "email_verify_runs": [{"session_id": "sess-1",
                                   "winner": "regi@pelda.hu"}],
            "tenants": [],
        },
        "clients": [_client_row()],
        "client_updates": [],
        "updates": [],
    })
    _SENT.clear()
    ecp._rate_bucket.clear()
    monkeypatch.setattr(ecp, "mx_resolves", lambda d: True)
    monkeypatch.setitem(sys.modules, "database", _db)
    monkeypatch.setitem(sys.modules, "email_processor", _ep)
    yield


def _updates_of(table):
    return [u for u in STATE["updates"] if u[0] == table]


# ── 1. validate_confirmation_email ───────────────────────────────────────────
def test_validate_typo_javaslat(monkeypatch):
    r = ecp.validate_confirmation_email("valaki@gmial.com")
    assert r["ok"] is True, "elírt, de ismert domain → ok True marad"
    assert r["suggestion"] == "valaki@gmail.com"


def test_validate_helyes_domain_nincs_javaslat(monkeypatch):
    r = ecp.validate_confirmation_email("valaki@gmail.com")
    assert r["ok"] is True
    assert r["suggestion"] is None


def test_validate_nem_email():
    r = ecp.validate_confirmation_email("nememail")
    assert r["ok"] is False
    assert r["error"] and r["suggestion"] is None


def test_validate_nxdomain(monkeypatch):
    monkeypatch.setattr(ecp, "mx_resolves", lambda d: False)
    r = ecp.validate_confirmation_email("valaki@nemletezo-xyz123.hu")
    assert r["ok"] is False
    assert "domain" in (r["error"] or "")


# ── 2. apply_confirmation 'confirmed' ág ─────────────────────────────────────
def test_apply_confirmed_ag():
    res = ecp.apply_confirmation(TOK, "regi@pelda.hu")
    assert res["ok"] is True and res["action"] == "confirmed"
    assert res["email"] == "regi@pelda.hu" and res.get("already") is False
    # ügyfél-frissítés audit-nyomvonallal
    assert len(STATE["client_updates"]) == 1
    cid, data = STATE["client_updates"][0]
    assert cid == 26 and data["email"] == "regi@pelda.hu"
    evrec = data["custom_data"]["email_verification"]
    assert evrec["previous"] == "regi@pelda.hu"
    assert evrec["value"] == "regi@pelda.hu"
    assert evrec["source"] == "sms_confirm"
    assert evrec["status"] == "sms_confirmed"
    assert evrec["applied"] is True and evrec["ts"]
    # esemény attendee_email
    cal = _updates_of("calendar_events")
    assert len(cal) == 1
    assert cal[0][1] == {"attendee_email": "regi@pelda.hu"}
    assert ("eq", "id", "ev-1") in cal[0][2]
    # email_verify_runs frissítés
    runs = _updates_of("email_verify_runs")
    assert len(runs) == 1
    rp = runs[0][1]
    assert rp["confirmed_email"] == "regi@pelda.hu"
    assert rp["confirm_action"] == "confirmed" and rp["confirmed_at"]
    assert ("eq", "session_id", "sess-1") in runs[0][2]
    # visszaigazoló email kiment az új (itt: változatlan) címre
    assert len(_SENT) == 1
    sent = _SENT[0]
    assert sent["event_id"] == "ev-1"
    assert sent["attendee_email"] == "regi@pelda.hu"
    assert sent["date"] == "2026-09-30" and sent["time"] == "10:00"
    assert sent["attendee"] == "Teszt Elek"


# ── 3. 'corrected' ág (több eseménnyel) ──────────────────────────────────────
def test_apply_corrected_ag_ket_esemennyel():
    STATE["tables"]["email_confirm_tokens"][0]["event_ids"] = ["ev-1", "ev-2"]
    STATE["tables"]["calendar_events"].append(
        _event_row(eid="ev-2", email="regi@pelda.hu"))
    res = ecp.apply_confirmation(TOK, "uj@pelda.hu")
    assert res["ok"] is True and res["action"] == "corrected"
    assert res["email"] == "uj@pelda.hu"
    assert len(STATE["client_updates"]) == 1
    _, data = STATE["client_updates"][0]
    evrec = data["custom_data"]["email_verification"]
    assert evrec["status"] == "sms_corrected"
    assert evrec["previous"] == "regi@pelda.hu" and evrec["value"] == "uj@pelda.hu"
    assert data["email"] == "uj@pelda.hu"
    cal = _updates_of("calendar_events")
    assert len(cal) == 2, "MINDEN event_ids esemény frissült"
    assert all(u[1] == {"attendee_email": "uj@pelda.hu"} for u in cal)
    ids = {f[2] for u in cal for f in u[2] if f[0] == "eq" and f[1] == "id"}
    assert ids == {"ev-1", "ev-2"}
    assert {s["attendee_email"] for s in _SENT} == {"uj@pelda.hu"}


# ── 4. 'provided' ág (candidate üres volt) ───────────────────────────────────
def test_apply_provided_ag():
    STATE["tables"]["email_confirm_tokens"][0]["candidate_email"] = None
    res = ecp.apply_confirmation(TOK, "megadott@pelda.hu")
    assert res["ok"] is True and res["action"] == "provided"
    assert res["email"] == "megadott@pelda.hu"
    evrec = STATE["client_updates"][0][1]["custom_data"]["email_verification"]
    assert evrec["status"] == "sms_provided"
    assert evrec["previous"] == "regi@pelda.hu"  # az első esemény RÉGI címe
    assert evrec["value"] == "megadott@pelda.hu"


# ── 5. Kétszeri apply: 'az első megerősítés nyer' ────────────────────────────
def test_apply_ketszer_already_nincs_uj_email():
    r1 = ecp.apply_confirmation(TOK, "regi@pelda.hu")
    assert r1["ok"] is True
    assert len(_SENT) == 1
    r2 = ecp.apply_confirmation(TOK, "regi@pelda.hu")
    assert r2["ok"] is True and r2.get("already") is True
    assert r2["email"] == "regi@pelda.hu"
    assert len(_SENT) == 1, "a második apply NEM küld új emailt"
    assert len(STATE["client_updates"]) == 1, "nincs második ügyfél-írás"
    assert len(_updates_of("calendar_events")) == 1, "nincs második esemény-írás"
    assert len(_updates_of("email_verify_runs")) == 1


# ── 6. Lejárt token: nincs írás ──────────────────────────────────────────────
def test_apply_lejart_token_nincs_iras():
    STATE["tables"]["email_confirm_tokens"][0]["expires_at"] = (
        datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    res = ecp.apply_confirmation(TOK, "regi@pelda.hu")
    assert res["ok"] is False and res["error"] == "expired"
    assert STATE["updates"] == [] and STATE["client_updates"] == []
    assert _SENT == []


def test_apply_ismeretlen_token_nincs_iras():
    res = ecp.apply_confirmation("nincsilyen", "regi@pelda.hu")
    assert res["ok"] is False and res["error"] == "unknown"
    assert STATE["updates"] == [] and _SENT == []


def test_apply_ervenytelen_email_nincs_iras(monkeypatch):
    monkeypatch.setattr(ecp, "mx_resolves", lambda d: False)
    res = ecp.apply_confirmation(TOK, "valaki@nemletezo-xyz123.hu")
    assert res["ok"] is False
    assert STATE["updates"] == [] and STATE["client_updates"] == []
    assert _SENT == []


# ── 7. rate_limited ──────────────────────────────────────────────────────────
def test_rate_limit_ip_enkent():
    for _ in range(20):
        assert ecp.rate_limited("1.2.3.4", now_ts=1000.0) is False
    assert ecp.rate_limited("1.2.3.4", now_ts=1000.0) is True, \
        "a 21. kérés egy percen belül limitált"
    assert ecp.rate_limited("5.6.7.8", now_ts=1000.0) is False, \
        "másik IP-t nem érint a limit"


# ── 8. render_confirm_page ───────────────────────────────────────────────────
def test_render_already_confirmed_koszonto():
    ctx = {"row": {"token": TOK, "confirmed_email": "vegleges@pelda.hu",
                   "candidate_email": "regi@pelda.hu"},
           "events": [], "expired": False, "already_confirmed": True,
           "rendelo": "DentalCare"}
    html_out = ecp.render_confirm_page(ctx)
    assert "vegleges@pelda.hu" in html_out
    assert "Köszönjük" in html_out
    assert "Megerősítem" not in html_out, "megerősítve → nincs több űrlap"


def test_render_normal_form_gombokkal():
    ctx = {"row": {"token": TOK, "candidate_email": "jelolt@pelda.hu"},
           "events": [{"id": "ev-1", "title": "Konzultáció",
                       "start_dt": "2026-09-30T10:00:00",
                       "attendee": "Teszt Elek", "attendee_email": ""}],
           "expired": False, "already_confirmed": False,
           "rendelo": "DentalCare"}
    html_out = ecp.render_confirm_page(ctx)
    assert "Megerősítem" in html_out
    assert 'value="jelolt@pelda.hu"' in html_out, "candidate előtöltve"
    assert "/e/" + TOK in html_out, "a form a token-útra POST-ol"
    assert 'name="viewport"' in html_out, "mobil-első: viewport meta"
    sugg_html = ecp.render_confirm_page(ctx, suggestion="jelolt@gmail.com")
    assert "Erre gondolt: jelolt@gmail.com?" in sugg_html


def test_render_lejart_es_ismeretlen_hibaoldal():
    lejart = ecp.render_confirm_page(
        {"row": _token_row(), "events": [], "expired": True,
         "already_confirmed": False, "rendelo": "Rendelő"})
    assert "lejárt" in lejart.lower() and "Megerősítem" not in lejart
    ismeretlen = ecp.render_confirm_page(
        {"row": None, "events": [], "expired": False,
         "already_confirmed": False, "rendelo": "Rendelő"})
    assert "Érvénytelen link" in ismeretlen
