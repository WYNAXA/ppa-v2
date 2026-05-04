-- FIX 4: Cancel ALL duplicate matches (keep earliest per poll+date+time, cancel rest)
WITH duplicates AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY match_date, match_time, poll_id
      ORDER BY created_at ASC
    ) as rn
  FROM matches
  WHERE poll_id IS NOT NULL
  AND status NOT IN ('cancelled')
)
UPDATE matches
SET status = 'cancelled'
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- FIX 3: Prevent future duplicates at DB level
CREATE UNIQUE INDEX IF NOT EXISTS idx_matches_no_poll_duplicates
ON matches(match_date, match_time, poll_id)
WHERE poll_id IS NOT NULL
AND status NOT IN ('cancelled');
