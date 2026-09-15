-- Update confirm_ringer_for_match to close is_open when match fills

CREATE OR REPLACE FUNCTION public.confirm_ringer_for_match(
  p_match_id uuid,
  p_ringer_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_match record;
  v_is_admin boolean := false;
  v_is_player boolean := false;
  v_request_status text;
  v_new_player_ids uuid[];
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;

  v_is_player := v_user_id = ANY(COALESCE(v_match.player_ids, ARRAY[]::uuid[]));
  IF NOT v_is_player AND v_match.group_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM group_members
      WHERE group_id = v_match.group_id AND user_id = v_user_id AND role = 'admin'
    ) INTO v_is_admin;
  END IF;

  IF NOT v_is_player AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Only match players or group admins can confirm ringers';
  END IF;

  SELECT status INTO v_request_status FROM ringer_requests
  WHERE match_id = p_match_id AND ringer_id = p_ringer_id;
  IF v_request_status IS NULL THEN RAISE EXCEPTION 'No request found for this ringer'; END IF;
  IF v_request_status <> 'accepted' THEN RAISE EXCEPTION 'Ringer has not accepted'; END IF;
  IF array_length(v_match.player_ids, 1) >= 4 THEN RAISE EXCEPTION 'Match is already full'; END IF;

  v_new_player_ids := COALESCE(v_match.player_ids, ARRAY[]::uuid[]) || p_ringer_id;

  UPDATE matches
  SET player_ids = v_new_player_ids,
      status = CASE WHEN array_length(v_new_player_ids, 1) >= 4 THEN 'scheduled' ELSE status END,
      is_open = CASE WHEN array_length(v_new_player_ids, 1) >= 4 THEN false ELSE is_open END,
      open_elo_min = CASE WHEN array_length(v_new_player_ids, 1) >= 4 THEN NULL ELSE open_elo_min END,
      open_elo_max = CASE WHEN array_length(v_new_player_ids, 1) >= 4 THEN NULL ELSE open_elo_max END,
      updated_at = now()
  WHERE id = p_match_id;

  UPDATE ringer_requests
  SET status = 'filled_by_other', responded_at = now()
  WHERE match_id = p_match_id AND ringer_id <> p_ringer_id AND status = 'pending';

  INSERT INTO notifications (user_id, type, title, message, related_id)
  VALUES (p_ringer_id, 'ringer_confirmed', 'You''re in!',
    'You''ve been confirmed for the match. Check details.', p_match_id);

  RETURN jsonb_build_object('success', true);
END;
$$;

NOTIFY pgrst, 'reload schema';
