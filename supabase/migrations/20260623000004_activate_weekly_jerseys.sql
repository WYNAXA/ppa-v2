-- ══════════════════════════════════════════════════════════════════════════════
-- Activate yellow (League Leader) and black (Wooden Spoon) jerseys.
-- Run in the Supabase SQL Editor. Does NOT schedule the cron — run the
-- dry-run query first, then schedule separately after approval.
-- ══════════════════════════════════════════════════════════════════════════════


-- ── 1. Drop the (league_id, user_id) unique constraint ──────────────────────
-- A player should be able to hold multiple jerseys in the same league
-- (e.g., league leader AND entertainer).
ALTER TABLE league_jerseys
  DROP CONSTRAINT IF EXISTS league_jerseys_league_id_user_id_key;


-- ── 2. Updated award_weekly_jerseys() ───────────────────────────────────────
-- Changes from the original:
--   a) Tiebreak on wins (ranking_points DESC, wins DESC for yellow;
--      ranking_points ASC, wins ASC for black)
--   b) Sets jersey_type = 'yellow' / 'black' (not just jersey_color)
--   c) ON CONFLICT (league_id, jersey_type) — consistent with entertainer

CREATE OR REPLACE FUNCTION public.award_weekly_jerseys()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_league record;
BEGIN
  FOR v_league IN SELECT id FROM leagues WHERE status = 'active' LOOP

    -- Yellow: league leader (top ranking_points, tiebreak on most wins)
    INSERT INTO league_jerseys (
      league_id, user_id, jersey_number, jersey_color, jersey_type, awarded_week, reason
    )
    SELECT
      v_league.id, user_id, 1, 'yellow', 'yellow', CURRENT_DATE, 'League leader'
    FROM league_standings
    WHERE league_id = v_league.id
      AND matches_played > 0
    ORDER BY ranking_points DESC, wins DESC
    LIMIT 1
    ON CONFLICT (league_id, jersey_type)
    DO UPDATE SET
      user_id      = EXCLUDED.user_id,
      jersey_color = 'yellow',
      awarded_week = CURRENT_DATE,
      reason       = 'League leader';

    -- Black: wooden spoon (bottom ranking_points, tiebreak on fewest wins)
    INSERT INTO league_jerseys (
      league_id, user_id, jersey_number, jersey_color, jersey_type, awarded_week, reason
    )
    SELECT
      v_league.id, user_id, 5, 'black', 'black', CURRENT_DATE, 'Bottom of standings'
    FROM league_standings
    WHERE league_id = v_league.id
      AND matches_played > 0
    ORDER BY ranking_points ASC, wins ASC
    LIMIT 1
    ON CONFLICT (league_id, jersey_type)
    DO UPDATE SET
      user_id      = EXCLUDED.user_id,
      jersey_color = 'black',
      awarded_week = CURRENT_DATE,
      reason       = 'Bottom of standings';

  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
