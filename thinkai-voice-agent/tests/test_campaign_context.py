# -*- coding: utf-8 -*-
"""Unit tesztek a kampány-hívások céges kontextusához (get_campaign_context).

A kampány-prompt 2026-10-15-ig teljesen lecserélte a standard promptot — a
modell nem tudta, melyik céget képviseli (cégnév, aktív kedvezmények, tudástár
hiányzott). A get_campaign_context kompakt kivonatot ad, amit a server.py a
forgatókönyv mellé csatol. DB nélkül fut: monkeypatchelt loadersekkel.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import prompt_utils


def _patch_profile(monkeypatch, pi=None, knowledge=""):
    monkeypatch.setattr(prompt_utils, "_load_praxisinfo", lambda: pi or {})
    monkeypatch.setattr(prompt_utils, "load_agent_settings", lambda: {})
    monkeypatch.setattr(prompt_utils, "_load_knowledge", lambda settings: knowledge)


class TestGetCampaignContext:
    def test_cegnev_aktiv_kedvezmeny_tevakenyseg(self, monkeypatch):
        _patch_profile(monkeypatch, {
            "markanev": "UltraLog", "practice_name": "Ultra Log Kft.",
            "szakterulet": "szállítmányozás",
            "campaigns": [{"name": "Nyári akció", "text": "10% kedvezmény", "active": True}],
        })
        ctx = prompt_utils.get_campaign_context()
        assert "UltraLog" in ctx                      # markanev a mérvadó
        assert "Ultra Log Kft." not in ctx            # csak az első név megy be
        assert "szállítmányozás" in ctx
        assert "Nyári akció: 10% kedvezmény" in ctx

    def test_ures_profil_ures_kontextus(self, monkeypatch):
        _patch_profile(monkeypatch, {})
        assert prompt_utils.get_campaign_context() == ""

    def test_inaktiv_kedvezmeny_nem_jon(self, monkeypatch):
        _patch_profile(monkeypatch, {
            "markanev": "Cég",
            "campaigns": [{"name": "Régi", "text": "régi akció", "active": False}],
        })
        ctx = prompt_utils.get_campaign_context()
        assert "régi akció" not in ctx
        assert "Nincs aktív kampány" not in ctx

    def test_tudastar_reszlet_benne(self, monkeypatch):
        _patch_profile(monkeypatch, {"markanev": "Cég"}, knowledge="24 órás szolgálat")
        assert "24 órás szolgálat" in prompt_utils.get_campaign_context()

    def test_tudastar_placeholder_nem_jon(self, monkeypatch):
        _patch_profile(monkeypatch, {"markanev": "Cég"}, knowledge="{}")
        assert "Tudástár" not in prompt_utils.get_campaign_context()

    def test_hossz_cappelve(self, monkeypatch):
        _patch_profile(monkeypatch, {"markanev": "C", "szakterulet": "x" * 5000})
        assert len(prompt_utils.get_campaign_context(max_chars=500)) <= 500

    def test_loader_hiba_ures_kontextus_fail_open(self, monkeypatch):
        def _boom():
            raise RuntimeError("db down")
        monkeypatch.setattr(prompt_utils, "_load_praxisinfo", _boom)
        assert prompt_utils.get_campaign_context() == ""
