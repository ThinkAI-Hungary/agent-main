# Balázs-backlog — 2026-09-22 (teszthívások elemzése alapján)

**Kontextus**: staging (`https://digideskadmin.molaire.hu`), branch `rebuild`, HEAD: `891c079`.
A tételek a 2026-09-22-i teszthívások (Orosz Erika 17:30 UTC, Lederer Balázs 18:02 UTC) DB- és logelemzéséből származnak. **Semmi nincs implementálva** — ez a fájl a megállapodás szerint a kolléga másik sessionjének indulópontja.

> ⚠️ **Állandó munkaszabály (user-utasítás, 2026-09-22)**: bármi implementálása ELŐTT a lehetséges kockázatokat le kell írni és meg kell beszélni a userrel. A tételeknél a „Kockázatok" szekció ezt szolgálja.

---

## 1. 🔴 Fantom-foglalás: az agent eszköz-siker nélkül jelent be foglalást

**Bizonyíték (2 azonos mintázatú eset egy napon):**
- Orosz Erika-hívás (`call-_+36703200236_7sCBuFPwupwk`, 17:30 UTC): `book_meeting("2026-09-25", "11:00")` → `_validate_slot` helyesen elutasította (valós ütközés: 09-25 11:00 „Konzultáció" esemény), 11:30-at ajánlott → az agent tárgyalt → **a 11:30-as foglaláshoz SOHA nem hívta újra a toolt**, mégis kijelentette: „be is foglaltam". Nincs esemény, nincs foglalás-interakció, nincs visszaigazoló email.
- Lederer Balázs-hívás (`call-_+36706369528_5PdzsaJmdf3E`, 18:02 UTC): ugyanez — `book_meeting("2026-09-25", "11:00")` ütközött (a logban csak ez az egy hívás), az agent „módosítottam, 11:30-ra foglaltam, visszaigazolást elküldtük" — eszközhívás nélkül.

**Gyökér**: a modell megszegi az Alapelvek §6-ot („műveletek csak eszköz-sikerre"); ezt kódoldalon semmi nem kényszeríti ki. A klasszifikátor az átiratból dolgozik → a hamis állítás bekerül az összefoglalóba („foglalt péntek 11:30-ra") → a popup a KORÁBBI hívás valós eseményét mutatja mellé → inkonzisztens UI.

**Javítási irányok (választandó):**
- a) A `book_meeting` hiba-ágának visszatérési szövege legyen explicit parancs: „NE jelentsd be a foglalást sikeresként, amíg ez az eszköz SIKERES nem lett újrahívva a módosított időponttal." (prompt-szint, kis kockázat, de soft garancia)
- b) Kódoldali kapu: session-state flag „pending booking confirmation" — ha a hívás úgy zárul, hogy volt sikertelen book_meeting, de nincs sikeres, a klasszifikáció/napló NE írhasson „Új időpont" eredményt (középkockázat: a klasszifikáció inputját érinti)
- c) A kettő kombinációja (javasolt).

**Kockázatok**: az a) változat prompt-viselkedést módosít (regressziós teszthívás kell); a b) változat a klasszifikációs pipeline-t érinti (a `classifier.py` „eredmeny" mezője több helyen jelenik meg).

**Kapcsolódó fájlok**: `tools.py` (`book_meeting`, `_validate_slot`), `classifier.py`, DB-template (Alapelvek §6).

---

## 2. 🟠 Voice thread-összevonás hiányzik az interakciós naplóból

**Jelenség**: ugyanazon ügyfél aznapi hívásai külön sorok (chip csak a híváson belüli interakciókat számol). User-elvárás: egy sor / ügyfél / csatorna (legalább naponta), chip = hívásszám.

**Gyökér**: a `get_grouped_interactions` SQL `GROUP BY session_id`-t használ; a voice session_id = LiveKit room-név (`call-<tel>-<random>`) → hívásonként egyedi. A tárgy-szintű thread-kulcs (`email_<feladó>_<tárgy>`, commit `8b23961`) csak emailre készült el.

**Javítási irány**: voice thread-kulcs, pl. `voice_<normalizált_telefonszám>` vagy napos bontás (`voice_<tel>_<yyyy-mm-dd>`) — a `session_id`-t a `server.py` hozza létre híváskor.

**Kockázatok**: a session_id a sessions/interactions FK-láncában és a transcript-popup „Előzmények" csatorna-szűrésében is kulcs — a napi összevonás miatt egy hosszú thread-sor sok hívást takar; a régi sorok retroaktívan nem vonódnak össze (migráció nélkül marad vegyes kép); az email-thread mintát kell követni, különben eltérő viselkedés lesz csatornánként.

**Kapcsolódó fájlok**: `server.py` (session-létrehozás), `migrate_interaction_count_toollog.sql` (a grouped SQL), `Interakciós napló` frontend.

---

## 3. 🟠 „Új vs Visszatérő ügyfél" — 4 párhuzamos definíció

| Hely | Logika | Lederer Balázs (149) esete |
|---|---|---|
| Interakciós modal (`InteractionSummaryModal.tsx:131`) | `clients.created_at` ≤ 30 nap = Új | 92 napos reg → **Visszatérő** ✔️ |
| Ügyfélprofil az interakciós lapról (`InteractionsPage.tsx:439`) | **`isNew: true` BEÉGETVE** | mindig **Új** ❌ (ez a bug) |
| Ügyféllista/profil (`ClientsPage.tsx:278`) | `calendar_events` múltbeli esemény ≤ 1 = Új | 2 múltbeli esemény → **Visszatérő** ✔️ |
| `clients.status` oszlop | létrehozáskor `'uj'`, sosem frissül | `'uj'` (élő, de ezt a pill nem olvassa) |

**Javítási irány**: egyetlen kanonikus definíció (javaslat: a `calendar_events`-előzmény-alapú, az az üzletileg értelmes), az `InteractionsPage` enrichment számolja ugyanúgy (az events már megvannak a page-ben). Döntés kell: a `clients.status='uj'` oszlop sorsa (frissítse-e a rendszer az első lezajlott időpont után, vagy vezessük ki a pill-források közül).

**Kockázatok**: UI-only, kis kockázat; a `clients.status` kivezetése nagyobb (kampány-targeting és wizard is olvassa: `CampaignWizardModal.tsx:102-106`).

---

## 4. 🟡 Telefonhang-minőség (STT/TTS) — research elkészült, setup-döntések kellenek

A 09-22-i hívásokban: STT-zagyvaság („Danin csónakázónál 10:30", „Azt mondja, hogy a 100-as úton"), TTS-kiejtési hiba („11:30" → „tizharmincharminc"-ként hallatszott). A részletes, forrásos kutatás a 2026-09-22-i session agent-jelentésében; lényeg:

**Quick winek:**
1. **Telnyx AI Noise Suppression** bekapcsolása (API PATCH, inbound, Denoiser/DeepFilterNet/Krisp Viva motor, <20 ms latency): https://developers.telnyx.com/docs/voice/sip-trunking/features/noise-suppression.md
2. **LiveKit `BVCTelephony()`** a `RoomInputOptions`-ba (telefonhangra hangolt zajszűrő; LiveKit Cloud-licenc kell — a worker Cloud-on fut): https://pypi.org/project/livekit-plugins-noise-cancellation/
3. **Codec-check**: G.722 (wideband 16 kHz) legyen a Telnyx `inbound.codecs` élén + SIP SDP-logból verifikálni, hogy a magyar PSTN-felől tényleg wideband jön-e át (ha G.711-re transzkódál az átjáró, a 8 kHz fizikai limit).

**Architekturális opciók:**
4. **Half-cascade**: `modalities=["TEXT"]` + Google Cloud TTS hu-HU → a szám/időpont-kiejtés normalizálódik (a „tizharmincharminc" osztály megszűnik). Megkötés: csak non-native-audio Gemini modellel.
5. **Full cascade**: Deepgram `nova-3` (`hu` + keywords-boost + smart_format) → Gemini szövegesen → Cloud TTS hu-HU. Legjobb magyar telefonos átirat; ~1 mp extra latency, a native-audio élmény elvész. (A Deepgram `*-phonecall` modellek csak angolok!)
6. Gemini Live `input_audio_transcription` **nem hangolható** (nincs phrase hints / telephony-modell native-audio módban); 8→16 kHz upsampling a mi dolgunk.

**Kockázatok**: 1–2 per-írás/perc-díjas lehet (Telnyx NS, Krisp) — költség-check kell; 4–6 architektúra-váltás, a hangszemélyiség és latency megváltozik (élő A/B teszthívás kell); 3 semmi kockázat (olvasás).

---

## 5. 🟡 Egyéb megfigyelések a híváslogokból (kisebb tételek)

- **`check_calendar` figyelmen kívül hagyva**: a Lederer-hívásban a tool visszaadta a 2 eseményt (köztük a foglalt péntek 11:00-t), az agent mégis a foglalt slotot ajánlotta. Irány: a `check_calendar` válasza jelölje strukturáltan a FOGLALT szakaszokat is. Kockázat: prompt/token-növekedés.
- **`book_meeting` paraméter-minőség**: `title=Konzultáció` (név nélkül), `service=Általános` (nincs szolgáltatás-mapping) — a normalize_event_title/duration-feloldó korrigál, de a cím és az időtartam így LLM-függő marad. Kockázat: alacsony.
- **Bemondott email ≠ tárolt email**: Lederer-hívásban skyrocketgroup.hu vs tárolt balazs@thinkai.hu — a slot-hiba korai returnje „megvédte" az adatot; szabad slottal az upsert felülírta volna az emailt (a név védett, az email nem). Irány: email-felülírásnál is legyen óvatos merge-szabály (pl. meglévő email csak explicit „új email" szándékra cserélhető). Kockázat: adat-konzisztencia vs. túl merev űrlapviselkedés.
- **Agent bontotta a hívást nyitott kérdésnél**: „Milyen email címre fogják küldeni?" → agent elköszönt. Irány: prompt-szabály (ne kössön be nyitott ügyfél-kérdésnél). Kockázat: alacsony.
- **`lookup_info` tudásbázis-miss**: „dentálhigiénia időtartam" nem talált semmit (a 60 percet a services-táblából tudta). Irány: GYIK/tudásbázis bővítés vagy a lookup fallback a services-adatra. Kockázat: alacsony.
- **Nyitott kérdés**: a 14:45-ös Orosz Erika-hívás naplója „2026-09-23 12:00"-t ír, a létrejött esemény (id 137) mégis 09-24 12:00 — valószínűleg kézi naptár-mozgatás a tesztelés alatt, de ha nem az volt, akkor a book_meeting date-kezelésében van eltérés (a `_parse_hungarian_date` ISO-inputra helyes, 2026-09-22-n tesztelve). Verifikálandó.
