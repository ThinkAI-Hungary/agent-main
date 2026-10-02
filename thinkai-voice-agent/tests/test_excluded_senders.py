# -*- coding: utf-8 -*-
"""WP-E3: user-kezelt kizárólista (excluded senders) tesztjei."""
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


DB_STUB = _stub("database")


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
