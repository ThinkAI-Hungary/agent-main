# -*- coding: utf-8 -*-
"""Unit tesztek a call_recorder.py pure segédfüggvényeihez (livekit/db stubbal).

A rögzítő élő része (rtc.AudioStream, Storage-upload) konténerben fut — itt a
WAV-összeállítás, a frame-igazítás/drop-oldest, a retention-küszöb és a
storage-út építő van letesztelve, livekit-függőség nélkül.
"""
import io
import json
import struct
import sys
import time
import types
import wave
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# ── Stub modulok a nehéz függőségekhez ──────────────────────────────────────
def _stub(name, **attrs):
    mod = types.ModuleType(name)
    for k, v in attrs.items():
        setattr(mod, k, v)
    sys.modules.setdefault(name, mod)
    return mod


# A 'livekit' stubnak NINCS 'rtc' attribútuma → call_recorder rtc=None-mal él.
# A database-t NEM stuboljuk: a call_recorder csak lazy (függvényen belül)
# importálja — a többi tesztmodul a VALÓDI database modult kapja.
_stub("livekit")

import call_recorder
from call_recorder import (
    CallRecorder,
    FrameBuffer,
    build_stereo_wav,
    frame_rms,
    recording_storage_path,
    retention_cutoff,
    silence_bytes,
    SAMPLE_RATE,
    FRAME_SAMPLES,
)


def _parse_wav(data: bytes):
    """WAV-bájtback fejjel-lelivel: (csatornák, mintavétel, mintaszélesség, frame-ek)."""
    buf = io.BytesIO(data)
    with wave.open(buf, "rb") as wf:
        return wf.getnchannels(), wf.getframerate(), wf.getsampwidth(), wf.readframes(wf.getnframes())


class TestStereoWav:
    def test_csatorna_sorrend_hivo_bal_agent_jobb(self):
        """A hívó (left) az első, az agent (right) a második minta minden sztereó frame-ben."""
        left = struct.pack("<2h", 100, 100)
        right = struct.pack("<2h", 40, 40)
        _, _, _, frames = _parse_wav(build_stereo_wav(left, right))
        pairs = struct.unpack("<4h", frames)
        assert pairs == (100, 40, 100, 40)

    def test_egyenlotlen_hossz_csenddel_tolt(self):
        """A rövidebb oldal csenddel egészül ki a hosszabb hosszára (eltérő csatlakozási idő)."""
        left = struct.pack("<4h", 1, 2, 3, 4)
        right = struct.pack("<2h", 9, 9)
        _, _, _, frames = _parse_wav(build_stereo_wav(left, right))
        vals = struct.unpack("<8h", frames)
        # L: 1,2,3,4 — R: 9,9,0,0
        assert vals[0::2] == (1, 2, 3, 4)
        assert vals[1::2] == (9, 9, 0, 0)

    def test_wav_fejlec_16k_16bit_sztereo(self):
        data = build_stereo_wav(struct.pack("<2h", 1, 2), struct.pack("<2h", 3, 4))
        ch, rate, width, frames = _parse_wav(data)
        assert (ch, rate, width) == (2, SAMPLE_RATE, 2)
        assert len(frames) == 8  # 2 frame × 4 bájt

    def test_paratlan_bajtu_puffer_fejmezre(self):
        """Páratlan bájthosszú (fél mintára csonka) oldalon is érvényes WAV készül."""
        data = build_stereo_wav(b"\x01\x02\x03", struct.pack("<h", 7))
        ch, _, _, frames = _parse_wav(data)
        assert ch == 2
        assert len(frames) % 4 == 0  # egész sztereó frame-ek

    def test_ures_bemenet_csend_fajl(self):
        """Teljesen csendes (pl. sosem szólalt meg) hívás is érvényes WAV-ot ad."""
        data = build_stereo_wav(silence_bytes(FRAME_SAMPLES), silence_bytes(FRAME_SAMPLES))
        ch, _, _, frames = _parse_wav(data)
        assert ch == 2
        assert frames == b"\x00" * (FRAME_SAMPLES * 4)


class TestFrameBuffer:
    def test_ures_buffer_drain_csend(self):
        fb = FrameBuffer()
        out = fb.drain(FRAME_SAMPLES)
        assert out == silence_bytes(FRAME_SAMPLES)
        assert fb.produced_samples == 0

    def test_drain_sorrend_tartja(self):
        fb = FrameBuffer()
        fb.push(struct.pack("<h", 1))
        fb.push(struct.pack("<h", 2))
        fb.push(struct.pack("<h", 3))
        out = struct.unpack("<3h", fb.drain(3))
        assert out == (1, 2, 3)

    def test_drain_hiany_csenddel_tolt(self):
        fb = FrameBuffer()
        fb.push(struct.pack("<h", 5))
        out = struct.unpack("<3h", fb.drain(3))
        assert out == (5, 0, 0)

    def test_drop_oldest_szamlalo(self):
        """Túltöltésnél a LEGREGESEBB chunk doboódik és a dobott mintaszámláló nő."""
        fb = FrameBuffer(max_chunks=2)
        fb.push(struct.pack("<h", 1))
        fb.push(struct.pack("<h", 2))
        fb.push(struct.pack("<h", 3))
        assert fb.dropped_samples == 1
        assert fb.produced_samples == 3
        out = struct.unpack("<2h", fb.drain(2))
        assert out == (2, 3)

    def test_reszleges_chunk_visszakerul(self):
        """A célt túllógó chunk maradéka nem vész el — a következő drain folytatja."""
        fb = FrameBuffer()
        fb.push(struct.pack("<2h", 10, 20))
        out1 = struct.unpack("<h", fb.drain(1))
        out2 = struct.unpack("<h", fb.drain(1))
        assert out1 == (10,)
        assert out2 == (20,)

    def test_ures_chunk_figyelmen_kivul(self):
        fb = FrameBuffer()
        fb.push(b"")
        fb.push(b"\x00")  # fél minta
        assert fb.produced_samples == 0


class TestRetention:
    def test_cutoff_30_nap(self):
        now = datetime(2026, 9, 24, 12, 0, tzinfo=timezone.utc)
        assert retention_cutoff(now, 30) == datetime(2026, 8, 25, 12, 0, tzinfo=timezone.utc)

    def test_cutoff_1_nap_napdon_at(self):
        now = datetime(2026, 9, 1, 0, 30, tzinfo=timezone.utc)
        assert retention_cutoff(now, 1) == datetime(2026, 8, 31, 0, 30, tzinfo=timezone.utc)


class TestStoragePath:
    def test_ut_epites(self):
        assert recording_storage_path("rivergate", "2026-09-24", "call-123") == \
            "rivergate/2026-09-24/call-123.wav"

    def test_tenant_fallback(self):
        assert recording_storage_path("", "2026-09-24", "s1").startswith("tenant/")

    def test_slash_normalizalas(self):
        assert recording_storage_path("/rivergate/", "2026-09-24", "s1") == \
            "rivergate/2026-09-24/s1.wav"


class TestCallRecorderTurns:
    def test_turnus_rogzites_es_json(self):
        """A bubble-szintű seekhez: {role, text, start_s} alak, JSON-sorosítható."""
        rec = CallRecorder(None)
        assert rec.elapsed() == 0.0
        assert rec.turns == []
        rec._t0 = time.monotonic() - 2.0  # start() szimulációja 2 mp elteltével
        rec.add_turn("user", "Szia!")
        rec.add_turn("ai", "Sziasztok, miben segíthetek?")
        assert len(rec.turns) == 2
        assert rec.turns[0]["role"] == "user"
        assert rec.turns[0]["text"] == "Szia!"
        assert 1.5 <= rec.turns[0]["start_s"] <= 2.5
        assert rec.turns[1]["role"] == "ai"
        # A log_interaction JSON-stringet vár — érvényesen sorosítható legyen
        parsed = json.loads(json.dumps(rec.turns))
        assert parsed[1]["start_s"] == rec.turns[1]["start_s"]

    def test_turnus_rendezett_az_esemeny_sorrendtol_fuggetlen(self):
        """A LiveKit eventek érkezési sorrendje nem kronologikus — a turns
        property start_s szerint rendezve ad vissza (bubble-sorrend javítás)."""
        rec = CallRecorder(None)
        rec._t0 = time.monotonic() - 10.0
        # érkezési sorrend: user@10s, majd ai@20s, majd user@15s
        rec.add_turn("user", "Szeretnék időpontot kérni keddre")
        rec._t0 = time.monotonic() - 20.0
        rec.add_turn("ai", "Természetesen, mikor jönne Önnek?")
        rec._t0 = time.monotonic() - 15.0
        rec.add_turn("user", "Délelőtt lenne jó")
        turns = rec.turns
        assert [t["start_s"] for t in turns] == sorted(t["start_s"] for t in turns)
        assert turns[0]["text"] == "Szeretnék időpontot kérni keddre"  # 10 s
        assert turns[1]["text"] == "Délelőtt lenne jó"                 # 15 s
        assert turns[2]["role"] == "ai"                                # 20 s
        # a belső lista (érkezési sorrend) érintetlen — a rendezés csak a nézet
        assert rec._turns[1]["role"] == "ai"   # érkezésben 2. — időrendben utolsó

    def test_dupla_esemenyforras_dedup(self):
        """Ugyanaz a mondás két eseményen (user_input_transcribed final +
        conversation_item_added) kis írásjelezési eltéréssel érkezik →
        3 s-es ablakon belül az első számít."""
        rec = CallRecorder(None)
        rec._t0 = time.monotonic() - 5.0
        rec.add_turn("user", "Kiss Péter vagyok, kiss.peter@freemail.hu.")
        rec.add_turn("user", "Kiss Péter vagyok, kiss.peter@freemail.hu")
        assert len(rec.turns) == 1
        # AI oldal is: conversation_item_added + (jövőbeni) speech_committed
        rec.add_turn("ai", "Köszönöm, rögzítettem.")
        rec.add_turn("ai", "Köszönöm, rögzítettem")
        assert len(rec.turns) == 2

    def test_jogos_ismetles_nem_szurodik_ki(self):
        """Az ablakon KÍVÜLI azonos szöveg (tényleges ismétlés) marad."""
        rec = CallRecorder(None)
        rec._t0 = time.monotonic() - 60.0   # elapsed: 60 s
        rec.add_turn("user", "Igen")
        rec._t0 = time.monotonic() - 100.0  # elapsed: 100 s — 40 s az első után
        rec.add_turn("user", "Igen")
        assert len(rec.turns) == 2

    def test_ures_irasjelek_nem_kerulnek_turnusba(self):
        rec = CallRecorder(None)
        rec._t0 = time.monotonic() - 3.0
        rec.add_turn("user", "...")
        rec.add_turn("user", "!!")
        assert rec.turns == []


class TestSpeechSegmentSeek:
    """A bubble-seek időigazítása: a turnus start_s-e a TÉNYLEGES beszédkezdet
    (csatorna-energiából), nem a chat-item eseményének időpontja — az eventek
    a beszéd VÉGE körül tüzelnek, eseményidőre seekelve a mondat eleje
    lemaradt („a következő páciens hangjától indul")."""

    @staticmethod
    def _speak(rec, channel, t0, t1, step=0.02, rms=2000.0):
        t = t0
        while t <= t1:
            rec.note_audio(channel, t, rms)
            t += step

    @staticmethod
    def _silence(rec, channel, t0, t1, step=0.02):
        t = t0
        while t <= t1:
            rec.note_audio(channel, t, 5.0)
            t += step

    def test_frame_rms(self):
        loud = struct.pack("<320h", *([8000] * 320))
        quiet = struct.pack("<320h", *([5] * 320))
        assert frame_rms(loud) == 8000.0
        assert frame_rms(quiet) == 5.0
        assert frame_rms(b"") == 0.0

    def test_user_turn_a_beszede_kezdetere_seekel(self):
        rec = CallRecorder(None)
        rec._t0 = time.monotonic() - 14.0
        # hívó beszél 10.0–13.0 s között (bal csatorna), a STT-final ~14.0-nál tüzel
        self._speak(rec, "left", 10.0, 13.0)
        self._silence(rec, "left", 13.02, 14.0)
        rec.add_turn("user", "Szeretnék időpontot kérni keddre")
        start = rec.turns[0]["start_s"]
        assert abs(start - (10.0 - 0.15)) < 0.05, f"kaptunk: {start}"

    def test_ai_turn_a_sajat_csatornajarol(self):
        rec = CallRecorder(None)
        rec._t0 = time.monotonic() - 19.0
        # agent beszél 15.0–18.0 s között (jobb csatorna), item-commit ~19.0-nál
        self._speak(rec, "right", 15.0, 18.0)
        self._silence(rec, "right", 18.02, 19.0)
        rec.add_turn("ai", "Természetesen, segítek.")
        start = rec.turns[0]["start_s"]
        assert abs(start - (15.0 - 0.15)) < 0.05, f"kaptunk: {start}"

    def test_esemeny_a_szakasz_kozben_is_jo(self):
        # streamelt item a beszéd KÖZBEN kerül be → az adott szakasz eleje
        rec = CallRecorder(None)
        rec._t0 = time.monotonic() - 20.0
        self._speak(rec, "right", 16.0, 19.0)
        rec.add_turn("ai", "Részmondás közben rögzített item")   # elapsed ≈ 20
        # 20.0 az utolsó voice 19.0 + 1.0 → szakaszon belüli/közel — start 16.0
        start = rec.turns[0]["start_s"]
        assert abs(start - (16.0 - 0.15)) < 0.05, f"kaptunk: {start}"

    def test_nincs_szakasz_esemenyido_marad(self):
        rec = CallRecorder(None)
        rec._t0 = time.monotonic() - 5.0
        rec.add_turn("user", "Halló?")
        assert abs(rec.turns[0]["start_s"] - 5.0) < 0.05

    def test_foldologan_regi_szakasz_nem_tapat(self):
        # a 4 s-nál régebben véget ért szakasz már NEM az eseményé
        rec = CallRecorder(None)
        rec._t0 = time.monotonic() - 30.0
        self._speak(rec, "left", 10.0, 11.0)
        self._silence(rec, "left", 11.02, 12.0)
        rec.add_turn("user", "Késői esemény")   # elapsed ≈ 30 — 19 s a szakasz után
        assert abs(rec.turns[0]["start_s"] - 30.0) < 0.05
