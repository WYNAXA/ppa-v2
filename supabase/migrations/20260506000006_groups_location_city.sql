-- Ensure groups has both location and city columns
ALTER TABLE groups ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS city text;

-- Seed Bristol for existing groups
UPDATE groups
SET location = 'Bristol', city = 'Bristol'
WHERE (name ILIKE '%BS3%' OR name ILIKE '%Bristol%')
AND (city IS NULL OR city = '');
