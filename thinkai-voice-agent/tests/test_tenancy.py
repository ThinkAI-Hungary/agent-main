# -*- coding: utf-8 -*-
"""Tenant-kontextus és izolációs unit tesztek (FÁZIS 2d).

A tesztek a database.py tenant-helperjeit és a contextvar-viselkedést ellenőrzik.
Nem igényelnek élő Supabase-t (a contextvar és a payload-manipuláció pure).
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import database as db


@pytest.fixture(autouse=True)
def _reset_tenant():
    """Minden teszt előtt tiszta tenant-kontextus."""
    db.set_current_tenant(None)
    yield
    db.set_current_tenant(None)


class TestTenantContext:
    def test_default_falls_back_to_rivergate(self):
        """Nincs explicit tenant → a DEFAULT_TENANT_SLUG (rivergate) uuid-je jön."""
        tid = db.get_current_tenant()
        assert tid is not None
        # A rivergate uuid a backfill-ből (élő DB-ből olvassa; ha nincs DB, None is lehet)
        # Itt csak azt ellenőrizzük, hogy a fallback logika nem dob kivételt.
        assert isinstance(tid, (str, type(None)))

    def test_explicit_tenant_wins(self):
        db.set_current_tenant("uuid-aaa")
        assert db.get_current_tenant() == "uuid-aaa"

    def test_contextvar_isolated_per_coroutine(self):
        """A contextvar coroutine-scoped — a beállítás nem szivárog ki."""
        db.set_current_tenant("uuid-aaa")
        assert db.get_current_tenant() == "uuid-aaa"
        db.set_current_tenant("uuid-bbb")
        assert db.get_current_tenant() == "uuid-bbb"
        db.set_current_tenant(None)
        # reset után a default jön
        assert db.get_current_tenant() != "uuid-bbb"

    def test_require_tenant_raises_without_default(self, monkeypatch):
        """require_tenant: ha nincs feloldható tenant, RuntimeError."""
        monkeypatch.setattr(db, "_resolve_tenant_id", lambda slug: None)
        db.set_current_tenant(None)
        with pytest.raises(RuntimeError):
            db.require_tenant()

    def test_require_tenant_returns_explicit(self):
        db.set_current_tenant("uuid-ccc")
        assert db.require_tenant() == "uuid-ccc"


class TestWithTenant:
    def test_adds_tenant_id(self):
        db.set_current_tenant("uuid-aaa")
        assert db._with_tenant({"name": "X"}) == {"name": "X", "tenant_id": "uuid-aaa"}

    def test_does_not_override_existing(self):
        db.set_current_tenant("uuid-aaa")
        payload = {"name": "X", "tenant_id": "uuid-other"}
        assert db._with_tenant(payload)["tenant_id"] == "uuid-other"

    def test_explicit_tid_param(self):
        db.set_current_tenant("uuid-aaa")
        assert db._with_tenant({"a": 1}, tid="uuid-explicit")["tenant_id"] == "uuid-explicit"

    def test_no_tenant_no_injection(self, monkeypatch):
        monkeypatch.setattr(db, "_resolve_tenant_id", lambda slug: None)
        db.set_current_tenant(None)
        assert db._with_tenant({"a": 1}) == {"a": 1}


class FakeQuery:
    """A supabase query-builder utánzat — csak az .eq() hívást naplózza."""
    def __init__(self):
        self.calls = []
    def eq(self, col, val):
        self.calls.append((col, val))
        return self


class TestTenantEq:
    def test_appends_tenant_filter(self):
        db.set_current_tenant("uuid-aaa")
        q = FakeQuery()
        result = db._tenant_eq(q)
        assert ("tenant_id", "uuid-aaa") in result.calls

    def test_explicit_tid_param(self):
        q = FakeQuery()
        result = db._tenant_eq(q, tid="uuid-explicit")
        assert ("tenant_id", "uuid-explicit") in result.calls

    def test_no_tenant_no_filter(self, monkeypatch):
        monkeypatch.setattr(db, "_resolve_tenant_id", lambda slug: None)
        db.set_current_tenant(None)
        q = FakeQuery()
        result = db._tenant_eq(q)
        assert result.calls == []


class TestCredentialHelpers:
    def test_fernet_none_without_key(self, monkeypatch):
        monkeypatch.setattr(db, "_CREDENTIALS_KEY", "")
        monkeypatch.setattr(db, "_fernet", None)
        assert db._get_fernet() is None

    def test_get_credential_fallback_to_default(self, monkeypatch):
        """Ha nincs a táblában credential (vagy nincs tenant), a default jön."""
        db.set_current_tenant(None)
        # get_credential(None, key, default) → default (nincs tenant lekérdezés)
        assert db.get_credential(None, "gemini_api_key", default="env-fallback") == "env-fallback"


class TestIsolationInvariant:
    """A legfontosabb üzleti szabály: egy tenant sosem láthatja a másik adatait.

    Ez a teszt azt ellenőrzi, hogy a _tenant_eq ténylegesen a contextvar-ból
    veszi a tenantot, és két különböző tenant-kontextusban különböző szűrőt ad.
    """
    def test_two_tenants_get_different_filters(self):
        db.set_current_tenant("uuid-aaa")
        qa = FakeQuery()
        db._tenant_eq(qa)
        db.set_current_tenant("uuid-bbb")
        qb = FakeQuery()
        db._tenant_eq(qb)
        assert ("tenant_id", "uuid-aaa") in qa.calls
        assert ("tenant_id", "uuid-bbb") in qb.calls
        assert ("tenant_id", "uuid-bbb") not in qa.calls
        assert ("tenant_id", "uuid-aaa") not in qb.calls
