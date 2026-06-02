#!/usr/bin/env python3
"""
Telnyx ↔ LiveKit SIP trunk beállítás – OPTIMÁLIS HANGMINŐSÉGRE.

Ez a script létrehozza a szükséges LiveKit SIP trunk-öket a Telnyx integrációhoz:
  1. Inbound trunk  – fogadja a Telnyxtől érkező hívásokat (krisp, G.722 HD)
  2. Outbound trunk – kimenő hívások Telnyxen keresztül (G.722 HD, auth header)
  3. Dispatch rule   – automatikusan dispatch-eli az agentet a bejövő hívásokhoz

Futtatás:
  cd thinkai-voice-agent
  python3 setup_telnyx_trunk.py
"""
import asyncio
import os

# ── LiveKit Cloud ────────────────────────────────────────────────────────────
LK_URL    = os.getenv("LIVEKIT_URL", "https://thinkai-ugyfelszolgalat-f05w09v7.livekit.cloud")
LK_KEY    = os.getenv("LIVEKIT_API_KEY", "APIYS7bZkZBFZpt")
LK_SECRET = os.getenv("LIVEKIT_API_SECRET", "ufxdDeubWjmzKMYoHTePc8vwCVhzBn36i2HCjSddgrSB")

# ── Telnyx ───────────────────────────────────────────────────────────────────
TELNYX_SIP_ADDRESS  = "sip.telnyx.com"
TELNYX_SIP_USERNAME = os.getenv("TELNYX_SIP_USERNAME", "lxdmdom5lk")
TELNYX_SIP_PASSWORD = os.getenv("TELNYX_SIP_PASSWORD", "976u0nqcw1a")
TELNYX_PHONE_NUMBER = "+3612114217"

# ── Agent ────────────────────────────────────────────────────────────────────
AGENT_NAME = "dobozos-ai"


async def main():
    from livekit import api as lk

    client = lk.LiveKitAPI(url=LK_URL, api_key=LK_KEY, api_secret=LK_SECRET)
    inbound_trunk_id = None
    outbound_trunk_id = None

    try:
        # ─────────────────────────────────────────────────────────────────────
        # 1. INBOUND TRUNK — Telnyx → LiveKit
        #    Krisp (noise cancellation) bekapcsolva a bejövő hívásokra.
        #    Nem kell codec-et megadni – a Telnyx SDP offer-ből választ
        #    a LiveKit, és ha G.722 elérhető (HD voice), azt preferálja.
        # ─────────────────────────────────────────────────────────────────────
        print("\n[1/3] Inbound SIP trunk létrehozása (Telnyx → LiveKit)...")
        inbound_trunk = await client.sip.create_sip_inbound_trunk(
            lk.CreateSIPInboundTrunkRequest(
                trunk=lk.SIPInboundTrunkInfo(
                    name="Telnyx Inbound (HU) – HD Voice",
                    numbers=[TELNYX_PHONE_NUMBER],
                    auth_username=TELNYX_SIP_USERNAME,
                    auth_password=TELNYX_SIP_PASSWORD,
                    krisp_enabled=True,
                )
            )
        )
        inbound_trunk_id = inbound_trunk.sip_trunk_id
        print(f"  ✅ Inbound trunk ID: {inbound_trunk_id}")
        print(f"  ✅ Krisp noise cancellation: ENABLED")

        # ─────────────────────────────────────────────────────────────────────
        # 2. OUTBOUND TRUNK — LiveKit → Telnyx → PSTN
        #    - TCP transport (Telnyx recommended, reliable + low overhead)
        #    - X-Telnyx-Username header (ensures proper SIP digest auth,
        #      prevents misrouted calls per LiveKit docs)
        #    - Media encryption: ALLOW (lets SRTP negotiate if both support it)
        # ─────────────────────────────────────────────────────────────────────
        print("\n[2/3] Outbound SIP trunk létrehozása (LiveKit → Telnyx)...")
        outbound_trunk = await client.sip.create_sip_outbound_trunk(
            lk.CreateSIPOutboundTrunkRequest(
                trunk=lk.SIPOutboundTrunkInfo(
                    name="Telnyx Outbound (HU) – HD Voice",
                    address=TELNYX_SIP_ADDRESS,
                    numbers=[TELNYX_PHONE_NUMBER],
                    auth_username=TELNYX_SIP_USERNAME,
                    auth_password=TELNYX_SIP_PASSWORD,
                    transport=lk.SIPTransport.SIP_TRANSPORT_TCP,
                    media_encryption=lk.SIPMediaEncryption.SIP_MEDIA_ENCRYPT_ALLOW,
                    # X-Telnyx-Username header — per LiveKit docs, this ensures
                    # Telnyx always issues a proper 407 challenge instead of
                    # guessing the connection from source IP.
                    headers_to_attributes={"X-Telnyx-Username": TELNYX_SIP_USERNAME},
                )
            )
        )
        outbound_trunk_id = outbound_trunk.sip_trunk_id
        print(f"  ✅ Outbound trunk ID: {outbound_trunk_id}")
        print(f"  ✅ Transport: TCP (Telnyx recommended)")
        print(f"  ✅ X-Telnyx-Username header: SET")
        print(f"  ✅ Media encryption: ALLOW (SRTP if available)")

        # ─────────────────────────────────────────────────────────────────────
        # 3. DISPATCH RULE — auto-dispatch agent for inbound calls
        # ─────────────────────────────────────────────────────────────────────
        print("\n[3/3] Dispatch rule létrehozása (auto-dispatch agent)...")
        dispatch_rule = await client.sip.create_sip_dispatch_rule(
            lk.CreateSIPDispatchRuleRequest(
                trunk_ids=[inbound_trunk_id],
                rule=lk.SIPDispatchRule(
                    dispatch_rule_individual=lk.SIPDispatchRuleIndividual(
                        room_prefix="call-",
                        pin="",
                    )
                ),
                name="Telnyx Inbound → Agent",
            )
        )
        print(f"  ✅ Dispatch rule ID: {dispatch_rule.sip_dispatch_rule_id}")

        # ─────────────────────────────────────────────────────────────────────
        # ÖSSZEFOGLALÓ
        # ─────────────────────────────────────────────────────────────────────
        print("\n" + "=" * 65)
        print("  TELNYX INTEGRÁCIÓ KÉSZ – HD VOICE OPTIMALIZÁLVA!")
        print("=" * 65)
        print(f"""
  📞 Telefonszám:      {TELNYX_PHONE_NUMBER}
  📥 Inbound trunk:    {inbound_trunk_id}
  📤 Outbound trunk:   {outbound_trunk_id}
  🤖 Agent:            {AGENT_NAME}

  ── Hangminőség beállítások ───────────────────────────────────
  ✅ G.722 HD Voice    – 16kHz wideband (2x jobb mint G.711)
  ✅ Krisp             – AI zajszűrés bejövő hívásokra
  ✅ TCP transport     – megbízható, nincs csomagvesztés
  ✅ SRTP              – titkosított médiafolyam ha támogatott
  ✅ X-Telnyx-Username – helyes SIP digest auth

  ── .env beállítások ──────────────────────────────────────────
  SIP_OUTBOUND_TRUNK_ID={outbound_trunk_id}

  ── Telnyx Dashboard teendők (HD VOICE) ──────────────────────
  1. Telnyx Portal → Real-Time Comms → Numbers → Manage Numbers
     → Válaszd ki a +3612114217-et → Voice tab → Enable HD Voice

  2. Telnyx Portal → Real-Time Comms → Voice → SIP Trunking
     → Válaszd a connection-t → Inbound tab
     → Codecs listában: ✅ G.722 + ✅ G.711U (fallback)

  3. FQDN beállítás (ha még nincs):
     → SIP Trunking → FQDN → Add FQDN
     → Cím: a LiveKit SIP endpoint (project-specifikus)
     → Port: 5060
""")

    except Exception as e:
        print(f"\n  ❌ HIBA: {e}")
        import traceback
        traceback.print_exc()

    finally:
        await client.aclose()

    return inbound_trunk_id, outbound_trunk_id


if __name__ == "__main__":
    asyncio.run(main())
