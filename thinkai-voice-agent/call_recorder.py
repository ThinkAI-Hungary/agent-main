# -*- coding: utf-8 -*-
"""
Hívásrögzítő (Work Package D) — mindkét hangirány in-worker capture.

A LiveKit Cloud RoomCompositeEgress ezen a projekten nem indul (EGRESS_STARTING →
ABORTED), ezért a rögzítés a worker-folyamatban történik: a hívó (remote) és az
agent (local, RoomIO AudioSource-a) hangját rtc.AudioStream-en olvassuk, 16 kHz /
16-bit / SZTEREO WAV-ba írjuk (hívó BAL, agent JOBB), majd a privát Supabase
Storage 'recordings' bucketbe töltjük (ugyanaz a minta, mint az avataroknál).

A modul szándékosan SOSEM dob kivételt a hívás felé: a rögzítés meghibásodása
soha nem szakíthatja meg a beszélgetést.
"""

import asyncio
import io
import os
import struct
import time
import wave
from collections import deque
from datetime import datetime, timedelta, timezone

from loguru import logger

# A livekit.rtc csak a worker-konténerben érhető el; a pure segédfüggvényeknek
# (tesztek, email-processor retention) nem kell hozzá.
try:
    from livekit import rtc
except ImportError:  # pragma: no cover - teszt környezet
    rtc = None

SAMPLE_RATE = 16000
NUM_CHANNELS = 1
FRAME_MS = 20
FRAME_SAMPLES = SAMPLE_RATE * FRAME_MS // 1000   # 320 minta / 20 ms
FRAME_BYTES = FRAME_SAMPLES * 2                  # 16-bit mono

# Drop-oldest biztonsági plafon: 2500 chunk = 50 s oldalonként (a stall-waites
# writer miatt csak extrém esetben activity — memória: ~1,6 MB / oldal)
MAX_QUEUE_FRAMES = 2500
# Biztonsági plafon a memóriavédelemhez (2 óra beszélgetés után levágjuk)
MAX_DURATION_S = 2 * 3600

RECORDINGS_BUCKET = "recordings"

# TrackKind.KIND_AUDIO — a livekit-rtc ezen verziójában NINCS rtc.Track.Kind
# enum (a kind sima int: 1=audio), ezért számmal hasonlítunk.
_AUDIO_KIND = 1


def _is_audio_track(track) -> bool:
    return getattr(track, "kind", None) == _AUDIO_KIND


# ═══════════════════════════════════════════════════════════════════════════════
# PURE segédfüggvények — livekit/db NÉLKÜL tesztelhetők
# ═══════════════════════════════════════════════════════════════════════════════

def silence_bytes(n_samples: int) -> bytes:
    """n darab 16-bit mono csend-minta."""
    return b"\x00" * (max(0, n_samples) * 2)


def build_stereo_wav(left: bytes, right: bytes, sample_rate: int = SAMPLE_RATE) -> bytes:
    """Két mono 16-bit PCM pufferből sztereó WAV: hívó BAL, agent JOBB csatorna.

    Az eltérő hosszú oldalt csenddel kiegészítjük; a páratlan bájton lógó
    fél-mintát levágjuk (16-bit minták csak egész bájtpárokból állhatnak).
    """
    def _even(b: bytes) -> bytes:
        return b[: len(b) - (len(b) % 2)]

    left = _even(left)
    right = _even(right)
    n = max(len(left), len(right))
    left += silence_bytes((n - len(left)) // 2)
    right += silence_bytes((n - len(right)) // 2)

    # Sztereó interleaving slice-kiosztással (gyors, pure-Python):
    # frame = L_lo L_hi R_lo R_hi → out[0::4]/out[1::4] a bal, out[2::4]/out[3::4] a jobb bájtok.
    # Egyensúlyban a sztereó file = len(left)+len(right) bájt (mindkettő 2n → 2n kimenet).
    out = bytearray(len(left) + len(right))
    out[0::4] = left[0::2]
    out[1::4] = left[1::2]
    out[2::4] = right[0::2]
    out[3::4] = right[1::2]

    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(bytes(out))
    return buf.getvalue()


class FrameBuffer:
    """PCM-tömbök (bájt-chunkok) gyűjtoje drop-oldest szemantikával.

    Ha a fogyasztó (WAV-író) lemarad, a legrégebbi chunk doboódik és a
    dobott minták számlálója növekszik — a file sosem nő a valós hossz fölé.
    """

    def __init__(self, max_chunks: int = MAX_QUEUE_FRAMES):
        self.chunks: deque = deque(maxlen=max_chunks)
        self.produced_samples = 0
        self.dropped_samples = 0

    def push(self, chunk: bytes) -> None:
        n = len(chunk) // 2
        if n == 0:
            return
        if len(self.chunks) == self.chunks.maxlen:
            old = self.chunks.popleft()
            self.dropped_samples += len(old) // 2
        self.chunks.append(chunk)
        self.produced_samples += n

    def available_samples(self) -> int:
        """A bufferben várakozó minták száma (a writer stall-döntéséhez)."""
        return sum(len(c) for c in self.chunks) // 2

    def drain(self, need_samples: int) -> bytes:
        """Pontosan need_samples mintát ad vissza: ami nincs, csend.

        Ha egy chunk túllógná a célt, a maradék visszakerül az elejére
        (a 20 ms-os rács eltérő frame-méreteknél is tart).
        """
        out = bytearray()
        while self.chunks and len(out) // 2 < need_samples:
            chunk = self.chunks.popleft()
            take = min(len(chunk), (need_samples * 2) - len(out))
            out += chunk[:take]
            if take < len(chunk):
                self.chunks.appendleft(chunk[take:])
        pad = need_samples * 2 - len(out)
        if pad > 0:
            out += silence_bytes(pad // 2)
        return bytes(out)


def retention_cutoff(now: datetime, retention_days: int) -> datetime:
    """A retention-küszöb időpontja: now - retention_days nap (UTC-ben gondolkodunk)."""
    return now - timedelta(days=retention_days)


def recording_storage_path(tenant_slug: str, day: str, session_id: str) -> str:
    """Storage-út a recordings bucketben: '<tenant>/<ÉÉ-HH-NN>/<session_id>.wav'."""
    return f"{(tenant_slug or 'tenant').strip('/')}/{day}/{session_id}.wav"


# ═══════════════════════════════════════════════════════════════════════════════
# ÉLŐ RÖGZÍTŐ — csak workerben fut (rtc szükséges hozzá)
# ═══════════════════════════════════════════════════════════════════════════════

class CallRecorder:
    """Egy hívás (session) hangrögzítője a worker-folyamaton belül.

    Bal csatorna: az ELSŐ remote (hívó) audio track. Jobb csatorna: a
    local_participant RoomIO által publikált audio trackje — ez a TTS-kimenet
    forrása (livekit-agents 1.5.x: rtc.AudioSource → LocalAudioTrack), és az
    AudioStream.from_track() local tracken IS leszedi a frame-eket
    (konténerben ellenőrizve: AudioSource-ba nyomott szinusz 1:1-ben kijön).
    """

    def __init__(self, room):
        self.room = room
        self._t0: float | None = None
        self._left = FrameBuffer()    # hívó (remote)
        self._right = FrameBuffer()   # agent (local TTS)
        self._turns: list = []
        self._tasks: list = []
        self._stopped = False
        self._remote_stream: object | None = None
        self._local_stream: object | None = None
        # PCM-töredékek listában (a bytes += O(n²) lenne hosszú hívásnál)
        self._pcm_parts: dict = {"left": [], "right": []}

    # ──publikus API──

    def elapsed(self) -> float:
        """Másodpercek a start() óta (monoton óra)."""
        if self._t0 is None:
            return 0.0
        return time.monotonic() - self._t0

    def add_turn(self, role: str, text: str) -> None:
        """Transcript-turnus rögzítése a bubble-szintű seekhez (start_s = elapsed())."""
        self._turns.append({
            "role": role,
            "text": text,
            "start_s": round(self.elapsed(), 2),
        })

    @property
    def turns(self) -> list:
        return self._turns

    async def start(self) -> None:
        """Capture-taskok indítása; sosem dob."""
        if rtc is None:
            logger.warning("Hívásrögzítés kihagyva: livekit.rtc nem elérhető ebben a folyamatban")
            return
        self._t0 = time.monotonic()
        self._tasks = [
            asyncio.get_event_loop().create_task(self._capture_remote(), name="rec-remote"),
            asyncio.get_event_loop().create_task(self._capture_local(), name="rec-local"),
            asyncio.get_event_loop().create_task(self._writer(), name="rec-writer"),
        ]

    async def finish_and_upload(self, tenant_slug: str, session_id: str) -> str | None:
        """Capture leállítása → WAV véglegesítés → Supabase Storage feltöltés.

        Visszaadja a storage-utat, hiba/üres felvétel esetén None-t. SOSEM dob.
        """
        try:
            self._stopped = True
            for t in self._tasks:
                t.cancel()
            if self._tasks:
                await asyncio.gather(*self._tasks, return_exceptions=True)
            for s in (self._remote_stream, self._local_stream):
                if s is not None:
                    try:
                        await s.aclose()
                    except Exception:
                        pass

            # A sorban még várakozó frame-eket is a fájlba kérjük (egy hívás —
            # a drain az összes fennmaradó mintát ledolgozza)
            for buf, side in ((self._left, "left"), (self._right, "right")):
                rem = sum(len(c) for c in buf.chunks) // 2
                if rem:
                    self._pcm_extend(side, buf.drain(rem))

            left_pcm, right_pcm = self._final_pcm()
            if not left_pcm and not right_pcm:
                logger.info(f"Hívásrögzítés: nincs rögzített hang ({session_id}) — nem töltünk fel")
                return None

            wav_bytes = build_stereo_wav(left_pcm, right_pcm)

            import database as db  # lazy: a pure használat ne húzza be a supabase-t
            day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            path = recording_storage_path(tenant_slug, day, session_id)
            db.supabase.storage.from_(RECORDINGS_BUCKET).upload(
                path,
                wav_bytes,
                file_options={"content-type": "audio/wav", "upsert": "true"},
            )
            logger.info(f"Hívásrögzítés feltöltve: {path} ({len(wav_bytes)} bájt, "
                        f"{self._left.dropped_samples + self._right.dropped_samples} dobott minta)")
            return path
        except Exception as e:
            logger.error(f"Hívásrögzítés feltöltése sikertelen ({session_id}): {e}")
            return None

    # ──belső részek──

    def _pcm_extend(self, side: str, data: bytes) -> None:
        self._pcm_parts[side].append(data)

    def _final_pcm(self) -> tuple:
        max_bytes = MAX_DURATION_S * SAMPLE_RATE * 2
        return (b"".join(self._pcm_parts["left"])[:max_bytes],
                b"".join(self._pcm_parts["right"])[:max_bytes])

    async def _capture_remote(self) -> None:
        """A hívó (remote) audio track feliratkozása — esemény VAGY már jelenlévő track."""
        try:
            started = asyncio.Event()

            def _on_track(track, pub, participant):
                if started.is_set() or self._stopped:
                    return
                if not _is_audio_track(track):
                    return
                started.set()
                asyncio.get_event_loop().create_task(self._consume(track, self._left, "remote", "remote"))

            self.room.on("track_subscribed", _on_track)

            # Már feliratkozott trackek (a worker auto_subscribe-ja a connect()-nél futott)
            for p in list(self.room.remote_participants.values()):
                for pub in list(getattr(p, "track_publications", {}).values()):
                    track = getattr(pub, "track", None)
                    if track and _is_audio_track(track) and not started.is_set():
                        started.set()
                        await self._consume(track, self._left, "remote", "remote")
                        return
            # Ha eseményből jön, a consume a callback taskjában fut — itt csak várunk a stopra
            while not self._stopped:
                await asyncio.sleep(0.5)
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.warning(f"Hívásrögzítés: hívó oldali capture hiba: {e}")

    async def _capture_local(self) -> None:
        """Az agent SAJÁT audio trackjének megvárása (RoomIO lazy publikál) és lecsapolása."""
        try:
            deadline = time.monotonic() + 120.0
            track = None
            while not self._stopped and time.monotonic() < deadline:
                lp = getattr(self.room, "local_participant", None)
                pubs = getattr(lp, "track_publications", None) or {}
                # SDK-verziónként eltér: dict (id→pub) vagy sima lista is lehet
                pub_iter = pubs.values() if hasattr(pubs, "values") else list(pubs)
                for pub in list(pub_iter):
                    t = getattr(pub, "track", None)
                    if t and _is_audio_track(t):
                        track = t
                        break
                if track:
                    break
                await asyncio.sleep(0.5)
            if not track:
                logger.warning("Hívásrögzítés: az agent audio trackje 120 s alatt nem jelent meg — agent csatorna csend lesz")
                return
            await self._consume(track, self._right, "local", "local")
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.warning(f"Hívásrögzítés: agent oldali capture hiba: {e}")

    async def _consume(self, track, buf: FrameBuffer, side: str, label: str) -> None:
        """Frame-ek olvasása egy trackről a FrameBufferbe (16 kHz / mono / 20 ms)."""
        stream = None
        try:
            stream = rtc.AudioStream.from_track(
                track=track,
                sample_rate=SAMPLE_RATE,
                num_channels=NUM_CHANNELS,
                frame_size_ms=FRAME_MS,
            )
            if side == "remote":
                self._remote_stream = stream
            else:
                self._local_stream = stream
            async for ev in stream:
                if self._stopped:
                    break
                buf.push(bytes(ev.frame.data))
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.warning(f"Hívásrögzítés: {label} stream olvasási hiba: {e}")

    async def _writer(self) -> None:
        """20 ms-os rácsra igazítja mindkét oldalt — JITTER-TŰRŐ módon.

        A rács csak akkor lép, ha mindkét rögzítés alatt álló oldalon megvan a
        minta, VAGY az oldal stall-tűrése (STALL_PATIENCE_S, 1 s) lejárt — az
        utóbbi csak igazi csend/DTX esetén fordul elő. Ez megakadályozza, hogy
        a hálózati/loop-jitter csend-réseket égessen a beszédbe és
        elcsúsztassa a csatornákat. A lemaradt tail-t a finish_and_upload
        rendezeti sorrendben (drain a rács után)."""
        frame_s = FRAME_MS / 1000.0
        stall_patience = 1.0
        written = 0
        stall_since: dict = {"left": None, "right": None}
        try:
            while not self._stopped:
                if self._t0 is None:
                    await asyncio.sleep(frame_s)
                    continue
                target = int(self.elapsed() / frame_s)
                need = target - written
                if need > 0:
                    need_samples = need * FRAME_SAMPLES
                    now = time.monotonic()
                    waiting = False
                    active = {
                        "left": self._remote_stream is not None,
                        "right": self._local_stream is not None,
                    }
                    for side in ("left", "right"):
                        if not active[side]:
                            stall_since[side] = None
                            continue
                        buf = getattr(self, f"_{side}")
                        if buf.available_samples() < need_samples:
                            if stall_since[side] is None:
                                stall_since[side] = now
                            if now - stall_since[side] < stall_patience:
                                waiting = True
                        else:
                            stall_since[side] = None
                    if waiting:
                        await asyncio.sleep(0.005)
                        continue
                    self._pcm_extend("left", self._left.drain(need_samples))
                    self._pcm_extend("right", self._right.drain(need_samples))
                    written = target
                    stall_since = {"left": None, "right": None}
                if self.elapsed() > MAX_DURATION_S:
                    logger.warning("Hívásrögzítés: elérte a 2 órás plafont — capture leállítva")
                    break
                # A tick a monotonic órához igazodik, nehogy kicsússzon
                next_tick = self._t0 + (written * frame_s)
                await asyncio.sleep(max(0.004, next_tick - time.monotonic()))
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.warning(f"Hívásrögzítés: writer hiba: {e}")


# ═══════════════════════════════════════════════════════════════════════════════
# RETENTION — lejárt rögzítések törlése (email_processor naponta egyszer hívja)
# ═══════════════════════════════════════════════════════════════════════════════

def _eval_protected_session_ids() -> set:
    """MU-3.4: az EVAL_CALLER_NUMBERS számokról érkezett hívások session_id-jei —
    ezek rögzítése a retention NEM törli (a replay/kiértékeléshez megmaradnak).
    Fail-open: hibánál üres halmaz."""
    numbers = [n.strip() for n in (os.getenv("EVAL_CALLER_NUMBERS", "") or "").split(",")
               if n.strip()]
    if not numbers:
        return set()
    try:
        import database as db
        res = (
            db.supabase.table("email_verify_runs")
            .select("session_id")
            .in_("caller_number", numbers)
            .limit(1000)
            .execute()
        )
        return {r["session_id"] for r in (res.data or []) if r.get("session_id")}
    except Exception as e:
        logger.warning(f"Retention: eval-védett sessionek lekérése sikertelen: {e}")
        return set()


def purge_expired_recordings() -> int:
    """A RECORDINGS_RETENTION_DAYS napnál régebbi, lezárt hívások rögzítéseit
    törli a storage-ból és nullázza a sessions.recording_url-t.

    Sosem dob; a darabszámot adja vissza. Globális futás (service key, tenant-
    filter nélkül) — a retention nem tenant-feladat."""
    if os.getenv("RECORDINGS_ENABLED", "0") != "1":
        return 0
    try:
        import database as db
        try:
            days = int(os.getenv("RECORDINGS_RETENTION_DAYS", "30"))
        except ValueError:
            days = 30
        cutoff = retention_cutoff(datetime.now(timezone.utc), days).isoformat()
        res = (
            db.supabase.table("sessions")
            .select("session_id, recording_url")
            .not_.is_("recording_url", "null")
            .lt("ended_at", cutoff)
            .limit(500)
            .execute()
        )
        rows = res.data or []
        protected = _eval_protected_session_ids()
        purged = 0
        for row in rows:
            if row.get("session_id") in protected:
                continue  # MU-3.4: eval-felvétel megőrzése a replay-hez
            path = row.get("recording_url")
            try:
                db.supabase.storage.from_(RECORDINGS_BUCKET).remove([path])
            except Exception:
                pass  # már törölt/hiányzó object ne blokkolja a sort
            try:
                db.supabase.table("sessions").update({"recording_url": None}).eq(
                    "session_id", row["session_id"]
                ).execute()
                purged += 1
            except Exception as e:
                logger.warning(f"Retention: recording_url nullázása sikertelen ({row.get('session_id')}): {e}")
        if purged:
            logger.info(f"Retention: {purged} lejárt hívásrögzítés törölve (cutoff={cutoff})")
        return purged
    except Exception as e:
        logger.error(f"Retention: lejárt rögzítések törlése sikertelen: {e}")
        return 0
