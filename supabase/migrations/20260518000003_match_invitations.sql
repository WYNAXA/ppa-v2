CREATE TABLE IF NOT EXISTS match_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  invitee_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  invited_by uuid NOT NULL REFERENCES profiles(id),
  is_broadcast boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'filled_by_other')),
  responded_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, invitee_id)
);

CREATE INDEX IF NOT EXISTS idx_match_invitations_match ON match_invitations(match_id);
CREATE INDEX IF NOT EXISTS idx_match_invitations_invitee ON match_invitations(invitee_id, status);

ALTER TABLE match_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY match_invitations_select ON match_invitations
FOR SELECT TO authenticated
USING (
  invitee_id = auth.uid()
  OR invited_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM matches m
    WHERE m.id = match_invitations.match_id
      AND auth.uid() = ANY(COALESCE(m.player_ids, ARRAY[]::uuid[]))
  )
);

CREATE OR REPLACE FUNCTION public.send_match_invitations(
  p_match_id uuid,
  p_invitee_ids uuid[]
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
  v_expires_at timestamptz;
  v_requester_name text;
  v_sent_count integer := 0;
  v_is_broadcast boolean;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;
  IF array_length(p_invitee_ids, 1) IS NULL THEN RAISE EXCEPTION 'No invitees'; END IF;

  v_is_broadcast := array_length(p_invitee_ids, 1) > 1;
  v_is_player := v_user_id = ANY(COALESCE(v_match.player_ids, ARRAY[]::uuid[]));
  IF NOT v_is_player AND v_match.group_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM group_members
      WHERE group_id = v_match.group_id AND user_id = v_user_id AND role = 'admin'
    ) INTO v_is_admin;
  END IF;
  IF NOT v_is_player AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Only match players or group admins can invite';
  END IF;

  v_expires_at := (v_match.match_date::timestamp + COALESCE(v_match.match_time, '00:00')::time) - INTERVAL '24 hours';
  IF v_expires_at <= now() THEN RAISE EXCEPTION 'Too late to send invitations'; END IF;

  SELECT name INTO v_requester_name FROM profiles WHERE id = v_user_id;
  v_requester_name := COALESCE(v_requester_name, 'A player');

  INSERT INTO match_invitations (match_id, invitee_id, invited_by, is_broadcast, expires_at)
  SELECT p_match_id, unnest(p_invitee_ids), v_user_id, v_is_broadcast, v_expires_at
  ON CONFLICT (match_id, invitee_id) DO NOTHING;
  GET DIAGNOSTICS v_sent_count = ROW_COUNT;

  INSERT INTO notifications (user_id, type, title, message, related_id)
  SELECT unnest(p_invitee_ids), 'match_invitation', 'Match invitation',
    v_requester_name || ' invited you to play in a match. Tap to see details.',
    p_match_id;

  RETURN jsonb_build_object('success', true, 'sent', v_sent_count, 'is_broadcast', v_is_broadcast, 'expires_at', v_expires_at);
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_match_invitations(uuid, uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.respond_match_invitation(
  p_match_id uuid,
  p_accept boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_invitation record;
  v_match record;
  v_invitee_name text;
  v_new_player_ids uuid[];
  v_will_be_full boolean;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_invitation FROM match_invitations
  WHERE match_id = p_match_id AND invitee_id = v_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'No invitation found'; END IF;
  IF v_invitation.status <> 'pending' THEN RAISE EXCEPTION 'Invitation already responded to'; END IF;
  IF v_invitation.expires_at <= now() THEN
    UPDATE match_invitations SET status = 'expired' WHERE id = v_invitation.id;
    RAISE EXCEPTION 'Invitation has expired';
  END IF;

  UPDATE match_invitations
  SET status = CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END, responded_at = now()
  WHERE id = v_invitation.id;

  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  SELECT name INTO v_invitee_name FROM profiles WHERE id = v_user_id;
  v_invitee_name := COALESCE(v_invitee_name, 'A player');

  IF p_accept AND NOT v_invitation.is_broadcast THEN
    IF v_user_id = ANY(COALESCE(v_match.player_ids, ARRAY[]::uuid[])) THEN
      RETURN jsonb_build_object('success', true, 'accepted', true, 'auto_filled', false);
    END IF;
    IF array_length(v_match.player_ids, 1) >= 4 THEN RAISE EXCEPTION 'Match is full'; END IF;

    v_new_player_ids := COALESCE(v_match.player_ids, ARRAY[]::uuid[]) || v_user_id;
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
        WHERE match_id = p_match_id AND status = 'pending' AND invitee_id <> v_user_id;
    END IF;

    INSERT INTO notifications (user_id, type, title, message, related_id)
    SELECT unnest(v_match.player_ids), 'invitee_joined',
      v_invitee_name || ' joined your match',
      v_invitee_name || ' has accepted the invitation and joined.', p_match_id;

    RETURN jsonb_build_object('success', true, 'accepted', true, 'auto_filled', true);
  END IF;

  IF p_accept AND v_invitation.is_broadcast THEN
    INSERT INTO notifications (user_id, type, title, message, related_id)
    VALUES (v_invitation.invited_by, 'invitation_accepted',
      v_invitee_name || ' is available',
      v_invitee_name || ' accepted your match invitation. Tap to confirm them.',
      p_match_id);
    RETURN jsonb_build_object('success', true, 'accepted', true, 'auto_filled', false);
  END IF;

  INSERT INTO notifications (user_id, type, title, message, related_id)
  VALUES (v_invitation.invited_by, 'invitation_declined',
    v_invitee_name || ' can''t play',
    v_invitee_name || ' isn''t available.', p_match_id);

  RETURN jsonb_build_object('success', true, 'accepted', false, 'auto_filled', false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.respond_match_invitation(uuid, boolean) TO authenticated;

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

  INSERT INTO notifications (user_id, type, title, message, related_id)
  VALUES (p_invitee_id, 'invitee_confirmed', 'You''re in!',
    'You''ve been confirmed for the match.', p_match_id);

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_invitee_for_match(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
