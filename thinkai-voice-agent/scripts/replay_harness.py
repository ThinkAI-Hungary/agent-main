#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""MU-3.2 — replay: az 50 teszthívás felvételeit lefuttatja az ÚJ (wp-e2)
pipeline-on, és összeveti a baseline (mode=live) verdiktekkel.

KONTÉNERBEN futtandó (a .env és a DB-kezelés ott él):
  python scripts/replay_harness.py \
      --csv tesztlista_50_hivas.csv --date 2026-09-25 \
      --callers A=+36XXXXXXXXX,B=+36YYYYYYYYY
  # egyedi újrafuttatás:
  python scripts/replay_harness.py --session <session_id> --csv ... --callers ...

Működés:
  - párosítás: hívószám + idopont (±5 perc) → legközelebbi baseline
    (mode=live) email_verify_runs sor; kétértelmű/hiányzó → a sor KIMARAD
    (nem találgat);
  - DRY-RUN: email NEM megy ki, clients/calendar_events NEM íródik; csak
    email_verify_runs sor (mode=replay, pipeline_version=wp-e2,
    ground_truth kitöltve) + a baseline sorokba is beírja a ground_truth-t;
  - minden sessionre lefuttatja az audio_qc-t mindkét csatornán;
  - kimenet: soronkénti tábla + baseline vs wp-e2 összesítő.
"""
import argparse
import json
import sys
import tempfile
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd

THIS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(THIS_DIR.parent))
sys.path.insert(0, str(THIS_DIR))  # audio_qc import

import audio_qc  # noqa: E402
import database as db  # noqa: E402
from email_verify_harness import (  # noqa: E402
    canon_email, run_harness_offline,
)

BUDAPEST = ZoneInfo("Europe/Budapest")
MATCH_WINDOW_S = 300  # idopont ±5 perc


def _jsonsafe(obj):
    """numpy/ elemszintű JSON-biztosító az audio_qc metrikákhoz."""
    import numpy as np
    if isinstance(obj, dict):
        return {str(k): _jsonsafe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_jsonsafe(v) for v in obj]
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        return float(obj)
    if isinstance(obj, np.bool_):
        return bool(obj)
    return obj


def load_baseline_runs(caller_numbers, day_start, day_end):
    """A nap baseline (mode=live) sorai az eval hívószámokra."""
    res = (
        db.supabase.table("email_verify_runs")
        .select("session_id,tenant_id,caller_number,created_at,verdict,winner,readings")
        .eq("mode", "live")
        .in_("caller_number", caller_numbers)
        .gte("created_at", day_start)
        .lt("created_at", day_end)
        .order("created_at")
        .limit(500)
        .execute()
    )
    return res.data or []


def match_session(row, baseline_rows, caller_number):
    """idopont ±5 perc → a LEGKÖZELEBBİ baseline sor; kétértelmű → None."""
    target = datetime.combine(row["date_part"], row["idopont"], BUDAPEST) \
        .astimezone(ZoneInfo("UTC"))
    cands = []
    for br in baseline_rows:
        if br.get("caller_number") != caller_number:
            continue
        created = datetime.fromisoformat(br["created_at"].replace("Z", "+00:00"))
        delta = abs((created - target).total_seconds())
        if delta <= MATCH_WINDOW_S:
            cands.append((delta, br))
    if not cands:
        return None, "nincs baseline sor ±5 percen belül"
    cands.sort(key=lambda x: x[0])
    if len(cands) > 1 and cands[1][0] - cands[0][0] < 1.0:
        return None, f"kétértelmű párosítás ({len(cands)} jelölt ±5 percen)"
    return cands[0][1], None


def fetch_turns(session_id):
    """Az élő átirat-turnusok az interactionsból (a reconcile bemenete)."""
    try:
        res = (
            db.supabase.table("interactions")
            .select("transcript_turns")
            .eq("session_id", session_id)
            .not_.is_("transcript_turns", "null")
            .limit(1)
            .execute()
        )
        raw = (res.data or [{}])[0].get("transcript_turns")
        if isinstance(raw, str):
            return json.loads(raw)
        return raw or []
    except Exception:
        return []


def fetch_recording(session_id):
    """A rögzítés letöltése (recording_path, wav_bytes) — vagy (None, ok)."""
    try:
        res = (
            db.supabase.table("sessions")
            .select("recording_url")
            .eq("session_id", session_id)
            .limit(1)
            .execute()
        )
        path = (res.data or [{}])[0].get("recording_url")
        if not path:
            return None, None
        data = db.supabase.storage.from_("recordings").download(path)
        if not data or isinstance(data, dict):
            return None, None
        return path, data
    except Exception:
        return None, None


def run_audio_qc(wav_bytes):
    """audio_qc mindkét csatornán (JSON-biztos metrikák + értékelés)."""
    out = {}
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tf:
        tf.write(wav_bytes)
        tmp = tf.name
    try:
        for ch in (0, 1):
            try:
                m = audio_qc.analyze(tmp, channel=ch)
                issues = audio_qc.evaluate(m)
                out[f"ch{ch}"] = {
                    "verdict": m.get("verdict"),
                    "issues": [[s, msg] for s, msg in issues],
                    "gaps_per_min": m.get("gaps_per_min"),
                    "snr_db_est": m.get("snr_db_est"),
                    "rolloff99_hz": m.get("rolloff99_hz"),
                    "speech_ratio": m.get("speech_ratio"),
                }
            except Exception as exc:
                out[f"ch{ch}"] = {"verdict": "HIBA", "issues": [["hiba", str(exc)]]}
    finally:
        Path(tmp).unlink(missing_ok=True)
    return out


def replay_session(session_id, baseline_row, gt_email, booking_email):
    """Egy session lefuttatása az ÚJ pipeline-on (nulla mellékhatás) + sorok írása.
    Vissza: (verdict, audio_qc, hiba)"""
    path, wav_bytes = fetch_recording(session_id)
    if not wav_bytes:
        return None, None, "nincs rögzítés a bucketben"
    turns = fetch_turns(session_id)
    verdict = run_harness_offline(
        session_id, wav_bytes, turns=turns,
        booking_email=booking_email or "", booking_name="",
        tenant_id=baseline_row.get("tenant_id") if baseline_row else None,
    )
    audit = verdict.get("audit") or {}
    qc = run_audio_qc(wav_bytes)
    db.log_email_verify_run(
        session_id,
        tenant_id=baseline_row.get("tenant_id") if baseline_row else None,
        caller_number=(baseline_row or {}).get("caller_number", ""),
        mode="replay", pipeline_version="wp-e2",
        readings=audit.get("readings"), gate=audit.get("gate"),
        audio_detail=audit.get("audio_detail"), timings_ms=audit.get("timings_ms"),
        winner=(verdict.get("email") or {}).get("winner", ""),
        verdict=verdict.get("status", "error"),
        audio_qc=_jsonsafe(qc), ground_truth=gt_email,
    )
    if gt_email:
        db.set_email_verify_run_ground_truth(session_id, gt_email)
    return verdict, qc, None


def aggregate(results):
    """Baseline vs wp-e2 összesítő."""
    n = len(results)
    if not n:
        print("Nincs kiértékelhető sor.")
        return

    def canon(row, key):
        return row.get(key) or None

    print("\n══ SORONKÉNT ══")
    print(f"{'hivo':4} {'sz':3} {'ground_truth':38} | {'live':1} {'stt':1} {'aud':1} "
          f"| {'baseline':10} | {'wp-e2 verdikt':13} {'gate.reason':24} {'winner ok':9}")
    for r in results:
        rd = r["readings"] or {}
        m = lambda k: "✓" if (rd.get(k) and r.get("gt_canon")
                              and rd[k] == r["gt_canon"]) else "✗"
        b_ok = ("✓" if r["baseline_winner_ok"]
                else ("·" if r["baseline_verdict"] != "green" and r["baseline_candidate_ok"] else "✗"))
        w_ok = ("✓" if r["wpe2_winner_ok"]
                else ("·" if r["wpe2_verdict"] != "green" and r["wpe2_candidate_ok"] else "✗"))
        print(f"{r['hivo']:4} {r['sorszam']:<3} {r['diktalt_email'][:38]:38} "
              f"| {m('live'):1} {m('stt'):1} {m('audio'):1} "
              f"| {r['baseline_verdict'] or '-':10} | {r['wpe2_verdict'] or '-':13} "
              f"{(r['gate_reason'] or '-'):24} {w_ok:9} (b: {b_ok})")

    def block(name, rows):
        if not rows:
            return
        greens = [r for r in rows if r["wpe2_verdict"] == "green"]
        wrong = [r for r in greens if not r["wpe2_winner_ok"]]
        bgreens = [r for r in rows if r["baseline_verdict"] == "green"]
        bwrong = [r for r in bgreens if not r["baseline_winner_ok"]]
        print(f"  {name:28} n={len(rows):3} | zöld arány {len(greens)/len(rows):5.0%} "
              f"| rossz zöld: {len(wrong)} (baseline: {len(bwrong)}/{len(bgreens)})")

    print("\n══ ÖSSZESÍTÉS: baseline vs wp-e2 ══")
    greens = [r for r in results if r["wpe2_verdict"] == "green"]
    green_prec = (sum(1 for r in greens if r["wpe2_winner_ok"]) / len(greens)) if greens else None
    for src in ("live", "stt", "audio", "stt_regex", "reconcile"):
        hits = sum(1 for r in results
                   if (r["readings"] or {}).get(src) and r["gt_canon"]
                   and r["readings"][src] == r["gt_canon"])
        present = sum(1 for r in results if (r["readings"] or {}).get(src))
        if present:
            print(f"  forrás {src:12} pontosság a ground truth-hoz: {hits}/{present}")
    if green_prec is not None:
        print(f"  wp-e2 ZÖLD PRECIZITÁS: {green_prec:.0%} "
              f"({len(greens)} zöld — cél: 100%)")
    ng = [r for r in results if r["wpe2_verdict"] != "green"]
    ng_ok = sum(1 for r in ng if r["wpe2_candidate_ok"])
    if ng:
        print(f"  nem-zöld jelölt pontossága: {ng_ok}/{len(ng)} (az opt-in jó címre ment volna)")
    print("\n  Bontás:")
    for key in ("tipus", "stilus", "kornyezet"):
        by = {}
        for r in results:
            by.setdefault(r.get(key) or "-", []).append(r)
        for val, rows in sorted(by.items()):
            block(f"{key}={val}", rows)
    by_qc = {}
    for r in results:
        v = ((r.get("audio_qc") or {}).get("ch0") or {}).get("verdict") or "-"
        by_qc.setdefault(v, []).append(r)
    for val, rows in sorted(by_qc.items()):
        block(f"audio_qc ch0={val}", rows)
    print("\n  ⚠ ÉRTELMEZÉSI KORLÁT: 50 hívás a hibamintázatok feltárására elég, "
          "a biztonság bizonyítására nem. Ha nincs egyetlen rossz zöld sem, az "
          "95%-os szinten csak annyit jelent, hogy a rossz-zöld arány ~6% alatt "
          "van (3/n szabály). Az autonóm zöld élesítéséhez nagyobb szet kell.")


def main():
    ap = argparse.ArgumentParser(description="WP-E2 MU-3.2 replay")
    ap.add_argument("--csv", default="tesztlista_50_hivas.csv")
    ap.add_argument("--date", help="YYYY-MM-DD — a tesztnap (Budapesti)")
    ap.add_argument("--callers", help="pl. A=+36...,B=+36...")
    ap.add_argument("--session", help="egyedi session replay (CSV-párosítás nélkül)")
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    callers = {}
    if args.callers:
        for part in args.callers.split(","):
            k, _, v = part.partition("=")
            callers[k.strip()] = v.strip()

    results = []
    if args.session:
        row = {"hivo": "?", "sorszam": 0, "diktalt_email": "", "tipus": "-",
               "stilus": "-", "kornyezet": "-", "date_part": None,
               "idopont": datetime.now(BUDAPEST).time()}
        verdict, _qc, err = replay_session(args.session, {}, "", "")
        print(f"{args.session}: {err or verdict.get('status')}")
        return

    df = pd.read_csv(args.csv, sep=";", encoding="utf-8-sig", dtype=str).fillna("")
    df["date_part"] = datetime.strptime(args.date, "%Y-%m-%d").date()
    df["idopont"] = df["idopont"].apply(
        lambda s: datetime.strptime(s.strip(), "%H:%M").time() if s.strip() else None)

    day_start = datetime.combine(df["date_part"].iloc[0],
                                 datetime.min.time(), BUDAPEST).astimezone(ZoneInfo("UTC")).isoformat()
    day_end = (datetime.combine(df["date_part"].iloc[0], datetime.min.time(), BUDAPEST)
               + timedelta(days=1)).astimezone(ZoneInfo("UTC")).isoformat()
    baseline_rows = load_baseline_runs(list(callers.values()), day_start, day_end)
    print(f"Baseline sorok a napon: {len(baseline_rows)}")

    used = set()
    for _, row in df.iterrows():
        if args.limit and len(results) >= args.limit:
            break
        status = (row.get("statusz") or "").strip().lower()
        if status and status != "ok":
            continue
        if not row.get("idopont"):
            continue
        caller = callers.get((row.get("hivo") or "").strip())
        if not caller:
            continue
        br, err = match_session(row, baseline_rows, caller)
        if br is None:
            print(f"⚠ {row['hivo']}#{row['sorszam']}: kihagyva — {err}")
            continue
        if br["session_id"] in used:
            print(f"⚠ {row['hivo']}#{row['sorszam']}: kihagyva — session már felhasználva")
            continue
        used.add(br["session_id"])
        gt = (row.get("diktalt_email") or "").strip()
        booking_email = ((br.get("readings") or {}).get("live") or "")
        verdict, qc, err = replay_session(br["session_id"], br, gt, booking_email)
        if err:
            print(f"⚠ {row['hivo']}#{row['sorszam']}: kihagyva — {err}")
            continue
        audit = verdict.get("audit") or {}
        results.append({
            "hivo": row["hivo"], "sorszam": row["sorszam"],
            "diktalt_email": gt, "gt_canon": canon_email(gt),
            "tipus": row.get("tipus"), "stilus": row.get("stilus"),
            "kornyezet": row.get("kornyezet"),
            "readings": audit.get("readings") or {},
            "gate_reason": (audit.get("gate") or {}).get("reason"),
            "wpe2_verdict": verdict.get("status"),
            "wpe2_winner_ok": (verdict.get("status") == "green"
                               and canon_email((verdict.get("email") or {}).get("winner"))
                               == canon_email(gt)),
            "wpe2_candidate_ok": canon_email((verdict.get("email") or {}).get("winner"))
                == canon_email(gt),
            "baseline_verdict": br.get("verdict"),
            "baseline_winner_ok": (br.get("verdict") == "green"
                                   and canon_email(br.get("winner") or "") == canon_email(gt)),
            "baseline_candidate_ok": canon_email(br.get("winner") or "") == canon_email(gt),
            "audio_qc": qc,
        })

    aggregate(results)


if __name__ == "__main__":
    main()
