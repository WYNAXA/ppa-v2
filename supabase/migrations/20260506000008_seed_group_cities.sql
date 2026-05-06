-- Seed city for Bristol groups by admin
UPDATE groups
SET city = 'Bristol'
WHERE admin_id = '80a9cb54-cec2-45a4-a67f-aea27f5f7d36'
AND (city IS NULL OR city = '');

-- Also set by name pattern
UPDATE groups
SET city = 'Bristol'
WHERE (name ILIKE '%BS3%' OR name ILIKE '%Bristol%' OR name ILIKE '%padel team%')
AND (city IS NULL OR city = '');
