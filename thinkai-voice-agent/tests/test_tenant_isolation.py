# -*- coding: utf-8 -*-
"""Tenant-izolációs regressziós tesztek (2026-10-16, Mauroni-incidens).

A text_configs PK-ja kompozit (key, tenant_id) lett; a get_excluded_senders
tenant-szűrt. A teszt két tenantot szimulál külön tartalommal, és ellenőrzi,
hogy a tenant-kontextus váltása a helyes listát adja — és tenant nélkül/üres
sornál üres a lista (sosem egy másik ügyfélé)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import database


class _FakeQuery:
    """A supabase .table().select().eq().limit().execute() lánc minimál
    utánzata: az eq('tenant_id', ...) szűrést tárolja, és a tenant szerinti
    tartalmat adja vissza."""

    def __init__(self, rows_by_tenant):
        self._rows = rows_by_tenant
        self._tenant = None

    def select(self, *a, **k):
        return self

    def eq(self, col, val):
        if col == "tenant_id":
            self._tenant = val
        return self

    def limit(self, *a, **k):
        return self

    def execute(self):
        class R:
            data = []
        r = R()
        r.data = self._rows.get(self._tenant, [])
        return r


class _FakeSupabase:
    def __init__(self, rows_by_tenant):
        self._rows = rows_by_tenant

    def table(self, name):
        return _FakeQuery(self._rows)


TENANT_A = "11111111-1111-1111-1111-111111111111"
TENANT_B = "22222222-2222-2222-2222-222222222222"


def _patch(monkeypatch):
    rows = {
        TENANT_A: [{"content": '{"emails": ["a@pelda.hu"], "domains": []}'}],
        TENANT_B: [{"content": '{"emails": [], "domains": []}'}],
        None: [],
    }
    monkeypatch.setattr(database, "supabase", _FakeSupabase(rows))


def test_tenant_sajat_listaja(monkeypatch):
    _patch(monkeypatch)
    database.set_current_tenant(TENANT_A)
    assert database.get_excluded_senders()["emails"] == ["a@pelda.hu"]


def test_masik_tenant_ures_listat_kap(monkeypatch):
    _patch(monkeypatch)
    database.set_current_tenant(TENANT_B)
    assert database.get_excluded_senders()["emails"] == []


def test_nincs_tenant_sor_nincs_lista(monkeypatch):
    """Ha a tenantnak NINCS sora, ÜRES listát kap — sosem egy másik ügyfélét."""
    _patch(monkeypatch)
    database.set_current_tenant(TENANT_B)
    assert database.get_excluded_senders() == {"emails": [], "domains": []}
