-- ======================================
-- DIGIDESK: Eseményvezérelt automatizációk tábla
-- Futtasd a Supabase SQL Editorban
-- ======================================

CREATE TABLE IF NOT EXISTS outbound_automations (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    trigger_type TEXT NOT NULL,
    enabled BOOLEAN DEFAULT false,
    delay_hours INTEGER DEFAULT 24,
    channel TEXT DEFAULT 'email',
    message_template TEXT DEFAULT '',
    target_tag TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Alapértelmezett automatizációk:
INSERT INTO outbound_automations (name, trigger_type, enabled, delay_hours, channel, message_template) VALUES
('No-show utáni üzenet', 'no_show', false, 24, 'email', 'Kedves {nev}!

Sajnálattal tapasztaltuk, hogy nem tudott megjelenni a(z) {szolgaltatas} időpontján ({idopont}).

Szeretne új időpontot foglalni? Szívesen segítünk!

Üdvözlettel,
A virtuális asszisztens csapata'),

('Inaktív ügyfél reaktiválás', 'inactive_client', false, 0, 'email', 'Kedves {nev}!

Régóta nem találkoztunk, és hiányzik nekünk! 😊

Szeretnénk felhívni a figyelmét aktuális szolgáltatásainkra. Foglaljon időpontot most, és mi gondoskodunk a legjobbról!

Üdvözlettel,
A virtuális asszisztens csapata'),

('Utánkövetés - elégedettség', 'follow_up', false, 48, 'email', 'Kedves {nev}!

Reméljük, elégedett volt a(z) {szolgaltatas} szolgáltatásunkkal!

Kérjük, ossza meg velünk tapasztalatát, hogy tovább fejlődhessünk.

Üdvözlettel,
A virtuális asszisztens csapata'),

('Ajánlatkövetés', 'price_inquiry_follow', false, 72, 'email', 'Kedves {nev}!

Korábban érdeklődött szolgáltatásaink iránt. Segíthetünk a döntésben?

Szívesen válaszolunk kérdéseire, vagy foglalunk Önnek egy konzultációs időpontot.

Üdvözlettel,
A virtuális asszisztens csapata'),

('Időpont lemondás - újrafoglalás', 'cancelled_no_rebook', false, 48, 'email', 'Kedves {nev}!

Lemondta korábbi időpontját ({szolgaltatas}). Szeretne új időpontot foglalni?

Várjuk visszajelzését!

Üdvözlettel,
A virtuális asszisztens csapata');

-- Nyomonkövetés tábla a dupla küldés elkerülésére
CREATE TABLE IF NOT EXISTS automation_sent_log (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL,
    automation_id INTEGER NOT NULL,
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(client_id, automation_id)
);
