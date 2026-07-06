# Architektúra Áttekintő — Zombo Audit System

**Utolsó frissítés:** 2026-07-03

## Komponensek

| Komponens | Felelősség | Technológia |
|---|---|---|
| Frontend | UI réteg, audit vezérlés, kreatív szerkesztő | React, Lucide Icons, Vanilla CSS |
| Backend API | Audit futtatása, kategória elemzés | Fastapi / Node.js (Proxy) |
| Image API | Képgenerálás, képmanipuláció | Node.js, Playwright, Flux/SD |
| Meta API | Posztok publikálása Instagramra | Meta Graph API |

## Kommunikáció

1. **Scrape/Audit Flow**: A Frontend küld egy URL-t a `/extract` vagy `/evaluate-category` endpointnak. A backend lekaparja az oldalt és visszaadja a strukturált JSON-t (AuditResult).
2. **Generation Flow**: A Frontend elküldi a Brand Kit-et és a brief-et a Image API-nak. Az Image API legenerálja a képet és visszaadja a metadata-t.
3. **Render Update**: A Frontend szövegmódosítást kér. A backend Playwright segítségével újrarendereli a szövegréteget a képre.

## Skálázás

- A képgenerálás és renderelés erőforrásigényes folyamat, ezért a backend oldalon queue (sorbanállás) rendszer kezeli a kéréseket.
- A frontend `AdminMonitor` komponensen keresztül követhető a technikai logok állapota.
