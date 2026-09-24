# -*- coding: utf-8 -*-
"""MU-3.4: a retention-takarítás NE törölje az eval-hívások felvételeit."""
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


_stub("database")

import call_recorder as cr


class _Res:
    def __init__(self, data):
        self.data = data


class _Table:
    def __init__(self, data):
        self._data = data

    def select(self, *a):
        return self

    def in_(self, *a):
        return self

    def limit(self, *a):
        return self

    def execute(self):
        return _Res(self._data)


def test_ures_env_ures_halmaz(monkeypatch):
    monkeypatch.delenv("EVAL_CALLER_NUMBERS", raising=False)
    assert cr._eval_protected_session_ids() == set()


def test_lekerdezes_talalat(monkeypatch):
    monkeypatch.setenv("EVAL_CALLER_NUMBERS", "+36111222333,+36222333444")
    data = [{"session_id": "s1"}, {"session_id": "s2"}, {"session_id": None}]
    import database as stub_db
    monkeypatch.setattr(stub_db, "supabase",
                        types.SimpleNamespace(table=lambda name: _Table(data)),
                        raising=False)
    assert cr._eval_protected_session_ids() == {"s1", "s2"}


def test_db_hiba_fail_open(monkeypatch):
    # hiba esetén NE blokkoljon a retention (de a felvételek elveshetnek —
    # ez a fail-open ára; a hiba a logba kerül)
    monkeypatch.setenv("EVAL_CALLER_NUMBERS", "+36111222333")

    class _Boom:
        def select(self, *a):
            raise RuntimeError("db nem elérhető")

        def __getattr__(self, name):
            return self

    import database as stub_db
    monkeypatch.setattr(stub_db, "supabase",
                        types.SimpleNamespace(table=lambda name: _Boom()),
                        raising=False)
    assert cr._eval_protected_session_ids() == set()
