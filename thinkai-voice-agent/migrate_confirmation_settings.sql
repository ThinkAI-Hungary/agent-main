-- Visszaigazoló email beállítások (Automatikus értesítések oldal)
-- Futattd a Supabase SQL Editor-ban a projekt adatbázisán.
ALTER TABLE public.reminder_settings ADD COLUMN IF NOT EXISTS confirmation_enabled BOOLEAN DEFAULT true;
ALTER TABLE public.reminder_settings ADD COLUMN IF NOT EXISTS confirmation_subject TEXT DEFAULT 'Időpont visszaigazolás';
ALTER TABLE public.reminder_settings ADD COLUMN IF NOT EXISTS confirmation_template TEXT;
ALTER TABLE public.reminder_settings ADD COLUMN IF NOT EXISTS confirmation_cancel_link BOOLEAN DEFAULT true;

-- Meglévő sorok: jelenlegi működéssel induljanak (visszaigazolás megy, lemondási linkkel)
UPDATE public.reminder_settings
SET confirmation_enabled = true,
    confirmation_subject = COALESCE(confirmation_subject, 'Időpont visszaigazolás'),
    confirmation_cancel_link = true;

NOTIFY pgrst, 'reload schema';
