# -*- coding: utf-8 -*-
"""Telefon-normalizálás és find_client_by_contact unit tesztek.

Regresszió: az arbiter (resolve_client_identity → find_client_by_contact) korábban
PONTOS string-egyezéssel kereste a telefonszámot — a heterogén tárolt formátumok
(+36 / 06 / kötőjel / szóköz) miatt split-brain keletkezett. Most minden telefon-
egyezés az utolsó 9 számjegyre normalizálva fut (a find_client tool konvenciója).
"""
import sys
import types
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import database as db


class TestNormalizePhoneDigits:
    def test_plus36_and_06_equal(self):
        assert db.normalize_phone_digits("+36701234567") == db.normalize_phone_digits("06701234567")

    def test_separators_ignored(self):
        assert db.normalize_phone_digits("+36 70 123 4567") == db.normalize_phone_digits("06-70-123-4567")

    def test_last_9_digits(self):
        assert db.normalize_phone_digits("+36701234567") == "701234567"

    def test_0036_prefix(self):
        assert db.normalize_phone_digits("0036 70 123 4567") == "701234567"

    def test_empty_and_short(self):
        assert db.normalize_phone_digits("") == ""
        assert db.normalize_phone_digits(None) == ""
        # 9-nél rövidebb szám változatlanul jön vissza (nem nyújtjuk ki)
        assert db.normalize_phone_digits("1234567") == "1234567"


# ── find_client_by_contact (mock supabase) ──────────────────────────────────

class _FakeQuery:
    """Minimális supabase query-lánc utánzat (select/eq/ilike/order/limit/execute)."""

    def __init__(self, rows):
        self._rows = rows
        self._filters = []

    def select(self, *a):
        return self

    def eq(self, col, val):
        self._filters.append(("eq", col, val))
        return self

    def ilike(self, col, val):
        self._filters.append(("ilike", col, val))
        return self

    def contains(self, col, val):
        self._filters.append(("contains", col, val))
        return self

    @property
    def not_(self):
        return self

    def is_(self, col, val):
        self._filters.append(("is_not_null" if val == "null" else "is", col, val))
        return self

    def order(self, *a, **k):
        return self

    def limit(self, n):
        return self

    def execute(self):
        rows = list(self._rows)
        for op, col, val in self._filters:
            if op == "eq":
                rows = [r for r in rows if r.get(col) == val]
            elif op == "ilike":
                pat = str(val).strip("%").lower()
                rows = [r for r in rows if pat in str(r.get(col) or "").lower()]
            elif op == "contains":
                rows = [r for r in rows if all(r.get(col, {}).get(k) == v for k, v in val.items())]
            elif op == "is_not_null":
                rows = [r for r in rows if r.get(col) is not None]
        return types.SimpleNamespace(data=rows)


class _FakeSupabase:
    def __init__(self, tables):
        self._tables = tables

    def table(self, name):
        return _FakeQuery(self._tables.get(name, []))


def _client(cid, name="", email="", phone=""):
    return {"id": cid, "name": name, "email": email, "phone": phone, "custom_data": {}}


@pytest.fixture
def fake_db(monkeypatch):
    """db.supabase → fake, _tenant_eq → identitás (tenant-szűrő nélkül)."""
    state = {"clients": []}
    monkeypatch.setattr(db, "supabase", _FakeSupabase(state))
    monkeypatch.setattr(db, "_tenant_eq", lambda q, tid=None: q)
    return state


class TestFindClientByContact:
    def test_phone_format_independent(self, fake_db):
        fake_db["clients"].append(_client(1, name="Teszt Elek", phone="+36701234567"))
        for query in ("06701234567", "+36 70 123 4567", "06-70-123-4567"):
            hit = db.find_client_by_contact(phone=query)
            assert hit and hit["id"] == 1, f"nem talált: {query}"

    def test_phone_beats_email_priority(self, fake_db):
        """A telefon erősebb kulcs: ha az email MÁS ügyfélre mutat, a telefon nyer
        (a korábbi OR/eq id-desc sorrendje nem-determinisztikus volt)."""
        fake_db["clients"].append(_client(10, name="Régi", email="kozos@x.hu", phone="+36301112233"))
        fake_db["clients"].append(_client(99, name="Új", email="mas@x.hu", phone="06704445566"))
        hit = db.find_client_by_contact(email="kozos@x.hu", phone="06 70 444 5566")
        assert hit["id"] == 99

    def test_email_fallback_when_phone_misses(self, fake_db):
        fake_db["clients"].append(_client(5, name="Email Ügyfél", email="csak@email.hu", phone="+36209998877"))
        hit = db.find_client_by_contact(email="csak@email.hu", phone="+36701110000")
        assert hit and hit["id"] == 5

    def test_substring_containment_not_enough(self, fake_db):
        """A tárolt szám tartalmazza a keresett 9 jegyet, de a normalizált vége
        eltér → NEM egyezés (a tiszta ilike hamis találatot adna)."""
        fake_db["clients"].append(_client(7, name="Más", phone="+36701234567"))
        assert db.find_client_by_contact(phone="+36301234567") is None

    def test_no_match_returns_none(self, fake_db):
        fake_db["clients"].append(_client(3, name="Valaki", phone="+36701234567"))
        assert db.find_client_by_contact(phone="+36201112233") is None

    def test_resolve_client_identity_phone_normalized(self, fake_db):
        """Az arbiter is a normalizált úton jut el a találathoz."""
        fake_db["clients"].append(_client(42, name="Arbiter Ügyfél", phone="06 30 555 4433"))
        primary, conflict = db.resolve_client_identity(phone="+36305554433")
        assert primary and primary["id"] == 42
        assert conflict is None
