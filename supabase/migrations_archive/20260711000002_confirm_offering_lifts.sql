-- ════════════════════════════════════════════════════════════════════════════
-- Update confirm_poll_schedule to set offering_lifts on match_drivers rows
-- based on poll response "I can offer a lift" answer.
--
-- SAME 3-arg signature: (uuid, jsonb, uuid[])
-- Run each block separately in the SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════


-- 1. Updated confirm_poll_schedule
CREATE OR REPLACE FUNCTION public.confirm_poll_schedule(
  p_poll_id     uuid,
  p_schedule    jsonb,
  p_benched_ids uuid[]   DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_poll            record;
  v_match           jsonb;
  v_match_id        uuid;
  v_player_ids      uuid[];
  v_match_date      date;
  v_match_time      time;
  v_slot_id         text;
  v_team1           uuid[];
  v_team2           uuid[];
  v_window_start    time;
  v_window_end      time;
  v_conflicts       record;
  v_created_ids     uuid[] := '{}';
  v_scheduled_ids   uuid[];
  v_scheduled_ct    int := 0;
  v_benched_ct      int := 0;
  v_bad_id          uuid;
  v_overlap         uuid[];
BEGIN
  SELECT * INTO v_poll FROM polls WHERE id = p_poll_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Poll % not found', p_poll_id;
  END IF;
  IF v_poll.status = 'processed' THEN
    RAISE EXCEPTION 'Poll % is already processed', p_poll_id;
  END IF;

  FOR v_match IN SELECT * FROM jsonb_array_elements(p_schedule)
  LOOP
    v_player_ids := ARRAY(
      SELECT (j.value)::uuid
      FROM jsonb_array_elements_text(v_match->'player_ids') AS j(value)
    );
    v_match_date := (v_match->>'match_date')::date;
    v_match_time := (v_match->>'match_time')::time;
    v_slot_id    := v_match->>'slot_id';

    -- Team columns: nullable
    v_team1 := NULL;
    v_team2 := NULL;
    IF v_match->'team1_player_ids' IS NOT NULL AND jsonb_typeof(v_match->'team1_player_ids') = 'array' THEN
      v_team1 := ARRAY(SELECT (j.value)::uuid FROM jsonb_array_elements_text(v_match->'team1_player_ids') AS j(value));
    END IF;
    IF v_match->'team2_player_ids' IS NOT NULL AND jsonb_typeof(v_match->'team2_player_ids') = 'array' THEN
      v_team2 := ARRAY(SELECT (j.value)::uuid FROM jsonb_array_elements_text(v_match->'team2_player_ids') AS j(value));
    END IF;

    -- Window columns: nullable (range polls only)
    v_window_start := NULL;
    v_window_end   := NULL;
    IF v_match->>'window_start' IS NOT NULL THEN
      v_window_start := (v_match->>'window_start')::time;
    END IF;
    IF v_match->>'window_end' IS NOT NULL THEN
      v_window_end := (v_match->>'window_end')::time;
    END IF;

    FOR v_conflicts IN
      SELECT * FROM get_household_conflicts(v_player_ids, v_match_date, v_match_time)
      LIMIT 1
    LOOP
      RAISE EXCEPTION 'Household conflict detected for match on % at %: % conflicts with %',
        v_match_date, v_match_time,
        v_conflicts.user_id, v_conflicts.conflicting_household_member;
    END LOOP;

    INSERT INTO matches (
      poll_id, group_id, match_date, match_time, player_ids,
      team1_player_ids, team2_player_ids,
      window_start, window_end,
      poll_slot_id, status, match_type, context_type,
      created_manually, additional_options
    ) VALUES (
      p_poll_id, v_poll.group_id, v_match_date, v_match_time, v_player_ids,
      v_team1, v_team2,
      v_window_start, v_window_end,
      v_slot_id, COALESCE(v_match->>'status', 'scheduled'), 'competitive', 'poll',
      false, COALESCE(v_match->'additional_options', '{}'::jsonb)
    )
    RETURNING id INTO v_match_id;

    v_created_ids := v_created_ids || v_match_id;

    -- Auto-create match_drivers for players who answered "I can drive".
    -- offering_lifts = true only if they ALSO answered "I can offer a lift".
    -- Atomic with match creation. ON CONFLICT DO NOTHING for idempotency.
    INSERT INTO match_drivers (match_id, driver_id, seats_available, offering_lifts)
    SELECT v_match_id, pr.user_id, 3,
           COALESCE((pr.additional_responses->>'I can offer a lift')::boolean, false)
    FROM poll_responses pr
    WHERE pr.poll_id = p_poll_id
      AND pr.user_id = ANY(v_player_ids)
      AND pr.additional_responses->>'I can drive' = 'true'
    ON CONFLICT (match_id, driver_id) DO NOTHING;

  END LOOP;

  SELECT ARRAY(
    SELECT DISTINCT unnest(m.player_ids)
    FROM matches m
    WHERE m.id = ANY(v_created_ids)
  ) INTO v_scheduled_ids;

  SELECT bid INTO v_bad_id
  FROM unnest(p_benched_ids) AS bid
  WHERE NOT EXISTS (
    SELECT 1 FROM poll_responses pr
    WHERE pr.poll_id = p_poll_id AND pr.user_id = bid
  )
  LIMIT 1;

  IF v_bad_id IS NOT NULL THEN
    RAISE EXCEPTION 'Benched id % did not respond to poll %', v_bad_id, p_poll_id;
  END IF;

  SELECT ARRAY(
    SELECT unnest(v_scheduled_ids) INTERSECT SELECT unnest(p_benched_ids)
  ) INTO v_overlap;

  IF array_length(v_overlap, 1) > 0 THEN
    RAISE EXCEPTION 'Player(s) % appear in BOTH scheduled and benched', v_overlap;
  END IF;

  INSERT INTO poll_player_outcomes (poll_id, group_id, user_id, outcome, match_id)
  SELECT DISTINCT ON (unnested.pid)
    p_poll_id, v_poll.group_id, unnested.pid, 'scheduled', m.id
  FROM matches m,
       LATERAL unnest(m.player_ids) AS unnested(pid)
  WHERE m.id = ANY(v_created_ids)
  ORDER BY unnested.pid, m.match_date, m.match_time;

  GET DIAGNOSTICS v_scheduled_ct = ROW_COUNT;

  INSERT INTO poll_player_outcomes (poll_id, group_id, user_id, outcome)
  SELECT p_poll_id, v_poll.group_id, bid, 'benched'
  FROM unnest(p_benched_ids) AS bid;

  GET DIAGNOSTICS v_benched_ct = ROW_COUNT;

  UPDATE polls SET status = 'processed' WHERE id = p_poll_id;

  RETURN jsonb_build_object(
    'matches_created', array_length(v_created_ids, 1),
    'match_ids',       to_jsonb(v_created_ids),
    'scheduled_count', v_scheduled_ct,
    'benched_count',   v_benched_ct
  );
END;
$$;


-- 2. Grant
GRANT EXECUTE ON FUNCTION public.confirm_poll_schedule(uuid, jsonb, uuid[]) TO service_role, authenticated;


-- 3. Schema reload
NOTIFY pgrst, 'reload schema';


-- 4. Verify
-- SELECT position('offering_lifts' in prosrc) > 0 AS has_offering_lifts
-- FROM pg_proc WHERE proname = 'confirm_poll_schedule';
