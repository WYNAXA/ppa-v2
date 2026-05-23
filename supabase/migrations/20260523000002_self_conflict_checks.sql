-- ── Self-conflict checks in match acceptance RPCs ───────────────────────────
--
-- Hard block: if the user already has a match on the same date within a
-- 2-hour window (90 min before to 30 min after), reject the action.
-- This prevents double-booking when accepting invitations or claiming open matches.

-- ── Helper: check self-conflict ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.check_self_conflict(
  p_user_id    uuid,
  p_match_date date,
  p_match_time time,
  p_exclude_match_id uuid DEFAULT NULL
)
RETURNS TABLE (
  conflicting_match_id uuid,
  conflicting_time     time
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start time;
  v_window_end   time;
BEGIN
  -- If no time provided, skip time-granular check (date-only overlap)
  IF p_match_time IS NULL THEN
    RETURN QUERY
    SELECT m.id, m.match_time::time
    FROM matches m
    WHERE m.match_date = p_match_date
      AND m.status NOT IN ('cancelled', 'completed')
      AND p_user_id = ANY(m.player_ids)
      AND (p_exclude_match_id IS NULL OR m.id <> p_exclude_match_id);
    RETURN;
  END IF;

  v_window_start := p_match_time - interval '90 minutes';
  v_window_end   := p_match_time + interval '30 minutes';

  RETURN QUERY
  SELECT m.id, m.match_time::time
  FROM matches m
  WHERE m.match_date = p_match_date
    AND m.status NOT IN ('cancelled', 'completed')
    AND p_user_id = ANY(m.player_ids)
    AND (p_exclude_match_id IS NULL OR m.id <> p_exclude_match_id)
    AND (
      m.match_time IS NULL  -- timeless match on same day = potential conflict
      OR (m.match_time::time >= v_window_start AND m.match_time::time <= v_window_end)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_self_conflict(uuid, date, time, uuid) TO authenticated, service_role;

-- ── Updated: claim_open_match with self-conflict check ──────────────────────

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
  SET player_ids = v_new_player_ids, is_open = false,
      open_elo_min = NULL, open_elo_max = NULL,
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

-- ── Updated: respond_match_invitation with self-conflict check ──────────────

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
  v_conflict record;
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

    -- Self-conflict check before auto-filling
    SELECT * INTO v_conflict
    FROM check_self_conflict(v_user_id, v_match.match_date, v_match.match_time::time, p_match_id)
    LIMIT 1;
    IF FOUND THEN
      -- Revert invitation status to pending so user can try again later
      UPDATE match_invitations SET status = 'pending', responded_at = NULL WHERE id = v_invitation.id;
      RAISE EXCEPTION 'You already have a match scheduled at %. Can''t accept another.',
        COALESCE(to_char(v_conflict.conflicting_time, 'HH24:MI'), 'that time');
    END IF;

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

-- ── Updated: confirm_invitee_for_match with self-conflict check ─────────────

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
  v_conflict record;
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

  -- Self-conflict check for the invitee being confirmed
  SELECT * INTO v_conflict
  FROM check_self_conflict(p_invitee_id, v_match.match_date, v_match.match_time::time, p_match_id)
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'This player already has a match at %. Can''t confirm.',
      COALESCE(to_char(v_conflict.conflicting_time, 'HH24:MI'), 'that time');
  END IF;

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

NOTIFY pgrst, 'reload schema';
