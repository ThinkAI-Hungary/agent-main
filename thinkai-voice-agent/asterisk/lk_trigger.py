#!/usr/bin/env python3
"""
LiveKit SIP participant trigger script.
Asterisk hivja ezt a scriptet amikor hivas erkezik.
Hasznalat: python3 /opt/lk_trigger.py <CALLID> <CALLERID>
"""
import sys, asyncio, os

LK_URL             = "https://thinkai-ugyfelszolgalat-f05w09v7.livekit.cloud"
LK_KEY             = "APIYS7bZkZBFZpt"
LK_SECRET          = "ufxdDeubWjmzKMYoHTePc8vwCVhzBn36i2HCjSddgrSB"
OUTBOUND_TRUNK_ID  = "ST_PB2SW4XszX52"   # Telefonalo.hu kimeno
CALLBACK_TRUNK_ID  = "ST_dVxQozpMuwtU"   # Asterisk callback (kozvetlen)
AGENT_NAME         = "dobozos-ai"

async def main(callid: str, callerid: str):
    from livekit import api as lk

    room_name = f"call-{callid}"
    sip_back  = f"lkcb-{callid}"

    client = lk.LiveKitAPI(url=LK_URL, api_key=LK_KEY, api_secret=LK_SECRET)
    try:
        # 1. Szoba letrehozasa
        await client.room.create_room(lk.CreateRoomRequest(name=room_name))
        print(f"[OK] Room: {room_name}")

        # 2. SIP participant – LiveKit visszahiv Asteriskra
        participant = await client.sip.create_sip_participant(
            lk.CreateSIPParticipantRequest(
                sip_trunk_id=CALLBACK_TRUNK_ID,
                sip_call_to=sip_back,
                room_name=room_name,
                participant_identity=f"phone-{callerid}",
                participant_name=f"Hivó: {callerid}",
                krisp_enabled=True,
            )
        )
        print(f"[OK] SIP participant: {participant.participant_identity}")

        # 3. Agent dispatch a szobaba
        await client.agent_dispatch.create_dispatch(
            lk.CreateAgentDispatchRequest(
                agent_name=AGENT_NAME,
                room=room_name,
            )
        )
        print(f"[OK] Agent dispatched: {AGENT_NAME}")

    except Exception as e:
        print(f"[HIBA] {e}", file=sys.stderr)
    finally:
        await client.aclose()

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Hasznalat: lk_trigger.py <CALLID> <CALLERID>")
        sys.exit(1)
    asyncio.run(main(sys.argv[1], sys.argv[2]))
