# API Specifikáció — Zombo Audit System

**Utolsó frissítés:** 2026-07-03

## Endpointok

### POST /api/extract
Márka adatok kinyerése weboldalról.

**Request:**
```json
{
  "url": "https://example.com"
}
```

**Response (200):**
```json
{
  "colors": { "primary": "#...", "secondary": "#...", "accent": "#...", "rules": "..." },
  "typography": { "fontName": "...", "titleSize": "...", "subtitleSize": "...", "bodySize": "...", "maxLineLength": 40 },
  "logoUrl": "...",
  "tone": ["..."],
  "brandDna": { ... }
}
```

### POST /marketing/api/zombo/evaluate-category
Egy adott audit kategória részletes kiértékelése.

**Request:**
```json
{
  "url": "https://example.com",
  "category": "seo | visual | content | marketing | brand | contact | products"
}
```

### POST /api/render-update
Kreatív újrarenderelése módosított szöveggel.

**Request:**
```json
{
  "post": { ... },
  "brandKit": { ... },
  "text": "Új szöveg"
}
```
