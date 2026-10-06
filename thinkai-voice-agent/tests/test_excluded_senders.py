# -*- coding: utf-8 -*-
"""WP-E3: user-kezelt kizárólista (excluded senders) tesztjei."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import database as db  # noqa: E402


class _Res:
    def __init__(self, data):
        self.data = data


class _Chain:
    """select/eq/limit/execute lánc — a get_excluded_senders-höz."""
    def __init__(self, data):
        self._data = data

    def select(self, *a):
        return self

    def eq(self, *a):
        return self

    def limit(self, *a):
        return self

    def execute(self):
        return _Res(self._data)


def test_is_excluded_pontos_email(monkeypatch):
    monkeypatch.setattr(db, "get_excluded_senders",
                        lambda: {"emails": ["tandilau@gmail.com"], "domains": ["dentors.com"]})
    assert db.is_excluded_sender("TandiLau@Gmail.com") == "email"
    assert db.is_excluded_sender("mas@freemail.hu") == ""


def test_is_excluded_domain(monkeypatch):
    monkeypatch.setattr(db, "get_excluded_senders",
                        lambda: {"emails": [], "domains": ["dentors.com"]})
    assert db.is_excluded_sender("valaki@DENTORS.com") == "domain"
    assert db.is_excluded_sender("valaki@notdentors.com") == ""


def test_ures_konfig(monkeypatch):
    monkeypatch.setattr(db, "get_excluded_senders", lambda: {"emails": [], "domains": []})
    assert db.is_excluded_sender("barki@hol.hu") == ""


def test_nincs_kulso_hiba(monkeypatch):
    assert db.is_excluded_sender("") == ""
    assert db.is_excluded_sender("nincs-kukac") == ""


def test_set_excluded_json(monkeypatch):
    saved = {}
    monkeypatch.setattr(db, "update_text_config",
                        lambda key, content: saved.update(key=key, content=content) or True)
    ok = db.set_excluded_senders(["a@b.hu"], ["ceg.hu"])
    assert ok is True
    import json
    data = json.loads(saved["content"])
    assert data == {"emails": ["a@b.hu"], "domains": ["ceg.hu"]}


# ── add_excluded_sender_email (2026-10-06, kizárt-feladó kebab-művelet) ──────

class _FakeExcludedStore:
    """In-memory excluded_senders tároló — get/set páros monkeypatch-hez.
    lost_writes=True esetén az első N írás „elvész" (párhuzamos felülírást
    szimulál), így a verify-retry ág is tesztelhető."""

    def __init__(self, emails=None, domains=None, lost_writes=0):
        self.state = {"emails": list(emails or []), "domains": list(domains or [])}
        self.writes = 0
        self.lost_writes = lost_writes

    def install(self, monkeypatch):
        store = self

        def _get():
            return {"emails": list(store.state["emails"]),
                    "domains": list(store.state["domains"])}

        def _set(emails, domains):
            store.writes += 1
            if store.lost_writes > 0:
                store.lost_writes -= 1
                return True  # „sikeres" írás, de a tartalom nem ragad meg
            store.state = {"emails": list(emails), "domains": list(domains)}
            return True

        monkeypatch.setattr(db, "get_excluded_senders", _get)
        monkeypatch.setattr(db, "set_excluded_senders", _set)


def test_add_uj_email_hozzafuzodik(monkeypatch):
    store = _FakeExcludedStore(emails=["meglevo@ceg.hu"], domains=["ceg.hu"])
    store.install(monkeypatch)
    res = db.add_excluded_sender_email("  Uj@Partner.hu ")
    assert res == {"ok": True, "added": True, "email": "uj@partner.hu"}
    assert store.state["emails"] == ["meglevo@ceg.hu", "uj@partner.hu"]
    assert store.state["domains"] == ["ceg.hu"]  # domain lista érintetlen
    assert store.writes == 1


def test_add_mar_listan_levo_nem_ir(monkeypatch):
    store = _FakeExcludedStore(emails=["tandilau@gmail.com"])
    store.install(monkeypatch)
    res = db.add_excluded_sender_email("TandiLau@Gmail.com")
    assert res == {"ok": True, "added": False, "email": "tandilau@gmail.com"}
    assert store.writes == 0


def test_add_ervenytelen_email(monkeypatch):
    store = _FakeExcludedStore()
    store.install(monkeypatch)
    assert db.add_excluded_sender_email("")["ok"] is False
    assert db.add_excluded_sender_email("nincs-kukac")["ok"] is False
    assert db.add_excluded_sender_email(None)["ok"] is False
    assert store.writes == 0


def test_add_elveszett_iras_retry(monkeypatch):
    """Párhuzamos felülírás-szimuláció: az első mentés nem ragad meg → a
    verify-retry második körben sikeres."""
    store = _FakeExcludedStore(lost_writes=1)
    store.install(monkeypatch)
    res = db.add_excluded_sender_email("uj@ceg.hu")
    assert res == {"ok": True, "added": True, "email": "uj@ceg.hu"}
    assert store.writes == 2
    assert store.state["emails"] == ["uj@ceg.hu"]


def test_add_retry_kimerul(monkeypatch):
    """Ha minden írás elvész (3 kör), ok=False — a hívó 500-zal tér vissza."""
    store = _FakeExcludedStore(lost_writes=5)
    store.install(monkeypatch)
    res = db.add_excluded_sender_email("uj@ceg.hu")
    assert res["ok"] is False
    assert store.writes == 3
