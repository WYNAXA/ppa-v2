-- ── Ringer requests table + RPCs ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ringer_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  ringer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES profiles(id),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'filled_by_other')),
  responded_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, ringer_id)
);

CREATE INDEX IF NOT EXISTS idx_ringer_requests_match ON ringer_requests(match_id);
CREATE INDEX IF NOT EXISTS idx_ringer_requests_ringer ON ringer_requests(ringer_id, status);

ALTER TABLE ringer_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY ringer_requests_select ON ringer_requests
FOR SELECT TO authenticated
USING (
  ringer_id = auth.uid()
  OR requested_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM matches m
    WHERE m.id = ringer_requests.match_id
      AND auth.uid() = ANY(COALESCE(m.player_ids, ARRAY[]::uuid[]))
  )
  OR EXISTS (
    SELECT 1 FROM matches m
    JOIN group_members gm ON gm.group_id = m.group_id
    WHERE m.id = ringer_requests.match_id
      AND gm.user_id = auth.uid()
      AND gm.role = 'admin'
  )
);

-- RPC: send ringer requests
CREATE OR REPLACE FUNCTION public.send_ringer_requests(
  p_match_id uuid,
  p_ringer_ids uuid[]
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
  v_expires_at timestamptz;
  v_requester_name text;
  v_sent_count integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  v_is_player := v_user_id = ANY(COALESCE(v_match.player_ids, ARRAY[]::uuid[]));

  IF NOT v_is_player AND v_match.group_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM group_members
      WHERE group_id = v_match.group_id
        AND user_id = v_user_id
        AND role = 'admin'
    ) INTO v_is_admin;
  END IF;

  IF NOT v_is_player AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Only match players or group admins can send ringer requests';
  END IF;

  v_expires_at := (v_match.match_date::timestamp + COALESCE(v_match.match_time, '00:00')::time) - INTERVAL '24 hours';

  IF v_expires_at <= now() THEN
    RAISE EXCEPTION 'Too late to send ringer requests for this match';
  END IF;

  SELECT name INTO v_requester_name FROM profiles WHERE id = v_user_id;
  v_requester_name := COALESCE(v_requester_name, 'A player');

  INSERT INTO ringer_requests (match_id, ringer_id, requested_by, expires_at)
  SELECT p_match_id, unnest(p_ringer_ids), v_user_id, v_expires_at
  ON CONFLICT (match_id, ringer_id) DO NOTHING;

  GET DIAGNOSTICS v_sent_count = ROW_COUNT;

  INSERT INTO notifications (user_id, type, title, message, related_id)
  SELECT
    unnest(p_ringer_ids),
    'ringer_request',
    'Can you play?',
    v_requester_name || ' is asking if you can fill in for a match. Tap to see details.',
    p_match_id;

  RETURN jsonb_build_object('success', true, 'sent', v_sent_count, 'expires_at', v_expires_at);
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_ringer_requests(uuid, uuid[]) TO authenticated;

-- RPC: ringer responds
CREATE OR REPLACE FUNCTION public.respond_ringer_request(
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
  v_request record;
  v_ringer_name text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_request FROM ringer_requests
  WHERE match_id = p_match_id AND ringer_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No request found';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Request already responded to';
  END IF;

  IF v_request.expires_at <= now() THEN
    UPDATE ringer_requests SET status = 'expired' WHERE id = v_request.id;
    RAISE EXCEPTION 'Request has expired';
  END IF;

  UPDATE ringer_requests
  SET status = CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END,
      responded_at = now()
  WHERE id = v_request.id;

  SELECT name INTO v_ringer_name FROM profiles WHERE id = v_user_id;
  v_ringer_name := COALESCE(v_ringer_name, 'A ringer');

  INSERT INTO notifications (user_id, type, title, message, related_id)
  VALUES (
    v_request.requested_by,
    CASE WHEN p_accept THEN 'ringer_accepted' ELSE 'ringer_declined' END,
    CASE WHEN p_accept THEN v_ringer_name || ' is available' ELSE v_ringer_name || ' can''t play' END,
    CASE WHEN p_accept
      THEN v_ringer_name || ' has accepted your ringer request. Tap to confirm them for the match.'
      ELSE v_ringer_name || ' isn''t available. Try another ringer.'
    END,
    p_match_id
  );

  RETURN jsonb_build_object('success', true, 'accepted', p_accept);
END;
$$;

GRANT EXECUTE ON FUNCTION public.respond_ringer_request(uuid, boolean) TO authenticated;

-- RPC: confirm ringer into match
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
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  v_is_player := v_user_id = ANY(COALESCE(v_match.player_ids, ARRAY[]::uuid[]));

  IF NOT v_is_player AND v_match.group_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM group_members
      WHERE group_id = v_match.group_id
        AND user_id = v_user_id
        AND role = 'admin'
    ) INTO v_is_admin;
  END IF;

  IF NOT v_is_player AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Only match players or group admins can confirm ringers';
  END IF;

  SELECT status INTO v_request_status
  FROM ringer_requests
  WHERE match_id = p_match_id AND ringer_id = p_ringer_id;

  IF v_request_status IS NULL THEN
    RAISE EXCEPTION 'No request found for this ringer';
  END IF;
  IF v_request_status <> 'accepted' THEN
    RAISE EXCEPTION 'Ringer has not accepted';
  END IF;

  IF array_length(v_match.player_ids, 1) >= 4 THEN
    RAISE EXCEPTION 'Match is already full';
  END IF;

  v_new_player_ids := COALESCE(v_match.player_ids, ARRAY[]::uuid[]) || p_ringer_id;

  UPDATE matches
  SET player_ids = v_new_player_ids,
      status = CASE WHEN array_length(v_new_player_ids, 1) >= 4 THEN 'scheduled' ELSE status END,
      updated_at = now()
  WHERE id = p_match_id;

  UPDATE ringer_requests
  SET status = 'filled_by_other', responded_at = now()
  WHERE match_id = p_match_id
    AND ringer_id <> p_ringer_id
    AND status = 'pending';

  INSERT INTO notifications (user_id, type, title, message, related_id)
  VALUES (
    p_ringer_id,
    'ringer_confirmed',
    'You''re in!',
    'You''ve been confirmed for the match. Check details.',
    p_match_id
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_ringer_for_match(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
