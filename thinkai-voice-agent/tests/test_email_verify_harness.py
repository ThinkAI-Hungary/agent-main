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

import math
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

    def test_email_kontextusban_a_szamszavak_szamjegyye_valnak(self):
        """@-kontextusban a számszavak számjegyek („egy hat" = 16)."""
        assert normalize_spoken_hu("egy hat kukac freemail pont hu") == \
            "1 6 @ freemail . hu"

    def test_nem_email_kontextusban_nincs_szamvaltas(self):
        """@ nélkül a közszó szám-szavak változatlanok."""
        assert normalize_spoken_hu("három napja fáj") == "három napja fáj"

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
        assert evh._transcribe_scribe(b"abc") == {}

    def test_ures_adat_ures(self, monkeypatch):
        monkeypatch.setenv("ELEVENLABS_API_KEY", "kulcs")
        assert evh._transcribe_scribe(b"") == {}

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
        assert evh._transcribe_scribe(b"abc") == {"words": []}
        assert calls["n"] == 3

    def test_4xx_nincs_ujraproba(self, monkeypatch):
        monkeypatch.setenv("ELEVENLABS_API_KEY", "kulcs")
        calls = {"n": 0}

        def fake_post(url, headers=None, files=None, timeout=None):
            calls["n"] += 1
            return _FakeResponse(401)

        monkeypatch.setattr(evh.requests, "post", fake_post)
        assert evh._transcribe_scribe(b"abc") == {}
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
    def test_fragment_tokenek_szohatarral(self):
        # Soniox: szub-szavas fragmentek, a szóhatár a token szövegének
        # VEZETŐ SZÓKÖZÉBEN van (dokumentáció szerint direkt összefűzendők)
        toks = [
            {"text": "kovacs", "confidence": 0.95},
            {"text": " akos"},
            {"text": "", "confidence": 0.9},
            "szemét",
            {"text": "<end>"},
        ]
        words = evh._soniox_tokens_to_words(toks)
        assert [w["text"] for w in words] == ["kovacs", "akos"]
        assert words[0]["logprob"] == pytest.approx(math.log(0.95))
        assert words[1]["logprob"] == -0.7  # nincs confidence → semleges

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


class TestCandidateVariants:
    def test_tld_utani_levagas(self):
        vs = evh._candidate_variants("hodi.akos13@citromail.hu.megjegyezted")
        assert vs[0] == "hodi.akos13@citromail.hu"
        assert vs[-1] == "hodi.akos13@citromail.hu.megjegyezted"

    def test_lead_kontextus_lehuzas(self):
        vs = evh._candidate_variants("hogybalazs.lederer@skyrocketgroup.hu.koszonom")
        assert vs[0] == "balazs.lederer@skyrocketgroup.hu"
        assert vs[-1] == "hogybalazs.lederer@skyrocketgroup.hu.koszonom"

    def test_utolso_eredeti_megmarad(self):
        vs = evh._candidate_variants("hodi.akos13@citromail.hu.megjegyezted")
        assert vs[0] == "hodi.akos13@citromail.hu"
        assert vs[-1] == "hodi.akos13@citromail.hu.megjegyezted"

    def test_tiszta_jelolt_valtozatlan(self):
        assert evh._candidate_variants("kovacs@gmail.com") == ["kovacs@gmail.com"]


class TestSonioxAsyncTokens:
    def test_konverzio(self):
        toks = [
            {"text": "kovacs", "confidence": 0.95},
            {"text": " akos"},
            {"text": "", "confidence": 0.9},
            "szemét",
            {"text": "<end>"},
        ]
        words = evh._soniox_tokens_to_words(toks)
        assert [w["text"] for w in words] == ["kovacs", "akos"]
        assert words[1]["logprob"] == -0.7


class TestEmailKontextusSzamszavak:
    def test_tizenharom_emailben(self):
        t = evh.normalize_spoken_hu("hodi akos tizenharom kukac citromail pont hu")
        # a számszó → 13 (a diktálásban nem hangzott el pont a lokálban)
        assert "hodiakos13@citromail.hu" in evh.extract_email_candidates(t)

    def test_osszetett_tizes_egyssel(self):
        t = evh.normalize_spoken_hu("kovacs akos otvenhat kukac gmail pont com")
        assert "kovacsakos56@gmail.com" in evh.extract_email_candidates(t)

    def test_nincs_szamszo_valtozatlan(self):
        t = evh.normalize_spoken_hu("balazs liderer kukac skyrocketgroup pont hu")
        cands = evh.extract_email_candidates(t)
        # pont nélküli lokál: összefűzve a helyes olvasat
        assert "balazsliderer@skyrocketgroup.hu" in cands


# ── REDESIGN: LLM-extrakció (gemini-3.8-flash) + JEV + green-gated írás ──────
class TestLlmExtractPrompt:
    def test_tartalmazza_mindket_atiratot(self):
        p = evh.build_llm_extract_prompt("élő szöveg", "utólagos szöveg")
        assert "ÉLŐ ÁTIRAT" in p and "élő szöveg" in p
        assert "UTÓLAGOS ÁTIRAT" in p and "utólagos szöveg" in p

    def test_konvencioek_a_promptban(self):
        p = evh.build_llm_extract_prompt("", "")
        assert "kukac" in p and "EGYBE" in p  # diktálási konvenciók

    def test_trapcso_6000_karakter(self):
        p = evh.build_llm_extract_prompt("x" * 9000, "")
        assert "x" * 6001 not in p

    def test_ures_bemenet_nem_tori(self):
        p = evh.build_llm_extract_prompt(None, None)
        assert "ÉLŐ ÁTIRAT" in p


class TestParseLlmExtract:
    def test_valid_json(self):
        d = evh.parse_llm_extract(
            '{"email": "Kovacs.Bertalan@Gmail.com", "name": "Kovács Bertalan", '
            '"variants": ["kovacsbertalan@gmail.com"], "confidence": 0.93}')
        assert d["email"] == "kovacs.bertalan@gmail.com"
        assert d["name"] == "Kovács Bertalan"
        # az email maga a variánsok ELSŐ helyére kerül
        assert d["variants"][0] == "kovacs.bertalan@gmail.com"
        assert d["variants"][1] == "kovacsbertalan@gmail.com"
        assert d["confidence"] == pytest.approx(0.93)

    def test_nullak(self):
        d = evh.parse_llm_extract(
            '{"email": null, "name": null, "variants": [], "confidence": 0.9}')
        assert d["email"] is None and d["name"] is None
        assert d["variants"] == []

    def test_szemet(self):
        assert evh.parse_llm_extract("") == {}
        assert evh.parse_llm_extract("nem json") == {}
        assert evh.parse_llm_extract("[1, 2, 3]") == {}

    def test_markdown_fenced(self):
        d = evh.parse_llm_extract(
            '```json\n{"email": "a@b.hu", "name": null, "variants": [], '
            '"confidence": 0.8}\n```')
        assert d["email"] == "a@b.hu"

    def test_ervenytelen_escape_megengedo(self):
        d = evh.parse_llm_extract(
            '{"email": "a@b.hu", "name": null, "variants": [], "confidence": 0.5, '
            '"note": "C:\\Temp"}')
        assert d["email"] == "a@b.hu"

    def test_konfidencia_klamplazas(self):
        d = evh.parse_llm_extract(
            '{"email": null, "name": null, "variants": [], "confidence": 7}')
        assert d["confidence"] == 1.0

    def test_semmi_email_nem_szivarghat_at(self):
        d = evh.parse_llm_extract(
            '{"email": "nem valodi cim", "name": null, "variants": [], '
            '"confidence": 0.5}')
        assert d["email"] is None
        assert d["variants"] == []


class TestLlmExtractHivas:
    def test_nincs_kliens_fail_open(self, monkeypatch):
        monkeypatch.setattr(evh, "_new_genai_client", lambda *a: None)
        assert evh.llm_extract("a", "b") == {}

    def test_kivetel_fail_open(self, monkeypatch):
        def _boom(*a):
            raise RuntimeError("API down")
        monkeypatch.setattr(evh, "_new_genai_client", _boom)
        assert evh.llm_extract("a", "b") == {}

    def test_modell_es_json_config(self, monkeypatch):
        # MU-refaktor óta a közös mag a _genai_generate_json — a prompt és a
        # parse él; a hívás részleteit ez a teszt a magon át ellenőrzi
        calls = {}

        def fake_gen(prompt, timeout_ms=90_000, delays=(0, 6, 15)):
            calls.update(prompt=prompt, timeout_ms=timeout_ms)
            return '{"email": "a@b.hu", "name": null, "variants": [], "confidence": 0.9}'

        monkeypatch.setattr(evh, "_genai_generate_json", fake_gen)
        d = evh.llm_extract("élő", "utólagos")
        assert d["email"] == "a@b.hu"
        assert "élő" in calls["prompt"] and "utólagos" in calls["prompt"]

    def test_stt_only_prompt_forrasa_csak_hivo(self, monkeypatch):
        # MU-1.2 elfogadás: az stt-extrakció promptja NEM tartalmazhatja az
        # élő átiratot és az agent szövegét (a forrás-függetlenség alapja)
        prompts = []

        def fake_gen(prompt, timeout_ms=90_000, delays=(0, 6, 15)):
            prompts.append(prompt)
            return '{"email": null, "name": null, "variants": [], "confidence": 0.5}'

        monkeypatch.setattr(evh, "_genai_generate_json", fake_gen)
        evh.llm_extract_stt_only("a nevem kovacs bela kukac gmail pont hu")
        assert "HÍVÓ ÁTIRAT" in prompts[0]
        assert "ÉLŐ ÁTIRAT" not in prompts[0] and "UTÓLAGOS ÁTIRAT" not in prompts[0]

    def test_stt_only_fail_open(self, monkeypatch):
        monkeypatch.setattr(evh, "_genai_generate_json", lambda *a, **k: None)
        assert evh.llm_extract_stt_only("szöveg") == {}


class TestMergeEmailCandidates:
    def test_llm_olvasat_all_elol(self):
        merged = evh.merge_email_candidates(
            "rossz@freemail.hu",
            {"email": "jo@gmail.com", "variants": ["jo1@gmail.com"]},
            ["live@freemail.hu"], ["utolagos@citromail.hu"])
        assert merged[0] == "jo@gmail.com"
        assert merged[1] == "jo1@gmail.com"
        # a többi jelölt megmarad mögötte
        assert "rossz@freemail.hu" in merged
        assert "utolagos@citromail.hu" in merged

    def test_llm_hianyaban_regi_sorrend(self):
        merged = evh.merge_email_candidates(
            "booking@gmail.com", {},
            [], ["scribe@gmail.com"])
        assert merged[0] == "booking@gmail.com"

    def test_ekezet_nyirt_es_szintaxis_szures(self):
        merged = evh.merge_email_candidates(
            "", {"email": "NEM EMAIL", "variants": ["árvíztűrő@hu", "ok@teszt.hu"]},
            [], [])
        assert merged[0] == "ok@teszt.hu"
        assert all(evh.EMAIL_SYNTAX_RE.match(c) for c in merged)

    def test_dedup(self):
        merged = evh.merge_email_candidates(
            "a@b.hu", {"email": "a@b.hu", "variants": ["a@b.hu"]}, ["a@b.hu"], [])
        assert merged.count("a@b.hu") == 1


class TestArbitrateLlmState:
    def test_state_tartalmaz_llm_olvasatot(self, monkeypatch):
        captured = {}

        def fake_post(payload):
            captured.update(payload)
            return 200, {"answers": {"pick": {"choice": "a@b.hu",
                                              "confidence": 0.97}}}

        monkeypatch.setattr(evh, "_post_decisions", fake_post)
        arb = arbitrate(["a@b.hu", "a@d.hu"], context={
            "kind": "email", "live": "a@b.hu", "scribe": "a@d.hu",
            "llm_value": "a@b.hu", "llm_confidence": 0.88})
        assert arb == {"choice": "a@b.hu", "confidence": 0.97, "source": "jev"}
        assert captured["state"]["llm_value"] == "a@b.hu"
        assert captured["state"]["llm_confidence"] == 0.88


class TestNameGuard:
    def test_booking_nev_nelkul_nincs_nev_feldolgozas(self, monkeypatch):
        # USER-szabály (élő incidens): booking-név nélkül a harness NEM ír
        # nevet — a "Gábor vagyok" az AGENT bemutatkozása, nem ügyfélnév.
        def _boom(t):
            raise AssertionError("extract_scribe_name nem hívódhat")
        monkeypatch.setattr(evh, "extract_scribe_name", _boom)
        assert evh._verify_name("", "gábor vagyok", "", "") is None

    def test_llm_nev_belep_a_jeloltek_koze(self, monkeypatch):
        captured = {}

        def fake_arb(cands, context):
            captured["cands"] = list(cands)
            return {"choice": cands[0], "confidence": 1.0, "source": "agree"}

        monkeypatch.setattr(evh, "arbitrate", fake_arb)
        res = evh._verify_name("Kovács Béla", "a nevem Kovács Béla", "", "",
                               llm_name="Kovács Béla")
        assert "Kovács Béla" in captured["cands"]
        assert res["winner"] == "Kovács Béla"


class TestApplyEmailCorrectionGating:
    def _row(self):
        return {"id": 7, "name": "Teszt Elemér", "email": "regi@freemail.hu",
                "phone": "+36301234567", "custom_data": {}}

    def test_non_green_az_email_oszlop_erintetlen(self, monkeypatch):
        upd = {}
        monkeypatch.setattr(evh.db, "edit_client_details",
                            lambda cid, u: upd.update(cid=cid, u=u) or True,
                            raising=False)
        monkeypatch.setattr(evh.db, "log_interaction", lambda **kw: None,
                            raising=False)
        evh._apply_email_correction(
            self._row(), "regi@freemail.hu", "jelolt@citromail.hu",
            {"confidence": 0.4, "source": "jev"}, "non_green",
            changed=False, interaction_id=None, apply=False)
        assert upd["u"]["email"] == "regi@freemail.hu"  # RÉGI cím marad
        audit = upd["u"]["custom_data"]["email_verification"]
        assert audit["status"] == "non_green"
        assert audit["applied"] is False
        assert audit["value"] == "jelolt@citromail.hu"  # a jelölt az auditban

    def test_green_felulirja_es_audit(self, monkeypatch):
        upd = {}
        monkeypatch.setattr(evh.db, "edit_client_details",
                            lambda cid, u: upd.update(cid=cid, u=u) or True,
                            raising=False)
        monkeypatch.setattr(evh.db, "log_interaction", lambda **kw: None,
                            raising=False)
        evh._apply_email_correction(
            self._row(), "regi@freemail.hu", "uj@gmail.com",
            {"confidence": 1.0, "source": "agree"}, "corrected",
            changed=True, interaction_id=None, apply=True)
        assert upd["u"]["email"] == "uj@gmail.com"
        assert upd["u"]["custom_data"]["email_verification"]["applied"] is True
