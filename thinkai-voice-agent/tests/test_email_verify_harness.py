# -*- coding: utf-8 -*-
"""Unit tesztek a WP-E email-ellenőrző harness pure függvényeihez (db/STT stubbal).

A harness ÉLŐ részei (Scribe HTTP-hívás, Supabase, MX-lookup) konténerben
futnak — itt a normalizáció, a jelölt-generálás, a döntetlen-feloldás
(JEV mockkal) és a zöld/non-zöld döntési mátrix van letesztelve, hálózat
nélkül.
"""
import sys
import types
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# ── Stub modulok a nehéz függőségekhez ──────────────────────────────────────
def _stub(name, **attrs):
    mod = types.ModuleType(name)
    for k, v in attrs.items():
        setattr(mod, k, v)
    sys.modules.setdefault(name, mod)
    return mod


_stub("database")
_stub("email_processor")

import email_verify_harness as evh
from email_verify_harness import (
    arbitrate,
    email_is_green,
    extract_email_candidates,
    extract_name_candidates,
    extract_scribe_name,
    fold_accents,
    generate_email_candidates,
    normalize_spoken_hu,
    validate_email,
)


class TestFoldAccents:
    def test_magyar_ekezetek(self):
        assert fold_accents("áéíóöőúüű") == "aeiooouuu"

    def test_ekezet_nelkul_valtozatlan(self):
        assert fold_accents("kovacs.bertalan@gmail.com") == "kovacs.bertalan@gmail.com"


class TestNormalizeSpokenHu:
    def test_kukac_pont(self):
        assert normalize_spoken_hu("kovacs bertalan kukac gmail pont com") == \
            "kovacs bertalan @ gmail . com"

    def test_kukac_zarojelesen(self):
        assert normalize_spoken_hu("kovacs (kukac) gmail pont hu") == \
            "kovacs @ gmail . hu"

    def test_at_szo(self):
        assert normalize_spoken_hu("kiss anna at freemail pont hu") == \
            "kiss anna @ freemail . hu"

    def test_kotojel_es_alahuzas(self):
        assert normalize_spoken_hu("anna kötőjel maria aláhúzás 82 kukac citromail pont hu") == \
            "anna - maria _ 82 @ citromail . hu"

    def test_dupla(self):
        assert normalize_spoken_hu("benedek dupla e kukac gmail pont com") == \
            "benedek ee @ gmail . com"

    def test_tolteloszavak_kihagyasa(self):
        """A töltelékszó csak betűtokenek KÖZÖTT tűnik el (konzervatív)."""
        assert normalize_spoken_hu("kovacs szóval bertalan kukac gmail pont com") == \
            "kovacs bertalan @ gmail . com"

    def test_tolteloszo_irasjel_utan(self):
        """Scribe-szerű írásjel a töltelékszó előtt („Kovács, szóval Bertalan")."""
        assert normalize_spoken_hu("kovács, szóval bertalan kukac gmail pont com") == \
            "kovács bertalan @ gmail . com"

    def test_tolteloszo_nincs_szelen(self):
        assert normalize_spoken_hu("vagyok kovacs kukac gmail pont com") == \
            "vagyok kovacs @ gmail . com"

    def test_telefon_kontextus_szamszavak(self):
        """Telefon-kontextusban a számszavak számjegyekké alakulnak (tizesek kétjegyűen)."""
        assert normalize_spoken_hu("telefonszámom nulla harminc kettő hét öt öt nyolc kilenc") == \
            "telefonszámom 0 30 2 7 5 5 8 9"

    def test_telefon_kontextus_osszetett_tizes(self):
        """Egy tokenbe írt összetett tizes ('harminchat') kétjegyű számmá áll."""
        assert normalize_spoken_hu("hívjon a harminchat négy nulla kettes számon") == \
            "hívjon a 36 4 0 kettes számon"

    def test_nem_telefon_kontextus_nincs_szamvaltas(self):
        """'egy'/'hat' közszavak email-diktálásban NEM alakulnak számmá."""
        assert normalize_spoken_hu("egy hat kukac freemail pont hu") == \
            "egy hat @ freemail . hu"

    def test_ekezetes_bevitel_nem_torik(self):
        assert normalize_spoken_hu("Szőke Árpád kukac freemail pont hu") == \
            "szőke árpád @ freemail . hu"

    def test_dupla_ekezetes_irattal(self):
        """A Scribe gyakran ékezetesen írja a 'dupla' szót („duplá E")."""
        assert normalize_spoken_hu("benedek duplá e kukac gmail pont com") == \
            "benedek ee @ gmail . com"

    def test_szamszo_futam_email_kontextusban(self):
        """≥3 számszó önmagában digit-sorozat (email lokálban diktált számok)."""
        assert normalize_spoken_hu("bence kettő nulla nulla kukac hotmail pont com") == \
            "bence 2 0 0 @ hotmail . com"

    def test_whitespace_tomorites(self):
        assert normalize_spoken_hu("  a   kukac   b  ") == "a @ b"

    def test_ures(self):
        assert normalize_spoken_hu("") == ""
        assert normalize_spoken_hu(None) == ""


class TestExtractEmailCandidates:
    def test_feszes_forma(self):
        assert extract_email_candidates("írjon a kovacs.bertalan@gmail.com címre") == \
            ["kovacs.bertalan@gmail.com"]

    def test_szokozos_mutermekek(self):
        """A normalizált szóközös műtermék ('a @ b . c') összefűzésre kerül —
        a teljes (névteret is tartalmazó) lokál plauzibilisebb, mint a csonka."""
        assert extract_email_candidates("kovacs bertalan @ gmail . com") == \
            ["kovacsbertalan@gmail.com", "bertalan@gmail.com"]

    def test_dedup_sorrend_tartas(self):
        text = "kovacs@gmail.com es megis kovacs@gmail.com"
        assert extract_email_candidates(text) == ["kovacs@gmail.com"]

    def test_nincs_email(self):
        assert extract_email_candidates("holnap delelott hivok") == []

    def test_proza_pont_nem_csal(self):
        """Mondatközi pont önmagában nem ad email-jelöltet."""
        assert extract_email_candidates("kovacs @ gmail . com") == ["kovacs@gmail.com"]
        assert extract_email_candidates("ez egy mondat. masik mondat") == []

    def test_ekezetes_lokal_osszefuzese(self):
        """Ékezetes lokál („szőke árpád @") is össze tud fűződni ékezet-nyírás után."""
        cands = extract_email_candidates("szőke árpád @ gmail.com")
        assert cands[0] == "szokearpad@gmail.com"


class TestGenerateEmailCandidates:
    def test_egyezo_menetek_dedup(self):
        assert generate_email_candidates("kovacs@gmail.com", "kovacs@gmail.com") == \
            ["kovacs@gmail.com"]

    def test_ekezetfolds_valtozat(self):
        cands = generate_email_candidates("kovács@gmail.com", "kovacs@gmail.com")
        assert cands[0] == "kovács@gmail.com"
        assert "kovacs@gmail.com" in cands

    def test_domain_levenshtein_javitas(self):
        cands = generate_email_candidates("kovacs@gmial.com", "")
        assert "kovacs@gmail.com" in cands

    def test_domain_javitas_nem_tulzakro(self):
        """Távoli domainre (lev > 2) nincs whitelist-javaslat."""
        cands = generate_email_candidates("kovacs@valami.szuperregio.tld", "")
        assert cands == ["kovacs@valami.szuperregio.tld"]

    def test_kereszt_kombinaciok(self):
        """Élő lokál + Scribe domén (és fordítva) is jelölt."""
        cands = generate_email_candidates("kovacs@gmail.com", "kovacs@freemail.hu")
        assert "kovacs@gmail.com" == cands[0]
        assert "kovacs@freemail.hu" in cands

    def test_ures_scribe(self):
        assert generate_email_candidates("kovacs@gmail.com", "") == ["kovacs@gmail.com"]

    def test_mindket_ures(self):
        assert generate_email_candidates("", "") == []


class TestExtractNameCandidates:
    def test_alap(self):
        assert extract_name_candidates("Kovács Béla", "Kovacs Bela") == \
            ["Kovács Béla", "Kovacs Bela"]

    def test_ures_eredeti(self):
        """Hiányzó élő névnél a Scribe-átirat + ékezet-nyírt változata áll elő."""
        assert extract_name_candidates("", "Kovács Béla") == \
            ["Kovács Béla", "Kovacs Bela"]

    def test_mindketto_ures(self):
        assert extract_name_candidates("", "") == []


class TestExtractScribeName:
    def test_nevem_minta(self):
        assert extract_scribe_name("Szia! A nevem Kovács Béla. Időpontot szeretnék.") == \
            "Kovács Béla"

    def test_vagyok_minta(self):
        assert extract_scribe_name("Jó napot, Kovács Béla vagyok.") == "Kovács Béla"

    def test_kisbetus_fallback(self):
        assert extract_scribe_name("nevem kovacs béla vagyok") == "Kovacs Béla"

    def test_nincs_minta(self):
        assert extract_scribe_name("Szia, időpontot kérnék.") == ""


class _FakeResponse:
    def __init__(self, status=200, data=None):
        self.status_code = status
        self._data = data

    def json(self):
        if self._data is None:
            raise ValueError("no json")
        return self._data


def _jev_answer(choice, confidence):
    return {"answers": {"pick": {"choice": choice, "confidence": confidence}}}


class TestArbitrate:
    def test_egyezes_conf_1(self):
        r = arbitrate(["kovacs@gmail.com"], context={"live": "kovacs@gmail.com", "scribe": "kovacs@gmail.com"})
        assert r == {"choice": "kovacs@gmail.com", "confidence": 1.0, "source": "agree"}

    def test_egyjeloltes_conf_05(self):
        r = arbitrate(["kovacs@gmail.com"], context={"live": "kovacs@gmail.com", "scribe": ""})
        assert r == {"choice": "kovacs@gmail.com", "confidence": 0.5, "source": "single"}

    def test_ures_jeloltek(self):
        assert arbitrate([], context={})["source"] == "empty"

    def test_jev_valasz(self, monkeypatch):
        monkeypatch.setattr(evh, "_post_decisions",
                            lambda payload: (200, _jev_answer("kovacs2@gmail.com", 0.995)))
        r = arbitrate(["kovacs@gmail.com", "kovacs2@gmail.com"],
                      context={"live": "kovacs@gmail.com", "scribe": "kovacs2@gmail.com"})
        assert r == {"choice": "kovacs2@gmail.com", "confidence": 0.995, "source": "jev"}

    def test_jev_alacsony_bizalom_ajtovabb_megy(self, monkeypatch):
        monkeypatch.setattr(evh, "_post_decisions",
                            lambda payload: (200, _jev_answer("kovacs2@gmail.com", 0.97)))
        r = arbitrate(["kovacs@gmail.com", "kovacs2@gmail.com"],
                      context={"live": "kovacs@gmail.com", "scribe": "kovacs2@gmail.com"})
        assert r["choice"] == "kovacs2@gmail.com" and r["confidence"] == 0.97

    def test_jev_ismeretlen_valasz_fail_open(self, monkeypatch):
        monkeypatch.setattr(evh, "_post_decisions",
                            lambda payload: (200, _jev_answer("nincs-ilyen", 0.99)))
        r = arbitrate(["kovacs@gmail.com", "kovacs2@gmail.com"],
                      context={"live": "kovacs@gmail.com", "scribe": "kovacs2@gmail.com"})
        assert r == {"choice": "kovacs@gmail.com", "confidence": 0.0, "source": "error"}

    def test_jev_hiba_fail_open(self, monkeypatch):
        def _boom(payload):
            raise RuntimeError("hálózat lehalt")
        monkeypatch.setattr(evh, "_post_decisions", _boom)
        r = arbitrate(["kovacs@gmail.com", "kovacs2@gmail.com"],
                      context={"live": "kovacs@gmail.com", "scribe": "kovacs2@gmail.com"})
        assert r == {"choice": "kovacs@gmail.com", "confidence": 0.0, "source": "error"}


class TestValidateEmail:
    def test_szintaxis_ok_mx_igaz(self, monkeypatch):
        monkeypatch.setattr(evh, "mx_resolves", lambda d: True)
        v = validate_email("kovacs@gmail.com")
        assert v == {"syntax": True, "mx": True, "known_domain": True}

    def test_szintaxis_hibas(self, monkeypatch):
        monkeypatch.setattr(evh, "mx_resolves", lambda d: True)
        v = validate_email("kovacs@gmail")
        assert v["syntax"] is False and v["mx"] is None and v["known_domain"] is False

    def test_mx_hamis(self, monkeypatch):
        monkeypatch.setattr(evh, "mx_resolves", lambda d: False)
        assert validate_email("kovacs@nemletezo.tld")["mx"] is False

    def test_mx_ismeretlen_nem_blokkol_a_kapuban(self, monkeypatch):
        monkeypatch.setattr(evh, "mx_resolves", lambda d: None)
        v = validate_email("kovacs@gmail.com")
        assert email_is_green("kovacs@gmail.com", v, False, 0.995) is True

    def test_ismeretlen_domain(self, monkeypatch):
        monkeypatch.setattr(evh, "mx_resolves", lambda d: True)
        assert validate_email("kovacs@cegem.hu")["known_domain"] is False


class TestGreenDecisionMatrix:
    V = {"syntax": True, "mx": True, "known_domain": True}

    def test_egyezes_es_mx_ok_zold(self):
        assert email_is_green("kovacs@gmail.com", self.V, True, 1.0) is True

    def test_jev_kuszob_felett_zold(self):
        assert email_is_green("kovacs@gmail.com", self.V, False, 0.995) is True

    def test_jev_kuszob_alatt_nem_zold(self):
        assert email_is_green("kovacs@gmail.com", self.V, False, 0.97) is False

    def test_mx_cárol_nem_zold(self):
        v = dict(self.V, mx=False)
        assert email_is_green("kovacs@gmail.com", v, True, 1.0) is False

    def test_szintaxis_hibas_nem_zold(self):
        v = dict(self.V, syntax=False)
        assert email_is_green("kovacs@gmail", v, True, 1.0) is False

    def test_ures_winner_nem_zold(self):
        assert email_is_green("", self.V, True, 1.0) is False

    def test_mx_ismeretlen_egyezesnel_zold(self):
        v = dict(self.V, mx=None)
        assert email_is_green("kovacs@gmail.com", v, True, 1.0) is True


class TestChannelParsing:
    def _w(self, text, ch, lp=None, typ="word"):
        d = {"text": text, "type": typ, "channel_index": ch}
        if lp is not None:
            d["logprob"] = lp
        return d

    def test_multichannel_csatorna_szovegek(self):
        scribe = {"transcripts": [
            {"words": [self._w("nevem", 0), self._w("kovacs", 0), {"text": " ", "type": "spacing", "channel_index": 0}]},
            {"words": [self._w("Szia", 1), self._w("Üdvözlöm", 1)]},
        ]}
        channels = evh._channel_texts(scribe)
        assert channels == {0: "nevem kovacs", 1: "Szia Üdvözlöm"}
        assert min(channels) == 0  # hívó = BAL = legkisebb csatornaindex

    def test_egycsatornas_fallback(self):
        scribe = {"words": [self._w("kukac", None, typ="word")]}
        assert evh._channel_texts(scribe) == {0: "kukac"}

    def test_min_logprob_az_email_spanra(self):
        words = [
            self._w("email", 0, lp=-0.2),
            self._w("cimem", 0, lp=-0.3),
            self._w("kovacs", 0, lp=-0.4),
            {"text": "@", "type": "word", "channel_index": 0, "logprob": -0.01},
            self._w("gmail", 0, lp=-0.9),
            {"text": ".", "type": "word", "channel_index": 0, "logprob": -0.05},
            self._w("com", 0, lp=-0.1),
        ]
        text, _ = evh._words_join(words)
        lp = evh._min_logprob_for_email(words, text)
        assert lp == -0.9  # a gyenge felismerés ('gmail') adja a minimumot

    def test_min_logprob_nincs_email(self):
        words = [self._w("semmi", 0, lp=-0.2)]
        text, _ = evh._words_join(words)
        assert evh._min_logprob_for_email(words, text) is None


class TestTranscribeClient:
    def test_nincs_kulcs_ures(self, monkeypatch):
        monkeypatch.setenv("ELEVENLABS_API_KEY", "")
        assert evh.transcribe_wav_bytes(b"abc") == {}

    def test_ures_adat_ures(self, monkeypatch):
        monkeypatch.setenv("ELEVENLABS_API_KEY", "kulcs")
        assert evh.transcribe_wav_bytes(b"") == {}

    def test_ujraprobal_5xx_utan(self, monkeypatch):
        """429/5xx után újrapróbál, 200-nál visszaadja a JSON-t (sleep stub)."""
        monkeypatch.setenv("ELEVENLABS_API_KEY", "kulcs")
        monkeypatch.setattr(evh, "_STT_RETRY_DELAYS", (0, 0))
        calls = {"n": 0}

        def fake_post(url, headers=None, files=None, timeout=None):
            calls["n"] += 1
            if calls["n"] < 3:
                return _FakeResponse(500)
            return _FakeResponse(200, {"words": []})

        monkeypatch.setattr(evh.requests, "post", fake_post)
        assert evh.transcribe_wav_bytes(b"abc") == {"words": []}
        assert calls["n"] == 3

    def test_4xx_nincs_ujraproba(self, monkeypatch):
        monkeypatch.setenv("ELEVENLABS_API_KEY", "kulcs")
        calls = {"n": 0}

        def fake_post(url, headers=None, files=None, timeout=None):
            calls["n"] += 1
            return _FakeResponse(401)

        monkeypatch.setattr(evh.requests, "post", fake_post)
        assert evh.transcribe_wav_bytes(b"abc") == {}
        assert calls["n"] == 1


class TestSttDispatcher:
    """HARNESS_STT_ENGINE diszpécser: soniox főmotor + scribe fallback."""

    def test_soniox_ures_fallback_scribe(self, monkeypatch):
        monkeypatch.setenv("HARNESS_STT_ENGINE", "soniox")
        monkeypatch.setattr(evh, "_transcribe_soniox", lambda d: {})
        monkeypatch.setattr(evh, "_transcribe_scribe", lambda d: {"words": [1]})
        assert evh.transcribe_wav_bytes(b"x") == {"words": [1]}

    def test_soniox_eredmeny_nem_hiv_scribe(self, monkeypatch):
        monkeypatch.setenv("HARNESS_STT_ENGINE", "soniox")
        calls = []
        monkeypatch.setattr(evh, "_transcribe_soniox", lambda d: calls.append("s") or {"words": [1]})
        monkeypatch.setattr(evh, "_transcribe_scribe", lambda d: calls.append("b") or {})
        assert evh.transcribe_wav_bytes(b"x") == {"words": [1]}
        assert calls == ["s"]

    def test_scribe_engine_beallitva(self, monkeypatch):
        monkeypatch.setenv("HARNESS_STT_ENGINE", "scribe")
        monkeypatch.setattr(evh, "_transcribe_soniox", lambda d: (_ for _ in ()).throw(AssertionError("soniox nem hívódhat")))
        monkeypatch.setattr(evh, "_transcribe_scribe", lambda d: {"words": []})
        assert evh.transcribe_wav_bytes(b"x") == {"words": []}


class TestSonioxTokens:
    def test_tokenek_to_words(self):
        toks = [
            {"text": "kovacs", "is_final": True, "confidence": 0.95},
            {"text": "<fin>", "is_final": True, "confidence": 1.0},
            {"text": "", "confidence": 0.9},
            "szemét",
        ]
        words = evh._soniox_tokens_to_words(toks)
        assert [w["text"] for w in words] == ["kovacs"]
        assert words[0]["logprob"] < -0.04

    def test_wav_left_channel_mono(self):
        import io as _io
        import wave as _wave
        import struct as _struct
        buf = _io.BytesIO()
        w = _wave.open(buf, "wb")
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(16000)
        w.writeframes(_struct.pack("<hhhh", 100, -200, 300, -400))
        w.close()
        pcm, sr = evh._wav_left_channel_pcm(buf.getvalue())
        import array as _a
        a = _a.array("h"); a.frombytes(pcm)
        assert sr == 16000 and list(a) == [100, 300]
