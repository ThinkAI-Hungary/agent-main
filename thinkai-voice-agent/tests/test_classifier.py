# -*- coding: utf-8 -*-
"""Unit tesztek a classifier.py pure-függvényeihez (DB nélkül futnak)."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import classifier
from classifier import (
    _determine_restriction,
    _apply_decision_tree,
    _lookup_rule,
    _rule_channel_matches,
    _rule_kb_matches,
    _detect_intent_keyword,
    _strip_accents,
    _normalize_altipus,
    _priority_type_to_restriction,
    TYPE_PRIORITY,
)


# ── Teszt triage konfig (a seed rules-list struktúra tükrözve) ──────────────

CORE_RULES = [
    {"situation": "Kérdés", "priority": "onallo", "routing": {
        "kb_relevance": "decision", "default_restriction": "none",
        "fallback": {"eredmeny": "Kérdés rögzítve", "statusz": "Nyitott", "teendo": "Válasz/visszahívás szükséges"},
        "rules": [
            {"channels": ["mind"], "kb": "yes", "restriction": "none", "automation": "auto_reply", "eredmeny": "Megválaszolt kérdés", "statusz": "Lezárt", "teendo": "Nincs további teendő"},
            {"channels": ["email", "messenger", "instagram", "whatsapp"], "kb": "yes", "restriction": "approval", "automation": "draft", "eredmeny": "Válasz előkészítve", "statusz": "Nyitott", "teendo": "Jóváhagyás szükséges"},
            {"channels": ["voice"], "kb": "yes", "restriction": "handover", "automation": "handover", "eredmeny": "Kérdés rögzítve", "statusz": "Nyitott", "teendo": "Válasz/visszahívás szükséges"},
            {"channels": ["mind"], "kb": "yes", "restriction": "urgent", "automation": "urgent_handover", "eredmeny": "Kérdés rögzítve", "statusz": "Sürgős", "teendo": "Azonnali beavatkozás szükséges"},
            {"channels": ["mind"], "kb": "no", "restriction": "any", "automation": "handover", "eredmeny": "Kérdés rögzítve", "statusz": "Nyitott", "teendo": "Válasz/visszahívás szükséges"},
        ]}},
    {"situation": "Kérés", "priority": "ember", "routing": {
        "kb_relevance": "irrelevant", "default_restriction": "handover",
        "fallback": {"eredmeny": "Igény rögzítve", "statusz": "Nyitott", "teendo": "Intézkedés"},
        "rules": [
            {"channels": ["mind"], "kb": "any", "restriction": "any", "automation": "handover", "eredmeny": "Igény rögzítve", "statusz": "Nyitott", "teendo": "Intézkedés"},
            {"channels": ["mind"], "kb": "any", "restriction": "urgent", "automation": "urgent_handover", "eredmeny": "Igény rögzítve", "statusz": "Sürgős", "teendo": "Azonnali beavatkozás szükséges"},
        ]}},
    {"situation": "Panasz", "priority": "surgos", "routing": {
        "kb_relevance": "irrelevant", "default_restriction": "urgent",
        "fallback": {"eredmeny": "Panasz rögzítve", "statusz": "Sürgős", "teendo": "Azonnali beavatkozás szükséges"},
        "rules": [
            {"channels": ["mind"], "kb": "any", "restriction": "any", "automation": "urgent_handover", "eredmeny": "Panasz rögzítve", "statusz": "Sürgős", "teendo": "Azonnali beavatkozás szükséges"},
        ]}},
    {"situation": "Időpont", "priority": "onallo", "routing": {
        "kb_relevance": "not_applicable", "default_restriction": "none",
        "fallback": {"eredmeny": "Foglalási szándék rögzítve", "statusz": "Nyitott", "teendo": "Időpont véglegesítése"},
        "subtypes": {
            "Új": {"rules": [
                {"channels": ["mind"], "kb": "any", "restriction": "none", "automation": "auto_booking", "eredmeny": "Új időpont", "statusz": "Lezárt", "teendo": "Nincs további teendő"},
                {"channels": ["mind"], "kb": "any", "restriction": "handover", "automation": "handover", "eredmeny": "Foglalási szándék rögzítve", "statusz": "Nyitott", "teendo": "Időpont véglegesítése"},
            ]},
            "Lemondás": {"rules": [
                {"channels": ["mind"], "kb": "any", "restriction": "none", "automation": "auto_cancel", "eredmeny": "Törölt időpont", "statusz": "Lezárt", "teendo": "Nincs további teendő"},
                {"channels": ["mind"], "kb": "any", "restriction": "handover", "automation": "handover", "eredmeny": "Lemondási szándék rögzítve", "statusz": "Nyitott", "teendo": "Időpont véglegesítése"},
            ]},
        }}},
    {"situation": "Egyéb", "priority": "ember", "routing": {
        "kb_relevance": "irrelevant", "default_restriction": "handover",
        "fallback": {"eredmeny": "Igény rögzítve", "statusz": "Nyitott", "teendo": "Intézkedés"},
        "rules": [
            {"channels": ["mind"], "kb": "any", "restriction": "any", "automation": "handover", "eredmeny": "Igény rögzítve", "statusz": "Nyitott", "teendo": "Intézkedés"},
            {"channels": ["mind"], "kb": "any", "restriction": "urgent", "automation": "urgent_handover", "eredmeny": "Igény rögzítve", "statusz": "Sürgős", "teendo": "Azonnali beavatkozás szükséges"},
        ]}},
]

CONTEXT_RULES = [
    {"situation": "Erős fájdalom", "priority": "surgos", "routing": {}},
    {"situation": "Árérdeklődés", "priority": "ember", "routing": {}},
]

ALL_RULES = CORE_RULES + CONTEXT_RULES


@pytest.fixture(autouse=True)
def _no_written_behavior(monkeypatch):
    """A written_behavior override-t alapból kikapcsoljuk (autonomous)."""
    monkeypatch.setattr(classifier, "_get_written_behavior", lambda: "autonomous")
    classifier.invalidate_classifier_cache()


# ═══════════════════════════════════════════════════════════════════════════
# _determine_restriction
# ═══════════════════════════════════════════════════════════════════════════

class TestDetermineRestriction:
    def test_voice_default_none(self):
        assert _determine_restriction("telefon", ALL_RULES, "szia", ugytipus="") == "none"

    def test_text_default_approval(self):
        assert _determine_restriction("email", ALL_RULES, "szia", ugytipus="") == "approval"

    def test_unknown_channel_safe_default(self):
        assert _determine_restriction("smoke-signal", ALL_RULES, "szia", ugytipus="") == "approval"

    def test_type_rule_onallo(self):
        assert _determine_restriction("telefon", ALL_RULES, "mi az ár?", ugytipus="Kérdés") == "none"

    def test_type_rule_ember(self):
        assert _determine_restriction("telefon", ALL_RULES, "kérem küldjék el", ugytipus="Kérés") == "handover"

    def test_type_rule_surgos(self):
        assert _determine_restriction("telefon", ALL_RULES, "ez felháborító", ugytipus="Panasz") == "urgent"

    def test_context_rule_urgent(self):
        # „Erős fájdalom" kontextus-szabály urgent restriction-t ad
        assert _determine_restriction("telefon", ALL_RULES, "Erős fájdalom gyötör", ugytipus="Kérdés") == "urgent"

    def test_context_rule_accent_insensitive(self):
        # ékezet-hibás beírás is matchel
        assert _determine_restriction("telefon", ALL_RULES, "eros fajdalom van", ugytipus="Kérdés") == "urgent"

    def test_context_rule_non_urgent(self):
        assert _determine_restriction("telefon", ALL_RULES, "árérdeklődés miatt hívok", ugytipus="") == "handover"

    def test_written_behavior_override_approval(self, monkeypatch):
        monkeypatch.setattr(classifier, "_get_written_behavior", lambda: "approval")
        assert _determine_restriction("whatsapp", ALL_RULES, "mi az ár?", ugytipus="Kérdés") == "approval"

    def test_written_behavior_does_not_suppress_context_urgent(self, monkeypatch):
        """KRITIKUS regresszió: override mellett a sürgős kontextus-szabály urgent marad."""
        monkeypatch.setattr(classifier, "_get_written_behavior", lambda: "approval")
        assert _determine_restriction("whatsapp", ALL_RULES, "erős fájdalom miatt írok", ugytipus="Kérdés") == "urgent"

    def test_written_behavior_does_not_apply_to_voice(self, monkeypatch):
        monkeypatch.setattr(classifier, "_get_written_behavior", lambda: "approval")
        assert _determine_restriction("telefon", ALL_RULES, "mi az ár?", ugytipus="Kérdés") == "none"

    def test_handover_reason(self):
        assert _determine_restriction("telefon", [], "szia", handover_reason="ügyfél embert kért") == "handover"

    def test_handover_reason_urgent(self):
        assert _determine_restriction("telefon", [], "szia", handover_reason="sürgős átadás") == "urgent"


# ═══════════════════════════════════════════════════════════════════════════
# _apply_decision_tree / _lookup_rule
# ═══════════════════════════════════════════════════════════════════════════

class TestDecisionTree:
    def test_question_auto_reply(self):
        d = _apply_decision_tree("Kérdés", None, "none", True, "email", ALL_RULES)
        assert d["automation"] == "auto_reply"
        assert d["eredmeny"] == "Megválaszolt kérdés"
        assert d["statusz"] == "Lezárt"

    def test_question_approval_draft_written_channel(self):
        d = _apply_decision_tree("Kérdés", None, "approval", True, "whatsapp", ALL_RULES)
        assert d["automation"] == "draft"
        assert d["teendo"] == "Jóváhagyás szükséges"

    def test_question_handover_voice(self):
        d = _apply_decision_tree("Kérdés", None, "handover", True, "telefon", ALL_RULES)
        assert d["automation"] == "handover"
        assert d["eredmeny"] == "Kérdés rögzítve"

    def test_question_urgent(self):
        d = _apply_decision_tree("Kérdés", None, "urgent", True, "email", ALL_RULES)
        assert d["automation"] == "urgent_handover"
        assert d["statusz"] == "Sürgős"

    def test_question_kb_not_answered(self):
        d = _apply_decision_tree("Kérdés", None, "none", False, "email", ALL_RULES)
        assert d["automation"] == "handover"

    def test_booking_autonomous(self):
        d = _apply_decision_tree("Időpont", "Új", "none", False, "telefon", ALL_RULES)
        assert d["automation"] == "auto_booking"
        assert d["eredmeny"] == "Új időpont"

    def test_booking_subtype_case_insensitive(self):
        """Az LLM-től jövő kisbetűs „új" is az Új altípus-szabályokra matchel."""
        d = _apply_decision_tree("Időpont", "új", "none", False, "telefon", ALL_RULES)
        assert d["automation"] == "auto_booking"

    def test_cancel_autonomous(self):
        d = _apply_decision_tree("Időpont", "lemondás", "none", False, "telefon", ALL_RULES)
        assert d["automation"] == "auto_cancel"
        assert d["eredmeny"] == "Törölt időpont"

    def test_panasz_always_urgent_handover(self):
        d = _apply_decision_tree("Panasz", None, "urgent", False, "messenger", ALL_RULES)
        assert d["automation"] == "urgent_handover"
        assert d["teendo"] == "Azonnali beavatkozás szükséges"

    def test_keres_never_autonomous(self):
        d = _apply_decision_tree("Kérés", None, "handover", False, "email", ALL_RULES)
        assert d["automation"] == "handover"

    def test_routing_fallback_when_no_rule_matches(self):
        # approval restriction Kérés típusra: nincs konkrét szabály → any-szabály (2. menet)
        d = _apply_decision_tree("Kérés", None, "approval", False, "email", ALL_RULES)
        assert d["eredmeny"] == "Igény rögzítve"
        assert d["automation"] == "handover"

    def test_unknown_type_generic_fallback(self):
        d = _apply_decision_tree("Reklamáció", None, "handover", False, "email", ALL_RULES)
        assert d["eredmeny"] == "Igény rögzítve"


class TestRuleMatching:
    def test_concrete_channel_does_not_match_other_text_channels(self):
        """KRITIKUS regresszió: channels:['email'] NEM matchel whatsapp-ra."""
        assert not _rule_channel_matches(["email"], "text", "whatsapp")
        assert _rule_channel_matches(["email"], "text", "email")

    def test_text_category_matches_all_written(self):
        # a 4-es írásos lista minden írásos csatornára matchel
        lst = ["email", "messenger", "instagram", "whatsapp"]
        assert _rule_channel_matches(lst, "text", "whatsapp")
        assert not _rule_channel_matches(lst, "voice", "telefon")

    def test_mind_and_voice(self):
        assert _rule_channel_matches(["mind"], "voice", "telefon")
        assert _rule_channel_matches(["voice"], "voice", "telefon")
        assert not _rule_channel_matches(["voice"], "text", "email")

    def test_kb_relevance_irrelevant_passes_all(self):
        assert _rule_kb_matches("no", True, "irrelevant")
        assert _rule_kb_matches("yes", False, "not_applicable")

    def test_kb_relevance_decision_filters(self):
        assert _rule_kb_matches("yes", True, "decision")
        assert not _rule_kb_matches("yes", False, "decision")
        assert _rule_kb_matches("no", False, "decision")
        assert _rule_kb_matches("any", False, "decision")

    def test_two_pass_specific_beats_any(self):
        routing = CORE_RULES[1]["routing"]  # Kérés: any → handover, urgent → urgent_handover
        matched = _lookup_rule(routing, "urgent", False, "text", "email")
        assert matched["automation"] == "urgent_handover"
        matched = _lookup_rule(routing, "handover", False, "text", "email")
        assert matched["automation"] == "handover"


# ═══════════════════════════════════════════════════════════════════════════
# Keyword fallback
# ═══════════════════════════════════════════════════════════════════════════

class TestKeywordFallback:
    def test_elegedetlen_panasz(self):
        """KRITIKUS regresszió: elírt kulcsszó miatt nem matchelt."""
        r = _detect_intent_keyword("Nagyon elégedetlen vagyok a szolgáltatással")
        assert "Panasz" in r["detected_types"]
        assert r["ugytipus"] == "Panasz"

    def test_accentless_input(self):
        r = _detect_intent_keyword("elegedetlen vagyok, panaszom van")
        assert "Panasz" in r["detected_types"]

    def test_fajl_not_panasz(self):
        """KRITIKUS regresszió: a „fájl" substring „faj" miatt Panasz volt."""
        r = _detect_intent_keyword("Csatolom a fájlt amit kértél")
        assert "Panasz" not in r["detected_types"]

    def test_fajdalom_is_panasz(self):
        r = _detect_intent_keyword("Fájdalom gyötör, alig bírom")
        assert "Panasz" in r["detected_types"]

    def test_holnap_not_kerdes_hol(self):
        r = _detect_intent_keyword("Holnap szeretnék időpontot foglalni")
        assert r["ugytipus"] == "Időpont"

    def test_kerem_keres(self):
        """KRITIKUS regresszió: elírt „kerm" miatt nem matchelt."""
        r = _detect_intent_keyword("Kérem küldjék el a leletemet")
        assert "Kérés" in r["detected_types"]

    def test_booking_new(self):
        r = _detect_intent_keyword("Szeretnék időpontot foglalni jövő hétre")
        assert r["ugytipus"] == "Időpont"
        assert r["idopont_altipus"] == "Új"

    def test_booking_cancel(self):
        r = _detect_intent_keyword("Sajnos le kell mondanom az időpontomat")
        assert r["idopont_altipus"] == "Lemondás"

    def test_foglalkozik_not_idopont(self):
        r = _detect_intent_keyword("A cég fogászattal foglalkozik")
        assert "Időpont" not in r["detected_types"]

    def test_question_mark_kerdes(self):
        r = _detect_intent_keyword("Mennyibe kerül a konzultáció?")
        assert "Kérdés" in r["detected_types"]

    def test_mixed_type_priority(self):
        r = _detect_intent_keyword("Elégedetlen vagyok és szeretnék időpontot foglalni")
        assert r["ugytipus"] == "Panasz"  # Panasz > Időpont
        assert set(r["detected_types"]) == {"Panasz", "Időpont"}

    def test_empty_is_egyeb(self):
        r = _detect_intent_keyword("")
        assert r["ugytipus"] == "Egyéb"


# ═══════════════════════════════════════════════════════════════════════════
# Egyéb pure-függvények
# ═══════════════════════════════════════════════════════════════════════════

class TestHelpers:
    def test_strip_accents(self):
        assert _strip_accents("Árvíztűrő tükörfúrógép") == "Arvizturo tukorfurogep"

    def test_normalize_altipus(self):
        assert _normalize_altipus("új") == "Új"
        assert _normalize_altipus("LEMONDÁS") == "Lemondás"
        assert _normalize_altipus("modositas") == "Módosítás"
        assert _normalize_altipus("át helyezés") is None or isinstance(_normalize_altipus("át helyezés"), str)
        assert _normalize_altipus(None) is None
        assert _normalize_altipus("szemét") is None

    def test_priority_mapping(self):
        assert _priority_type_to_restriction("onallo") == "none"
        assert _priority_type_to_restriction("jovahagyas") == "approval"
        assert _priority_type_to_restriction("ember") == "handover"
        assert _priority_type_to_restriction("surgos") == "urgent"
        assert _priority_type_to_restriction("eloatadas") == "urgent"
        assert _priority_type_to_restriction("ismeretlen") == "approval"

    def test_type_priority_order(self):
        assert TYPE_PRIORITY == ["Panasz", "Időpont", "Kérés", "Kérdés", "Egyéb"]
