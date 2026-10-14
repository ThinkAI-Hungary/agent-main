# -*- coding: utf-8 -*-
"""Hívás utáni transzkript-véglegesítés (2026-10-08, user-spec).

Két valós idejű Gemini Live gyengeség javítása:
1. Pontatlan beszédfelismerés → a hívó CSATORNÁJÁT (a sztereó WAV BAL fele)
   köteges, magyarra hangolt STT-lépés írja újra. Az agent szövege a modell
   SAJÁT kimenete — pontos, újraírás nem kell rá.
2. Buborék-sorrend → a merge a meglévő start_s horgonyok szerint rendez; a
   hívó-szeletek a hívócsatorna (BAL) idővonalából készülnek — ugyanarról
   az időalapról, mint a start_s-ek, tehát az illesztés determinisztikus.

Fail-open: bármilyen hibánál a prototípus-transzkript marad. A kontextus
(magyar szókincs-hint) TENANT-SAJÁT és iparágfüggetlen: céginfó
(szakterület/kulcsszavak/cégnév), szolgáltatásnevek, kampányscript —
semmi iparági hardcode.
"""

import io
import sys
import wave


def split_stereo_to_caller(wav_bytes: bytes) -> tuple[bytes, int]:
    """Sztereó 16-bit WAV → (BAL csatorna PCM, sample_rate). Mono → self."""
    inp = wave.open(io.BytesIO(wav_bytes), "rb")
    n_channels = inp.getnchannels()
    sample_rate = inp.getframerate()
    frames = inp.readframes(inp.getnframes())
    width = inp.getsampwidth()
    inp.close()
    if width != 2:
        raise ValueError(f"Csak 16-bit PCM támogatott (sampwidth={width})")
    if n_channels <= 1:
        return frames, sample_rate
    import array
    samples = array.array("h")
    samples.frombytes(frames)
    if sys.byteorder == "big":
        samples.byteswap()
    return samples[0::2].tobytes(), sample_rate


def _pcm_to_wav(pcm: bytes, sample_rate: int) -> bytes:
    buf = io.BytesIO()
    w = wave.open(buf, "wb")
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(sample_rate)
    w.writeframes(pcm)
    w.close()
    return buf.getvalue()


def slice_caller_pcm(left_pcm: bytes, sample_rate: int,
                     caller_starts: list[float]) -> list[dict]:
    """A hívó turnus-start horgonyok mentén szeletek a BAL csatornából.

    Szelet = [start_s, következő hívó-start) — < 0.3 s szeletek kihagyva.
    Vissza: [{'start_s': float, 'wav': bytes}] — mono WAV-konténerben.
    Az utolsó szelet a PCM végéig tart (a hívó utolsó megszólalása a hívás
    végéig értendő).
    """
    out = []
    bytes_per_s = max(1, sample_rate * 2)
    total_bytes = len(left_pcm)
    total_s = total_bytes / bytes_per_s
    starts = sorted(round(float(s), 2) for s in caller_starts if s is not None)
    for i, start in enumerate(starts):
        a = int(max(0.0, start) * bytes_per_s)
        end_s = starts[i + 1] if i + 1 < len(starts) else total_s
        b = int(min(max(0.0, end_s), total_s) * bytes_per_s)
        a = max(0, min(a, total_bytes))
        b = max(a, min(b, total_bytes))
        if b - a < int(0.3 * bytes_per_s):
            continue
        out.append({"start_s": start, "wav": _pcm_to_wav(left_pcm[a:b], sample_rate)})
    return out


def build_final_turns(turns: list[dict], retranscribed: dict[float, str]) -> list[dict]:
    """Merge: agent turnusok változatlanul (a modell pontos szövege), hívó
    turnusok a végleges átírással (ahol kész). Minden turn 'final': true."""
    out = []
    for t in turns:
        tt = dict(t)
        try:
            key = round(float(tt.get("start_s") or -1), 2)
        except (TypeError, ValueError):
            key = -1
        if str(tt.get("role")) == "user" and key in retranscribed and retranscribed[key].strip():
            tt["text"] = retranscribed[key]
        tt["final"] = True
        out.append(tt)
    return out


def transcribe_slice(gemini_client, wav_bytes: bytes, context_text: str,
                     provisional_hint: str = "") -> str:
    """Egy hívó-csatorna szelet átírása Gemini 2.5 Flash-sel."""
    """Egy hívó-csatorna szelet átírása Gemini 2.5 Flash-sel.

    Szabály a promptban (user-spec): csak a hanganyag tartalma; nyilvánvaló
    felismerési/nyelvtani hiba javítható; ÚJ tartalom soha."""
    from google.genai import types

    hint = ""
    if provisional_hint:
        hint = ("\nTájékoztatóul — egy valós idejű felismerés így értelmezte ugyanezt "
                f"a részt (hiba lehetséges, csak ellenőrzésre): {provisional_hint}")
    prompt = (
        "Ez egy magyar nyelvű telefonhívás EGY résztvevőjének (a hívónak) a "
        "hangcsatornája. "
        + (f"{context_text}\n" if context_text else "")
        + "Feladat: írd át pontosan magyarul, mi hangzott el ebben a hangrészletben.\n"
        "Szabályok:\n"
        "- Csak a hanganyagban elhangzó tartalmat írd át.\n"
        "- Nyilvánvaló felismerési és nyelvtani hibákat javíthatsz (helyesírás, "
        "szóhasználat); ÚJ tartalmat, választ vagy kérdést NE adj hozzá, és a "
        "tartalmat NE kommentáld.\n"
        "- Ha nem érthető, írd: [nem érthető]."
        + hint
    )
    resp = gemini_client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[
            types.Part.from_bytes(data=wav_bytes, mime_type="audio/wav"),
            prompt,
        ],
        config=types.GenerateContentConfig(temperature=0.0),
    )
    return (resp.text or "").strip()


async def refine_caller_transcript(session_id: str, tenant_id: str | None,
                                   recording_path: str, turns: list[dict],
                                   campaign_script: str = "",
                                   client_name: str = "") -> dict:
    """Teljes folyamat: WAV letöltés → hívó-csatorna szeletek a turnus-határokon →
    szeletenkénti magyar STT (tenant-kontextussal) → merge → transcript_turns update.

    Fail-open: minden hibánál a prototípus-transzkript marad. A kontextus
    TENANT-SAJÁT (céginfó + szolgáltatások + kampányscript) — iparágfüggetlen.
    """
    import os
    import asyncio

    if (os.getenv("CALLER_TRANSCRIBE_FINAL", "1") or "1") != "1":
        return {"status": "disabled"}

    import database as db
    from google import genai as google_genai
    from google.genai import types

    if not recording_path or not turns:
        return {"status": "skipped", "reason": "no recording or turns"}

    try:
        db.set_current_tenant(tenant_id)

        api_key = None
        try:
            api_key = db.get_credential(tenant_id or "", "gemini_api_key", default=None)
        except Exception:
            pass
        api_key = api_key or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        if not api_key:
            return {"status": "error", "reason": "no gemini key"}
        gemini_client = google_genai.Client(api_key=api_key)

        # Kontextus: tenant-saját céginfó + szolgáltatásnevek (+ kampányscript)
        context_text = build_context_text(
            db.get_business_info() or {},
            [s.get("service_name") for s in (db.get_services() or [])],
            campaign_script, client_name,
        )

        # 1. WAV letöltés a privát recordings bucketből
        wav_bytes = db.supabase.storage.from_("recordings").download(recording_path)
        if isinstance(wav_bytes, str):
            wav_bytes = wav_bytes.encode()
        left_pcm, sample_rate = split_stereo_to_caller(wav_bytes)

        # 2. Hívó turnus-start horgonyok → szeletek
        caller_starts = [round(float(t.get("start_s") or 0), 2) for t in turns
                         if str(t.get("role")) == "user" and t.get("start_s") is not None]
        slices = slice_caller_pcm(left_pcm, sample_rate, caller_starts)
        if not slices:
            return {"status": "skipped", "reason": "no caller slices"}

        # 3. Szeletenkénti átírás (sync SDK → to_thread)
        retranscribed: dict[float, str] = {}
        for s in slices:
            try:
                text = await asyncio.to_thread(
                    transcribe_slice, gemini_client, s["wav"], context_text, "")
                if text and text != "[nem érthető]":
                    retranscribed[s["start_s"]] = text
            except Exception as slice_err:
                logger.warning(f"[TranscribeCaller] szelet ({s['start_s']}) hiba: {slice_err}")

        # 4. Merge + DB update
        final_turns = build_final_turns(turns, retranscribed)
        rows = (db.supabase.table("interactions")
                .select("id").eq("session_id", session_id)
                .not_("transcript_turns", "is", None).limit(1).execute())
        if not rows.data:
            return {"status": "error", "reason": "transcript interaction not found"}
        db.supabase.table("interactions").update(
            {"transcript_turns": json.dumps(final_turns, ensure_ascii=False)}
        ).eq("id", rows.data[0]["id"]).execute()

        return {"status": "finalized", "turns": len(final_turns),
                "retranscribed": len(retranscribed)}
    except Exception as exc:
        logger.warning(f"[TranscribeCaller] hiba (fail-open, prototípus marad): {exc}")
        return {"status": "error", "reason": str(exc)[:200]}


def build_context_text(business_info: dict, service_names: list[str],
                       campaign_script: str = "", client_name: str = "") -> str:
    """Tenant-saját, iparágfüggetlen kontextus-szöveg a STT-promptnak."""
    parts = []
    bi = business_info or {}
    if bi.get("szakterulet"):
        parts.append(f"szakterület: {bi['szakterulet']}")
    if bi.get("kulcsszavak"):
        parts.append(f"gyakori szavak/kifejezések: {bi['kulcsszavak']}")
    if bi.get("practice_name"):
        parts.append(f"cég: {bi['practice_name']}")
    names = [n for n in (service_names or []) if n]
    if names:
        parts.append("szolgáltatások: " + ", ".join(names))
    if campaign_script:
        short = campaign_script[:400]
        parts.append(f"a hívás témája (forgatókönyv-részlet): {short}")
    if client_name:
        parts.append(f"a hívó neve: {client_name}")
    return "; ".join(parts)
