#!/usr/bin/env python3
"""
LiveKit Outbound SIP trunk letrehozasa (LiveKit -> Asterisk irany).
Futtatás: python3 asterisk/create_outbound_trunk.py
"""
import asyncio

LK_URL    = "https://thinkai-ugyfelszolgalat-f05w09v7.livekit.cloud"
LK_KEY    = "APIYS7bZkZBFZpt"
LK_SECRET = "ufxdDeubWjmzKMYoHTePc8vwCVhzBn36i2HCjSddgrSB"
ASTERISK_IP = "165.227.139.84"

async def main():
    from livekit import api as lk
    client = lk.LiveKitAPI(url=LK_URL, api_key=LK_KEY, api_secret=LK_SECRET)
    try:
        trunk = await client.sip.create_sip_outbound_trunk(
            lk.CreateSIPOutboundTrunkRequest(
                trunk=lk.SIPOutboundTrunkInfo(
                    name="Asterisk Bridge",
                    address=f"{ASTERISK_IP}:5060",
                    numbers=["+3617001622"],
                    transport=lk.SIPTransport.SIP_TRANSPORT_UDP,
                )
            )
        )
        print(f"[OK] Outbound trunk ID: {trunk.sip_trunk_id}")
        print(f"[OK] Ments el: SIP_OUTBOUND_TRUNK_ID={trunk.sip_trunk_id}")
    except Exception as e:
        print(f"[HIBA] {e}")
    finally:
        await client.aclose()

asyncio.run(main())
