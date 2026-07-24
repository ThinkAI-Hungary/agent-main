# -*- coding: utf-8 -*-
"""Unit tesztek a tools.py pure-függvényeihez (LiveKit/DB stubbal importálva)."""
import sys
import types
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# ── Stub modulok a nehéz függőségekhez ──────────────────────────────────────
def _stub(name, **attrs):
    mod = types.ModuleType(name)
    for k, v in attrs.items():
        setattr(mod, k, v)
    sys.modules.setdefault(name, mod)
    return mod


def _function_tool(*args, **kwargs):
    def deco(f):
        return f
    if args and callable(args[0]) and len(args) == 1 and not kwargs:
        return args[0]
    return deco


_lk = _stub("livekit")
_lk_agents = _stub("livekit.agents", function_tool=_function_tool, RunContext=object)
_lk.agents = _lk_agents

_stub("database")
_stub("email_processor")

import tools
from tools import _normalize_email, _parse_hungarian_date, _parse_hungarian_time, BUDAPEST_TZ


class TestNormalizeEmail:
    def test_kukac(self):
        assert _normalize_email("kovacs.janos kukac gmail pont com") == "kovacs.janos@gmail.com"

    def test_kukac_parenthesized(self):
        """Regresszió: a '(kukac)' ág korábban holt kód volt → 'janos(@)gmail.com'."""
        assert _normalize_email("janos(kukac)gmail.com") == "janos@gmail.com"

    def test_at_variants(self):
        assert _normalize_email("Kiss Anna at freemail.hu") == "kissanna@freemail.hu"

    def test_multiple_at_collapsed(self):
        """Regresszió: a többszörös-@ 'javítás' korábban no-op volt."""
        assert _normalize_email("a@@b.hu") == "a@b.hu"

    def test_invalid_returns_empty(self):
        """Érvénytelen eredmény eldobva (nem megy ki csendben elbukó email)."""
        assert _normalize_email("nem email") == ""
        assert _normalize_email("hianyzo@tld") == ""

    def test_empty(self):
        assert _normalize_email("") == ""


class TestParseHungarianDate:
    def test_iso_passthrough(self):
        assert _parse_hungarian_date("2026-03-11") == "2026-03-11"

    def test_year_with_month_name(self):
        """Regresszió: '2026. március 11'-ből a nap korábban 20 lett (az év első
        két számjegye), nem 11."""
        assert _parse_hungarian_date("2026. március 11.") == "2026-03-11"

    def test_month_name_current_year(self):
        now = datetime.now(BUDAPEST_TZ)
        result = _parse_hungarian_date("december 28")
        # Ha idén már elmúlt, jövő évre görget
        expected_year = now.year if (now.month, now.day) <= (12, 28) else now.year + 1
        assert result == f"{expected_year}-12-28"

    def test_roll_forward_past_month(self):
        """Decemberben a 'január 15' a KÖVETKEZŐ évet kapja, nem múltbeli."""
        now = datetime.now(BUDAPEST_TZ)
        result = _parse_hungarian_date("január 15")
        parsed = datetime.strptime(result, "%Y-%m-%d").date()
        assert parsed >= now.date()
        assert parsed.month == 1 and parsed.day == 15

    def test_numeric_format(self):
        now = datetime.now(BUDAPEST_TZ)
        result = _parse_hungarian_date("12/25")
        parsed = datetime.strptime(result, "%Y-%m-%d").date()
        assert parsed.month == 12 and parsed.day == 25
        assert parsed >= now.date()

    def test_full_numeric_year(self):
        assert _parse_hungarian_date("2027.03.11") == "2027-03-11"

    def test_invalid_raises(self):
        with pytest.raises(ValueError):
            _parse_hungarian_date("semmilyen dátum")


class TestParseHungarianTime:
    def test_hhmm(self):
        assert _parse_hungarian_time("14:30") == "14:30"

    def test_ora(self):
        assert _parse_hungarian_time("10 óra") == "10:00"

    def test_delutan(self):
        assert _parse_hungarian_time("délután 3") == "15:00"

    def test_invalid_raises(self):
        with pytest.raises(ValueError):
            _parse_hungarian_time("soha")
