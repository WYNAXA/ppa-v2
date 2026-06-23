-- ══════════════════════════════════════════════════════════════════════════════
-- Badge trigger exception guards
-- Wrap all badge-awarding triggers in EXCEPTION WHEN OTHERS so badge failures
-- are logged but NEVER block verification or rating_history writes.
-- Run in the Supabase SQL Editor — standalone, safe to apply immediately.
-- ══════════════════════════════════════════════════════════════════════════════


-- ── 1. award_career_badges_on_verify — wrap entire body ──────────────────────
-- Fires AFTER UPDATE OF verification_status ON match_results.
-- A badge insert error must NOT roll back the verification UPDATE.

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

  -- Wrap entire body so badge errors never block verification
  BEGIN
    v_player_ids := COALESCE(NEW.team1_players, '{}') || COALESCE(NEW.team2_players, '{}');
    IF array_length(v_player_ids, 1) IS NULL THEN RETURN NEW; END IF;

    FOREACH v_uid IN ARRAY v_player_ids LOOP
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

      SELECT COUNT(*) INTO v_group_count
      FROM group_members
      WHERE user_id = v_uid AND status = 'approved';

      IF v_wins >= 1
         AND NOT EXISTS (SELECT 1 FROM user_badges WHERE user_id = v_uid AND badge_key = 'first_win')
      THEN
        INSERT INTO user_badges (user_id, badge_key) VALUES (v_uid, 'first_win');
        INSERT INTO notifications (user_id, type, title, message, related_id, read)
        VALUES (v_uid, 'achievement',
          (v_badges->'first_win'->>'emoji') || ' ' || (v_badges->'first_win'->>'name') || ' earned!',
          'Won your first match', v_uid, false);
      END IF;

      IF v_streak >= 3
         AND NOT EXISTS (SELECT 1 FROM user_badges WHERE user_id = v_uid AND badge_key = 'on_fire')
      THEN
        INSERT INTO user_badges (user_id, badge_key) VALUES (v_uid, 'on_fire');
        INSERT INTO notifications (user_id, type, title, message, related_id, read)
        VALUES (v_uid, 'achievement',
          (v_badges->'on_fire'->>'emoji') || ' ' || (v_badges->'on_fire'->>'name') || ' earned!',
          '3 wins in a row', v_uid, false);
      END IF;

      IF v_total >= 10
         AND NOT EXISTS (SELECT 1 FROM user_badges WHERE user_id = v_uid AND badge_key = 'consistent')
      THEN
        INSERT INTO user_badges (user_id, badge_key) VALUES (v_uid, 'consistent');
        INSERT INTO notifications (user_id, type, title, message, related_id, read)
        VALUES (v_uid, 'achievement',
          (v_badges->'consistent'->>'emoji') || ' ' || (v_badges->'consistent'->>'name') || ' earned!',
          'Played 10 matches', v_uid, false);
      END IF;

      IF v_total >= 10 AND v_win_rate >= 70
         AND NOT EXISTS (SELECT 1 FROM user_badges WHERE user_id = v_uid AND badge_key = 'sharp_shooter')
      THEN
        INSERT INTO user_badges (user_id, badge_key) VALUES (v_uid, 'sharp_shooter');
        INSERT INTO notifications (user_id, type, title, message, related_id, read)
        VALUES (v_uid, 'achievement',
          (v_badges->'sharp_shooter'->>'emoji') || ' ' || (v_badges->'sharp_shooter'->>'name') || ' earned!',
          '70%+ win rate (10+ matches)', v_uid, false);
      END IF;

      IF v_group_count >= 3
         AND NOT EXISTS (SELECT 1 FROM user_badges WHERE user_id = v_uid AND badge_key = 'social')
      THEN
        INSERT INTO user_badges (user_id, badge_key) VALUES (v_uid, 'social');
        INSERT INTO notifications (user_id, type, title, message, related_id, read)
        VALUES (v_uid, 'achievement',
          (v_badges->'social'->>'emoji') || ' ' || (v_badges->'social'->>'name') || ' earned!',
          'Member of 3+ groups', v_uid, false);
      END IF;

      IF v_total >= 50
         AND NOT EXISTS (SELECT 1 FROM user_badges WHERE user_id = v_uid AND badge_key = 'veteran')
      THEN
        INSERT INTO user_badges (user_id, badge_key) VALUES (v_uid, 'veteran');
        INSERT INTO notifications (user_id, type, title, message, related_id, read)
        VALUES (v_uid, 'achievement',
          (v_badges->'veteran'->>'emoji') || ' ' || (v_badges->'veteran'->>'name') || ' earned!',
          '50+ matches played', v_uid, false);
      END IF;

      -- perfectionist (repeatable)
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
              INSERT INTO user_badges (user_id, badge_key) VALUES (v_uid, 'perfectionist');
              INSERT INTO notifications (user_id, type, title, message, related_id, read)
              VALUES (v_uid, 'achievement',
                (v_badges->'perfectionist'->>'emoji') || ' ' || (v_badges->'perfectionist'->>'name') || ' earned!',
                'Won 6-0, 6-0', v_uid, false);
            END IF;
          END IF;
        END;
      END IF;

    END LOOP;

  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[career-badges] failed for match_result %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;


-- ── 2. trigger_peer_vote_badges_on_verify — wrap body ────────────────────────

CREATE OR REPLACE FUNCTION public.trigger_peer_vote_badges_on_verify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_player_ids uuid[];
BEGIN
  IF NEW.verification_status = 'verified'
     AND (OLD.verification_status IS NULL OR OLD.verification_status <> 'verified')
  THEN
    BEGIN
      v_player_ids := COALESCE(NEW.team1_players, '{}') || COALESCE(NEW.team2_players, '{}');
      IF array_length(v_player_ids, 1) > 0 THEN
        PERFORM award_peer_vote_badges(v_player_ids);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[peer-vote-badges] failed for match_result %: %', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;


-- ── 3. award_giant_slayer_on_rating — wrap body + support skip flag ──────────

CREATE OR REPLACE FUNCTION public.award_giant_slayer_on_rating()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Skip during rebuild (session variable set by rebuild-ratings)
  IF current_setting('app.skip_badge_triggers', true) = 'true' THEN
    RETURN NEW;
  END IF;

  BEGIN
    IF NEW.actual_score <> 1 THEN RETURN NEW; END IF;
    IF NEW.opponent_avg_rating - NEW.rating_before < 200 THEN RETURN NEW; END IF;

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
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[giant-slayer] failed for user % on rating_history insert: %', NEW.user_id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
