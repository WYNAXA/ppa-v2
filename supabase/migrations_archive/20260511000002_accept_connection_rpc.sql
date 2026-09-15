-- ── Atomic accept_connection_request RPC ─────────────────────────────────────
-- Accepts a pending connection request and creates the reciprocal row
-- in a single transaction. Called via supabase.rpc('accept_connection_request').

CREATE OR REPLACE FUNCTION public.accept_connection_request(p_requester_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Validate: caller must have a pending incoming request from p_requester_id
  IF NOT EXISTS (
    SELECT 1 FROM player_connections
    WHERE user_id = p_requester_id
      AND connected_user_id = auth.uid()
      AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'No pending request from this user';
  END IF;

  -- Accept the existing row
  UPDATE player_connections
  SET status = 'accepted', updated_at = now()
  WHERE user_id = p_requester_id
    AND connected_user_id = auth.uid()
    AND status = 'pending';

  -- Insert reciprocal row
  INSERT INTO player_connections (user_id, connected_user_id, status)
  VALUES (auth.uid(), p_requester_id, 'accepted')
  ON CONFLICT (user_id, connected_user_id) DO UPDATE
    SET status = 'accepted', updated_at = now();
END;
$$;

-- ── DELETE policy for declining/removing connections ─────────────────────────
CREATE POLICY "Users can delete own connections"
ON player_connections FOR DELETE TO authenticated
USING (auth.uid() = user_id OR auth.uid() = connected_user_id);
