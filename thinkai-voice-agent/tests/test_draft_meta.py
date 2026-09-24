# -*- coding: utf-8 -*-
"""_stamp_draft_meta pure unit tesztek (offline, DB nélkül).

A helper különbözteti meg az ember által szerkesztett kiküldött választ az AI
autonóm küldésétől: az original_body (az AI eredeti szövege) törölhetetlenül
megőrzésre kerül, az edited/edited_at/edited_by a szerkesztést, a sent_by
('human' | 'ai') a kiküldőt rögzíti.
"""
import sys
import types
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# A teszt-környezet a worker teljes függőségi fáját NEM tartalmazza — az
# email_processor importjához minimál stub elég (a helper csak datetime-ot használ).
# Csak akkor lépünk be, ha a valódi csomag nincs telepítve.
try:
    import requests  # noqa: F401
except ModuleNotFoundError:
    sys.modules["requests"] = types.ModuleType("requests")
try:
    import charset_normalizer  # noqa: F401
except ModuleNotFoundError:
    _cn = types.ModuleType("charset_normalizer")
    _cn.from_bytes = lambda b: b  # noqa: E731 — csak a modul szintű import miatt kell
    sys.modules["charset_normalizer"] = _cn
try:
    from google import genai  # noqa: F401
except ModuleNotFoundError:
    for _name in ("google", "google.genai", "google.genai.types"):
        if _name not in sys.modules:
            sys.modules[_name] = types.ModuleType(_name)
    sys.modules["google"].genai = sys.modules["google.genai"]  # type: ignore[attr-defined]
    sys.modules["google.genai"].types = sys.modules["google.genai.types"]  # type: ignore[attr-defined]

from email_processor import _stamp_draft_meta  # noqa: E402


class TestEgySorosDraft:
    def test_szerkesztetlen_valasz(self):
        """Nem szerkesztett válasz: edited False, original_body elmentve, sent_by beállítva."""
        draft = {"channel": "Email", "body": "Kedves Páciens!"}
        out = _stamp_draft_meta(draft, "Kedves Páciens!", "human", "anna")
        assert out["edited"] is False
        assert out["original_body"] == "Kedves Páciens!"
        assert out["sent_by"] == "human"
        assert "edited_at" not in out

    def test_szerkesztett_valasz(self):
        """Szerkesztett válasz: az eredeti AI-szöveg megőrződik, edited_at és edited_by rögzül."""
        draft = {"channel": "Email", "body": "AI eredeti válasz"}
        out = _stamp_draft_meta(draft, "Ember által átfogalmazott válasz", "human", "anna")
        assert out["original_body"] == "AI eredeti válasz"
        assert out["body"] == "Ember által átfogalmazott válasz"
        assert out["edited"] is True
        assert out["edited_at"]
        assert out["edited_by"] == "anna"
        assert out["sent_by"] == "human"

    def test_ai_kuldes_nincs_szerkesztes(self):
        """Autonóm AI-küldés: sent_by='ai', edited_by nem kerül a draftba."""
        draft = {"channel": "Email", "body": "Autonóm válasz"}
        out = _stamp_draft_meta(draft, "Autonóm válasz", "ai")
        assert out["sent_by"] == "ai"
        assert out["edited"] is False
        assert "edited_by" not in out

    def test_whitespace_csak_kulonbseg_nem_szerkesztes(self):
        """Csak whitespace-ben eltérő szöveg nem számít szerkesztésnek."""
        draft = {"channel": "Email", "body": "Szia!\n\nÜdv,"}
        out = _stamp_draft_meta(draft, "  Szia!\n\nÜdv,  ", "human", "anna")
        assert out["edited"] is False


class TestIdempotensBelyegzes:
    def test_ketszeri_hivas_az_elso_original_body_marad(self):
        """Ismételt bélyegzés NEM írja felül az ELSŐ original_body-t."""
        draft = {"channel": "Email", "body": "AI eredeti"}
        _stamp_draft_meta(draft, "Első szerkesztett változat", "human", "anna")
        out = _stamp_draft_meta(draft, "Második szerkesztett változat", "human", "béla")
        assert out["original_body"] == "AI eredeti"
        assert out["edited"] is True
        # Az első edited_at is megmarad (nem írjuk felül)
        assert out["edited_at"]


class TestMultiChannel:
    def test_valtozott_csatorna_top_level_edited(self):
        """Multi-channel piszkozatnál bármelyik csatorna változása top-level edited=True."""
        draft = {
            "multi_channel": True,
            "drafts": [
                {"channel": "Email", "body": "Email szöveg"},
                {"channel": "WhatsApp", "body": "WA szöveg"},
            ],
        }
        out = _stamp_draft_meta(
            draft, "", "human", "anna",
            channel_texts={"Email": "Email szöveg", "WhatsApp": "WA szerkesztett szöveg"},
        )
        assert out["edited"] is True
        wa = next(sd for sd in out["drafts"] if sd["channel"] == "WhatsApp")
        email_sd = next(sd for sd in out["drafts"] if sd["channel"] == "Email")
        assert wa["edited"] is True
        assert wa["original_body"] == "WA szöveg"
        assert wa["edited_by"] == "anna"
        assert email_sd["edited"] is False
        assert email_sd["original_body"] == "Email szöveg"

    def test_egyszeru_draft_csatorna_szovegekkel_nem_multichannel(self):
        """channel_texts multi_channel draft nélkül nem duplikál — sima single út."""
        draft = {"channel": "Email", "body": "Eredeti"}
        out = _stamp_draft_meta(draft, "Szerkesztett", "human", "anna", channel_texts={"Email": "Figyelmen kívül"})
        assert out["body"] == "Szerkesztett"
        assert out["original_body"] == "Eredeti"
        assert "drafts" not in out
