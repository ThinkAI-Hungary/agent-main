# -*- coding: utf-8 -*-
"""WP-E2 elfogadási tesztek (MUNKAUTALVÁNY 1.8 + 2.5 listái).

Kapu: evaluate_gate | kanonizálás: canon_email | többség: majority_reading |
audio: csatornakivonás + ablakolás + fail-open.
"""
import io
import sys
import wave
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def _stub(name, **attrs):
    mod = types.ModuleType(name)
    for k, v in attrs.items():
        setattr(mod, k, v)
    sys.modules.setdefault(name, mod)
    return mod


import types  # noqa: E402  (a stub miatt előbb-utóbb kell)

_stub("database")
_stub("email_processor")

import email_verify_harness as evh  # noqa: E402

A = "kovacs.bertalan13@citromail.hu"
B = "kovacs.bertalan13@gmail.com"


# ── MU-1.3: kanonizálás ──────────────────────────────────────────────────────
class TestCanonEmail:
    def test_szokoz_ekezet_zaro_irasjel(self):
        # 1.8: „Kovács.Bertalan13 @ Citromail.hu." == „kovacs.bertalan13@citromail.hu"
        assert evh.canon_email("Kovács.Bertalan13 @ Citromail.hu.") == \
            "kovacs.bertalan13@citromail.hu"

    def test_none_es_szemet(self):
        assert evh.canon_email("") is None
        assert evh.canon_email(None) is None
        assert evh.canon_email("nem email") is None
        assert evh.canon_email("a@b") is None  # nincs TLD

    def test_belso_szokoz_torles(self):
        assert evh.canon_email("kovacs bertalan 13 @ gmail . com") == \
            "kovacsbertalan13@gmail.com"


# ── MU-1.4: az új kapu ───────────────────────────────────────────────────────
class TestEvaluateGate:
    def test_bug_regresszio_live_es_reconcile_egyez_de_stt_mas(self):
        # 1.8: live=A, reconcile=A, stt=B, audio=None → NG_CONTRADICTION
        gate = evh.evaluate_gate({"live": A, "stt": B, "audio": None},
                                 mx_resolver=lambda d: True)
        assert gate["reason"] == "NG_CONTRADICTION"

    def test_ketto_ismeert_domainnel(self):
        # 1.8: live=A, stt=A, audio=None, ismert domain → GREEN_2OF2_KNOWN
        gate = evh.evaluate_gate({"live": A, "stt": A, "audio": None},
                                 mx_resolver=lambda d: True)
        assert gate["reason"] == "GREEN_2OF2_KNOWN"
        assert gate["known_domain"] is True

    def test_harom_forras(self):
        # 1.8: live=A, stt=A, audio=A → GREEN_3OF3
        gate = evh.evaluate_gate({"live": A, "stt": A, "audio": A},
                                 mx_resolver=lambda d: True)
        assert gate["reason"] == "GREEN_3OF3"

    def test_harombol_ketto_egyez_egy_mas(self):
        # 1.8: live=A, stt=A, audio=B → NG_CONTRADICTION (és a winner = A)
        gate = evh.evaluate_gate({"live": A, "stt": A, "audio": B},
                                 mx_resolver=lambda d: True)
        assert gate["reason"] == "NG_CONTRADICTION"
        assert evh.majority_reading({"live": A, "stt": A, "audio": B}) == A

    def test_ismeretlen_domain_ketto(self):
        # 1.8: ismeretlen domain + 2 egyezik + 1 hiányzik → NG_UNKNOWN_DOMAIN_2OF2
        gate = evh.evaluate_gate({"live": B.replace("gmail.com", "pelda-xyz.tld"),
                                  "stt": B.replace("gmail.com", "pelda-xyz.tld"),
                                  "audio": None},
                                 mx_resolver=lambda d: True)
        assert gate["reason"] == "NG_UNKNOWN_DOMAIN_2OF2"

    def test_ismeretlen_domain_harom(self):
        d = "pelda-xyz.tld"
        gate = evh.evaluate_gate({"live": B.replace("gmail.com", d),
                                  "stt": B.replace("gmail.com", d),
                                  "audio": B.replace("gmail.com", d)},
                                 mx_resolver=lambda d: True)
        assert gate["reason"] == "GREEN_3OF3"

    def test_egyetlen_forras(self):
        # 1.8: csak live → NG_SINGLE_SOURCE (JEV-konfidencia sem mentheti meg)
        gate = evh.evaluate_gate({"live": A, "stt": None, "audio": None},
                                 mx_resolver=lambda d: True)
        assert gate["reason"] == "NG_SINGLE_SOURCE"

    def test_nincs_email(self):
        assert evh.evaluate_gate({}, mx_resolver=lambda d: True)["reason"] == "NG_NO_EMAIL"

    def test_mx_nxdomain_blokkol(self):
        gate = evh.evaluate_gate({"live": A, "stt": A, "audio": None},
                                 mx_resolver=lambda d: False)
        assert gate["reason"] == "NG_MX_NXDOMAIN"

    def test_mx_ismeretlen_nem_blokkol(self):
        gate = evh.evaluate_gate({"live": A, "stt": A, "audio": None},
                                 mx_resolver=lambda d: None)
        assert gate["reason"] == "GREEN_2OF2_KNOWN"

    def test_szintaxis_hiba(self):
        gate = evh.evaluate_gate({"live": "nem email", "stt": "nem email",
                                  "audio": "nem email"},
                                 mx_resolver=lambda d: True)
        assert gate["reason"] == "NG_SYNTAX"

    def test_canon_eltunes_nem_ellentmondas(self):
        # ékezet/szóköz-különbség kanonizálás után egyezés
        gate = evh.evaluate_gate(
            {"live": evh.canon_email("Kovács Bertalan13 @ citromail.hu"),
             "stt": evh.canon_email("kovacsbertalan13@citromail.hu"),
             "audio": None},
            mx_resolver=lambda d: True)
        assert gate["reason"] == "GREEN_2OF2_KNOWN"


class TestJevGreenFlag:
    def test_default_kikapcsolva(self, monkeypatch):
        monkeypatch.delenv("EMAIL_VERIFY_JEV_GREEN", raising=False)
        assert evh._jev_green_enabled() is False

    def test_bekapcsolva(self, monkeypatch):
        monkeypatch.setenv("EMAIL_VERIFY_JEV_GREEN", "1")
        assert evh._jev_green_enabled() is True

    def test_egyetlen_forras_jev_0995_sem_zold(self, monkeypatch):
        # 1.8: EMAIL_VERIFY_JEV_GREEN=0 mellett JEV 0.995 + egyetlen forrás →
        # nem zöld (a kapu dönt, a JEV csak rangsorol)
        monkeypatch.setenv("EMAIL_VERIFY_JEV_GREEN", "0")
        gate = evh.evaluate_gate({"live": A, "stt": None, "audio": None},
                                 mx_resolver=lambda d: True)
        green = gate["reason"].startswith("GREEN")
        if green and evh._jev_green_enabled() and 0.995 < evh._confidence_threshold():
            green = False
        assert green is False


class TestMajority:
    def test_nincs_tobbseg(self):
        assert evh.majority_reading({"live": A, "stt": B}) is None

    def test_ketto_egyik(self):
        assert evh.majority_reading({"live": A, "stt": A, "audio": B}) == A

    def test_ures(self):
        assert evh.majority_reading({}) is None


# ── MU-2.5: audio ────────────────────────────────────────────────────────────
def _stereo_wav(left_hz, right_hz, seconds=0.1, rate=8000, amp=12000):
    import math
    import struct as _struct
    n = int(rate * seconds)
    frames = b"".join(
        _struct.pack("<hh",
                     int(amp * math.sin(2 * math.pi * left_hz * i / rate)),
                     int(amp * math.sin(2 * math.pi * right_hz * i / rate)))
        for i in range(n))
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(frames)
    return buf.getvalue()


class TestCallerChannelExtraction:
    def test_bal_csatorna_lesz_a_mono(self):
        # 2.5: a modellnek átadott audio a WAV 0. csatornája (bal = hívó)
        stereo = _stereo_wav(440, 880)
        mono = evh._extract_caller_channel_wav(stereo)
        with wave.open(io.BytesIO(mono), "rb") as w:
            assert w.getnchannels() == 1
            n = w.getnframes()
            samples = w.readframes(n)
        import struct as _struct
        vals = _struct.unpack(f"<{n}h", samples)
        with wave.open(io.BytesIO(stereo), "rb") as w:
            stereo_frames = w.readframes(w.getnframes())
        all_samples = _struct.unpack(f"<{n * 2}h", stereo_frames)
        left = all_samples[0::2]
        assert list(vals) == list(left)

    def test_mono_atmegy_valtozatlanul(self):
        mono = evh._extract_caller_channel_wav(_stereo_wav(440, 440))
        assert evh._extract_caller_channel_wav(
            evh._extract_caller_channel_wav(mono)) == mono

    def test_szemet_fail_open(self):
        assert evh._extract_caller_channel_wav(b"nem wav") == b"nem wav"
        assert evh._extract_caller_channel_wav(b"") == b""


class TestAudioWindow:
    def test_rovid_hivas_teljes(self):
        wav = _stereo_wav(440, 880, seconds=0.2)
        assert evh._caller_audio_window(wav, []) == wav

    def test_hosszu_hivas_soniox_jelzo_ablak(self):
        # 310 s-os hívás: a jelző-tokenek (start_ms) körül vág ±5 s
        rate = 1000
        buf = io.BytesIO()
        with wave.open(buf, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(rate)
            w.writeframes(b"\x00\x00" * (rate * 310))
        wav = buf.getvalue()
        words = [
            {"text": "szia", "start_ms": 5000, "end_ms": 5800},
            {"text": "kukac", "start_ms": 120000, "end_ms": 120600},
            {"text": "gmail.com", "start_ms": 121000, "end_ms": 121900},
        ]
        out = evh._caller_audio_window(wav, words)
        assert out != wav  # szabályozva
        with wave.open(io.BytesIO(out), "rb") as w:
            dur = w.getnframes() / w.getframerate()
        assert dur <= 300.0 + 10.6  # ablak + pad

    def test_hosszu_hivas_jelzo_nelkul_elso_300(self):
        rate = 1000
        buf = io.BytesIO()
        with wave.open(buf, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(rate)
            w.writeframes(b"\x00\x00" * (rate * 310))
        wav = buf.getvalue()
        out = evh._caller_audio_window(wav, [{"text": "szia"}])
        with wave.open(io.BytesIO(out), "rb") as w:
            dur = w.getnframes() / w.getframerate()
        assert abs(dur - 300.0) < 1.0


class TestAudioLlmFailOpen:
    def test_nincs_kliens(self, monkeypatch):
        monkeypatch.setattr(evh, "_new_genai_client", lambda *a: None)
        assert evh.llm_audio_extract(b"x") == {}

    def test_kivetel(self, monkeypatch):
        def _boom(*a):
            raise RuntimeError("503 unavailable")
        monkeypatch.setattr(evh, "_new_genai_client", _boom)
        assert evh.llm_audio_extract(b"x") == {}

    def test_ervenytelen_json(self, monkeypatch):
        class _Client:
            class models:
                @staticmethod
                def generate_content(**k):
                    class _R:
                        text = "nem json"
                    return _R()
        monkeypatch.setattr(evh, "_new_genai_client", lambda *a: _Client())
        assert evh.llm_audio_extract(b"x") == {}

    def test_ures_bemenet(self):
        assert evh.llm_audio_extract(b"") == {}


class TestParseAudioExtract:
    def test_teljes_séma(self):
        d = evh._parse_audio_extract(
            '{"email": "Aniko.Szilagyi84@Gmail.com", "heard_raw": "aniko pont '
            'szilagyi nyolcvannégy kukac gmail pont com", "spelled": false, '
            '"uncertain": [{"segment": "nyolcvannégy", "alternatives": '
            '["84", "48"]}], "confidence": 0.91}')
        assert d["email"] == "aniko.szilagyi84@gmail.com"
        assert d["spelled"] is False
        # csak a TELJES, érvényes email-alternatívák lesznek jelöltek;
        # a puszta szegmensek ("84") az uncertain auditban maradnak
        assert d["candidate_emails"] == []
        assert d["uncertain"][0]["alternatives"] == ["84", "48"]
        assert d["confidence"] == pytest.approx(0.91)

    def test_null_email(self):
        d = evh._parse_audio_extract(
            '{"email": null, "heard_raw": "", "spelled": false, '
            '"uncertain": [], "confidence": 0.8}')
        assert d["email"] is None and d["candidate_emails"] == []
