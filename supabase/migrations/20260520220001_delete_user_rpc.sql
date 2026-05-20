-- =============================================================================
-- delete_user RPC — Apple App Store requirement (Guideline 5.1.1(v))
-- =============================================================================
-- Permanently deletes the calling user's account and associated data.
-- SECURITY DEFINER so it can delete from auth.users and bypass RLS.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.delete_user()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  -- Refuse to run without an authenticated user
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated — auth.uid() is NULL';
  END IF;

  -- ──────────────────────────────────────────────────────────────────────
  -- 1. Tables WITHOUT ON DELETE CASCADE from profiles(id)
  --    These must be handled explicitly before the profile row is deleted.
  -- ──────────────────────────────────────────────────────────────────────

  -- user_badges (may or may not exist — created via dashboard, not migrations)
  BEGIN
    DELETE FROM user_badges WHERE user_id = v_uid;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  -- ranking_changes (may or may not exist — uses player_id not user_id)
  BEGIN
    DELETE FROM ranking_changes WHERE player_id = v_uid;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  -- league_standings — no CASCADE defined in migrations
  DELETE FROM league_standings WHERE user_id = v_uid;

  -- league_members — no CASCADE defined in migrations
  DELETE FROM league_members WHERE user_id = v_uid;

  -- group_members — no CASCADE defined in migrations
  DELETE FROM group_members WHERE user_id = v_uid;

  -- notifications — no CASCADE defined in migrations
  DELETE FROM notifications WHERE user_id = v_uid;

  -- match_result_votes — voter_id references profiles
  BEGIN
    DELETE FROM match_result_votes WHERE voter_id = v_uid;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  -- poll_responses — user_id references profiles (original schema, no CASCADE)
  BEGIN
    DELETE FROM poll_responses WHERE user_id = v_uid;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  -- ──────────────────────────────────────────────────────────────────────
  -- 2. Anonymize historical records (don't delete — they're shared data)
  -- ──────────────────────────────────────────────────────────────────────

  -- match_results: null out submitted_by (team arrays are historical record;
  -- the profile deletion makes the UUIDs unresolvable, which is sufficient)
  UPDATE match_results SET submitted_by = NULL WHERE submitted_by = v_uid;

  -- matches: null out creator and booker references
  UPDATE matches SET created_by = NULL WHERE created_by = v_uid;
  UPDATE matches SET booked_by  = NULL WHERE booked_by  = v_uid;

  -- matches: remove user from player_ids and confirmed_players arrays
  UPDATE matches
  SET player_ids = array_remove(player_ids, v_uid)
  WHERE v_uid = ANY(player_ids);

  BEGIN
    UPDATE matches
    SET confirmed_players = array_remove(confirmed_players, v_uid)
    WHERE v_uid = ANY(confirmed_players);
  EXCEPTION WHEN undefined_column THEN NULL;
  END;

  -- court_bookings: anonymize (don't delete — booking is shared/financial)
  BEGIN
    UPDATE court_bookings SET booked_by = NULL WHERE booked_by = v_uid;
    UPDATE court_bookings
    SET player_ids = array_remove(player_ids, v_uid)
    WHERE v_uid = ANY(player_ids);
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  -- groups: null out admin_id if this user was the admin
  BEGIN
    UPDATE groups SET admin_id = NULL WHERE admin_id = v_uid;
  EXCEPTION WHEN undefined_column THEN NULL;
  END;

  -- leagues: null out created_by
  BEGIN
    UPDATE leagues SET created_by = NULL WHERE created_by = v_uid;
  EXCEPTION WHEN undefined_column THEN NULL;
  END;

  -- events: null out created_by
  BEGIN
    UPDATE events SET created_by = NULL WHERE created_by = v_uid;
  EXCEPTION WHEN undefined_column THEN NULL;
  END;

  -- polls: null out created_by
  BEGIN
    UPDATE polls SET created_by = NULL WHERE created_by = v_uid;
  EXCEPTION WHEN undefined_column THEN NULL;
  END;

  -- ──────────────────────────────────────────────────────────────────────
  -- 3. Delete the profile row.
  --    ON DELETE CASCADE handles: player_achievements, league_jerseys,
  --    rating_history, league_adjustments, match_peer_votes,
  --    player_connections, event_attendees, travel_requests,
  --    league_invitations, ringer_requests, match_invitations,
  --    user_venue_stamps, venue_rewards, venue_ratings, venue_managers
  -- ──────────────────────────────────────────────────────────────────────
  DELETE FROM profiles WHERE id = v_uid;

  -- ──────────────────────────────────────────────────────────────────────
  -- 4. Delete the auth.users row (the actual Supabase Auth identity)
  -- ──────────────────────────────────────────────────────────────────────
  DELETE FROM auth.users WHERE id = v_uid;

  RETURN jsonb_build_object('deleted', true, 'user_id', v_uid);
END;
$$;

-- Grant to authenticated users only (not anon)
GRANT EXECUTE ON FUNCTION public.delete_user() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_user() FROM anon;

COMMENT ON FUNCTION public.delete_user() IS
  'Permanently deletes the calling user''s account and all associated data. '
  'Required for Apple App Store Guideline 5.1.1(v).';
