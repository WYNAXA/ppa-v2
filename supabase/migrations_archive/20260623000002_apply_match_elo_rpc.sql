-- ══════════════════════════════════════════════════════════════════════════════
-- apply_match_elo: atomic ELO application for one match result.
-- Replaces the per-player write loop in process-elo with a single
-- transactional DB function. Fixes Bug 1 (concurrent race) and
-- Bug 3 (partial write / matches_played double-count).
--
-- Run in the Supabase SQL Editor.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.apply_match_elo(
  p_match_result_id uuid,
  p_match_id        uuid,
  p_updates         jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_already_processed boolean;
  v_player            jsonb;
  v_player_id         uuid;
  v_rating_change     int;
  v_rating_before     int;
  v_rating_after      int;
  v_expected_score    numeric;
  v_actual_score      numeric;
  v_k_factor          int;
  v_opponent_ids      uuid[];
  v_opponent_avg      int;
  v_is_provisional    boolean;
  v_is_winner         boolean;
  v_current_peak      int;
  v_current_rating    int;
  v_new_rating        int;
  v_new_mp            int;
  v_today             date := CURRENT_DATE;
  v_applied           int := 0;
BEGIN
  -- ── 1. Idempotency gate ──
  SELECT elo_processed INTO v_already_processed
  FROM match_results
  WHERE id = p_match_result_id
  FOR UPDATE;  -- lock the match_result row too

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'match_result not found');
  END IF;

  IF v_already_processed THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'already_processed');
  END IF;

  -- ── 2. Lock all participating player rows (sorted by id to prevent deadlock) ──
  PERFORM p.id
  FROM profiles p
  WHERE p.id IN (
    SELECT (elem->>'player_id')::uuid
    FROM jsonb_array_elements(p_updates) AS elem
  )
  ORDER BY p.id
  FOR UPDATE;

  -- ── 3. Apply each player's rating change as a DELTA ──
  FOR v_player IN SELECT * FROM jsonb_array_elements(p_updates)
  LOOP
    v_player_id     := (v_player->>'player_id')::uuid;
    v_rating_change := (v_player->>'rating_change')::int;
    v_rating_before := (v_player->>'rating_before')::int;
    v_rating_after  := (v_player->>'rating_after')::int;
    v_expected_score := (v_player->>'expected_score')::numeric;
    v_actual_score  := (v_player->>'actual_score')::numeric;
    v_k_factor      := (v_player->>'k_factor')::int;
    v_opponent_avg  := (v_player->>'opponent_avg_rating')::int;
    v_is_provisional := (v_player->>'is_provisional')::boolean;
    v_is_winner     := (v_player->>'is_winner')::boolean;

    -- Parse opponent_ids from JSON array
    SELECT ARRAY(
      SELECT (elem #>> '{}')::uuid
      FROM jsonb_array_elements(v_player->'opponent_ids') AS elem
    ) INTO v_opponent_ids;

    -- Apply delta to profile (not absolute overwrite)
    UPDATE profiles
    SET internal_ranking = GREATEST(0, LEAST(3000, internal_ranking + v_rating_change)),
        matches_played   = matches_played + 1,
        is_provisional   = (matches_played + 1) < 10,
        peak_elo         = CASE
                             WHEN GREATEST(0, LEAST(3000, internal_ranking + v_rating_change)) > COALESCE(peak_elo, 0)
                             THEN GREATEST(0, LEAST(3000, internal_ranking + v_rating_change))
                             ELSE peak_elo
                           END,
        peak_elo_date    = CASE
                             WHEN GREATEST(0, LEAST(3000, internal_ranking + v_rating_change)) > COALESCE(peak_elo, 0)
                             THEN v_today
                             ELSE peak_elo_date
                           END
    WHERE id = v_player_id;

    -- Insert rating_history (NOT upsert — must succeed or roll back)
    INSERT INTO rating_history (
      user_id, match_result_id, rating_before, rating_after, rating_change,
      expected_score, actual_score, k_factor, opponent_ids, opponent_avg_rating, is_provisional
    ) VALUES (
      v_player_id, p_match_result_id, v_rating_before, v_rating_after, v_rating_change,
      v_expected_score, v_actual_score, v_k_factor, v_opponent_ids, v_opponent_avg, v_is_provisional
    )
    ON CONFLICT (user_id, match_result_id) DO NOTHING;

    -- Insert ranking_changes (NOT wrapped in try/catch — must succeed or roll back)
    INSERT INTO ranking_changes (
      player_id, match_id, match_result_id, previous_points, new_points,
      points_change, opponent_ids, opponent_avg_rating, is_winner
    ) VALUES (
      v_player_id, p_match_id, p_match_result_id, v_rating_before, v_rating_after,
      v_rating_change, v_opponent_ids, v_opponent_avg, v_is_winner
    )
    ON CONFLICT (player_id, match_result_id) DO NOTHING;

    v_applied := v_applied + 1;
  END LOOP;

  -- ── 4. Mark as processed (in the same transaction) ──
  UPDATE match_results
  SET elo_processed = true,
      verified_at = COALESCE(verified_at, NOW())
  WHERE id = p_match_result_id;

  RETURN jsonb_build_object('applied', v_applied);
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_match_elo(uuid, uuid, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
