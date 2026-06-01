-- ── Server-side peer-vote badge awarding ─────────────────────────────────────
-- Ports the client-side checkAndAwardPeerVoteBadges logic to SQL so it fires
-- on BOTH manual verification AND the 24h auto-verify cron.

-- A. award_peer_vote_badges(p_user_ids uuid[])
--    Reads verified vote counts via get_verified_peer_vote_counts,
--    awards bronze(5) / silver(15) / gold(40) per category,
--    never downgrades or double-awards, notifies only on new/upgraded tiers.

CREATE OR REPLACE FUNCTION public.award_peer_vote_badges(p_user_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

  -- Badge metadata (must match ACHIEVEMENT_LIBRARY in achievements.ts)
  v_badges        jsonb := '{
    "shot_of_match":      {"emoji": "🎾", "name": "Shot of the Match"},
    "tactical_genius":    {"emoji": "🧠", "name": "Tactical Genius"},
    "best_recovery_shot": {"emoji": "🪃", "name": "Best Recovery Shot"},
    "comedy_gold":        {"emoji": "😂", "name": "Comedy Gold"},
    "hustle_award":       {"emoji": "💪", "name": "Hustle Award"}
  }'::jsonb;
BEGIN
  FOREACH v_uid IN ARRAY p_user_ids LOOP
    -- Get verified vote counts for this user
    FOR v_row IN
      SELECT category, vote_count
      FROM get_verified_peer_vote_counts(v_uid)
    LOOP
      -- Only process known peer-vote categories
      IF NOT v_badges ? v_row.category THEN CONTINUE; END IF;

      -- Determine highest qualifying tier
      IF    v_row.vote_count >= 40 THEN v_new_tier := 'gold';
      ELSIF v_row.vote_count >= 15 THEN v_new_tier := 'silver';
      ELSIF v_row.vote_count >= 5  THEN v_new_tier := 'bronze';
      ELSE  CONTINUE;
      END IF;

      -- Get existing tier for this user + category
      SELECT tier INTO v_existing_tier
      FROM user_badges
      WHERE user_id = v_uid AND badge_key = v_row.category;

      -- Rank tiers: gold=3, silver=2, bronze=1, null=0
      v_tier_rank_old := CASE v_existing_tier
        WHEN 'gold' THEN 3 WHEN 'silver' THEN 2 WHEN 'bronze' THEN 1 ELSE 0 END;
      v_tier_rank_new := CASE v_new_tier
        WHEN 'gold' THEN 3 WHEN 'silver' THEN 2 WHEN 'bronze' THEN 1 ELSE 0 END;

      -- Skip if already at this tier or higher (idempotent)
      IF v_tier_rank_old >= v_tier_rank_new THEN CONTINUE; END IF;

      -- Upsert the badge
      IF v_existing_tier IS NOT NULL THEN
        -- Upgrade existing
        UPDATE user_badges
        SET tier = v_new_tier, earned_at = now()
        WHERE user_id = v_uid AND badge_key = v_row.category;
      ELSE
        -- New badge
        INSERT INTO user_badges (user_id, badge_key, tier)
        VALUES (v_uid, v_row.category, v_new_tier);
      END IF;

      -- Notify the player (only on actual insert/upgrade — we're past the skip)
      v_emoji := v_badges->v_row.category->>'emoji';
      v_badge_name := v_badges->v_row.category->>'name';
      v_tier_label := INITCAP(v_new_tier);

      INSERT INTO notifications (user_id, type, title, message, related_id, read)
      VALUES (
        v_uid,
        'achievement',
        v_emoji || ' ' || v_tier_label || ' ' || v_badge_name || '!',
        'You''ve received ' || v_row.vote_count || ' verified votes — ' || v_tier_label || ' tier unlocked.',
        v_uid::text,
        false
      );
    END LOOP;
  END LOOP;
END;
$$;


-- B. Trigger on match_results: fire on transition TO 'verified'
--    Covers both manual confirm (MatchDetail.tsx) and 24h auto-verify cron.

CREATE OR REPLACE FUNCTION public.trigger_peer_vote_badges_on_verify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_player_ids uuid[];
BEGIN
  -- Only fire on transition TO verified from a non-verified state
  IF NEW.verification_status = 'verified'
     AND (OLD.verification_status IS NULL OR OLD.verification_status <> 'verified')
  THEN
    -- Collect all participants from both teams
    v_player_ids := COALESCE(NEW.team1_players, '{}') || COALESCE(NEW.team2_players, '{}');
    IF array_length(v_player_ids, 1) > 0 THEN
      PERFORM award_peer_vote_badges(v_player_ids);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Drop if exists, then create (idempotent)
DROP TRIGGER IF EXISTS trg_peer_vote_badges_on_verify ON match_results;
CREATE TRIGGER trg_peer_vote_badges_on_verify
  AFTER UPDATE OF verification_status ON match_results
  FOR EACH ROW
  EXECUTE FUNCTION trigger_peer_vote_badges_on_verify();

-- Notify PostgREST
NOTIFY pgrst, 'reload schema';
