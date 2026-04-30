"""
sip_call.py — ThinkAI kimenő hívás indítása
Használat: python sip_call.py +36301234567
"""
import asyncio
import os
import sys
from pathlib import Path
from dotenv import load_dotenv
from livekit import api

load_dotenv(Path(__file__).parent / ".env")

LIVEKIT_URL    = os.getenv("LIVEKIT_URL")
LIVEKIT_KEY    = os.getenv("LIVEKIT_API_KEY")
LIVEKIT_SECRET = os.getenv("LIVEKIT_API_SECRET")
OUTBOUND_TRUNK = os.getenv("SIP_OUTBOUND_TRUNK_ID", "ST_2wJZqGsWZBC3")
AGENT_NAME     = "thinkai-dobozos-local"


async def call(phone_number: str):
    """Kimenő hívás indítása a megadott telefonszámra."""
    if not phone_number.startswith("+"):
        phone_number = "+" + phone_number

    room_name = f"call-out-{phone_number.replace('+', '')}"
    print(f"📞 Hívás indítása: {phone_number} → szoba: {room_name}")

    lk_api = api.LiveKitAPI(url=LIVEKIT_URL, api_key=LIVEKIT_KEY, api_secret=LIVEKIT_SECRET)

    # Szoba létrehozása — az agent automatikusan csatlakozik
    await lk_api.room.create_room(api.CreateRoomRequest(name=room_name))

    # SIP résztvevő hozzáadása (kimenő hívás)
    sip_participant = await lk_api.sip.create_sip_participant(
        api.CreateSIPParticipantRequest(
            sip_trunk_id=OUTBOUND_TRUNK,
            sip_call_to=phone_number,
            room_name=room_name,
            participant_identity="caller",
            participant_name="Hívott fél",
            wait_until_answered=True,
        )
    )
    print(f"✅ Hívás felépült! SIP résztvevő: {sip_participant.participant_identity}")
    await lk_api.aclose()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Használat: python sip_call.py +36301234567")
        sys.exit(1)

    target = sys.argv[1]
    asyncio.run(call(target))
