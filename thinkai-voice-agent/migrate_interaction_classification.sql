-- Migration to add structured classification to interactions
ALTER TABLE interactions
ADD COLUMN classification JSONB DEFAULT '{}'::jsonb;
