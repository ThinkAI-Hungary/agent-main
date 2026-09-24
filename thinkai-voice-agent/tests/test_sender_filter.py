# -*- coding: utf-8 -*-
"""Unit tesztek a JEV küldő-szűrőhöz (jev_classifier.py) — hálózat és DB nélkül.

A HTTP-hívást (_post_decisions) mindig monkeypatcheljük, így a tesztek offline
futnak; a retry-várakozást (_sleep) szintén kikapcsoljuk a sebesség kedvéért.
"""
import sys
from pathlib import Path

import pytest
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import jev_classifier
from jev_classifier import classify_sender, should_filter


class _FakeResponse:
    """Minimál response-double: status_code + json()."""

    def __init__(self, status_code, payload=None, bad_json=False):
        self.status_code = status_code
        self._payload = payload
        self._bad_json = bad_json

    def json(self):
        if self._bad_json or self._payload is None:
            raise ValueError("Nem JSON a válasz")
        return self._payload


class _FakeDecisions:
    """_post_decisions helyettesítő: előre betáplált eredmények/kivételek sorban."""

    def __init__(self, outcomes):
        # outcome: _FakeResponse | Exception példány
        self.outcomes = list(outcomes)
        self.calls = 0
        self.payloads = []

    def __call__(self, payload):
        self.calls += 1
        self.payloads.append(payload)
        if not self.outcomes:
            return 500, None  # elfogyott a betáplált sor: biztonsági fallback
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome.status_code, (None if outcome._bad_json or outcome._payload is None else outcome.json())


@pytest.fixture(autouse=True)
def _fast_and_clean_env(monkeypatch):
    """Retry-sleep nélkül és küszöb-API-varianciáktól függetlenül futtatunk."""
    monkeypatch.setattr(jev_classifier, "_sleep", lambda seconds: None)
    monkeypatch.delenv("SENDER_FILTER_THRESHOLD", raising=False)


def _ok_payload(choice, confidence, probabilities=None):
    return {"answers": {"sender_class": {"choice": choice, "confidence": confidence, "probabilities": probabilities or {}}}}


# ═══════════════════════════════════════════════════════════════════════════
# should_filter — a szűrési döntés pure logikája
# ═══════════════════════════════════════════════════════════════════════════

class TestShouldFilter:
    def test_non_paciens_above_threshold(self):
        """Munkatárs / szolgáltató / marketing a küszöb FELETT: szűrendő."""
        for label in ("munkatars", "szolgaltato", "marketing"):
            assert should_filter({"label": label, "confidence": 0.9, "error": ""}) is True

    def test_below_threshold_not_filtered(self):
        """A küszöb ALATT soha ne szűrjünk — inkább fusson be egy gyanús levél, mint
        hogy legitim ügyfelet veszítünk."""
        assert should_filter({"label": "munkatars", "confidence": 0.79, "error": ""}) is False

    def test_threshold_boundary_inclusive(self):
        """confidence == threshold (default 0.8) még szűr (>=)."""
        assert should_filter({"label": "marketing", "confidence": 0.8, "error": ""}) is True

    def test_paciens_never_filtered(self):
        assert should_filter({"label": "paciens", "confidence": 0.99, "error": ""}) is False

    def test_error_never_filtered(self):
        """Fail-open: technikai hibánál a levél bemegy, függetlenül a címkétől."""
        assert should_filter({"label": "marketing", "confidence": 0.99, "error": "HTTP 503"}) is False

    def test_missing_label_not_filtered(self):
        assert should_filter({"label": "", "confidence": 0.9, "error": ""}) is False

    def test_non_dict_not_filtered(self):
        assert should_filter(None) is False
        assert should_filter("munkatars") is False

    def test_threshold_from_env(self, monkeypatch):
        monkeypatch.setenv("SENDER_FILTER_THRESHOLD", "0.95")
        assert should_filter({"label": "munkatars", "confidence": 0.9, "error": ""}) is False
        monkeypatch.setenv("SENDER_FILTER_THRESHOLD", "0.5")
        assert should_filter({"label": "munkatars", "confidence": 0.6, "error": ""}) is True

    def test_invalid_threshold_falls_back_to_default(self, monkeypatch):
        monkeypatch.setenv("SENDER_FILTER_THRESHOLD", "nem-szam")
        assert should_filter({"label": "munkatars", "confidence": 0.79, "error": ""}) is False
        assert should_filter({"label": "munkatars", "confidence": 0.8, "error": ""}) is True


# ═══════════════════════════════════════════════════════════════════════════
# classify_sender — fail-open viselkedés és retry-szám
# ═══════════════════════════════════════════════════════════════════════════

class TestClassifySenderFailOpen:
    def test_missing_api_key_fail_open(self, monkeypatch):
        """Nincs OPENROUTER_API_KEY → paciens fail-open, hálózati hívás nélkül."""
        monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
        fake = _FakeDecisions([_FakeResponse(500)])
        monkeypatch.setattr(jev_classifier, "_post_decisions", fake)
        result = classify_sender("paciens@example.com", "Kovács Béla", "Időpont", "Fáj a fogam")
        assert result["label"] == "paciens"
        assert result["confidence"] == 0.0
        assert result["probabilities"] == {}
        assert result["error"]
        assert fake.calls == 0

    def test_connection_error_retries_then_fail_open(self, monkeypatch):
        """Szállítási hiba mindig → 1 próba + 2 retry, majd fail-open, kivétel nélkül."""
        fake = _FakeDecisions([requests.ConnectionError("down"), requests.ConnectionError("down"), requests.ConnectionError("down")])
        monkeypatch.setattr(jev_classifier, "_post_decisions", fake)
        monkeypatch.setenv("OPENROUTER_API_KEY", "teszt-kulcs")
        result = classify_sender("spam@example.com", "Robot", "NYEREMÉNY", "Kattints ide")
        assert result["label"] == "paciens"
        assert result["confidence"] == 0.0
        assert result["probabilities"] == {}
        assert result["error"]
        assert fake.calls == 3  # 1 eredeti + 2 retry

    def test_500_twice_then_200_succeeds(self, monkeypatch):
        """Két 500 után sikerül: harmadik próba érvényes válasza kerül kiértékelésre."""
        fake = _FakeDecisions([
            _FakeResponse(500),
            _FakeResponse(500),
            _FakeResponse(200, _ok_payload("munkatars", 0.93, {"munkatars": 0.93})),
        ])
        monkeypatch.setattr(jev_classifier, "_post_decisions", fake)
        monkeypatch.setenv("OPENROUTER_API_KEY", "teszt-kulcs")
        result = classify_sender("kassza@rendelo.hu", "Belső", "Beosztás", "Sziasztok")
        assert fake.calls == 3
        assert result["label"] == "munkatars"
        assert result["confidence"] == 0.93
        assert result["probabilities"] == {"munkatars": 0.93}
        assert result["error"] == ""

    def test_client_error_no_retry(self, monkeypatch):
        """4xx nem újrapróbálható — azonnal fail-open, egyetlen hívással."""
        fake = _FakeDecisions([_FakeResponse(400)])
        monkeypatch.setattr(jev_classifier, "_post_decisions", fake)
        monkeypatch.setenv("OPENROUTER_API_KEY", "teszt-kulcs")
        result = classify_sender("valaki@example.com", "Név", "Tárgy", "Szöveg")
        assert result["label"] == "paciens"
        assert result["error"]
        assert fake.calls == 1

    def test_timeout_counts_as_retryable(self, monkeypatch):
        fake = _FakeDecisions([requests.Timeout("többször") for _ in range(3)])
        monkeypatch.setattr(jev_classifier, "_post_decisions", fake)
        monkeypatch.setenv("OPENROUTER_API_KEY", "teszt-kulcs")
        result = classify_sender("valaki@example.com", "Név", "Tárgy", "Szöveg")
        assert fake.calls == 3
        assert result["label"] == "paciens"
        assert result["error"]

    def test_unexpected_shape_fail_open(self, monkeypatch):
        """Defenzív parse: ismeretlen válaszforma → paciens fail-open, nem kivétel."""
        fake = _FakeDecisions([_FakeResponse(200, {"fullnamet": "valami más"})])
        monkeypatch.setattr(jev_classifier, "_post_decisions", fake)
        monkeypatch.setenv("OPENROUTER_API_KEY", "teszt-kulcs")
        result = classify_sender("valaki@example.com", "Név", "Tárgy", "Szöveg")
        assert result["label"] == "paciens"
        assert result["confidence"] == 0.0
        assert result["error"]

    def test_unknown_choice_fail_open(self, monkeypatch):
        fake = _FakeDecisions([_FakeResponse(200, _ok_payload("foldreszakasz", 0.99))])
        monkeypatch.setattr(jev_classifier, "_post_decisions", fake)
        monkeypatch.setenv("OPENROUTER_API_KEY", "teszt-kulcs")
        result = classify_sender("valaki@example.com", "Név", "Tárgy", "Szöveg")
        assert result["label"] == "paciens"
        assert result["error"]

    def test_bad_json_body_fail_open(self, monkeypatch):
        fake = _FakeDecisions([_FakeResponse(200, bad_json=True)])
        monkeypatch.setattr(jev_classifier, "_post_decisions", fake)
        monkeypatch.setenv("OPENROUTER_API_KEY", "teszt-kulcs")
        result = classify_sender("valaki@example.com", "Név", "Tárgy", "Szöveg")
        assert result["label"] == "paciens"
        assert result["error"]


class TestClassifySenderRequest:
    def test_payload_shape_and_body_head_truncation(self, monkeypatch):
        """A payload tartalma: model env-ből, state mezők, body_head 1500 karakternél vágva."""
        fake = _FakeDecisions([_FakeResponse(200, _ok_payload("paciens", 0.9))])
        monkeypatch.setattr(jev_classifier, "_post_decisions", fake)
        monkeypatch.setenv("OPENROUTER_API_KEY", "teszt-kulcs")
        monkeypatch.setenv("OPENROUTER_JEV_MODEL", "teszt-jev-modell")
        result = classify_sender("paciens@example.com", "Kovács Béla", "Időpontkérés", "x" * 5000)
        assert result["error"] == ""
        payload = fake.payloads[0]
        assert payload["model"] == "teszt-jev-modell"
        assert payload["state"]["from_email"] == "paciens@example.com"
        assert payload["state"]["from_name"] == "Kovács Béla"
        assert payload["state"]["subject"] == "Időpontkérés"
        assert len(payload["state"]["body_head"]) == 1500
        q = payload["questions"]["sender_class"]
        assert q["type"] == "choice"
        assert set(q["criteria"].keys()) == {"paciens", "munkatars", "szolgaltato", "marketing"}
        assert "FELADÓJA" in q["instructions"]

    def test_post_decisions_sends_bearer_header(self, monkeypatch):
        """A valódi _post_decisions Bearer fejléccel, 10s timeouttal hív."""
        captured = {}

        def _fake_post(url, json=None, headers=None, timeout=None):
            captured.update({"url": url, "headers": headers, "timeout": timeout})
            return _FakeResponse(200, _ok_payload("paciens", 0.9))

        monkeypatch.setenv("OPENROUTER_API_KEY", "dummy-teszt-kulcs")
        monkeypatch.setattr(jev_classifier.requests, "post", _fake_post)
        status, data = jev_classifier._post_decisions({"model": "m"})
        assert status == 200
        assert data["answers"]["sender_class"]["choice"] == "paciens"
        assert captured["url"] == "https://openrouter.ai/api/alpha/decisions"
        assert captured["headers"]["Authorization"].startswith("Bearer ")
        assert captured["timeout"] == 10

    def test_model_default_when_env_missing(self, monkeypatch):
        monkeypatch.delenv("OPENROUTER_JEV_MODEL", raising=False)
        fake = _FakeDecisions([_FakeResponse(200, _ok_payload("paciens", 0.9))])
        monkeypatch.setattr(jev_classifier, "_post_decisions", fake)
        monkeypatch.setenv("OPENROUTER_API_KEY", "teszt-kulcs")
        classify_sender("paciens@example.com", "Név", "Tárgy", "Szöveg")
        assert fake.payloads[0]["model"] == "typesafe/jev-1.13"
