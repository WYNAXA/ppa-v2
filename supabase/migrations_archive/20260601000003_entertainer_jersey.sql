-- ── Entertainer jersey: most verified peer votes received in a league week ────
-- Scope: per-league (mirrors yellow/black). Week: ISO week (Mon→Sun).
-- Does NOT touch or schedule award_weekly_jerseys (yellow/black stay dormant).

-- A. Weekly league peer-vote standings RPC
--    Returns each player's count of VERIFIED peer votes received in a given
--    ISO week, scoped to matches belonging to p_league_id.

CREATE OR REPLACE FUNCTION public.get_weekly_league_vote_standings(
  p_league_id uuid,
  p_week_start date DEFAULT NULL  -- Monday of the ISO week; NULL = current week
)
RETURNS TABLE(user_id uuid, vote_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    pv.voted_for_id AS user_id,
    COUNT(*) AS vote_count
  FROM match_peer_votes pv
  JOIN match_results mr ON mr.match_id = pv.match_id
  JOIN matches m         ON m.id = pv.match_id
  WHERE mr.verification_status = 'verified'
    AND m.league_id = p_league_id
    AND pv.created_at >= COALESCE(p_week_start, date_trunc('week', CURRENT_DATE)::date)
    AND pv.created_at <  COALESCE(p_week_start, date_trunc('week', CURRENT_DATE)::date) + INTERVAL '7 days'
  GROUP BY pv.voted_for_id
  ORDER BY vote_count DESC;
$$;


-- B. Award Entertainer jersey for a COMPLETED week
--    Finds the top player(s) in each active league for the PREVIOUS week,
--    co-awards ties, skips weeks with zero votes, idempotent.

CREATE OR REPLACE FUNCTION public.award_entertainer_jersey()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_week_start     date := (date_trunc('week', CURRENT_DATE) - INTERVAL '7 days')::date;
  v_league         record;
  v_top_count      bigint;
  v_winner         record;
  v_existing_user  uuid;
  v_player_name    text;
BEGIN
  FOR v_league IN SELECT id FROM leagues WHERE status = 'active' LOOP
    -- Get the highest vote count for this league+week
    SELECT MAX(vote_count) INTO v_top_count
    FROM get_weekly_league_vote_standings(v_league.id, v_week_start);

    -- Skip if no verified votes this week
    IF v_top_count IS NULL OR v_top_count = 0 THEN CONTINUE; END IF;

    -- Award all tied leaders
    FOR v_winner IN
      SELECT user_id, vote_count
      FROM get_weekly_league_vote_standings(v_league.id, v_week_start)
      WHERE vote_count = v_top_count
    LOOP
      -- Idempotent: check if this exact award already exists
      -- Use jersey_color + awarded_week to identify Entertainer awards per week
      SELECT lj.user_id INTO v_existing_user
      FROM league_jerseys lj
      WHERE lj.league_id = v_league.id
        AND lj.jersey_color = 'blue'
        AND lj.awarded_week = v_week_start
        AND lj.user_id = v_winner.user_id;

      IF v_existing_user IS NOT NULL THEN CONTINUE; END IF;

      -- Insert the jersey (use jersey_type for UI compat, jersey_color for SQL compat)
      INSERT INTO league_jerseys (league_id, user_id, jersey_number, jersey_color, jersey_type, awarded_week, reason)
      VALUES (
        v_league.id,
        v_winner.user_id,
        6,  -- jersey_number 6 = Entertainer (1=yellow,5=black from existing)
        'blue',
        'blue',
        v_week_start,
        'Entertainer — most peer votes this week (' || v_winner.vote_count || ')'
      )
      ON CONFLICT (league_id, jersey_number)
      DO UPDATE SET
        user_id = EXCLUDED.user_id,
        jersey_color = 'blue',
        jersey_type = 'blue',
        awarded_week = EXCLUDED.awarded_week,
        reason = EXCLUDED.reason
      WHERE league_jerseys.awarded_week < EXCLUDED.awarded_week
         OR league_jerseys.user_id <> EXCLUDED.user_id;

      -- Notify winner
      SELECT name INTO v_player_name FROM profiles WHERE id = v_winner.user_id;
      INSERT INTO notifications (user_id, type, title, message, related_id, read)
      VALUES (
        v_winner.user_id,
        'achievement',
        '🔵 Entertainer Jersey!',
        'You received the most peer votes in your league this week (' || v_winner.vote_count || ' votes).',
        v_league.id::text,
        false
      );
    END LOOP;
  END LOOP;
END;
$$;


-- C. Schedule: Monday 01:00 UTC (just after ISO week boundary)
SELECT cron.schedule(
  'award-entertainer-jersey',
  '0 1 * * 1',
  $$SELECT public.award_entertainer_jersey();$$
);

NOTIFY pgrst, 'reload schema';
