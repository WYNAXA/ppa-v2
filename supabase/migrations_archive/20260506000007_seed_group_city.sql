-- Seed city for Bristol groups
UPDATE groups
SET city = 'Bristol'
WHERE (name ILIKE '%BS3%' OR name ILIKE '%Bristol%')
AND (city IS NULL OR city = '');
