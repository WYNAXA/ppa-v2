-- ════════════════════════════════════════════════════════════════════════════
-- Real guest-player invites (replaces the old "name in notes" hack).
--
-- matches.player_ids is uuid[], so a guest occupies a slot as a dedicated
-- placeholder UUID (match_guest_invites.slot_player_id) that lives in player_ids
-- until the invited person signs up. Their name + invite link live in
-- match_guest_invites. claim_match_guest_invite() then swaps the placeholder for
-- the new user's real profile id — so the match then counts for ELO.
-- ════════════════════════════════════════════════════════════════════════════

-- A first attempt may have partially created this table with a wrong column type
-- (text slot_player_id) before erroring. It holds no data yet, so drop-and-recreate
-- guarantees the correct schema on re-run.
DROP TABLE IF EXISTS public.match_guest_invites CASCADE;

CREATE TABLE IF NOT EXISTS public.match_guest_invites (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id       uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  guest_name     text NOT NULL,
  contact        text,                          -- optional phone/email (never required)
  invite_token   text NOT NULL UNIQUE,
  slot_player_id uuid NOT NULL,                 -- placeholder UUID held in matches.player_ids
  invited_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status         text NOT NULL DEFAULT 'pending',   -- pending | accepted | cancelled
  claimed_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  accepted_at    timestamptz,
  expires_at     timestamptz NOT NULL DEFAULT (now() + interval '30 days')
);

CREATE INDEX IF NOT EXISTS idx_mgi_match ON public.match_guest_invites(match_id);
CREATE INDEX IF NOT EXISTS idx_mgi_token ON public.match_guest_invites(invite_token);
CREATE INDEX IF NOT EXISTS idx_mgi_slot  ON public.match_guest_invites(slot_player_id);

ALTER TABLE public.match_guest_invites ENABLE ROW LEVEL SECURITY;

-- Participants / inviter can read invites for their matches (roster display).
DROP POLICY IF EXISTS mgi_select ON public.match_guest_invites;
CREATE POLICY mgi_select ON public.match_guest_invites FOR SELECT TO authenticated
USING (
  invited_by = auth.uid()
  OR EXISTS (SELECT 1 FROM public.matches m WHERE m.id = match_id AND auth.uid() = ANY(m.player_ids))
);
-- All writes go through the SECURITY DEFINER RPCs below (no direct write policy).

-- ── create_match_guest_invite: add or replace a slot with a guest ───────────
CREATE OR REPLACE FUNCTION public.create_match_guest_invite(
  p_match_id          uuid,
  p_guest_name        text,
  p_contact           text DEFAULT NULL,
  p_replace_player_id uuid DEFAULT NULL      -- when replacing an existing slot; NULL = append
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_token text := encode(gen_random_bytes(9), 'hex');   -- 18 hex chars, url-safe
  v_slot  uuid := gen_random_uuid();
  v_pids  uuid[];
  v_id    uuid;
BEGIN
  IF coalesce(btrim(p_guest_name), '') = '' THEN
    RAISE EXCEPTION 'Guest name is required';
  END IF;

  -- Authorize: caller must be a participant or the creator of the match
  IF NOT EXISTS (
    SELECT 1 FROM public.matches m
    WHERE m.id = p_match_id
      AND (auth.uid() = ANY(m.player_ids) OR m.created_by = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Not authorized to invite to this match';
  END IF;

  SELECT coalesce(player_ids, '{}'::uuid[]) INTO v_pids FROM public.matches WHERE id = p_match_id FOR UPDATE;

  IF p_replace_player_id IS NOT NULL AND p_replace_player_id = ANY(v_pids) THEN
    v_pids := array_replace(v_pids, p_replace_player_id, v_slot);
    -- If we replaced a pending guest slot, retire that old invite
    UPDATE public.match_guest_invites
      SET status = 'cancelled'
      WHERE slot_player_id = p_replace_player_id AND status = 'pending';
  ELSE
    v_pids := v_pids || v_slot;
  END IF;

  INSERT INTO public.match_guest_invites (match_id, guest_name, contact, invite_token, slot_player_id, invited_by)
  VALUES (p_match_id, btrim(p_guest_name), nullif(btrim(coalesce(p_contact,'')), ''), v_token, v_slot, auth.uid())
  RETURNING id INTO v_id;

  UPDATE public.matches
    SET player_ids = v_pids,
        status = CASE WHEN coalesce(array_length(v_pids, 1), 0) >= 4 THEN 'scheduled' ELSE status END
    WHERE id = p_match_id;

  RETURN jsonb_build_object('invite_id', v_id, 'token', v_token, 'slot', v_slot::text);
END; $$;

-- ── get_match_invite_preview: unauthenticated preview for the landing page ───
CREATE OR REPLACE FUNCTION public.get_match_invite_preview(p_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v jsonb;
BEGIN
  SELECT jsonb_build_object(
    'guest_name', gi.guest_name,
    'status', gi.status,
    'expired', (gi.expires_at < now()),
    'match_id', m.id,
    'match_date', m.match_date,
    'match_time', m.match_time,
    'venue', m.booked_venue_name,
    'inviter_name', p.name
  ) INTO v
  FROM public.match_guest_invites gi
  JOIN public.matches m ON m.id = gi.match_id
  LEFT JOIN public.profiles p ON p.id = gi.invited_by
  WHERE gi.invite_token = p_token;

  RETURN coalesce(v, jsonb_build_object('error', 'invalid_token'));
END; $$;

-- ── claim_match_guest_invite: promote the guest slot to the signed-in user ──
CREATE OR REPLACE FUNCTION public.claim_match_guest_invite(p_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_inv public.match_guest_invites%ROWTYPE;
  v_pids uuid[];
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  SELECT * INTO v_inv FROM public.match_guest_invites WHERE invite_token = p_token FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'invalid_token'); END IF;
  IF v_inv.status = 'accepted' THEN
    RETURN jsonb_build_object('match_id', v_inv.match_id, 'already_claimed', true);
  END IF;
  IF v_inv.status = 'cancelled' THEN RETURN jsonb_build_object('error', 'cancelled'); END IF;
  IF v_inv.expires_at < now() THEN RETURN jsonb_build_object('error', 'expired'); END IF;

  SELECT coalesce(player_ids, '{}'::uuid[]) INTO v_pids FROM public.matches WHERE id = v_inv.match_id FOR UPDATE;

  IF v_uid = ANY(v_pids) THEN
    -- already a player in this match: just drop the placeholder slot
    v_pids := array_remove(v_pids, v_inv.slot_player_id);
  ELSE
    v_pids := array_replace(v_pids, v_inv.slot_player_id, v_uid);
  END IF;

  UPDATE public.matches SET player_ids = v_pids WHERE id = v_inv.match_id;
  UPDATE public.match_guest_invites
    SET status = 'accepted', claimed_by = v_uid, accepted_at = now()
    WHERE id = v_inv.id;

  RETURN jsonb_build_object('match_id', v_inv.match_id, 'ok', true);
END; $$;

GRANT EXECUTE ON FUNCTION public.create_match_guest_invite(uuid, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_match_guest_invite(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_match_invite_preview(text) TO anon, authenticated;
