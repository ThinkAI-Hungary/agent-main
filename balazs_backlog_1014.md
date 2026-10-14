# Balázs-backlog — 2026-10-14 (kampány email-statisztika: Brevo-admin beállítás)

**Kontextus**: staging (`https://digideskadmin.molaire.hu`), prod (`https://desk.eaisy.hu`), branch `rebuild`. A kampány email-statisztika (Megnyitás / Kattintás / Visszapattan) **kódoldala KÉSZ** (commit `292a07d`, 2026-10-08) és stagingen verifikálva; a `campaign_events` tábla prod-migrációja a prod-deploy checklistben szerepel (HANDOFF-2026-10-14, deploy-tétel 3a). **A megmaradt teendő kézi, Brevo adminoldali konfiguráció** — kódírás nem kell hozzá (ellenőrzés kivételével). Ez a fájl egy másik session indulópontja.

> ⚠️ Állandó munkaszabály: prod-beli beavatkozás (itt: a prod Brevo-fiók beállítása) csak explicit user-jóváhagyással. A webhook URL-t a prod-deploy UTÁN érdemes bekötni, amikor az endpoint már az új kóddal fut.

---

## Mi van már kész (nem kell hozzányúlni)

- **Nyilvános webhook-endpoint**: `POST /api/webhooks/brevo` (`web_server.py:6656`) — lista vagy egyetlen event payloadt fogad; elfogadott eseménytípusok: `delivered, opened, clicked, hard_bounce, soft_bounce, blocked, spam, deferred, invalid_email, unsubscribed`.
- **Kampány-korreáció**: a küldéskor beállított `campaign_<id>` tagből (`_run_campaign` Brevo-küldés `tags: [campaign_{id}]`); tag nélküli eseményt figyelmen kívül hagy.
- **Dedup** azonos `(campaign_id, email, event, brevo_ts)` alapján (Brevo-retry nem dupláz); tenant feloldás a `campaigns` táblából.
- **Stats endpoint**: `GET /admin/api/campaigns/{id}/stats` (JWT-védett) — email-címenkénti egyediség, bounce = hard+soft.
- **Frontend**: CampaignDetailPanel Megnyitás/Kattintás/Visszapattan counterjei a stats endpointot olvassák.
- **Staging-verifikáció megtörtént**: szimulált `opened` webhook → `campaign_events` sor → stats `opened=1`; tesztsor törölve.

## A TEENDŐ: Brevo admin (két beállítás)

1. **Tranzakciós email követés engedélyezése** (open/click tracking) — enélkül `opened`/`clicked` esemény egyáltalán nem keletkezik, csak delivered/bounce. (Brevo konzol: SMTP & API → Transactional → Settings / Tracking — a konkrét menühely a konzol aktuális felületétől függ.)
2. **Webhook létrehozása**:
   - URL: `https://desk.eaisy.hu/api/webhooks/brevo` (prod backend publikus címe)
   - Továbbítandó események: legalább `delivered, opened, clicked, hard_bounce, soft_bounce` (a endpoint a fenti szélesebb készletet is elfogadja)

## Előtte ellenőrizendő / döntési pont

- **Egy Brevo-fiók vagy kettő?** Ha staging és prod ugyanazt a fiókot használja (ugyanaz a `BREVO_API_KEY`), a webhook EGY URL-re kézbesít minden eseményt: a másik környezet statisztikája 0 marad, és a fogadó DB-ben nem létező `campaign_id`-vel is keletkezhet sor (a tenant-feloldás csendben `null` lesz). **Javaslat**: prod URL-t kötni; ha a staging-statisztika is kell, külön Brevo-fiók stagingnek. A fiók-hozzárendelést a két környezet .env-jének `BREVO_API_KEY`-e alapján lehet tisztázni.
- **Biztonság**: a végpont nyilvános és nem authentikál (a Brevo alapból nem küld aláírást); a kód csak ismert eseménytípus + `campaign_` tag esetén ír. Ha a Brevo konzol lehetővé tesz token/azonosító hozzáfűzését az URL-hez, később opcionális hardeningként validálható (most nincs implementálva — nem blokkolja a beállítást).

## Verifikáció (élő, a beállítás után)

1. **Gyors, kontrollált teszt** (valós prod kampány-ID-vel; a teszt sor utólag törölhető):
   ```bash
   curl -X POST https://desk.eaisy.hu/api/webhooks/brevo \
     -H 'Content-Type: application/json' \
     -d '[{"email":"teszt@pelda.hu","event":"opened","tags":["campaign_<ID>"],"ts":"2026-10-14T12:00:00Z"}]'
   # elvárt válasz: {"status":"ok","inserted":1}
   ```
2. **Élő E2E**: 1-2 címzettös email-kampány indítása prodon, megnyitás + link-kattintás, majd CampaignDetailPanel counterek ellenőrzése (a `/admin/api/campaigns/{id}/stats`ból olvasnak).
3. Ha a Brevo konzol kínál „test webhook" funkciót, azzal is ellenőrizhető a kézbesítés.

## Kapcsolódó fájlok

`thinkai-voice-agent/web_server.py` (`brevo_webhook` ~6656, `campaign_email_stats` ~6716), `thinkai-voice-agent/migrate_campaign_events.sql`, `thinkai-voice-agent/eaisydesk-frontend/src/components/outbound/CampaignDetailPanel.tsx`, deploy-checklist: `HANDOFF-2026-10-14.md`.
