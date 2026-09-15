-- ── Fix: claim_open_match should keep is_open=true until match is full ───────
-- Previously the RPC unconditionally set is_open=false on any claim, even if
-- the match only had 2-3 players. Now uses the same CASE pattern as
-- confirm_ringer_for_match and respond_match_invitation.

CREATE OR REPLACE FUNCTION public.claim_open_match(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_match record;
  v_user_elo integer;
  v_claimer_name text;
  v_new_player_ids uuid[];
  v_conflict record;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;
  IF NOT v_match.is_open THEN RAISE EXCEPTION 'Match is no longer open'; END IF;
  IF array_length(v_match.player_ids, 1) >= 4 THEN RAISE EXCEPTION 'Match is full'; END IF;
  IF v_user_id = ANY(COALESCE(v_match.player_ids, ARRAY[]::uuid[])) THEN
    RAISE EXCEPTION 'You are already in this match';
  END IF;

  SELECT internal_ranking INTO v_user_elo FROM profiles WHERE id = v_user_id;
  IF v_user_elo IS NULL THEN RAISE EXCEPTION 'No ELO on profile'; END IF;
  IF v_user_elo < v_match.open_elo_min OR v_user_elo > v_match.open_elo_max THEN
    RAISE EXCEPTION 'Your ELO is outside the match range';
  END IF;

  -- Self-conflict check
  SELECT * INTO v_conflict
  FROM check_self_conflict(v_user_id, v_match.match_date, v_match.match_time::time, p_match_id)
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'You already have a match scheduled at %. Can''t accept another.',
      COALESCE(to_char(v_conflict.conflicting_time, 'HH24:MI'), 'that time');
  END IF;

  v_new_player_ids := COALESCE(v_match.player_ids, ARRAY[]::uuid[]) || v_user_id;

  UPDATE matches
  SET player_ids = v_new_player_ids,
      is_open = CASE WHEN array_length(v_new_player_ids, 1) >= 4 THEN false ELSE is_open END,
      open_elo_min = CASE WHEN array_length(v_new_player_ids, 1) >= 4 THEN NULL ELSE open_elo_min END,
      open_elo_max = CASE WHEN array_length(v_new_player_ids, 1) >= 4 THEN NULL ELSE open_elo_max END,
      status = CASE WHEN array_length(v_new_player_ids, 1) >= 4 THEN 'scheduled' ELSE status END,
      updated_at = now()
  WHERE id = p_match_id;

  UPDATE ringer_requests
  SET status = 'filled_by_other', responded_at = now()
  WHERE match_id = p_match_id AND status = 'pending';

  SELECT name INTO v_claimer_name FROM profiles WHERE id = v_user_id;
  v_claimer_name := COALESCE(v_claimer_name, 'A player');

  INSERT INTO notifications (user_id, type, title, message, related_id)
  SELECT unnest(v_match.player_ids), 'open_match_claimed',
    v_claimer_name || ' joined your match',
    v_claimer_name || ' has claimed the open spot.',
    p_match_id;

  INSERT INTO notifications (user_id, type, title, message, related_id)
  VALUES (v_user_id, 'open_match_confirmed', 'You''re in!',
    'You''ve claimed an open match. Check details.', p_match_id);

  RETURN jsonb_build_object('success', true);
END;
$$;

NOTIFY pgrst, 'reload schema';
