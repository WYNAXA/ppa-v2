-- Phase 0 of the match<->booking model migration: rename court_bookings -> bookings,
-- with a backward-compatible, RLS-respecting view so existing app + edge-function
-- consumers keep working unchanged during the cutover.

-- 1. Rename the physical table (data, constraints, indexes, FKs all preserved).
ALTER TABLE public.court_bookings RENAME TO bookings;

-- 2. Repoint the only DB function that WRITES the table by name, so a SECURITY
--    DEFINER function hits the real table, not the compat view. (delete_user)
CREATE OR REPLACE FUNCTION public.delete_user()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_profile_exists boolean;
  v_group_id uuid;
  v_new_admin uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated — auth.uid() is NULL';
  END IF;

  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = v_uid) INTO v_profile_exists;
  IF NOT v_profile_exists THEN
    DELETE FROM auth.users WHERE id = v_uid;
    RETURN jsonb_build_object('deleted', true, 'user_id', v_uid, 'note', 'profile_not_found');
  END IF;

  BEGIN DELETE FROM event_attendees WHERE user_id = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM league_members WHERE user_id = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM league_invitations WHERE invited_user_id = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM match_result_votes WHERE voter_id = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM league_teams WHERE player1_id = v_uid OR player2_id = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM pairs_rankings WHERE player1_id = v_uid OR player2_id = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM user_badges WHERE user_id = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM ranking_changes WHERE player_id = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM league_standings WHERE user_id = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM group_members WHERE user_id = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM notifications WHERE user_id = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM poll_responses WHERE user_id = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  BEGIN UPDATE court_block_outs SET created_by = NULL WHERE created_by = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN UPDATE bookings SET cancelled_by = NULL WHERE cancelled_by = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN UPDATE group_members SET banned_by = NULL WHERE banned_by = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN UPDATE league_adjustments SET created_by = NULL WHERE created_by = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN UPDATE league_invitations SET invited_by = NULL WHERE invited_by = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN UPDATE league_jerseys SET previous_holder = NULL WHERE previous_holder = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN UPDATE league_ranking_adjustments SET adjusted_by = NULL WHERE adjusted_by = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN UPDATE match_invitations SET invited_by = NULL WHERE invited_by = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN UPDATE match_results SET disputed_by = NULL WHERE disputed_by = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN UPDATE match_results SET verified_by = NULL WHERE verified_by = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN UPDATE match_results SET submitted_by = NULL WHERE submitted_by = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN UPDATE matches SET opened_by = NULL WHERE opened_by = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN UPDATE matches SET voided_by = NULL WHERE voided_by = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN UPDATE matches SET created_by = NULL WHERE created_by = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN UPDATE matches SET booked_by = NULL WHERE booked_by = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN UPDATE ringer_requests SET requested_by = NULL WHERE requested_by = v_uid; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  BEGIN UPDATE profiles SET worst_partner_id = NULL WHERE worst_partner_id = v_uid; EXCEPTION WHEN undefined_column THEN NULL; END;
  BEGIN UPDATE profiles SET household_partner_id = NULL WHERE household_partner_id = v_uid; EXCEPTION WHEN undefined_column THEN NULL; END;
  BEGIN UPDATE profiles SET best_partner_id = NULL WHERE best_partner_id = v_uid; EXCEPTION WHEN undefined_column THEN NULL; END;

  BEGIN UPDATE matches SET player_ids = array_remove(player_ids, v_uid) WHERE v_uid = ANY(player_ids); EXCEPTION WHEN undefined_column THEN NULL; END;
  BEGIN UPDATE matches SET confirmed_players = array_remove(confirmed_players, v_uid) WHERE v_uid = ANY(confirmed_players); EXCEPTION WHEN undefined_column THEN NULL; END;

  BEGIN
    UPDATE bookings SET booked_by = NULL WHERE booked_by = v_uid;
    UPDATE bookings SET player_ids = array_remove(player_ids, v_uid) WHERE v_uid = ANY(player_ids);
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  BEGIN
    FOR v_group_id IN SELECT id FROM groups WHERE admin_id = v_uid LOOP
      SELECT user_id INTO v_new_admin
      FROM group_members
      WHERE group_id = v_group_id AND user_id != v_uid AND status = 'approved'
      ORDER BY created_at ASC LIMIT 1;
      IF v_new_admin IS NOT NULL THEN
        UPDATE group_members SET role = 'admin'::group_role WHERE group_id = v_group_id AND user_id = v_new_admin;
        UPDATE groups SET admin_id = v_new_admin WHERE id = v_group_id;
      ELSE
        DELETE FROM groups WHERE id = v_group_id;
      END IF;
    END LOOP;
  EXCEPTION WHEN undefined_table THEN NULL; WHEN undefined_column THEN NULL;
  END;

  BEGIN UPDATE leagues SET created_by = NULL WHERE created_by = v_uid; EXCEPTION WHEN undefined_column THEN NULL; END;
  BEGIN UPDATE events SET created_by = NULL WHERE created_by = v_uid; EXCEPTION WHEN undefined_column THEN NULL; END;
  BEGIN UPDATE polls SET created_by = NULL WHERE created_by = v_uid; EXCEPTION WHEN undefined_column THEN NULL; END;

  DELETE FROM profiles WHERE id = v_uid;
  DELETE FROM auth.users WHERE id = v_uid;

  RETURN jsonb_build_object('deleted', true, 'user_id', v_uid);
END;
$fn$;

-- 3. Backward-compat view. security_invoker = true so it RESPECTS the RLS policies
--    on bookings (a plain view would bypass them). Auto-updatable (simple SELECT *),
--    so reads and writes pass through for existing consumers.
CREATE VIEW public.court_bookings
  WITH (security_invoker = true)
  AS SELECT * FROM public.bookings;

-- 4. Replicate the table grants onto the view (a view does NOT inherit them).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.court_bookings TO anon, authenticated, service_role;
