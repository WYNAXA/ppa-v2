-- Event entry codes and notes
ALTER TABLE events
ADD COLUMN IF NOT EXISTS entry_code text,
ADD COLUMN IF NOT EXISTS entry_notes text;
