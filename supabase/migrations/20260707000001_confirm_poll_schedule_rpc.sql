-- ════════════════════════════════════════════════════════════════════════════
-- confirm_poll_schedule RPC — atomic poll → matches + outcomes write.
--
-- Called by the edge function after the ILP engine produces a schedule.
-- Runs as ONE transaction: all-or-nothing.
--
-- Run each fenced block as a separate statement in the SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════


-- 1. The RPC function
CREATE OR REPLACE FUNCTION public.confirm_poll_schedule(
  p_poll_id  uuid,
  p_schedule jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_poll          record;
  v_match         jsonb;
  v_match_id      uuid;
  v_player_ids    uuid[];
  v_match_date    date;
  v_match_time    time;
  v_conflicts     record;
  v_created_ids   uuid[] := '{}';
  v_scheduled_ct  int := 0;
  v_benched_ct    int := 0;
BEGIN
  -- ── Fetch and lock the poll ─────────────────────────────────────────
  SELECT * INTO v_poll FROM polls WHERE id = p_poll_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Poll % not found', p_poll_id;
  END IF;
  IF v_poll.status = 'processed' THEN
    RAISE EXCEPTION 'Poll % is already processed', p_poll_id;
  END IF;

  -- ── 1. Insert every match from p_schedule ──────────────────────────
  -- p_schedule is a JSON array of objects:
  --   { "player_ids": ["uuid",...], "match_date": "yyyy-MM-dd",
  --     "match_time": "HH:mm:ss", "additional_options": {...} }
  --
  -- On 23505 (unique violation from idx_matches_no_poll_duplicates):
  -- the whole transaction ABORTS. This is correct for an atomic confirm —
  -- a duplicate means the schedule was already partially written by a
  -- prior call, which violates the all-or-nothing contract. The caller
  -- must not retry with the same schedule; they should re-fetch poll state.

  FOR v_match IN SELECT * FROM jsonb_array_elements(p_schedule)
  LOOP
    v_player_ids := ARRAY(
      SELECT (j.value)::uuid
      FROM jsonb_array_elements_text(v_match->'player_ids') AS j(value)
    );
    v_match_date := (v_match->>'match_date')::date;
    v_match_time := (v_match->>'match_time')::time;

    -- Household conflict re-validation at write time.
    -- An admin edit to the proposal could introduce a conflict the engine
    -- did not see. If any conflict exists, the whole confirm fails loudly.
    FOR v_conflicts IN
      SELECT * FROM get_household_conflicts(v_player_ids, v_match_date, v_match_time)
      LIMIT 1
    LOOP
      RAISE EXCEPTION 'Household conflict detected for match on % at %: % conflicts with %',
        v_match_date, v_match_time,
        v_conflicts.user_id, v_conflicts.conflicting_household_member;
    END LOOP;

    INSERT INTO matches (
      poll_id,
      group_id,
      match_date,
      match_time,
      player_ids,
      status,
      match_type,
      context_type,
      created_manually,
      additional_options
    ) VALUES (
      p_poll_id,
      v_poll.group_id,
      v_match_date,
      v_match_time,
      v_player_ids,
      COALESCE(v_match->>'status', 'scheduled'),
      'competitive',
      'poll',
      false,
      COALESCE(v_match->'additional_options', '{}'::jsonb)
    )
    RETURNING id INTO v_match_id;

    v_created_ids := v_created_ids || v_match_id;
  END LOOP;

  -- ── 2. Record poll_player_outcomes ─────────────────────────────────

  -- 2a. 'scheduled' for every player placed in a created match.
  -- A player in multiple matches (can_play_twice/unlimited) gets ONE
  -- outcome row linked to their FIRST match (the unique index on
  -- poll_id+user_id enforces one row per player per poll).
  INSERT INTO poll_player_outcomes (poll_id, group_id, user_id, outcome, match_id)
  SELECT DISTINCT ON (unnested.pid)
    p_poll_id,
    v_poll.group_id,
    unnested.pid,
    'scheduled',
    m.id
  FROM matches m,
       LATERAL unnest(m.player_ids) AS unnested(pid)
  WHERE m.id = ANY(v_created_ids)
  ORDER BY unnested.pid, m.match_date, m.match_time
  ON CONFLICT (poll_id, user_id) DO NOTHING;

  GET DIAGNOSTICS v_scheduled_ct = ROW_COUNT;

  -- 2b. 'benched' for responders who are available at a slot where a
  -- match was created, but were NOT placed in any match.
  --
  -- LOCKED DEFINITION: a responder is benched if and only if:
  --   (i)   they submitted a poll_response for this poll, AND
  --   (ii)  at least one of the time_slots they selected (via
  --         selected_slots array) had a match created at the same
  --         day+time, AND
  --   (iii) they are NOT in any created match's player_ids.
  --
  -- A responder available ONLY at slots with NO match is NOT benched —
  -- that is lack-of-numbers, not a fairness issue.
  --
  -- We derive the benched set by:
  --   1. Get all responders for this poll (poll_responses).
  --   2. Exclude those already in 'scheduled' outcomes (placed players).
  --   3. For each remaining responder, check if ANY of their selected
  --      time_slots (from poll.time_slots) has a matching match_date+time
  --      among the created matches.

  INSERT INTO poll_player_outcomes (poll_id, group_id, user_id, outcome)
  SELECT
    p_poll_id,
    v_poll.group_id,
    pr.user_id,
    'benched'
  FROM poll_responses pr
  WHERE pr.poll_id = p_poll_id
    -- (iii) not placed in any match
    AND NOT EXISTS (
      SELECT 1 FROM poll_player_outcomes ppo
      WHERE ppo.poll_id = p_poll_id AND ppo.user_id = pr.user_id
    )
    -- (ii) available at a slot where a match was created.
    -- The engine tags each match with the slot's start_time as match_time.
    -- A responder is "available at a slot with a match" if they selected
    -- a slot_id whose start_time matches any created match's match_time.
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_poll.time_slots) AS ts,
           matches m
      WHERE m.id = ANY(v_created_ids)
        AND m.match_time = (ts->>'start_time')::time
        AND (ts->>'id') = ANY(COALESCE(pr.selected_slots, '{}'))
    )
  ON CONFLICT (poll_id, user_id) DO NOTHING;

  GET DIAGNOSTICS v_benched_ct = ROW_COUNT;

  -- ── 3. Close the poll ──────────────────────────────────────────────
  UPDATE polls SET status = 'processed' WHERE id = p_poll_id;

  -- ── Return summary ─────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'matches_created', array_length(v_created_ids, 1),
    'match_ids',       to_jsonb(v_created_ids),
    'scheduled_count', v_scheduled_ct,
    'benched_count',   v_benched_ct
  );
END;
$$;


-- 2. Grant execute to service_role (edge function caller) and authenticated
GRANT EXECUTE ON FUNCTION public.confirm_poll_schedule(uuid, jsonb) TO service_role, authenticated;


-- 3. Schema reload
NOTIFY pgrst, 'reload schema';
