#!/usr/bin/env python3
"""
audio_qc.py — referencia nélküli hangminőség-ellenőrzés STT-alkalmassághoz.

Használat:
    python audio_qc.py call.wav                 # 0. csatorna (nálatok: hívó = BAL)
    python audio_qc.py call.wav --channel 1     # agent
    python audio_qc.py call.wav --json          # gépi feldolgozáshoz

Függőség: csak numpy (a WAV-ot a stdlib `wave` olvassa, 16 bites PCM).
Kilépési kód: 0 = OK, 1 = HATÁRESET, 2 = ROSSZ  → CI-ban / batch-ben szűrhető.

A küszöbök kiinduló értékek. Kalibráljátok a saját hívásaitokon:
nézzétek meg, mely metrikák különböztetik meg a jól és rosszul átírt hívásokat.
"""
import argparse
import hashlib
import json
import sys
import wave

import numpy as np

FRAME_MS = 20

# (figyelmeztetés, hiba) küszöbök
TH = {
    "speech_level_low_dbfs": (-30.0, -40.0),   # aktív beszédszint alatta
    "speech_level_high_dbfs": -3.0,            # felette közel a clippinghez
    "clip_ratio": (0.001, 0.01),               # levágott minták aránya
    "snr_db": (20.0, 10.0),                    # becsült SNR alatta
    "gaps_per_min": (2.0, 10.0),               # digitális nullás rések beszéd közben
    "dup_frame_ratio": (0.005, 0.02),          # ismétlődő 20 ms-os blokkok aránya
    "clicks_per_min": (5.0, 20.0),             # hirtelen ugrások (szakadás, illesztési hiba)
    "speech_ratio_min": 0.05,                  # ennél kevesebb beszéd → nincs mit elemezni
    "narrowband_rolloff_hz": 4000.0,           # 99% energia ez alatt → szűksáv (info)
}


def load_wav(path, channel):
    with wave.open(path, "rb") as w:
        sr, ch, sw, n = w.getframerate(), w.getnchannels(), w.getsampwidth(), w.getnframes()
        raw = w.readframes(n)
    if sw != 2:
        raise SystemExit(f"Csak 16 bites PCM támogatott (ez: {sw * 8} bit)")
    x = np.frombuffer(raw, dtype="<i2").reshape(-1, ch)
    if channel >= ch:
        raise SystemExit(f"Nincs {channel}. csatorna (összesen {ch})")
    pcm = x[:, channel].copy()
    return pcm, pcm.astype(np.float64) / 32768.0, sr, ch


def frame_view(x, flen):
    n = len(x) // flen
    return x[: n * flen].reshape(n, flen)


def db(p):
    return 10 * np.log10(np.maximum(p, 1e-12))


def runs(mask):
    """True-szakaszok (start, hossz) listája egy bool tömbben."""
    if not mask.any():
        return []
    d = np.diff(np.concatenate(([0], mask.astype(np.int8), [0])))
    starts, ends = np.where(d == 1)[0], np.where(d == -1)[0]
    return list(zip(starts, ends - starts))


def analyze(path, channel=0):
    pcm, x, sr, nch = load_wav(path, channel)
    dur = len(x) / sr
    flen = int(sr * FRAME_MS / 1000)
    fr = frame_view(x, flen)
    fr_pcm = frame_view(pcm, flen)
    pwr = (fr ** 2).mean(axis=1)
    lvl = db(pwr)

    # --- beszéd / zaj szétválasztása (egyszerű energia-VAD) ---
    digital_zero = pwr == 0
    live = lvl[~digital_zero]
    if len(live) == 0:
        return {"file": path, "verdict": "ROSSZ", "issues": [("hiba", "A csatorna teljesen néma")]}
    p10, p95 = np.percentile(live, 10), np.percentile(live, 95)
    thr = p10 + max(6.0, 0.4 * (p95 - p10))
    speech = (~digital_zero) & (lvl > thr)
    speech_ratio = speech.mean()
    speech_sec = speech.sum() * FRAME_MS / 1000

    speech_level = db(pwr[speech].mean()) if speech.any() else None
    noise_frames = (~digital_zero) & (~speech)
    noise_floor = db(pwr[noise_frames].mean()) if noise_frames.sum() >= 10 else None
    snr = (speech_level - noise_floor) if (speech_level is not None and noise_floor is not None) else None

    # --- sávszélesség a beszédkereteken ---
    rolloff99 = hf_above_4k_db = None
    if speech.sum() >= 5:
        nfft = 512
        spec = np.zeros(nfft // 2 + 1)
        win = np.hanning(nfft)
        idx = np.where(speech)[0]
        for i in idx:
            seg = x[i * flen: i * flen + nfft]
            if len(seg) < nfft:
                continue
            spec += np.abs(np.fft.rfft(seg * win)) ** 2
        freqs = np.fft.rfftfreq(nfft, 1 / sr)
        cum = np.cumsum(spec) / max(spec.sum(), 1e-20)
        rolloff99 = float(freqs[np.searchsorted(cum, 0.99)])
        hf = spec[freqs >= 4000].sum()
        hf_above_4k_db = float(db(hf / max(spec.sum(), 1e-20))) if sr > 8000 else None

    # --- clipping ---
    clip_ratio = float((np.abs(pcm.astype(np.int32)) >= 32700).mean())

    # --- digitális nullás rések BESZÉD KÖZBEN (rögzítő csendkitöltés, csomagvesztés) ---
    min_gap = int(sr * 0.010)
    ctx = int(0.15 * 1000 / FRAME_MS)  # 150 ms környezet
    gaps = []
    for start, length in runs(pcm == 0):
        if length < min_gap:
            continue
        f0, f1 = start // flen, (start + length) // flen
        before = speech[max(0, f0 - ctx): f0].any()
        after = speech[f1 + 1: f1 + 1 + ctx].any()
        if before and after:
            gaps.append(length / sr * 1000)
    gaps_per_min = len(gaps) / (dur / 60) if dur else 0

    # --- ismétlődő 20 ms-os blokkok (frame-duplikáció) ---
    seen, dups, checked = set(), 0, 0
    for i in np.where(speech)[0]:
        h = hashlib.md5(fr_pcm[i].tobytes()).digest()
        checked += 1
        if h in seen:
            dups += 1
        seen.add(h)
    dup_ratio = dups / checked if checked else 0.0

    # --- kattanások: minta-ugrás jóval a lokális szint felett ---
    d = np.abs(np.diff(x))
    local_rms = np.repeat(np.sqrt(pwr), flen)[: len(d)]
    local_rms = np.pad(local_rms, (0, len(d) - len(local_rms)), mode="edge")
    click_mask = (d > 0.25) & (d > 8 * np.maximum(local_rms, 1e-4))
    clicks = len(runs(click_mask))
    clicks_per_min = clicks / (dur / 60) if dur else 0

    m = {
        "file": path,
        "sample_rate": sr,
        "channels": nch,
        "analyzed_channel": channel,
        "duration_s": round(dur, 2),
        "speech_s": round(speech_sec, 2),
        "speech_ratio": round(float(speech_ratio), 3),
        "speech_level_dbfs": None if speech_level is None else round(float(speech_level), 1),
        "noise_floor_dbfs": None if noise_floor is None else round(float(noise_floor), 1),
        "snr_db_est": None if snr is None else round(float(snr), 1),
        "digital_silence_ratio": round(float(digital_zero.mean()), 3),
        "rolloff99_hz": rolloff99,
        "energy_above_4k_db": None if hf_above_4k_db is None else round(hf_above_4k_db, 1),
        "clip_ratio": round(clip_ratio, 5),
        "gaps_in_speech": len(gaps),
        "gaps_per_min": round(gaps_per_min, 2),
        "gap_ms_median": round(float(np.median(gaps)), 1) if gaps else None,
        "dup_frame_ratio": round(dup_ratio, 4),
        "clicks_per_min": round(clicks_per_min, 2),
        "dc_offset": round(float(x.mean()), 5),
    }
    m["issues"] = evaluate(m)
    sev = {s for s, _ in m["issues"]}
    m["verdict"] = "ROSSZ" if "hiba" in sev else ("HATÁRESET" if "figyelm" in sev else "OK")
    return m


def evaluate(m):
    out = []

    def chk(val, key, msg, higher_is_bad=True):
        if val is None:
            return
        warn, err = TH[key]
        bad = (lambda v, t: v > t) if higher_is_bad else (lambda v, t: v < t)
        if bad(val, err):
            out.append(("hiba", msg.format(val)))
        elif bad(val, warn):
            out.append(("figyelm", msg.format(val)))

    if m["speech_ratio"] < TH["speech_ratio_min"]:
        out.append(("hiba", f"Alig van beszéd ({m['speech_ratio']:.1%})"))
    chk(m["speech_level_dbfs"], "speech_level_low_dbfs", "Halk beszéd: {:.1f} dBFS", higher_is_bad=False)
    if m["speech_level_dbfs"] is not None and m["speech_level_dbfs"] > TH["speech_level_high_dbfs"]:
        out.append(("figyelm", f"Túl hangos: {m['speech_level_dbfs']:.1f} dBFS"))
    chk(m["clip_ratio"], "clip_ratio", "Clipping: {:.2%} minta levágva")
    chk(m["snr_db_est"], "snr_db", "Alacsony SNR: {:.1f} dB", higher_is_bad=False)
    chk(m["gaps_per_min"], "gaps_per_min", "Digitális rések beszéd közben: {:.1f}/perc (rögzítő vagy csomagvesztés)")
    chk(m["dup_frame_ratio"], "dup_frame_ratio", "Ismétlődő frame-ek: {:.2%}")
    chk(m["clicks_per_min"], "clicks_per_min", "Kattanások: {:.1f}/perc")
    if m["rolloff99_hz"] is not None and m["rolloff99_hz"] < TH["narrowband_rolloff_hz"]:
        out.append(("info", f"Szűksávú forrás (99% energia {m['rolloff99_hz']:.0f} Hz alatt) — telefonon normális"))
    if m["snr_db_est"] is None:
        out.append(("info", "Zajpadló nem mérhető (a szünetek digitális csendek — DTX vagy csendkitöltés)"))
    if abs(m["dc_offset"]) > 0.01:
        out.append(("figyelm", f"DC offset: {m['dc_offset']:.3f}"))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("wav")
    ap.add_argument("--channel", type=int, default=0)
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    m = analyze(a.wav, a.channel)
    if a.json:
        print(json.dumps(m, ensure_ascii=False, indent=2))
    else:
        print(f"\n{m['file']} [csatorna {m['analyzed_channel']}] → {m['verdict']}\n")
        for k, v in m.items():
            if k not in ("file", "issues", "verdict", "analyzed_channel"):
                print(f"  {k:24s} {v}")
        print()
        for sev, msg in m["issues"] or [("ok", "Nincs talált probléma")]:
            print(f"  [{sev}] {msg}")
        print()
    sys.exit({"OK": 0, "HATÁRESET": 1, "ROSSZ": 2}[m["verdict"]])


if __name__ == "__main__":
    main()
