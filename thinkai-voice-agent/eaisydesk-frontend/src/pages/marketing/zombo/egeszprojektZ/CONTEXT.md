# CONTEXT.md — ThinkAI Voice Agent Global Glosszárium

> Ez a dokumentum a teljes ThinkAI Voice Agent projekt domain terminológiáját rögzíti.

## Entitások

### Voice Agent (Hangalapú Ágens)
Egy valós idejű mesterséges intelligencia, amely képes telefonhívásokat fogadni vagy kezdeményezni, megérteni az élő beszédet (STT), döntéseket hozni (LLM) és emberi hangon válaszolni (TTS).

### LiveKit
A technológiai keretrendszer, amely a WebRTC alapú audio-video adatfolyamot és az ágensek közötti kommunikációt biztosítja.

### SIP / Telephony
A hagyományos telefonhálózat (PSTN) és a digitális Voice Agent közötti híd, amelyet a Telnyx szolgáltató biztosít.

### Knowledge Base (Tudásbázis)
A hangalapú ágens számára elérhető strukturált információk (pl. praxis nyitvatartás, szolgáltatások árai), amiből válaszolni tud a kérdésekre.

### Task / Reminder
Az ágens által létrehozott feladatok vagy emlékeztetők, amelyeket a felhasználók (pl. orvosi asszisztensek) az admin felületen látnak.

## Szerepkörök

### Admin / Owner
A teljes rendszer felett rendelkező felhasználó, aki beállíthatja az ágenst, kezeli az előfizetést és látja az összes statisztikát.

### Assistant / Manager
A napi operatív munkát végző felhasználó, aki kezeli a naptárat, jóváhagyja a kampányokat és válaszol a bejövő kérésekre.

### Caller (Hívó)
Az ügyfél vagy beteg, aki telefonon keresztül lép interakcióba az ágenssel.

## Kulcsfolyamatok

### Inbound Call Flow
Bejövő hívás feldolgozása: Telnyx → LiveKit → Agent Worker (server.py) → Válaszadás.

### Appointment Booking (Időpontfoglalás)
Az ágens ellenőrzi a szabad helyeket a naptárban, és ütközésmentesen rögzíti az új időpontot.

### Outbound Campaign
Automatizált kimenő hívások vagy üzenetek sorozata egy adott célközönség számára (pl. vizit emlékeztető).
