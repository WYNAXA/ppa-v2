CREATE OR REPLACE FUNCTION public.confirm_invitee_for_match(
  p_match_id uuid,
  p_invitee_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_match record;
  v_is_player boolean := false;
  v_is_admin boolean := false;
  v_invitation_status text;
  v_new_player_ids uuid[];
  v_will_be_full boolean;
  v_invitee_name text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;

  v_is_player := v_user_id = ANY(COALESCE(v_match.player_ids, ARRAY[]::uuid[]));
  IF NOT v_is_player AND v_match.group_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM group_members
      WHERE group_id = v_match.group_id AND user_id = v_user_id AND role = 'admin'
    ) INTO v_is_admin;
  END IF;
  IF NOT v_is_player AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Only match players or group admins can confirm invitees';
  END IF;

  IF p_invitee_id = ANY(COALESCE(v_match.player_ids, ARRAY[]::uuid[])) THEN
    RAISE EXCEPTION 'Invitee is already in this match';
  END IF;

  SELECT status INTO v_invitation_status FROM match_invitations
  WHERE match_id = p_match_id AND invitee_id = p_invitee_id;
  IF v_invitation_status IS NULL THEN RAISE EXCEPTION 'No invitation found'; END IF;
  IF v_invitation_status <> 'accepted' THEN RAISE EXCEPTION 'Invitee has not accepted'; END IF;
  IF array_length(v_match.player_ids, 1) >= 4 THEN RAISE EXCEPTION 'Match is full'; END IF;

  v_new_player_ids := COALESCE(v_match.player_ids, ARRAY[]::uuid[]) || p_invitee_id;
  v_will_be_full := array_length(v_new_player_ids, 1) >= 4;

  UPDATE matches
  SET player_ids = v_new_player_ids,
      is_open = CASE WHEN v_will_be_full THEN false ELSE is_open END,
      open_elo_min = CASE WHEN v_will_be_full THEN NULL ELSE open_elo_min END,
      open_elo_max = CASE WHEN v_will_be_full THEN NULL ELSE open_elo_max END,
      status = CASE WHEN v_will_be_full THEN 'scheduled' ELSE status END,
      updated_at = now()
  WHERE id = p_match_id;

  IF v_will_be_full THEN
    UPDATE ringer_requests SET status = 'filled_by_other', responded_at = now()
      WHERE match_id = p_match_id AND status = 'pending';
    UPDATE match_invitations SET status = 'filled_by_other', responded_at = now()
      WHERE match_id = p_match_id AND status = 'pending' AND invitee_id <> p_invitee_id;
  END IF;

  SELECT name INTO v_invitee_name FROM profiles WHERE id = p_invitee_id;
  INSERT INTO notifications (user_id, type, title, message, related_id)
  VALUES (p_invitee_id, 'invitee_confirmed', 'You''re in!',
    'You''ve been confirmed for the match.', p_match_id);

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_invitee_for_match(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
