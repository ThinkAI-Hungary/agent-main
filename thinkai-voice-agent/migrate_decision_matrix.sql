-- ═══════════════════════════════════════════════════════════════════════════════
-- EAISY-241 — Döntési Mátrix (REDUX — a hivatalos specifikáció szerint)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Forrás: EAISY-241 Döntési Mátrix Specifikáció (§7 teljes szabálytábla).
--
-- STRATÉGIA: a 'routing' JSONB oszlop egy RULES-LIST struktúrát tartalmaz.
-- Minden rule = a §7-es táblázat egy sora, konfigurálható formában.
-- A classifier.py szabály-illesztéssel (ügytípus + csatorna + KB + korlátozás)
-- választja ki a megfelelő rule-t, fallback mechanizmussal.
--
-- ROUTING STRUKTÚRA:
--   {
--     "kb_relevance": "decision" | "irrelevant" | "not_applicable",  // §3
--     "default_restriction": "...",  // ha az admin nem állít be külön (Kérés/Panasz/Időpont)
--     "fallback": { "eredmeny":"...", "statusz":"...", "teendo":"..." },  // §6.3
--     "rules": [
--       {
--         "channels": ["mind"], vagy ["email","messenger","instagram","whatsapp"], vagy ["voice"], vagy []
--         "kb": "yes" | "no" | "any",            // "any" = nem döntési feltétel
--         "restriction": "none|approval|handover|urgent",
--         "automation": "auto_reply|draft|handover|urgent_handover|auto_booking|auto_modify|auto_cancel",
--         "eredmeny": "...", "statusz": "...", "teendo": "..."
--       }, ...
--     ]
--   }
--
-- Channel filter értelmezése:
--   "mind" (vagy hiány) → minden csatornára illeszkedik
--   ["email","messenger","instagram","whatsapp"] → csak írásos csatornák
--   ["voice"] → csak hang (telefon/widget)
-- A classifier a tényleges csatornát ezekhez matcheli.
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. 'routing' oszlop hozzáadása (idempotens)
ALTER TABLE triage_rules
ADD COLUMN IF NOT EXISTS routing JSONB DEFAULT '{}'::jsonb;


-- 2. Meglévő kontextus-szabályok priority normalizálása (Normál→ember, surgos→surgos)
UPDATE triage_rules
SET priority = CASE
        WHEN priority IN ('Normál', 'normal', 'normál', 'altalanos', 'kozepes', 'közepes') THEN 'ember'
        WHEN priority IN ('surgos', 'sürgős', 'high', 'magas', 'kiemelt', 'urgent') THEN 'surgos'
        ELSE priority
    END
WHERE priority IN ('Normál','normal','normál','altalanos','kozepes','közepes','surgos','sürgős','high','magas','kiemelt','urgent');


-- 3. Alap ügytípusok (§7 szabálytábla szerinti rules-list routing) — upsert situation alapján

-- ── KÉRDÉS (§4.1) — KB döntési feltétel, csatorna-filter a jóváhagyásnál/átadásnál ──
INSERT INTO triage_rules (situation, priority, escalation_email, routing) VALUES
('Kérdés', 'onallo', NULL,
'{"kb_relevance":"decision","default_restriction":"none","fallback":{"eredmeny":"Kérdés rögzítve","statusz":"Nyitott","teendo":"Válasz/visszahívás szükséges"},"rules":[
  {"channels":["mind"],"kb":"yes","restriction":"none","automation":"auto_reply","eredmeny":"Megválaszolt kérdés","statusz":"Lezárt","teendo":"Nincs további teendő"},
  {"channels":["email","messenger","instagram","whatsapp"],"kb":"yes","restriction":"approval","automation":"draft","eredmeny":"Válasz előkészítve","statusz":"Nyitott","teendo":"Jóváhagyás szükséges"},
  {"channels":["voice"],"kb":"yes","restriction":"handover","automation":"handover","eredmeny":"Kérdés rögzítve","statusz":"Nyitott","teendo":"Válasz/visszahívás szükséges"},
  {"channels":["mind"],"kb":"yes","restriction":"urgent","automation":"urgent_handover","eredmeny":"Kérdés rögzítve","statusz":"Sürgős","teendo":"Azonnali beavatkozás szükséges"},
  {"channels":["mind"],"kb":"no","restriction":"any","automation":"handover","eredmeny":"Kérdés rögzítve","statusz":"Nyitott","teendo":"Válasz/visszahívás szükséges"}
]}'::jsonb)
ON CONFLICT DO NOTHING;

-- ── KÉRÉS (§4.2) — KB irreleváns, default átadás ──
INSERT INTO triage_rules (situation, priority, escalation_email, routing) VALUES
('Kérés', 'ember', NULL,
'{"kb_relevance":"irrelevant","default_restriction":"handover","fallback":{"eredmeny":"Igény rögzítve","statusz":"Nyitott","teendo":"Intézkedés"},"rules":[
  {"channels":["mind"],"kb":"any","restriction":"any","automation":"handover","eredmeny":"Igény rögzítve","statusz":"Nyitott","teendo":"Intézkedés"},
  {"channels":["mind"],"kb":"any","restriction":"urgent","automation":"urgent_handover","eredmeny":"Igény rögzítve","statusz":"Sürgős","teendo":"Azonnali beavatkozás"}
]}'::jsonb)
ON CONFLICT DO NOTHING;

-- ── PANASZ (§4.3) — KB irreleváns, mindig sürgős ──
INSERT INTO triage_rules (situation, priority, escalation_email, routing) VALUES
('Panasz', 'surgos', NULL,
'{"kb_relevance":"irrelevant","default_restriction":"urgent","fallback":{"eredmeny":"Panasz rögzítve","statusz":"Sürgős","teendo":"Azonnali beavatkozás"},"rules":[
  {"channels":["mind"],"kb":"any","restriction":"any","automation":"urgent_handover","eredmeny":"Panasz rögzítve","statusz":"Sürgős","teendo":"Azonnali beavatkozás"}
]}'::jsonb)
ON CONFLICT DO NOTHING;

-- ── IDŐPONT (§4.4) — KB nem döntési feltétel; altípusonként (Új/Módosítás/Lemondás) ──
-- A subtypes mező tartalmazza a három altípus rules-listáját (csatornafüggetlen = "mind").
INSERT INTO triage_rules (situation, priority, escalation_email, routing) VALUES
('Időpont', 'onallo', NULL,
'{"kb_relevance":"not_applicable","default_restriction":"none","fallback":{"eredmeny":"Foglalási szándék rögzítve","statusz":"Nyitott","teendo":"Időpont véglegesítése"},"subtypes":{
  "Új":{"rules":[
    {"channels":["mind"],"kb":"any","restriction":"none","automation":"auto_booking","eredmeny":"Új időpont","statusz":"Lezárt","teendo":"Nincs további teendő"},
    {"channels":["mind"],"kb":"any","restriction":"handover","automation":"handover","eredmeny":"Foglalási szándék rögzítve","statusz":"Nyitott","teendo":"Időpont véglegesítése"}
  ]},
  "Módosítás":{"rules":[
    {"channels":["mind"],"kb":"any","restriction":"none","automation":"auto_modify","eredmeny":"Módosított időpont","statusz":"Lezárt","teendo":"Nincs további teendő"},
    {"channels":["mind"],"kb":"any","restriction":"handover","automation":"handover","eredmeny":"Módosítási szándék rögzítve","statusz":"Nyitott","teendo":"Időpont véglegesítése"},
    {"channels":["mind"],"kb":"any","restriction":"urgent","automation":"handover","eredmeny":"Módosítási szándék rögzítve","statusz":"Sürgős","teendo":"Időpont véglegesítése"}
  ]},
  "Lemondás":{"rules":[
    {"channels":["mind"],"kb":"any","restriction":"none","automation":"auto_cancel","eredmeny":"Törölt időpont","statusz":"Lezárt","teendo":"Nincs további teendő"},
    {"channels":["mind"],"kb":"any","restriction":"handover","automation":"handover","eredmeny":"Lemondási szándék rögzítve","statusz":"Nyitott","teendo":"Időpont véglegesítése"},
    {"channels":["mind"],"kb":"any","restriction":"urgent","automation":"handover","eredmeny":"Lemondási szándék rögzítve","statusz":"Sürgős","teendo":"Időpont véglegesítése"}
  ]}
}}'::jsonb)
ON CONFLICT DO NOTHING;

-- ── EGYÉB — default embernek ──
INSERT INTO triage_rules (situation, priority, escalation_email, routing) VALUES
('Egyéb', 'ember', NULL,
'{"kb_relevance":"irrelevant","default_restriction":"handover","fallback":{"eredmeny":"Igény rögzítve","statusz":"Nyitott","teendo":"Intézkedés"},"rules":[
  {"channels":["mind"],"kb":"any","restriction":"any","automation":"handover","eredmeny":"Igény rögzítve","statusz":"Nyitott","teendo":"Intézkedés"},
  {"channels":["mind"],"kb":"any","restriction":"urgent","automation":"urgent_handover","eredmeny":"Igény rögzítve","statusz":"Sürgős","teendo":"Azonnali beavatkozás"}
]}'::jsonb)
ON CONFLICT DO NOTHING;

