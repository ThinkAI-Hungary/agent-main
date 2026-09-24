#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""WP-E2/E3 — eval-izoláció-ellenőr: a teszthívások után bizonyítja, hogy a
sessionök/ügyfelek NEM csúsztak össze (se tool callból, se máshonnan).

Konténerben futtandó:
  python scripts/check_eval_isolation.py --hours 8
  python scripts/check_eval_isolation.py --callers +36709436426,+36706369528

Ellenőrzések:
  1. minden hívás-sessionhez pontosan EGY ügyfél kapcsolódik;
  2. egy ügyfél NE jelenjen meg több hívás-session interakcióiban (a
     telefon-alapú összefésülés tiltólistás az eval számokon);
  3. két ügyfél NE használja ugyanazt az emailt (utolsó hívás felülírás);
  4. a sessionben született naptáreventek attendee_email-je egyezzen az
     ügyfél emailjével (a foglalás nem egy MÁSIK hívás címére íródott);
  5. futás-sor (email_verify_runs) legyen minden sessionhez.
Minden találat: ✗ sor + a végén összesítés; 0 találat → PASS."""
import argparse
import sys
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

THIS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(THIS_DIR.parent))

import database as db  # noqa: E402

BUDAPEST = ZoneInfo("Europe/Budapest")


def _q(table, select, filters):
    q = db.supabase.table(table).select(select)
    for col, op, val in filters:
        q = getattr(q, op)(col, val)
    return q.limit(500).execute().data or []


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--hours", type=int, default=12)
    ap.add_argument("--callers", default="", help="vesszőlista — csak ezekre szűr")
    args = ap.parse_args()

    since = (datetime.now(ZoneInfo("UTC")) - timedelta(hours=args.hours)).isoformat()
    callers = [c.strip() for c in args.callers.split(",") if c.strip()]

    sessions = _q("sessions", "session_id,room_name,started_at,ended_at",
                  [("started_at", "gte", since), ("room_name", "like", "call-%")])
    if callers:
        sessions = [s for s in sessions
                    if any(c in (s.get("room_name") or "") for c in callers)]
    print(f"Hívás-sessionek az elmúlt {args.hours} órában: {len(sessions)}")
    if not sessions:
        print("Nincs mit ellenőrizni.")
        return

    problems = []
    sess_ids = [s["session_id"] for s in sessions]

    inter = _q("interactions", "session_id,client_id,created_at",
               [("created_at", "gte", since)])
    by_session = {}
    for i in inter:
        if i.get("session_id") in sess_ids and i.get("client_id"):
            by_session.setdefault(i["session_id"], set()).add(i["client_id"])

    events = _q("calendar_events",
                "id,title,attendee,attendee_email,created_at",
                [("created_at", "gte", since)])
    client_emails = {}
    for s in sessions:
        sid = s["session_id"]
        label = (s.get("room_name") or "")[7:27]
        cids = by_session.get(sid, set())
        # 1) session ↔ pontosan egy ügyfél
        if len(cids) > 1:
            problems.append(f"{label}: TÖBB ÜGYFÉL kapcsolódik a sessionhöz: {sorted(cids)}")
        elif not cids:
            problems.append(f"{label}: nincs ügyfélhoz kötött interakció")
        # 2) ügyfél csak egy sessionben
        for cid in cids:
            sess_of_client = {i["session_id"] for i in inter
                              if i.get("client_id") == cid and i.get("session_id") in sess_ids}
            if len(sess_of_client) > 1:
                problems.append(f"{label}: ügyfél {cid} TÖBB sessionben jelenik meg: {sorted(sess_of_client)}")
        # 3-4) események: csak a SAJÁT [started_at, ended_at] ablakában született
        # események tartoznak ehhez a híváshoz (a többi session eseménye nem)
        try:
            win_start = datetime.fromisoformat((s.get("started_at") or "").replace("Z", "+00:00"))
            win_end_raw = s.get("ended_at") or ""
            win_end = (datetime.fromisoformat(win_end_raw.replace("Z", "+00:00"))
                       if win_end_raw else win_start + timedelta(hours=1))
        except Exception:
            win_start = win_end = None
        own_events = []
        for ev in events:
            try:
                ev_t = datetime.fromisoformat((ev.get("created_at") or "").replace("Z", "+00:00"))
            except Exception:
                continue
            if win_start and win_start <= ev_t <= win_end:
                own_events.append(ev)
        first_cid = sorted(cids)[0] if cids else None
        client_row = None
        if first_cid is not None:
            rows = _q("clients", "id,email", [("id", "eq", first_cid)])
            client_row = rows[0] if rows else None
        for ev in own_events:
            cmail = (client_row or {}).get("email") or ""
            evmail = (ev.get("attendee_email") or "")
            if cmail and evmail and cmail != evmail:
                problems.append(f"{label}: esemény #{ev['id']} emailje ({evmail}) "
                                f"≠ az ügyfél emailje ({cmail}) — kereszt-írás!")
            if evmail:
                client_emails.setdefault(evmail, []).append(label)
        # 5) futás-sor
        runs = _q("email_verify_runs", "session_id", [("session_id", "eq", sid)])
        if not runs:
            problems.append(f"{label}: nincs email_verify_runs sor")

    # 3) ugyanaz az email két hívásban
    for mail, labels in client_emails.items():
        if len(labels) > 1:
            problems.append(f"AZONOS EMAIL több hívásban: {mail} → {labels}")

    if problems:
        print(f"\n══ {len(problems)} PROBLÉMA ══")
        for p in problems:
            print(f"  ✗ {p}")
        sys.exit(1)
    print("\n✅ IZOLÁCIÓ PASSZ — session/ügyfél/esemény/futás-sor minden hívásnál különálló.")


if __name__ == "__main__":
    main()
