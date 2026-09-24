#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""WP-E2 recovery: azokat a teszthívásokat, amelyek a worker-kill incidens
előtt készültek (nincs baseline futás-soruk), UTÓLAG lefuttatja az wp-e2
pipeline-on (run_harness_offline — nulla mellékhatás) és replay-sort ír
ground_truth-val. Konténerben futtandó."""
import argparse
import re
import sys
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

THIS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(THIS_DIR.parent))
sys.path.insert(0, str(THIS_DIR))

import pandas as pd  # noqa: E402

import database as db  # noqa: E402
from replay_harness import (  # noqa: E402
    BUDAPEST, _jsonsafe, fetch_recording, fetch_turns, run_audio_qc,
)
from email_verify_harness import canon_email, run_harness_offline  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default="tesztlista_50_hivas.csv")
    ap.add_argument("--callers", required=True, help="A=+36...,B=+36...")
    ap.add_argument("--hours", type=int, default=6, help="visszatekintő ablak")
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    num_to_letter = {}
    for part in args.callers.split(","):
        k, _, v = part.partition("=")
        num_to_letter[v.strip()] = k.strip()

    df = pd.read_csv(args.csv, sep=";", encoding="utf-8-sig", dtype=str).fillna("")

    since = (datetime.now(ZoneInfo("UTC")) - timedelta(hours=args.hours)) \
        .isoformat()
    res = (
        db.supabase.table("sessions")
        .select("session_id,room_name,started_at")
        .not_.is_("recording_url", "null")
        .gte("started_at", since)
        .order("started_at")
        .limit(100)
        .execute()
    )
    sessions = res.data or []
    print(f"Felvétellel rendelkező sessionek az elmúlt {args.hours} órában: {len(sessions)}")

    used = set()
    done = 0
    for s in sessions:
        room = s.get("room_name") or ""
        m = re.search(r"\+(\d{8,15})", room)
        if not m:
            continue
        number = "+" + m.group(1)
        letter = num_to_letter.get(number)
        if not letter:
            continue
        started = datetime.fromisoformat(s["started_at"].replace("Z", "+00:00")) \
            .astimezone(BUDAPEST)
        # CSV-párosítás: ugyanaz a hívó, idopont ±5 perc
        match, best = None, 10 ** 9
        for _, row in df.iterrows():
            if (row.get("hivo") or "").strip() != letter:
                continue
            if not (row.get("idopont") or "").strip():
                continue
            t = datetime.strptime(row["idopont"].strip(), "%H:%M").time()
            delta = abs((datetime.combine(started.date(), t, BUDAPEST) - started).total_seconds())
            if delta <= 300 and delta < best and row["sorszam"] not in used:
                best, match = delta, row
        gt = (match.get("diktalt_email") or "").strip() if match is not None else ""
        label = f"{letter}#{match['sorszam']}" if match is not None else f"{letter}(párosítás nélkül)"
        if match is not None:
            used.add(match["sorszam"])

        path, wav = fetch_recording(s["session_id"])
        if not wav:
            print(f"⚠ {label} ({s['session_id'][:14]}): nincs rögzítés")
            continue
        turns = fetch_turns(s["session_id"])
        verdict = run_harness_offline(s["session_id"], wav, turns=turns,
                                      booking_email="", booking_name="")
        audit = verdict.get("audit") or {}
        qc = run_audio_qc(wav)
        db.log_email_verify_run(
            s["session_id"], mode="replay", pipeline_version="wp-e2",
            readings=audit.get("readings"), gate=audit.get("gate"),
            audio_detail=audit.get("audio_detail"),
            timings_ms=audit.get("timings_ms"),
            winner=(verdict.get("email") or {}).get("winner", ""),
            verdict=verdict.get("status", "error"),
            audio_qc=_jsonsafe(qc), ground_truth=gt or None,
        )
        rd = audit.get("readings") or {}
        reason = (audit.get("gate") or {}).get("reason")
        tick = lambda v: "✓" if (v and gt and canon_email(v) == canon_email(gt)) else "✗"
        print(f"{label:12} GT={gt[:36]:36} | live={tick(rd.get('live'))} "
              f"stt={tick(rd.get('stt'))} audio={tick(rd.get('audio'))} "
              f"| {verdict.get('status'):10} {reason}")
        done += 1
        if args.limit and done >= args.limit:
            break
    print(f"\nKész: {done} hívás újrafuttatva (mode=replay, pipeline_version=wp-e2).")


if __name__ == "__main__":
    main()
