-- 20260602000002_rewards_hotfixes.sql
-- Hotfixes applied directly to production on 2026-06-02 via the Supabase dashboard,
-- captured here so the repo matches prod.
--
--   1. award_peer_vote_badges: notification insert was casting the user id
--      (v_uid) to text into the uuid column "related_id" -> fixed to plain v_uid.
--   2. league_jerseys: re-keyed to UNIQUE (league_id, jersey_type) so the
--      Entertainer jersey is a single transferring current-holder row.
--      (Was UNIQUE (league_id, jersey_type, awarded_week), which would have
--      accumulated one row per week and broken the transfer logic.)
--   3. award_entertainer_jersey: removed references to the non-existent
--      "jersey_number" column, pointed ON CONFLICT at the real (league_id,
--      jersey_type) key, and fixed the same related_id ::text cast.

-- ---------------------------------------------------------------------------
-- 1 & 2. Re-key league_jerseys (clear orphan rows from deleted leagues first)
-- ---------------------------------------------------------------------------
DELETE FROM league_jerseys lj
WHERE NOT EXISTS (SELECT 1 FROM leagues l WHERE l.id = lj.league_id);

ALTER TABLE league_jerseys
  DROP CONSTRAINT IF EXISTS league_jerseys_league_id_jersey_type_awarded_week_key;
ALTER TABLE league_jerseys
  DROP CONSTRAINT IF EXISTS league_jerseys_league_id_jersey_type_key;
ALTER TABLE league_jerseys
  ADD CONSTRAINT league_jerseys_league_id_jersey_type_key UNIQUE (league_id, jersey_type);

-- ---------------------------------------------------------------------------
-- 1. Corrected peer-vote badge function (related_id no longer cast to text)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.award_peer_vote_badges(p_user_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid           uuid;
  v_row           record;
  v_existing_tier text;
  v_new_tier      text;
  v_tier_rank_old int;
  v_tier_rank_new int;
  v_emoji         text;
  v_badge_name    text;
  v_tier_label    text;
  v_badges        jsonb := '{
    "shot_of_match":      {"emoji": "🎾", "name": "Shot of the Match"},
    "tactical_genius":    {"emoji": "🧠", "name": "Tactical Genius"},
    "best_recovery_shot": {"emoji": "🪃", "name": "Best Recovery Shot"},
    "comedy_gold":        {"emoji": "😂", "name": "Comedy Gold"},
    "hustle_award":       {"emoji": "💪", "name": "Hustle Award"}
  }'::jsonb;
BEGIN
  FOREACH v_uid IN ARRAY p_user_ids LOOP
    FOR v_row IN
      SELECT vote_category, vote_count
      FROM get_verified_peer_vote_counts(v_uid)
    LOOP
      IF NOT v_badges ? v_row.vote_category THEN CONTINUE; END IF;

      IF    v_row.vote_count >= 40 THEN v_new_tier := 'gold';
      ELSIF v_row.vote_count >= 15 THEN v_new_tier := 'silver';
      ELSIF v_row.vote_count >= 5  THEN v_new_tier := 'bronze';
      ELSE  CONTINUE;
      END IF;

      SELECT tier INTO v_existing_tier
      FROM user_badges
      WHERE user_id = v_uid AND badge_key = v_row.vote_category;

      v_tier_rank_old := CASE v_existing_tier
        WHEN 'gold' THEN 3 WHEN 'silver' THEN 2 WHEN 'bronze' THEN 1 ELSE 0 END;
      v_tier_rank_new := CASE v_new_tier
        WHEN 'gold' THEN 3 WHEN 'silver' THEN 2 WHEN 'bronze' THEN 1 ELSE 0 END;

      IF v_tier_rank_old >= v_tier_rank_new THEN CONTINUE; END IF;

      IF v_existing_tier IS NOT NULL THEN
        UPDATE user_badges
        SET tier = v_new_tier, earned_at = now()
        WHERE user_id = v_uid AND badge_key = v_row.vote_category;
      ELSE
        INSERT INTO user_badges (user_id, badge_key, tier)
        VALUES (v_uid, v_row.vote_category, v_new_tier);
      END IF;

      v_emoji := v_badges->v_row.vote_category->>'emoji';
      v_badge_name := v_badges->v_row.vote_category->>'name';
      v_tier_label := INITCAP(v_new_tier);

      INSERT INTO notifications (user_id, type, title, message, related_id, read)
      VALUES (
        v_uid,
        'achievement',
        v_emoji || ' ' || v_tier_label || ' ' || v_badge_name || '!',
        'You''ve received ' || v_row.vote_count || ' verified votes — ' || v_tier_label || ' tier unlocked.',
        v_uid,
        false
      );
    END LOOP;
  END LOOP;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Corrected Entertainer jersey function
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.award_entertainer_jersey()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_week_start       date := (date_trunc('week', CURRENT_DATE) - INTERVAL '7 days')::date;
  v_league           record;
  v_top_count        bigint;
  v_winner_id        uuid;
  v_current_holder   uuid;
  v_history_exists   boolean;
BEGIN
  FOR v_league IN SELECT id FROM leagues WHERE status = 'active' LOOP

    SELECT MAX(vote_count) INTO v_top_count
    FROM get_weekly_league_vote_standings(v_league.id, v_week_start);

    IF v_top_count IS NULL OR v_top_count = 0 THEN CONTINUE; END IF;

    SELECT user_id INTO v_current_holder
    FROM league_jerseys
    WHERE league_id = v_league.id AND jersey_type = 'entertainer';

    IF v_current_holder IS NOT NULL AND EXISTS (
      SELECT 1 FROM get_weekly_league_vote_standings(v_league.id, v_week_start)
      WHERE user_id = v_current_holder AND vote_count = v_top_count
    ) THEN
      v_winner_id := v_current_holder;
    ELSE
      SELECT user_id INTO v_winner_id
      FROM get_weekly_league_vote_standings(v_league.id, v_week_start)
      WHERE vote_count = v_top_count
      ORDER BY user_id ASC
      LIMIT 1;
    END IF;

    IF v_winner_id IS NULL THEN CONTINUE; END IF;

    SELECT EXISTS (
      SELECT 1 FROM entertainer_jersey_history
      WHERE league_id = v_league.id AND week_start = v_week_start
    ) INTO v_history_exists;

    IF NOT v_history_exists THEN
      INSERT INTO entertainer_jersey_history (league_id, user_id, week_start, vote_count)
      VALUES (v_league.id, v_winner_id, v_week_start, v_top_count)
      ON CONFLICT (league_id, week_start) DO NOTHING;

      IF v_current_holder IS NULL OR v_current_holder <> v_winner_id THEN
        INSERT INTO notifications (user_id, type, title, message, related_id, read)
        VALUES (
          v_winner_id,
          'achievement',
          '🔵 Entertainer Jersey!',
          'You''re the Entertainer — most peer votes in your league this week (' || v_top_count || ').',
          v_league.id,
          false
        );
      END IF;
    END IF;

    INSERT INTO league_jerseys (league_id, user_id, jersey_color, jersey_type, awarded_week, reason, previous_holder)
    VALUES (
      v_league.id,
      v_winner_id,
      'blue',
      'entertainer',
      v_week_start,
      'Entertainer — most peer votes (' || v_top_count || ')',
      v_current_holder
    )
    ON CONFLICT (league_id, jersey_type)
    DO UPDATE SET
      previous_holder = league_jerseys.user_id,
      user_id         = EXCLUDED.user_id,
      awarded_week    = EXCLUDED.awarded_week,
      reason          = EXCLUDED.reason
    WHERE league_jerseys.awarded_week < EXCLUDED.awarded_week
       OR league_jerseys.user_id <> EXCLUDED.user_id;

  END LOOP;
END;
$function$;

NOTIFY pgrst, 'reload schema';
