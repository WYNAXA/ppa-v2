-- Seed location for Bristol groups that don't have it set
UPDATE groups
SET city = 'Bristol'
WHERE (name ILIKE '%BS3%' OR name ILIKE '%Bristol%')
AND (city IS NULL OR city = '');

-- Also ensure the test group has city set
UPDATE groups
SET city = 'Bristol'
WHERE id = 'bb35c502-b5c9-4b23-8379-b81c2066c654'
AND (city IS NULL OR city = '');
