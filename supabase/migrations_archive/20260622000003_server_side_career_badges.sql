-- ══════════════════════════════════════════════════════════════════════════════
-- BLOCK 1: Dedup existing permanent badges + partial unique index
-- Run this FIRST in the SQL Editor.
-- ══════════════════════════════════════════════════════════════════════════════

-- 1a. Delete duplicate permanent badges, keeping the earliest per (user_id, badge_key)
WITH ranked AS (
  SELECT ctid,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, badge_key
      ORDER BY earned_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM user_badges
  WHERE badge_key IN ('first_win','on_fire','consistent','sharp_shooter','social','veteran')
)
DELETE FROM user_badges
WHERE ctid IN (SELECT ctid FROM ranked WHERE rn > 1);

-- 1b. Partial unique index for permanent badges only
-- Does NOT cover perfectionist/giant_slayer (repeatable) or peer-vote badges (tiered).
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_badges_permanent_unique
  ON user_badges (user_id, badge_key)
  WHERE badge_key IN ('first_win','on_fire','consistent','sharp_shooter','social','veteran');


-- ══════════════════════════════════════════════════════════════════════════════
-- BLOCK 2: award_career_badges_on_verify() function + trigger
-- Fires synchronously on match_results verification.
-- Awards: first_win, on_fire, consistent, sharp_shooter, social, veteran,
--         perfectionist.
-- Does NOT award giant_slayer — that needs rating_history which is written
-- asynchronously by the process-elo edge function (see Block 2b).
-- Run this SECOND.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.award_career_badges_on_verify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_player_ids   uuid[];
  v_uid          uuid;
  v_total        int;
  v_wins         int;
  v_win_rate     numeric;
  v_streak       int;
  v_group_count  int;
  v_result       record;
  v_is_winner    boolean;
  v_in_team1     boolean;

  v_badges jsonb := '{
    "first_win":     {"emoji": "🏆", "name": "First Victory"},
    "on_fire":       {"emoji": "🔥", "name": "On Fire"},
    "consistent":    {"emoji": "⚡", "name": "Consistent"},
    "sharp_shooter": {"emoji": "🎯", "name": "Sharp Shooter"},
    "social":        {"emoji": "👥", "name": "Social Butterfly"},
    "veteran":       {"emoji": "🌟", "name": "Veteran"},
    "perfectionist": {"emoji": "💎", "name": "Perfectionist"}
  }'::jsonb;
BEGIN
  -- Guard: only fire on transition TO verified
  IF NEW.verification_status <> 'verified' THEN RETURN NEW; END IF;
  IF OLD.verification_status IS NOT NULL AND OLD.verification_status = 'verified' THEN RETURN NEW; END IF;

  v_player_ids := COALESCE(NEW.team1_players, '{}') || COALESCE(NEW.team2_players, '{}');
  IF array_length(v_player_ids, 1) IS NULL THEN RETURN NEW; END IF;

  FOREACH v_uid IN ARRAY v_player_ids LOOP
    -- ── Compute stats from ALL verified results for this player ──

    SELECT
      COUNT(*),
      COUNT(*) FILTER (WHERE
        (mr.team1_players @> ARRAY[v_uid] AND mr.result_type = 'team1_win')
        OR (mr.team2_players @> ARRAY[v_uid] AND mr.result_type = 'team2_win')
      )
    INTO v_total, v_wins
    FROM match_results mr
    WHERE mr.verification_status = 'verified'
      AND (mr.team1_players @> ARRAY[v_uid] OR mr.team2_players @> ARRAY[v_uid]);

    v_win_rate := CASE WHEN v_total > 0 THEN (v_wins::numeric / v_total) * 100 ELSE 0 END;

    -- ── Win streak (most recent verified results, chronological desc) ──
    -- Includes the just-verified match.
    v_streak := 0;
    FOR v_result IN
      SELECT mr.result_type, mr.team1_players, mr.team2_players
      FROM match_results mr
      WHERE mr.verification_status = 'verified'
        AND (mr.team1_players @> ARRAY[v_uid] OR mr.team2_players @> ARRAY[v_uid])
      ORDER BY mr.created_at DESC
    LOOP
      v_in_team1 := v_result.team1_players @> ARRAY[v_uid];
      v_is_winner := (v_in_team1 AND v_result.result_type = 'team1_win')
                  OR (NOT v_in_team1 AND v_result.result_type = 'team2_win');
      IF v_is_winner THEN v_streak := v_streak + 1;
      ELSE EXIT;
      END IF;
    END LOOP;

    -- ── Group count ──
    SELECT COUNT(*) INTO v_group_count
    FROM group_members
    WHERE user_id = v_uid AND status = 'approved';

    -- ── Award permanent badges (existence-guarded, partial unique index as backstop) ──

    -- first_win
    IF v_wins >= 1
       AND NOT EXISTS (SELECT 1 FROM user_badges WHERE user_id = v_uid AND badge_key = 'first_win')
    THEN
      INSERT INTO user_badges (user_id, badge_key) VALUES (v_uid, 'first_win');
      INSERT INTO notifications (user_id, type, title, message, related_id, read)
      VALUES (v_uid, 'achievement',
        (v_badges->'first_win'->>'emoji') || ' ' || (v_badges->'first_win'->>'name') || ' earned!',
        'Won your first match', v_uid, false);
    END IF;

    -- on_fire
    IF v_streak >= 3
       AND NOT EXISTS (SELECT 1 FROM user_badges WHERE user_id = v_uid AND badge_key = 'on_fire')
    THEN
      INSERT INTO user_badges (user_id, badge_key) VALUES (v_uid, 'on_fire');
      INSERT INTO notifications (user_id, type, title, message, related_id, read)
      VALUES (v_uid, 'achievement',
        (v_badges->'on_fire'->>'emoji') || ' ' || (v_badges->'on_fire'->>'name') || ' earned!',
        '3 wins in a row', v_uid, false);
    END IF;

    -- consistent
    IF v_total >= 10
       AND NOT EXISTS (SELECT 1 FROM user_badges WHERE user_id = v_uid AND badge_key = 'consistent')
    THEN
      INSERT INTO user_badges (user_id, badge_key) VALUES (v_uid, 'consistent');
      INSERT INTO notifications (user_id, type, title, message, related_id, read)
      VALUES (v_uid, 'achievement',
        (v_badges->'consistent'->>'emoji') || ' ' || (v_badges->'consistent'->>'name') || ' earned!',
        'Played 10 matches', v_uid, false);
    END IF;

    -- sharp_shooter
    IF v_total >= 10 AND v_win_rate >= 70
       AND NOT EXISTS (SELECT 1 FROM user_badges WHERE user_id = v_uid AND badge_key = 'sharp_shooter')
    THEN
      INSERT INTO user_badges (user_id, badge_key) VALUES (v_uid, 'sharp_shooter');
      INSERT INTO notifications (user_id, type, title, message, related_id, read)
      VALUES (v_uid, 'achievement',
        (v_badges->'sharp_shooter'->>'emoji') || ' ' || (v_badges->'sharp_shooter'->>'name') || ' earned!',
        '70%+ win rate (10+ matches)', v_uid, false);
    END IF;

    -- social
    IF v_group_count >= 3
       AND NOT EXISTS (SELECT 1 FROM user_badges WHERE user_id = v_uid AND badge_key = 'social')
    THEN
      INSERT INTO user_badges (user_id, badge_key) VALUES (v_uid, 'social');
      INSERT INTO notifications (user_id, type, title, message, related_id, read)
      VALUES (v_uid, 'achievement',
        (v_badges->'social'->>'emoji') || ' ' || (v_badges->'social'->>'name') || ' earned!',
        'Member of 3+ groups', v_uid, false);
    END IF;

    -- veteran
    IF v_total >= 50
       AND NOT EXISTS (SELECT 1 FROM user_badges WHERE user_id = v_uid AND badge_key = 'veteran')
    THEN
      INSERT INTO user_badges (user_id, badge_key) VALUES (v_uid, 'veteran');
      INSERT INTO notifications (user_id, type, title, message, related_id, read)
      VALUES (v_uid, 'achievement',
        (v_badges->'veteran'->>'emoji') || ' ' || (v_badges->'veteran'->>'name') || ' earned!',
        '50+ matches played', v_uid, false);
    END IF;

    -- ── Repeatable: perfectionist (per qualifying match) ──
    -- sets_data is on match_results — available synchronously at verify time.

    v_in_team1 := NEW.team1_players @> ARRAY[v_uid];
    v_is_winner := (v_in_team1 AND NEW.result_type = 'team1_win')
                OR (NOT v_in_team1 AND NEW.result_type = 'team2_win');

    IF v_is_winner AND NEW.sets_data IS NOT NULL THEN
      DECLARE
        v_sets     jsonb;
        v_set      jsonb;
        v_set_count int;
        v_all_perfect boolean := true;
        v_my_score   int;
        v_their_score int;
      BEGIN
        v_sets := CASE
          WHEN jsonb_typeof(NEW.sets_data::jsonb) = 'array' THEN NEW.sets_data::jsonb
          ELSE '[]'::jsonb
        END;
        v_set_count := jsonb_array_length(v_sets);

        IF v_set_count >= 2 THEN
          FOR i IN 0 .. v_set_count - 1 LOOP
            v_set := v_sets->i;
            IF v_in_team1 THEN
              v_my_score := COALESCE((v_set->>'team1')::int, (v_set->>'team1_score')::int, -1);
              v_their_score := COALESCE((v_set->>'team2')::int, (v_set->>'team2_score')::int, -1);
            ELSE
              v_my_score := COALESCE((v_set->>'team2')::int, (v_set->>'team2_score')::int, -1);
              v_their_score := COALESCE((v_set->>'team1')::int, (v_set->>'team1_score')::int, -1);
            END IF;
            IF v_my_score <> 6 OR v_their_score <> 0 THEN
              v_all_perfect := false;
              EXIT;
            END IF;
          END LOOP;

          IF v_all_perfect THEN
            INSERT INTO user_badges (user_id, badge_key)
            VALUES (v_uid, 'perfectionist');
            INSERT INTO notifications (user_id, type, title, message, related_id, read)
            VALUES (v_uid, 'achievement',
              (v_badges->'perfectionist'->>'emoji') || ' ' || (v_badges->'perfectionist'->>'name') || ' earned!',
              'Won 6-0, 6-0', v_uid, false);
          END IF;
        END IF;
      END;
    END IF;

  END LOOP; -- player loop

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_career_badges_on_verify ON match_results;
CREATE TRIGGER trg_career_badges_on_verify
  AFTER UPDATE OF verification_status ON match_results
  FOR EACH ROW
  EXECUTE FUNCTION award_career_badges_on_verify();

NOTIFY pgrst, 'reload schema';


-- ══════════════════════════════════════════════════════════════════════════════
-- BLOCK 2b: giant_slayer badge — AFTER INSERT ON rating_history
-- Fires when process-elo writes a rating_history row (asynchronously, after
-- the verify transaction commits). This is the only moment match-time ELO
-- (rating_before, opponent_avg_rating) is available.
-- Repeatable: one award per qualifying match, guarded by a partial unique
-- index on (user_id, badge_key, match_result_id) to prevent double-award
-- if ELO is recomputed.
-- Run after Block 2.
-- ══════════════════════════════════════════════════════════════════════════════

-- Add match_result_id column to user_badges (nullable — only used by repeatable badges)
ALTER TABLE user_badges
  ADD COLUMN IF NOT EXISTS match_result_id uuid REFERENCES match_results(id) ON DELETE SET NULL;

-- Partial unique index: one giant_slayer per user per match
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_badges_giant_slayer_per_match
  ON user_badges (user_id, badge_key, match_result_id)
  WHERE badge_key = 'giant_slayer';

CREATE OR REPLACE FUNCTION public.award_giant_slayer_on_rating()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only award on wins where the ELO gap is >= 200
  IF NEW.actual_score <> 1 THEN RETURN NEW; END IF;
  IF NEW.opponent_avg_rating - NEW.rating_before < 200 THEN RETURN NEW; END IF;

  -- Idempotent: skip if already awarded for this user + match
  INSERT INTO user_badges (user_id, badge_key, match_result_id)
  VALUES (NEW.user_id, 'giant_slayer', NEW.match_result_id)
  ON CONFLICT (user_id, badge_key, match_result_id) WHERE badge_key = 'giant_slayer'
  DO NOTHING;

  IF FOUND THEN
    INSERT INTO notifications (user_id, type, title, message, related_id, read)
    VALUES (
      NEW.user_id,
      'achievement',
      '🗡️ Giant Slayer earned!',
      'Beat opponents rated 200+ ELO above you',
      NEW.user_id,
      false
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_giant_slayer_on_rating ON rating_history;
CREATE TRIGGER trg_giant_slayer_on_rating
  AFTER INSERT ON rating_history
  FOR EACH ROW
  EXECUTE FUNCTION award_giant_slayer_on_rating();

NOTIFY pgrst, 'reload schema';


-- ══════════════════════════════════════════════════════════════════════════════
-- BLOCK 3: One-time backfill (run ONCE in the SQL Editor after Blocks 1, 2, 2b)
-- Awards all currently-qualifying PERMANENT badges to all players.
-- Idempotent via NOT EXISTS check (partial unique index as backstop).
-- Does NOT send notifications (backfill is silent).
-- ══════════════════════════════════════════════════════════════════════════════

WITH player_stats AS (
  SELECT
    p.id AS user_id,
    COUNT(mr.id) AS total_matches,
    COUNT(mr.id) FILTER (WHERE
      (mr.team1_players @> ARRAY[p.id] AND mr.result_type = 'team1_win')
      OR (mr.team2_players @> ARRAY[p.id] AND mr.result_type = 'team2_win')
    ) AS wins
  FROM profiles p
  LEFT JOIN match_results mr ON mr.verification_status = 'verified'
    AND (mr.team1_players @> ARRAY[p.id] OR mr.team2_players @> ARRAY[p.id])
  GROUP BY p.id
),
group_counts AS (
  SELECT user_id, COUNT(*) AS cnt
  FROM group_members WHERE status = 'approved'
  GROUP BY user_id
),
badges_to_award AS (
  -- first_win
  SELECT user_id, 'first_win' AS badge_key
  FROM player_stats WHERE wins >= 1
  UNION ALL
  -- consistent
  SELECT user_id, 'consistent'
  FROM player_stats WHERE total_matches >= 10
  UNION ALL
  -- veteran
  SELECT user_id, 'veteran'
  FROM player_stats WHERE total_matches >= 50
  UNION ALL
  -- sharp_shooter
  SELECT user_id, 'sharp_shooter'
  FROM player_stats WHERE total_matches >= 10
    AND (wins::numeric / total_matches) * 100 >= 70
  UNION ALL
  -- social
  SELECT gc.user_id, 'social'
  FROM group_counts gc WHERE gc.cnt >= 3
)
INSERT INTO user_badges (user_id, badge_key)
SELECT b.user_id, b.badge_key FROM badges_to_award b
WHERE NOT EXISTS (
  SELECT 1 FROM user_badges ub
  WHERE ub.user_id = b.user_id AND ub.badge_key = b.badge_key
);

-- Note: on_fire is NOT backfilled because computing win streaks for all players
-- retroactively is expensive and the streak may no longer be current. It will
-- award naturally on the next verified match during an active streak.
