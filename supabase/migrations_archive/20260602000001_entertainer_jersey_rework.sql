-- ── Entertainer jersey rework: true weekly transfer + append-only history ─────
-- Replaces the Phase 3b accumulation approach with:
--   1. ONE live holder row per league in league_jerseys (transfers on award)
--   2. Append-only entertainer_jersey_history (one winner per league per week)
-- Does NOT touch yellow/black (award_weekly_jerseys stays dormant).

-- ══════════════════════════════════════════════════════════════════════════════
-- B. Append-only winners log
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS entertainer_jersey_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id   uuid NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  week_start  date NOT NULL,
  vote_count  int  NOT NULL,
  awarded_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (league_id, week_start)
);

ALTER TABLE entertainer_jersey_history ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "ejh_select" ON entertainer_jersey_history FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- Backfill: migrate any existing blue league_jerseys rows into history,
-- then collapse to one live holder per league (most recent awarded_week).
-- ══════════════════════════════════════════════════════════════════════════════

-- Backfill history from existing blue rows (ON CONFLICT DO NOTHING for idempotency)
INSERT INTO entertainer_jersey_history (league_id, user_id, week_start, vote_count, awarded_at)
SELECT league_id, user_id, awarded_week, 0, created_at
FROM league_jerseys
WHERE jersey_color = 'blue' AND awarded_week IS NOT NULL
ON CONFLICT (league_id, week_start) DO NOTHING;

-- Remove all but the most-recent blue row per league
DELETE FROM league_jerseys lj
WHERE lj.jersey_color = 'blue'
  AND lj.id <> (
    SELECT id FROM league_jerseys
    WHERE league_id = lj.league_id AND jersey_color = 'blue'
    ORDER BY awarded_week DESC NULLS LAST
    LIMIT 1
  );

-- Ensure surviving blue rows have jersey_type = 'entertainer' (not 'blue')
UPDATE league_jerseys
SET jersey_type = 'entertainer'
WHERE jersey_color = 'blue';


-- ══════════════════════════════════════════════════════════════════════════════
-- A. Reworked award function: transfer + history + tiebreaker + notify-on-change
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.award_entertainer_jersey()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  -- When run on Tuesday, this still gives the Mon of the just-completed week
  v_week_start       date := (date_trunc('week', CURRENT_DATE) - INTERVAL '7 days')::date;
  v_league           record;
  v_top_count        bigint;
  v_winner_id        uuid;
  v_current_holder   uuid;
  v_history_exists   boolean;
BEGIN
  FOR v_league IN SELECT id FROM leagues WHERE status = 'active' LOOP

    -- 1. Get highest vote count for this league + completed week
    SELECT MAX(vote_count) INTO v_top_count
    FROM get_weekly_league_vote_standings(v_league.id, v_week_start);

    IF v_top_count IS NULL OR v_top_count = 0 THEN CONTINUE; END IF;

    -- 2. Tiebreaker: incumbent keeps if tied; else lowest user_id
    --    Get current holder
    SELECT user_id INTO v_current_holder
    FROM league_jerseys
    WHERE league_id = v_league.id AND jersey_color = 'blue';

    -- Check if incumbent is among tied leaders
    IF v_current_holder IS NOT NULL AND EXISTS (
      SELECT 1 FROM get_weekly_league_vote_standings(v_league.id, v_week_start)
      WHERE user_id = v_current_holder AND vote_count = v_top_count
    ) THEN
      v_winner_id := v_current_holder;  -- incumbent defends
    ELSE
      -- Pick deterministically: lowest user_id among tied leaders
      SELECT user_id INTO v_winner_id
      FROM get_weekly_league_vote_standings(v_league.id, v_week_start)
      WHERE vote_count = v_top_count
      ORDER BY user_id ASC
      LIMIT 1;
    END IF;

    IF v_winner_id IS NULL THEN CONTINUE; END IF;

    -- 3. Idempotent history insert (one row per league per week)
    SELECT EXISTS (
      SELECT 1 FROM entertainer_jersey_history
      WHERE league_id = v_league.id AND week_start = v_week_start
    ) INTO v_history_exists;

    IF NOT v_history_exists THEN
      INSERT INTO entertainer_jersey_history (league_id, user_id, week_start, vote_count)
      VALUES (v_league.id, v_winner_id, v_week_start, v_top_count)
      ON CONFLICT (league_id, week_start) DO NOTHING;

      -- 4. Notify ONLY on new history insert (never on re-run or retain)
      --    Notify if the jersey changes hands OR it's the first ever award
      IF v_current_holder IS NULL OR v_current_holder <> v_winner_id THEN
        INSERT INTO notifications (user_id, type, title, message, related_id, read)
        VALUES (
          v_winner_id,
          'achievement',
          '🔵 Entertainer Jersey!',
          'You''re the Entertainer — most peer votes in your league this week (' || v_top_count || ').',
          v_league.id::text,
          false
        );
      END IF;
    END IF;

    -- 5. Transfer the live jersey (upsert on league_id, jersey_type)
    INSERT INTO league_jerseys (league_id, user_id, jersey_number, jersey_color, jersey_type, awarded_week, reason, previous_holder)
    VALUES (
      v_league.id,
      v_winner_id,
      6,
      'blue',
      'entertainer',
      v_week_start,
      'Entertainer — most peer votes (' || v_top_count || ')',
      v_current_holder
    )
    ON CONFLICT (league_id, jersey_number)
    DO UPDATE SET
      previous_holder = league_jerseys.user_id,
      user_id         = EXCLUDED.user_id,
      awarded_week    = EXCLUDED.awarded_week,
      reason          = EXCLUDED.reason
    WHERE league_jerseys.awarded_week < EXCLUDED.awarded_week
       OR league_jerseys.user_id <> EXCLUDED.user_id;

  END LOOP;
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- D. Reschedule cron: Tuesday 02:00 UTC (grace period for 24h auto-verify)
-- ══════════════════════════════════════════════════════════════════════════════

SELECT cron.unschedule('award-entertainer-jersey');
SELECT cron.schedule(
  'award-entertainer-jersey',
  '0 2 * * 2',
  $$SELECT public.award_entertainer_jersey();$$
);

NOTIFY pgrst, 'reload schema';
