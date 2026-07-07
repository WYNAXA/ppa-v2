-- ════════════════════════════════════════════════════════════════════════════
-- Fix split-brain benched derivation: engine is the SINGLE source of truth.
--
-- Bug: the RPC derived benched from selected_slots in SQL, missing players
-- available only via flexible_times. This diverged from the engine which
-- uses isUserAvailableForSlot (selected_slots AND flexible_times).
--
-- Fix (Option A): the engine passes its authoritative scheduled[] and
-- benched[] arrays into the RPC. The RPC records what the engine decided.
-- Zero availability logic in SQL — one implementation, one source of truth.
--
-- Run each block separately in the SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════


-- 1. Rewrite confirm_poll_schedule: engine-authoritative outcomes.
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
  v_poll          record;
  v_match         jsonb;
  v_match_id      uuid;
  v_player_ids    uuid[];
  v_match_date    date;
  v_match_time    time;
  v_slot_id       text;
  v_conflicts     record;
  v_created_ids   uuid[] := '{}';
  v_scheduled_ct  int := 0;
  v_benched_ct    int := 0;
  v_benched_uid   uuid;
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
  -- p_schedule: JSON array of match objects from the engine:
  --   { "player_ids": ["uuid",...], "match_date": "yyyy-MM-dd",
  --     "match_time": "HH:mm:ss", "slot_id": "slot-uuid",
  --     "additional_options": {...}, "status": "scheduled" }
  --
  -- On 23505 (dedup index collision): whole transaction ABORTS.

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

  -- ── 2a. 'scheduled' outcomes ───────────────────────────────────────
  -- Derived from the created matches (player_ids column).
  -- A player in multiple matches gets ONE outcome row (DISTINCT ON + ON CONFLICT).
  INSERT INTO poll_player_outcomes (poll_id, group_id, user_id, outcome, match_id)
  SELECT DISTINCT ON (unnested.pid)
    p_poll_id, v_poll.group_id, unnested.pid, 'scheduled', m.id
  FROM matches m,
       LATERAL unnest(m.player_ids) AS unnested(pid)
  WHERE m.id = ANY(v_created_ids)
  ORDER BY unnested.pid, m.match_date, m.match_time
  ON CONFLICT (poll_id, user_id) DO NOTHING;

  GET DIAGNOSTICS v_scheduled_ct = ROW_COUNT;

  -- ── 2b. 'benched' outcomes ─────────────────────────────────────────
  -- ENGINE-AUTHORITATIVE: the engine computed playersBenched using
  -- isUserAvailableForSlot (selected_slots AND flexible_times).
  -- The RPC records exactly what the engine decided — no SQL re-derivation,
  -- no divergent availability logic, no split-brain.
  --
  -- Each benched user_id is inserted ONLY if they do not already have a
  -- 'scheduled' row (ON CONFLICT DO NOTHING protects against a player
  -- being in both lists due to a caller bug).
  FOREACH v_benched_uid IN ARRAY p_benched_ids
  LOOP
    INSERT INTO poll_player_outcomes (poll_id, group_id, user_id, outcome)
    VALUES (p_poll_id, v_poll.group_id, v_benched_uid, 'benched')
    ON CONFLICT (poll_id, user_id) DO NOTHING;
  END LOOP;

  GET DIAGNOSTICS v_benched_ct = ROW_COUNT;
  -- Note: ROW_COUNT after a loop reports the LAST statement's count.
  -- For accurate total, count from the table:
  SELECT count(*) INTO v_benched_ct
  FROM poll_player_outcomes
  WHERE poll_id = p_poll_id AND outcome = 'benched';

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


-- 2. Grant
GRANT EXECUTE ON FUNCTION public.confirm_poll_schedule(uuid, jsonb, uuid[]) TO service_role, authenticated;


-- 3. Schema reload
NOTIFY pgrst, 'reload schema';
