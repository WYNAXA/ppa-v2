-- ── Open Matches — public slot claim flow ────────────────────────────────────

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS is_open boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS open_elo_min integer,
  ADD COLUMN IF NOT EXISTS open_elo_max integer,
  ADD COLUMN IF NOT EXISTS opened_by uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS opened_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_matches_open
  ON matches(is_open, match_date)
  WHERE is_open = true;

-- RPC: push match to open listing
CREATE OR REPLACE FUNCTION public.push_match_to_open(
  p_match_id uuid,
  p_elo_min integer,
  p_elo_max integer
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
  v_expiry timestamptz;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;

  IF array_length(v_match.player_ids, 1) >= 4 THEN
    RAISE EXCEPTION 'Match is already full';
  END IF;

  v_is_player := v_user_id = ANY(COALESCE(v_match.player_ids, ARRAY[]::uuid[]));
  IF NOT v_is_player AND v_match.group_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM group_members
      WHERE group_id = v_match.group_id AND user_id = v_user_id AND role = 'admin'
    ) INTO v_is_admin;
  END IF;

  IF NOT v_is_player AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Only match players or group admins can open a match';
  END IF;

  v_expiry := (v_match.match_date::timestamp + COALESCE(v_match.match_time, '00:00')::time) - INTERVAL '24 hours';
  IF v_expiry <= now() THEN
    RAISE EXCEPTION 'Too late to open this match';
  END IF;

  IF p_elo_min < 600 OR p_elo_max > 2500 OR p_elo_min >= p_elo_max THEN
    RAISE EXCEPTION 'Invalid ELO range';
  END IF;

  UPDATE matches
  SET is_open = true, open_elo_min = p_elo_min, open_elo_max = p_elo_max,
      opened_by = v_user_id, opened_at = now(), updated_at = now()
  WHERE id = p_match_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.push_match_to_open(uuid, integer, integer) TO authenticated;

-- RPC: revert open match
CREATE OR REPLACE FUNCTION public.revert_open_match(p_match_id uuid)
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
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;
  IF NOT v_match.is_open THEN RAISE EXCEPTION 'Match is not open'; END IF;

  v_is_player := v_user_id = ANY(COALESCE(v_match.player_ids, ARRAY[]::uuid[]));
  IF NOT v_is_player AND v_match.group_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM group_members
      WHERE group_id = v_match.group_id AND user_id = v_user_id AND role = 'admin'
    ) INTO v_is_admin;
  END IF;

  IF NOT v_is_player AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Only match players or group admins can revert';
  END IF;

  UPDATE matches
  SET is_open = false, open_elo_min = NULL, open_elo_max = NULL,
      opened_by = NULL, opened_at = NULL, updated_at = now()
  WHERE id = p_match_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.revert_open_match(uuid) TO authenticated;

-- RPC: claim an open match slot
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

GRANT EXECUTE ON FUNCTION public.claim_open_match(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
