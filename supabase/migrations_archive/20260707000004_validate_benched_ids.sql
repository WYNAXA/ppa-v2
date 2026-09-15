-- ════════════════════════════════════════════════════════════════════════════
-- Validate p_benched_ids at the boundary in confirm_poll_schedule.
--
-- Bug: SECURITY DEFINER function trusted p_benched_ids blindly — any uuid
-- passed would be recorded as benched, including non-responders or players
-- already scheduled. ON CONFLICT masked scheduled+benched overlap silently.
--
-- Fix: two explicit checks before recording outcomes:
--   1. Every benched id must have a poll_responses row for this poll.
--   2. Benched and scheduled sets must be disjoint.
-- Both RAISE EXCEPTION and roll back the entire atomic confirm.
--
-- This is VALIDATION of the passed set, not recomputation of availability.
-- The engine remains the single source of truth for who is benched.
--
-- Run each block separately in the SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════


-- 1. Rewrite confirm_poll_schedule with boundary validation.
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
  v_conflicts       record;
  v_created_ids     uuid[] := '{}';
  v_scheduled_ids   uuid[];
  v_scheduled_ct    int := 0;
  v_benched_ct      int := 0;
  v_bad_id          uuid;
  v_overlap         uuid[];
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
  FOR v_match IN SELECT * FROM jsonb_array_elements(p_schedule)
  LOOP
    v_player_ids := ARRAY(
      SELECT (j.value)::uuid
      FROM jsonb_array_elements_text(v_match->'player_ids') AS j(value)
    );
    v_match_date := (v_match->>'match_date')::date;
    v_match_time := (v_match->>'match_time')::time;
    v_slot_id    := v_match->>'slot_id';

    -- Household conflict re-validation at write time.
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
      poll_slot_id, status, match_type, context_type,
      created_manually, additional_options
    ) VALUES (
      p_poll_id, v_poll.group_id, v_match_date, v_match_time, v_player_ids,
      v_slot_id, COALESCE(v_match->>'status', 'scheduled'), 'competitive', 'poll',
      false, COALESCE(v_match->'additional_options', '{}'::jsonb)
    )
    RETURNING id INTO v_match_id;

    v_created_ids := v_created_ids || v_match_id;
  END LOOP;

  -- ── Collect the scheduled set from created matches ─────────────────
  SELECT ARRAY(
    SELECT DISTINCT unnest(m.player_ids)
    FROM matches m
    WHERE m.id = ANY(v_created_ids)
  ) INTO v_scheduled_ids;

  -- ── VALIDATION 1: every benched id must be a poll responder ────────
  -- This is membership validation, not availability recomputation.
  -- The engine decides WHO is benched; we verify they actually responded.
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

  -- ── VALIDATION 2: scheduled and benched must be disjoint ───────────
  -- A player in both lists is an engine/caller contradiction.
  -- Surface it as a hard error, not a silent ON CONFLICT mask.
  SELECT ARRAY(
    SELECT unnest(v_scheduled_ids) INTERSECT SELECT unnest(p_benched_ids)
  ) INTO v_overlap;

  IF array_length(v_overlap, 1) > 0 THEN
    RAISE EXCEPTION 'Player(s) % appear in BOTH scheduled and benched — engine contradiction',
      v_overlap;
  END IF;

  -- ── 2a. Record 'scheduled' outcomes ────────────────────────────────
  INSERT INTO poll_player_outcomes (poll_id, group_id, user_id, outcome, match_id)
  SELECT DISTINCT ON (unnested.pid)
    p_poll_id, v_poll.group_id, unnested.pid, 'scheduled', m.id
  FROM matches m,
       LATERAL unnest(m.player_ids) AS unnested(pid)
  WHERE m.id = ANY(v_created_ids)
  ORDER BY unnested.pid, m.match_date, m.match_time;

  GET DIAGNOSTICS v_scheduled_ct = ROW_COUNT;

  -- ── 2b. Record 'benched' outcomes (engine-authoritative) ───────────
  -- Validated above: all ids are real responders, none overlap with scheduled.
  INSERT INTO poll_player_outcomes (poll_id, group_id, user_id, outcome)
  SELECT p_poll_id, v_poll.group_id, bid, 'benched'
  FROM unnest(p_benched_ids) AS bid;

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


-- 2. Grant (same signature — default param, compatible)
GRANT EXECUTE ON FUNCTION public.confirm_poll_schedule(uuid, jsonb, uuid[]) TO service_role, authenticated;


-- 3. Schema reload
NOTIFY pgrst, 'reload schema';
