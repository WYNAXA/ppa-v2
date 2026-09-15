-- ══════════════════════════════════════════════════════════════════════════════
-- BLOCK 1: Household partner request/accept flow + unlink RPC
-- Mirrors the player_connections + accept_connection_request pattern.
-- Run FIRST — the frontend needs these before the UPDATE policy is enabled.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Table: household_link_requests ──
CREATE TABLE IF NOT EXISTS household_link_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  target_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined')),
  responded_at timestamptz,
  created_at   timestamptz DEFAULT now(),
  UNIQUE (requester_id, target_id)
);

ALTER TABLE household_link_requests ENABLE ROW LEVEL SECURITY;

-- Both parties can read
CREATE POLICY hlr_select ON household_link_requests
  FOR SELECT TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = target_id);

-- Only requester can insert (but prefer the RPC for validation)
CREATE POLICY hlr_insert ON household_link_requests
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = requester_id);


-- ── RPC: request_household_link ──
-- Creates a pending request. Validates neither party already has a partner.
CREATE OR REPLACE FUNCTION public.request_household_link(p_partner_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller       uuid := auth.uid();
  v_caller_name  text;
  v_caller_partner uuid;
  v_target_partner uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF v_caller = p_partner_id THEN
    RAISE EXCEPTION 'Cannot link to yourself';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_partner_id) THEN
    RAISE EXCEPTION 'Player not found';
  END IF;

  -- Check neither party already has a partner
  SELECT household_partner_id INTO v_caller_partner FROM profiles WHERE id = v_caller;
  IF v_caller_partner IS NOT NULL THEN
    RAISE EXCEPTION 'You already have a household partner — unlink first';
  END IF;

  SELECT household_partner_id INTO v_target_partner FROM profiles WHERE id = p_partner_id;
  IF v_target_partner IS NOT NULL THEN
    RAISE EXCEPTION 'This player already has a household partner';
  END IF;

  -- Check no pending request already exists (either direction)
  IF EXISTS (
    SELECT 1 FROM household_link_requests
    WHERE status = 'pending'
      AND ((requester_id = v_caller AND target_id = p_partner_id)
        OR (requester_id = p_partner_id AND target_id = v_caller))
  ) THEN
    RAISE EXCEPTION 'A pending request already exists between you and this player';
  END IF;

  -- Create the request
  INSERT INTO household_link_requests (requester_id, target_id, status)
  VALUES (v_caller, p_partner_id, 'pending')
  ON CONFLICT (requester_id, target_id) DO UPDATE
    SET status = 'pending', responded_at = NULL, created_at = now();

  -- Notify the target
  SELECT name INTO v_caller_name FROM profiles WHERE id = v_caller;
  INSERT INTO notifications (user_id, type, title, message, related_id, read)
  VALUES (
    p_partner_id,
    'household_link_request',
    'Household link request',
    COALESCE(v_caller_name, 'A player') || ' wants to link as household partners.',
    v_caller,
    false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_household_link(uuid) TO authenticated;


-- ── RPC: respond_household_link ──
-- Only the target (auth.uid() = target_id) can call this.
-- On accept: sets household_partner_id on BOTH profiles.
-- Re-validates neither party has gained a partner since the request was made.
CREATE OR REPLACE FUNCTION public.respond_household_link(
  p_request_id uuid,
  p_accept     boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller          uuid := auth.uid();
  v_req             record;
  v_caller_partner  uuid;
  v_req_partner     uuid;
  v_caller_name     text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_req FROM household_link_requests
  WHERE id = p_request_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;
  IF v_req.target_id <> v_caller THEN
    RAISE EXCEPTION 'Only the invited partner can respond';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'Request already responded to';
  END IF;

  IF NOT p_accept THEN
    UPDATE household_link_requests
    SET status = 'declined', responded_at = now()
    WHERE id = p_request_id;

    -- Notify requester of decline
    SELECT name INTO v_caller_name FROM profiles WHERE id = v_caller;
    INSERT INTO notifications (user_id, type, title, message, related_id, read)
    VALUES (
      v_req.requester_id,
      'household_link_declined',
      'Household request declined',
      COALESCE(v_caller_name, 'A player') || ' declined your household link request.',
      v_caller,
      false
    );
    RETURN;
  END IF;

  -- Accept: re-validate neither party has since gained a partner
  SELECT household_partner_id INTO v_caller_partner FROM profiles WHERE id = v_caller;
  IF v_caller_partner IS NOT NULL THEN
    UPDATE household_link_requests SET status = 'declined', responded_at = now() WHERE id = p_request_id;
    RAISE EXCEPTION 'You already have a household partner — unlink first';
  END IF;

  SELECT household_partner_id INTO v_req_partner FROM profiles WHERE id = v_req.requester_id;
  IF v_req_partner IS NOT NULL THEN
    UPDATE household_link_requests SET status = 'declined', responded_at = now() WHERE id = p_request_id;
    RAISE EXCEPTION 'The requester already has a household partner';
  END IF;

  -- Link both profiles
  UPDATE profiles SET household_partner_id = v_req.requester_id WHERE id = v_caller;
  UPDATE profiles SET household_partner_id = v_caller WHERE id = v_req.requester_id;

  UPDATE household_link_requests
  SET status = 'accepted', responded_at = now()
  WHERE id = p_request_id;

  -- Expire any other pending requests involving either party
  UPDATE household_link_requests
  SET status = 'declined', responded_at = now()
  WHERE status = 'pending'
    AND id <> p_request_id
    AND (requester_id IN (v_caller, v_req.requester_id)
      OR target_id IN (v_caller, v_req.requester_id));

  -- Notify requester of acceptance
  SELECT name INTO v_caller_name FROM profiles WHERE id = v_caller;
  INSERT INTO notifications (user_id, type, title, message, related_id, read)
  VALUES (
    v_req.requester_id,
    'household_link_accepted',
    'Household partner linked!',
    COALESCE(v_caller_name, 'A player') || ' accepted your household link request.',
    v_caller,
    false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.respond_household_link(uuid, boolean) TO authenticated;


-- ── RPC: unlink_household_partner ──
-- A user unlinking their own link — clears both sides. Safe as-is.
CREATE OR REPLACE FUNCTION public.unlink_household_partner()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller   uuid := auth.uid();
  v_partner  uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT household_partner_id INTO v_partner
  FROM profiles WHERE id = v_caller;

  UPDATE profiles SET household_partner_id = NULL WHERE id = v_caller;

  IF v_partner IS NOT NULL THEN
    UPDATE profiles SET household_partner_id = NULL WHERE id = v_partner;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.unlink_household_partner() TO authenticated;


-- ══════════════════════════════════════════════════════════════════════════════
-- BLOCK 2: Enable RLS on profiles (read-neutral, write-protective)
-- Run SECOND, after Block 1 and the frontend deploy that uses the RPCs.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Read-neutral: all authenticated users can SELECT everything (same as today).
-- Column-level restriction (public_profiles view) is a separate later task.
CREATE POLICY profiles_select_all
  ON profiles FOR SELECT TO authenticated
  USING (true);

-- Write protection: users can only UPDATE their own row.
-- Household partner link/unlink uses SECURITY DEFINER RPCs (bypass RLS).
-- process-elo / send-push use service_role key (bypass RLS).
CREATE POLICY profiles_update_self
  ON profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Self-only INSERT: new profiles are created client-side in AuthContext
-- with id = auth.uid(). No other client path inserts profiles.
CREATE POLICY profiles_insert_self
  ON profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

-- No DELETE policy — profiles are deleted via the delete_user() SECURITY DEFINER RPC.
-- Without a policy, client-side DELETE is blocked, which is correct.

NOTIFY pgrst, 'reload schema';
