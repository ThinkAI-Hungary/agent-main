# -*- coding: utf-8 -*-
"""WP-E3 MU-3 tesztek: SMS-es e-mail-megerősítő token modul.

A `database` modult stubolni KELL a tényleges import ELŐTT (a teszt-venvben
nincs supabase) — a stubolt supabase table-lánc rögzíti az insertet/update-öt,
így a DB-függő útok hálózat nélkül tesztelhetők.
"""
import re
import sys
import types
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def _stub(name, **attrs):
    mod = types.ModuleType(name)
    for k, v in attrs.items():
        setattr(mod, k, v)
    sys.modules.setdefault(name, mod)
    return mod


# ── Supabase-stub: a table(...) lánc önmagát adja, execute() rögzít ─────────
class _Chain:
    """Egy PostgREST table-lánc: ops = író műveletek, filters = where-ek."""

    def __init__(self, store, table):
        self._store = store
        self._table = table
        self.ops = []       # ("insert"|"update", payload)
        self.filters = []   # (metódusnév, oszlop, érték)

    def insert(self, payload):
        self.ops.append(("insert", payload))
        return self

    def update(self, payload):
        self.ops.append(("update", payload))
        return self

    def select(self, *cols):
        return self

    def eq(self, col, val):
        self.filters.append(("eq", col, val))
        return self

    def is_(self, col, val):
        self.filters.append(("is", col, val))
        return self

    def limit(self, n):
        return self

    def execute(self):
        if self._store.get("raise"):
            raise RuntimeError("supabase nem elérhető")
        if self._store.get("fail_first_n_inserts", 0) > 0 and \
                self.ops and self.ops[0][0] == "insert":
            self._store["fail_first_n_inserts"] -= 1
            raise RuntimeError('duplicate key value violates unique constraint '
                               '"email_confirm_tokens_pkey"')
        self._store["chains"].append(self)
        return _Result(self, self._store)


class _Result:
    def __init__(self, chain, store):
        op = chain.ops[0][0] if chain.ops else "select"
        if op == "select":
            self.data = list(store.get("select_rows", []))
        elif op == "update":
            # 'első megerősítés nyer': a where nem talál sort → üres data
            self.data = [] if store.get("update_hits_nothing") else [dict(chain.ops[0][1])]
        else:
            self.data = [dict(chain.ops[0][1])]


class _Supabase:
    def __init__(self, store):
        self._store = store

    def table(self, name):
        ch = _Chain(self._store, name)
        self._store["chains"].append(ch)   # láncszemregisztráció execute előtt is
        return ch


STORE = {"chains": [], "select_rows": [], "update_hits_nothing": False,
         "raise": False, "fail_first_n_inserts": 0}

# Saját `database` stub (sosem egy másik teszt modulobjektumát piszkáljuk).
# A modul LAZÁN, függvényen belül importálja a database-t, ezért a stubot
# az autouse fixture TESZTENKÉNT helyezi vissza a sys.modules-ba — így a
# párhuzamosan futó más tesztmodulok database-cseréje sem tévesztheti meg.
_db = types.ModuleType("database")
_db.supabase = _Supabase(STORE)
_db._with_tenant = lambda payload, tid=None: {
    **payload, "tenant_id": payload.get("tenant_id") or "t-teszt"}
sys.modules.setdefault("database", _db)   # stub az import ELŐTT, ha üres a tér

import email_confirm_tokens as ect  # noqa: E402
from sms_text import is_gsm7  # noqa: E402


@pytest.fixture(autouse=True)
def _friss_db(monkeypatch):
    """Minden teszt tiszta store-t és garantáltan saját database-stubot kap."""
    STORE.update({"chains": [], "select_rows": [], "update_hits_nothing": False,
                  "raise": False, "fail_first_n_inserts": 0})
    monkeypatch.setattr(_db, "supabase", _Supabase(STORE), raising=False)
    monkeypatch.setitem(sys.modules, "database", _db)
    yield


def _create(**kw):
    kw.setdefault("session_id", "sess-teszt-1")
    return ect.create_confirm_token(**kw)


def _expires_in(r):
    return datetime.fromisoformat(r["expires_at"]) - datetime.now(timezone.utc)


def _ops_of(kind):
    return [c for c in STORE["chains"]
            if c.ops and c.ops[0][0] == kind]


# ── 1. Token formátum és egyediség ───────────────────────────────────────────
def test_token_12_karakter_base62_es_egedi():
    r1 = _create()
    r2 = _create()
    assert r1["ok"] is True and r2["ok"] is True
    assert re.fullmatch(r"[a-zA-Z0-9]{12}", r1["token"])
    assert r1["token"] != r2["token"], "két egymás utáni token különbözzön"
    inserts = _ops_of("insert")
    assert inserts, "az insertnek el kell érnie a stubolt supabase-t"
    payload = inserts[0].ops[0][1]
    assert payload["token"] == r1["token"]
    assert payload["session_id"] == "sess-teszt-1"
    assert payload["tenant_id"] == "t-teszt"   # db._with_tenant meghívódott


# ── 2. Lejárat-számítás ──────────────────────────────────────────────────────
def test_lejarat_nelkul_foglalas_72_ora():
    r = _create()
    assert r["ok"] is True
    delta = _expires_in(r)
    assert timedelta(hours=71, minutes=55) < delta <= timedelta(hours=72, minutes=5)


def test_lejarat_foglalas_24_oraval_mulva():
    booking = datetime.now(timezone.utc) + timedelta(hours=24)
    r = _create(first_booking_start=booking)          # datetime objektum is mehet
    delta = _expires_in(r)
    assert abs(delta - timedelta(hours=24)) < timedelta(seconds=10), \
        "a lejárat ≈ az első foglalás kezdete (72 óra helyett)"


def test_lejarat_minimum_clamp_foglalas_10_percmulva():
    booking_iso = (datetime.now(timezone.utc) +
                   timedelta(minutes=10)).isoformat()
    r = _create(first_booking_start=booking_iso)      # ISO-string is mehet
    delta = _expires_in(r)
    assert abs(delta - timedelta(hours=1)) < timedelta(minutes=1), \
        "minimum-clamp: a lejárat soha ne legyen korábbi mint now + 1 óra"
    assert delta > timedelta(minutes=10), "a token ne járjon le a foglalás előtt"


# ── 3. Default sablon: hossz és GSM-7 ────────────────────────────────────────
def test_default_sablon_rovid_es_gsm7():
    text = ect.build_sms_text(link="https://do.bo/Ab12Cd34Ef56",
                              rendelo="DentalCare Rendelo",
                              datum="2026-09-30", ido="10:00")
    assert len(text) <= 160, f"a kitöltött default sablon {len(text)} karakter"
    assert is_gsm7(text), "a default sablon GSM-7-ben kódolható (ékezet nélküli)"
    # az üres-értékes szélsőség is belefér és valid
    assert is_gsm7(ect.build_sms_text(link="https://do.bo/Ab12Cd34Ef56"))


# ── 4. Túl hosszú sablon elbukik a validáción ────────────────────────────────
def test_hosszu_ekezetes_sablon_tobb_mint_2_szegmens():
    hosszu = ("Kedves vendégünk! Köszönjük, hogy időpontot foglalt nálunk: "
              "{rendelo}, {datum} {ido}. Kérjük, erősítse meg e-mail címét "
              "ide kattintva: {link}. Üdvözlettel, a Rendelő csapata — "
              "kedves vendégünk, köszönjük szépen a bizalmat, hamarosan "
              "küldjük a pontos részleteket!")
    ok, seg, msg = ect.validate_sms_template(hosszu, max_segments=2)
    assert ok is False
    assert seg > 2, f"ékezetes, hosszú szöveg >2 szegmens (kaptunk: {seg})"
    assert msg and isinstance(msg, str)


def test_default_sablon_atmegy_a_validacion():
    ok, seg, msg = ect.validate_sms_template(ect.DEFAULT_SMS_TEMPLATE)
    assert ok is True and seg <= 2
    ok2, seg2, _ = ect.validate_sms_template(ect.DEFAULT_SMS_TEMPLATE_NO_EMAIL)
    assert ok2 is True and seg2 <= 2


# ── 5. build_sms_text: két változat és a link behelyettesítés ────────────────
def test_build_sms_text_valtozatok():
    link = "https://do.bo/xy123"
    with_c = ect.build_sms_text(link=link, rendelo="R", datum="d", ido="i",
                                has_candidate=True)
    no_c = ect.build_sms_text(link=link, rendelo="R", datum="d", ido="i",
                              has_candidate=False)
    assert "erositse meg" in with_c and "adja meg" not in with_c
    assert "adja meg" in no_c and "erositse meg" not in no_c
    assert link in with_c and link in no_c, "a {link} behelyettesítődik"


# ── 6. mark_confirmed: where confirmed_at is null + payload ──────────────────
def test_mark_confirmed_update_lanc_es_payload():
    assert ect.mark_confirmed("tok1234567890", "paciens@pelda.hu",
                              "corrected") is True
    updates = _ops_of("update")
    assert updates, "az update-nek el kell érnie a stubolt supabase-t"
    chain = updates[0]
    payload = chain.ops[0][1]
    assert payload["confirmed_email"] == "paciens@pelda.hu"
    assert payload["confirmed_at"]                    # ISO timestamp bekerül
    assert payload["action"] == "corrected"
    assert ("is", "confirmed_at", "null") in chain.filters, \
        "'első megerősítés nyer': where confirmed_at is null"
    assert ("eq", "token", "tok1234567890") in chain.filters


def test_mark_confirmed_masodik_probalka_bukik():
    STORE["update_hits_nothing"] = True   # a where-klauzula már nem talál sort
    assert ect.mark_confirmed("tok1234567890", "masik@pelda.hu",
                              "confirmed") is False


# ── Extra: fail-open útok ────────────────────────────────────────────────────
def test_create_db_hibanal_se_dobbenn():
    STORE["raise"] = True
    r = _create()
    assert r["ok"] is False and r["error"], "hiba esetén ok=False + error"
    assert ect.get_confirm_token("tok1234567890") is None  # fail-open → None


def test_create_pk_utkozes_ujraprobalt():
    STORE["fail_first_n_inserts"] = 1
    r = _create()
    assert r["ok"] is True, "első ütközés után az új token már átment"
    inserts = _ops_of("insert")
    assert len(inserts) >= 2, "ütközés után újrapróbált (új tokennel)"
    assert inserts[0].ops[0][1]["token"] != inserts[1].ops[0][1]["token"]


def test_get_confirm_token_sor_vagy_none():
    row = {"token": "abc123def456", "confirmed_at": None,
           "confirmed_email": None, "action": None}
    STORE["select_rows"] = [row]
    assert ect.get_confirm_token("abc123def456") == row
    STORE["select_rows"] = []
    assert ect.get_confirm_token("abc123def456") is None


def test_token_is_confirmed():
    assert ect.token_is_confirmed({"confirmed_at": "2026-09-24T10:00:00+00:00",
                                   "confirmed_email": "p@pelda.hu"}) is True
    assert ect.token_is_confirmed({"confirmed_at": "2026-09-24T10:00:00+00:00",
                                   "confirmed_email": ""}) is False
    assert ect.token_is_confirmed({"confirmed_at": None,
                                   "confirmed_email": "p@pelda.hu"}) is False
    assert ect.token_is_confirmed(None) is False
