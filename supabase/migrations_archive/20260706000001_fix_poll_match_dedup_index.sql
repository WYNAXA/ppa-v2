-- ────────────────────────────────────────────────────────────────────────────
-- Fix: allow multiple distinct games at the same (match_date, match_time,
-- poll_id).  The old index keyed on slot alone, blocking the second INSERT
-- even when the player sets were completely different.
--
-- New dedup key: poll_id + match_date + match_time + sorted player_ids.
-- "Same game" = same poll, same slot, same four players.
-- ────────────────────────────────────────────────────────────────────────────

-- 1. Helper: deterministic text key from a uuid[] (sort then join)
CREATE OR REPLACE FUNCTION sorted_player_key(ids uuid[])
RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
AS $$
  SELECT array_to_string(
           (SELECT array_agg(u ORDER BY u) FROM unnest(ids) AS u),
           ','
         );
$$;

-- 2. Drop the over-broad index
DROP INDEX IF EXISTS idx_matches_no_poll_duplicates;

-- 3. Replacement: unique on (poll_id, date, time, sorted players)
CREATE UNIQUE INDEX idx_matches_no_poll_duplicates
ON matches (
  poll_id,
  match_date,
  match_time,
  (sorted_player_key(player_ids))
)
WHERE poll_id IS NOT NULL
  AND status NOT IN ('cancelled');
