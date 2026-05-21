-- =============================================================================
-- delete_user RPC — Apple App Store requirement (Guideline 5.1.1(v))
-- =============================================================================
-- Permanently deletes the calling user's account and associated data.
-- SECURITY DEFINER so it can delete from auth.users and bypass RLS.
--
-- Every FK with ON DELETE NO ACTION pointing at profiles(id) is handled
-- explicitly before the profile row is deleted. Tables with ON DELETE CASCADE
-- are cleaned up automatically by the profile deletion.
--
-- EXCEPTION clauses catch ONLY undefined_table and undefined_column so the
-- function survives in environments missing certain tables/columns. All other
-- errors (permission_denied, foreign_key_violation, deadlock, etc.) propagate
-- to the caller.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.delete_user()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile_exists boolean;
  v_group_id uuid;
  v_new_admin uuid;
BEGIN
  -- Refuse to run without an authenticated user
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated — auth.uid() is NULL';
  END IF;

  -- Check whether the profile row exists. If a previous half-deletion left
  -- an auth.users row without a profile, skip straight to auth cleanup.
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = v_uid) INTO v_profile_exists;

  IF NOT v_profile_exists THEN
    -- No profile — just clean up the orphaned auth row
    DELETE FROM auth.users WHERE id = v_uid;
    RETURN jsonb_build_object('deleted', true, 'user_id', v_uid, 'note', 'profile_not_found');
  END IF;

  -- ──────────────────────────────────────────────────────────────────────
  -- 1. Handle all ON DELETE NO ACTION foreign keys pointing at profiles(id).
  --    Each is wrapped defensively so the function works even if a table
  --    or column doesn't exist in this environment.
  -- ──────────────────────────────────────────────────────────────────────

  -- ── 1a. DELETE rows from junction / user-owned tables ─────────────────

  -- event_attendees.user_id
  BEGIN
    DELETE FROM event_attendees WHERE user_id = v_uid;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  -- league_members.user_id
  BEGIN
    DELETE FROM league_members WHERE user_id = v_uid;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  -- league_invitations.invited_user_id (this user as invitee)
  BEGIN
    DELETE FROM league_invitations WHERE invited_user_id = v_uid;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  -- match_result_votes.voter_id
  BEGIN
    DELETE FROM match_result_votes WHERE voter_id = v_uid;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  -- league_teams (pair includes this user)
  BEGIN
    DELETE FROM league_teams WHERE player1_id = v_uid OR player2_id = v_uid;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  -- pairs_rankings (pair includes this user)
  BEGIN
    DELETE FROM pairs_rankings WHERE player1_id = v_uid OR player2_id = v_uid;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  -- user_badges.user_id (may be dashboard-created table)
  BEGIN
    DELETE FROM user_badges WHERE user_id = v_uid;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  -- ranking_changes.player_id (uses player_id, not user_id)
  BEGIN
    DELETE FROM ranking_changes WHERE player_id = v_uid;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  -- league_standings.user_id
  BEGIN
    DELETE FROM league_standings WHERE user_id = v_uid;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  -- group_members.user_id
  BEGIN
    DELETE FROM group_members WHERE user_id = v_uid;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  -- notifications.user_id
  BEGIN
    DELETE FROM notifications WHERE user_id = v_uid;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  -- poll_responses.user_id
  BEGIN
    DELETE FROM poll_responses WHERE user_id = v_uid;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  -- ── 1b. NULL "actor" / "metadata" columns (preserve parent row) ──────

  -- court_block_outs.created_by
  BEGIN
    UPDATE court_block_outs SET created_by = NULL WHERE created_by = v_uid;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  -- court_bookings.cancelled_by
  BEGIN
    UPDATE court_bookings SET cancelled_by = NULL WHERE cancelled_by = v_uid;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  -- group_members.banned_by (rows already deleted above, but other users'
  -- rows may reference this user as the one who banned them)
  BEGIN
    UPDATE group_members SET banned_by = NULL WHERE banned_by = v_uid;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  -- league_adjustments.created_by
  BEGIN
    UPDATE league_adjustments SET created_by = NULL WHERE created_by = v_uid;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  -- league_invitations.invited_by (other users' invitation rows)
  BEGIN
    UPDATE league_invitations SET invited_by = NULL WHERE invited_by = v_uid;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  -- league_jerseys.previous_holder
  BEGIN
    UPDATE league_jerseys SET previous_holder = NULL WHERE previous_holder = v_uid;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  -- league_ranking_adjustments.adjusted_by
  BEGIN
    UPDATE league_ranking_adjustments SET adjusted_by = NULL WHERE adjusted_by = v_uid;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  -- match_invitations.invited_by (other users' invitation rows)
  BEGIN
    UPDATE match_invitations SET invited_by = NULL WHERE invited_by = v_uid;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  -- match_results.disputed_by
  BEGIN
    UPDATE match_results SET disputed_by = NULL WHERE disputed_by = v_uid;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  -- match_results.verified_by
  BEGIN
    UPDATE match_results SET verified_by = NULL WHERE verified_by = v_uid;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  -- match_results.submitted_by
  BEGIN
    UPDATE match_results SET submitted_by = NULL WHERE submitted_by = v_uid;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  -- matches.opened_by
  BEGIN
    UPDATE matches SET opened_by = NULL WHERE opened_by = v_uid;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  -- matches.voided_by
  BEGIN
    UPDATE matches SET voided_by = NULL WHERE voided_by = v_uid;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  -- matches.created_by
  BEGIN
    UPDATE matches SET created_by = NULL WHERE created_by = v_uid;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  -- matches.booked_by
  BEGIN
    UPDATE matches SET booked_by = NULL WHERE booked_by = v_uid;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  -- ringer_requests.requested_by (other users' rows referencing this user)
  BEGIN
    UPDATE ringer_requests SET requested_by = NULL WHERE requested_by = v_uid;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  -- ── 1c. Self-references on OTHER profiles rows ───────────────────────

  BEGIN
    UPDATE profiles SET worst_partner_id = NULL WHERE worst_partner_id = v_uid;
  EXCEPTION WHEN undefined_column THEN NULL;
  END;

  BEGIN
    UPDATE profiles SET household_partner_id = NULL WHERE household_partner_id = v_uid;
  EXCEPTION WHEN undefined_column THEN NULL;
  END;

  BEGIN
    UPDATE profiles SET best_partner_id = NULL WHERE best_partner_id = v_uid;
  EXCEPTION WHEN undefined_column THEN NULL;
  END;

  -- ── 1d. Array columns — remove user from arrays on shared rows ───────

  -- matches.player_ids
  BEGIN
    UPDATE matches
    SET player_ids = array_remove(player_ids, v_uid)
    WHERE v_uid = ANY(player_ids);
  EXCEPTION WHEN undefined_column THEN NULL;
  END;

  -- matches.confirmed_players
  BEGIN
    UPDATE matches
    SET confirmed_players = array_remove(confirmed_players, v_uid)
    WHERE v_uid = ANY(confirmed_players);
  EXCEPTION WHEN undefined_column THEN NULL;
  END;

  -- court_bookings.booked_by + player_ids
  BEGIN
    UPDATE court_bookings SET booked_by = NULL WHERE booked_by = v_uid;
    UPDATE court_bookings
    SET player_ids = array_remove(player_ids, v_uid)
    WHERE v_uid = ANY(player_ids);
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  -- ── 1e. Other "created_by" / "admin" columns ────────────────────────

  -- groups.admin_id — NOT NULL column, so reassign or delete the group
  BEGIN
    FOR v_group_id IN
      SELECT id FROM groups WHERE admin_id = v_uid
    LOOP
      -- Find another approved member to promote
      SELECT user_id INTO v_new_admin
      FROM group_members
      WHERE group_id = v_group_id
        AND user_id != v_uid
        AND status = 'approved'
      ORDER BY created_at ASC
      LIMIT 1;

      IF v_new_admin IS NOT NULL THEN
        UPDATE group_members
        SET role = 'admin'::group_role
        WHERE group_id = v_group_id AND user_id = v_new_admin;

        UPDATE groups SET admin_id = v_new_admin WHERE id = v_group_id;
      ELSE
        -- No other members — delete the group (cascades to group_members etc.)
        DELETE FROM groups WHERE id = v_group_id;
      END IF;
    END LOOP;
  EXCEPTION
    WHEN undefined_table THEN NULL;
    WHEN undefined_column THEN NULL;
  END;

  -- leagues.created_by
  BEGIN
    UPDATE leagues SET created_by = NULL WHERE created_by = v_uid;
  EXCEPTION WHEN undefined_column THEN NULL;
  END;

  -- events.created_by
  BEGIN
    UPDATE events SET created_by = NULL WHERE created_by = v_uid;
  EXCEPTION WHEN undefined_column THEN NULL;
  END;

  -- polls.created_by
  BEGIN
    UPDATE polls SET created_by = NULL WHERE created_by = v_uid;
  EXCEPTION WHEN undefined_column THEN NULL;
  END;

  -- ──────────────────────────────────────────────────────────────────────
  -- 2. Delete the profile row.
  --    ON DELETE CASCADE handles ~31 child tables including:
  --    player_achievements, league_jerseys, rating_history,
  --    match_peer_votes, player_connections, travel_requests,
  --    ringer_requests (ringer_id), match_invitations (invitee_id),
  --    user_venue_stamps, venue_rewards, venue_ratings, venue_managers,
  --    league_invitations (invited_user_id — already deleted above too)
  -- ──────────────────────────────────────────────────────────────────────
  DELETE FROM profiles WHERE id = v_uid;

  -- ──────────────────────────────────────────────────────────────────────
  -- 3. Delete the auth.users row (the actual Supabase Auth identity)
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
