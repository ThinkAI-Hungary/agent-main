# -*- coding: utf-8 -*-
"""Unit tesztek a _language_rule-hoz (2026-10-15): szöveges csatornán az ügyfél
megkeresésének nyelve felülírja a tenant-nyelvet; a belső mezők magyarul
maradnak; a hangcsatorna viselkedése változatlan."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from prompt_utils import _language_rule


class TestLanguageRule:
    def test_hu_szoveges_csatorna_kivetellel(self):
        rule = _language_rule("hu", True)
        assert "Alapértelmezésben magyarul" in rule
        assert "KIVÉTEL" in rule                     # a megkeresés nyelve felülír
        assert "AZ Ő NYELVÉN" in rule
        assert "magyarul maradnak" in rule           # belső mezők maradnak magyarul

    def test_hu_hangcsatorna_valtozatlan(self):
        # A voice-hint a server.py-ból jön; itt a tenant-nyelvi szabály a régi
        assert _language_rule("hu", False) == "Mindig magyarul kommunikálj, udvariasan és segítőkészen."

    def test_angol_tenant_valtozatlan(self):
        rule = _language_rule("en", True)
        assert "NEVER respond in Hungarian" in rule
