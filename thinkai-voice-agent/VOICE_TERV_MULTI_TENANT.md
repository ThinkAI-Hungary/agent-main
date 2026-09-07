# Voice Agent Multi-Tenant Terv — Telnyx + LiveKit (2026-09-07)

> Kutatás forrása: LiveKit/Telnyx hivatalos dokik (2026-09 current) + a mi kódunk tényleges állapota.
> Stategy: amit MOST meg tudunk csinálni (Telnyx kulcs nélkül) megcsináljuk; a Telnyx-függő lépések pontos recepttel várnak a kulcsra.

---

## 1. HOL ÁLL MOST A KÓD (tényleges állapot)

| Funkció | Állapot | Hely |
|---|---|---|
| Outbound hívás tenant-feloldás | ✅ MŰKÖDIK | tenant_id átmegy a room/dispatch metadata-ban → `server.py:140-143` feldolgozza |
| Widget tenant-feloldás | ✅ MŰKÖDIK | room-name `<slug>-<uuid>` prefix → tenants lookup (`server.py:146-154`) |
| Hívó telefonszám kinyerés | ✅ MŰKÖDIK | `sip.phoneNumber` participant attribútum (`server.py:394-415`, HidePhoneNumber figyelmeztetéssel) |
| **Bejövő SIP tenant-feloldás** | ❌ **HIÁNYZIK** | inbound (`call-` szobák) → default tenant (rivergate) — **ez a fő gap** |
| Per-tenant SIP cred-ek | ⚠️ TÁROLTVA, DE NINCS OLVASVA | `tenant_credentials`-ben megvannak (sip_phone_number, sip_inbound/outbound_trunk_id, sip_dispatch_rule_id), de a kód a `.env` `SIP_OUTBOUND_TRUNK_ID`-t használja |
| Kampanányhívás metadata | ✅ tenant_id átmegy | web_server.py outbound |

---

## 2. AJÁNLOTT ARCHITEKTÚRA (kutatás eredménye)

**Pattern A+módosítva: EGY shared inbound trunk + telefonszámonként EGY dispatch rule.**

```
Telnyx (1 FQDN connection) ──► LiveKit inbound trunk (1 db, több szám)
                                     │
                    dispatch rules (számonként 1, `numbers` filterrel):
                    ┌────────────────────────────────────────────┐
                    │ rule "tenant-dentors": numbers=[+3662…]     │
                    │   metadata: {"tenant_id": "<uuid>"}         │──► agent session
                    │ rule "tenant-<másik>": numbers=[+361…]      │    (tenant_id a
                    │   metadata: {"tenant_id": "<uuid2>"}        │    ctx.job.metadata-ban)
                    │ rule "catch-all" (legalacsonyabb prioritás) │──► warning + default
                    └────────────────────────────────────────────┘
```

- A dispatch rule `metadata`-ja a `ctx.job.metadata`-ba érkezik → **nincs DB-lookup a hívás forró útján**
- A `numbers` mező (hívott szám filter) proto-szintű, dokumentáció-táblázatban nem szerepel — **egy teszthívással validálni kell**
- Prioritás: a `numbers`-szel rendelkező szabály nyer a nélküli ellen (+1000 büntetés nélkülük) → a meglévő SDR_ szabály co-existál catch-all-ként
- Fallback (B-minta): a **`sip.trunkPhoneNumber`** attribútum = a HÍVOTT szám → DB-lookup (`tenant_credentials.sip_phone_number`) — ez a catch-all út
- Widget nincs hatással: a token `RoomAgentDispatch` csak akkor él, ha a szoba új; SIP rule csak SIP INVITE-ra matchel

---

## 3. FÁZIS 0 — MOST (Telnyx kulcs NÉLKÜL)

### 3.1 `server.py` — bejövő tenant-feloldás (a fő gap)
```python
# tenant-feloldási lánc, prioritás szerint:
# 1. ctx.job.metadata → {"tenant_id": …}        (dispatch rule injektálja — FÁZIS 1-ben él)
# 2. participant.attributes["sip.trunkPhoneNumber"]  (hívott szám)
#    → tenant_credentials lookup: key='sip_phone_number' AND value_encrypted=<szám>
#    (Fernet-decrypt mindenkire, vagy value hash-elt keresés)
# 3. room-name prefix (meglévő widget-logika)
# 4. semmi → logger.warning("Ismeretlen hívószám, default tenant") + default
```
- A 2. lépéshez: `tenant_credentials` reverse-lookup helper a `database.py`-ba (`find_tenant_by_sip_number(phone)`)
- Staging/prod kettős: `AGENT_NAME` alapján a dispatch rule `agentName`-ja dönt (dobozos-ai / dobozos-ai-staging)

### 3.2 `web_server.py` — outbound per-tenant SIP
- `sip_outbound_call` + kampányhívás: a tenant `sip_outbound_trunk_id` + `sip_phone_number` cred-jét olvassa (fallback `.env`), a `CreateSIPParticipant`-nak `sip_number=<tenant száma>` (caller ID = a patika száma!)

### 3.3 Dispatch-rule generátor + provisioning script
- `provision_voice.py`: JSON-generátor (sablon lent) + `lk sip dispatch create` futtatás + `tenant_credentials` frissítés
```json
{"dispatch_rule": {
  "name": "tenant-<slug>-<utolsó4szám>",
  "trunk_ids": ["<ST_trunk>"],
  "numbers": ["+3662xxxxxxx"],
  "rule": {"dispatchRuleIndividual": {"roomPrefix": "t-<slug>-"}},
  "roomConfig": {"agents": [{"agentName": "dobozos-ai",
    "metadata": "{\"tenant_id\": \"<uuid>\", \"language\": \"hu\"}"}]},
  "attributes": {"tenant_id": "<uuid>"}
}}
```

### 3.4 Azonnali validáció meglévő számmal
- A mostani SDR_ trunk-jára egy második teszt-rule külön roomPrefix + metadata-val → valódi hívással ellenőrizni, hogy a `ctx.job.metadata` és a `sip.trunkPhoneNumber` bejön-e (a `numbers` proto-mező validálása)

---

## 4. FÁZIS 1 — Telnyx kulcs megérkezésekor

### Egyszeri (platform-szintű)
1. Telnyx API key → `.env` (`TELNYX_API_KEY`)
2. `POST /v2/outbound_voice_profiles` (conversational, global)
3. `POST /v2/fqdn_connections` (TCP, **+E.164 ANI/DNIS format kötelező!**, outbound profile linkelve) → `connection_id`
4. `POST /v2/fqdns` → `<project-subdomain>.sip.livekit.cloud` (EU-pinning: `<subdomain>.eu.sip.livekit.cloud`), port 5060
5. LiveKit outbound trunk: `address: sip.telnyx.com`, auth + **`headers_to_attributes: {"X-Telnyx-Username": …}`** (kritikus pitfall: nélküle a Telnyx rossz connection-re matchelhet!), `destination_country: "hu"`

### Tenantonként
1. Szám vásárlás: `GET /v2/available_phone_numbers?filter[country_code]=HU` → `POST /v2/number_orders`
   - **HU reguláció:** local = cégdokumentum + a körzetszámhoz illő cím + 3 hónaposnál frissebb lakcím-igazolás (~72 óra validáció!); **national szám = bármely HU cím** — multi-tenant rollout-hoz ez a könnyebb út
   - Kimenő kampányhíváshoz HU-ban **explicit opt-in consent kötelező** (2003. évi C tv. §155, NAIH)
2. `PATCH /v2/phone_numbers/{id}` → `connection_id` (a szám a connection-re kerül)
3. LiveKit: szám felvétele az inbound trunk `numbers[]`-ba (`lk sip inbound update`)
4. `provision_voice.py` → dispatch rule (metadata: tenant_id) + `tenant_credentials` sip_* sorok
5. Outbound trunk `numbers[]`-ba a caller-ID poolhoz
6. E2E teszthívás: logokban `ctx.job.metadata`, `sip.trunkPhoneNumber`, room-prefix ellenőrzés

---

## 5. KÖLTSÉGEK (kutatás)

| Tétel | Ár |
|---|---|
| Telnyx HU local szám | $3/hó + $3 egyszeri |
| Telnyx HU national/DID/mobile | $1/hó + $1 egyszeri |
| Telnyx HU bejövő (local) | $0.006/perc |
| LiveKit 3rd-party SIP | Ship: $0.004/perc (5000 ingyenes/hó), Scale: $0.003/perc |
| **Példa: 3 perces bejövő hívás** | ~$0.03 + Gemini realtime token |

---

## 6. TEENDŐK LISTÁJA (FÁZIS 0 — jóváhagyás után)

1. [ ] `database.py`: `find_tenant_by_sip_number(phone)` reverse-lookup
2. [ ] `server.py`: inbound tenant-lánc (metadata → trunkPhoneNumber lookup → room-prefix → default+warning)
3. [ ] `web_server.py`: outbound per-tenant trunk + caller-ID (tenant_credentials-ből)
4. [ ] `provision_voice.py`: dispatch-rule generátor + `lk` CLI wrapper + cred-frissítés
5. [ ] Teszt-rule a meglévő számon (metadata-path validálás)
6. [ ] Tesztek + deploy staging → prod
7. [ ] FÁZIS 1 checklist a Telnyx kulcs érkezésekor (fent)

Kockázatok: `numbers` proto-mező validálása valódi hívással; HU regulációs dokumentumok beszerzése ügyfelenként (72 óra); HidePhoneNumber beállítás a dispatch rule-ban maradjon OFF.
