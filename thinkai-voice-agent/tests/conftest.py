# -*- coding: utf-8 -*-
"""Közös teszt-fixture: a TELJES tesztcsomagra érvényes biztonsági sapkák.

2026-10-15: a test_sms_decision.py egyik (stub-regressziós) ága a VALÓDI
SMS-küldőig futott le, amikor a monkeypatch csendben nem érte el a célt —
így a tesztfuttatás valós SMS-t küldött a tesztfájlba beégetett élő
telefonszámra. Ez az autouse fixture minden tesztnél dry-runra kényszeríti
az SMS- és email-küldést: unit-tesztből SOHA nem megy ki valódi üzenet,
tekintet nélkül arra, hogy egy adott teszt stub-olása működik-e. (A
dry-run-tesztek saját env-felülírása a fixture UTÁN fut, így felülírja.)"""
import pytest


@pytest.fixture(autouse=True)
def _no_real_outbound(monkeypatch):
    monkeypatch.setenv("SMS_DRY_RUN", "1")
    monkeypatch.setenv("EMAIL_DRY_RUN", "1")
