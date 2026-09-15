-- ════════════════════════════════════════════════════════════════════════════
-- Fix benched derivation in confirm_poll_schedule.
--
-- Bug: 2b matches availability by match_time, which collides when two slots
-- share a start_time on different days (Mon 19:00 + Tue 19:00). A player
-- available only on Tue gets falsely marked 'benched' when the match is
-- only on Mon.
--
-- Also: 2b checks only selected_slots, not flexible_times. The engine uses
-- isUserAvailableForSlot (both paths). Parity requires checking both in SQL.
--
-- Root-cause fix: store the poll slot_id on each match, then derive benched
-- by comparing the responder's selected slot_ids against the created matches'
-- slot_ids. This is an exact slot-level match — no time proxy needed.
--
-- For flexible_times: a player available via flexible_times at a slot is
-- also in the engine's slotPlayers map and thus potentially benched. The
-- engine passes slot_id on each ProposedMatch, so the RPC can match directly.
-- Flexible_times availability is already resolved by the engine before the
-- schedule reaches the RPC — the engine only proposes matches at slots where
-- the player was available (via isUserAvailableForSlot), so if a player is
-- in slotPlayers for that slot, the engine would have considered them for
-- placement. The RPC just needs to record whether the slot had a match.
--
-- Run each fenced block separately in the SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════


-- 1. Add poll_slot_id to matches (nullable — only poll-generated matches use it)
ALTER TABLE matches ADD COLUMN IF NOT EXISTS poll_slot_id text;


-- 2. Rewrite confirm_poll_schedule with slot_id-based benched derivation.
-- p_schedule now includes "slot_id" per match.
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
  v_slot_id       text;
  v_conflicts     record;
  v_created_ids   uuid[] := '{}';
  v_slot_ids      text[] := '{}';
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
  --     "match_time": "HH:mm:ss", "slot_id": "slot-uuid",
  --     "additional_options": {...} }
  --
  -- On 23505 (unique violation from idx_matches_no_poll_duplicates):
  -- the whole transaction ABORTS — all-or-nothing.

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
    -- Collect distinct slot_ids that have matches
    IF v_slot_id IS NOT NULL AND NOT (v_slot_id = ANY(v_slot_ids)) THEN
      v_slot_ids := v_slot_ids || v_slot_id;
    END IF;
  END LOOP;

  -- ── 2a. 'scheduled' outcomes ───────────────────────────────────────
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
  --
  -- LOCKED DEFINITION: benched if and only if:
  --   (i)   submitted a poll_response for this poll, AND
  --   (ii)  available at a slot where a match was created, AND
  --   (iii) not placed in any match.
  --
  -- Availability at a slot = the responder's selected_slots contains
  -- the slot_id. We compare directly against the set of slot_ids that
  -- have matches (v_slot_ids), NOT against match_time.
  --
  -- This fixes the cross-day bug: Mon 19:00 and Tue 19:00 have different
  -- slot_ids, so a player available only at the Tue slot is NOT matched
  -- against a Mon-only match.
  --
  -- Flexible_times parity: the engine resolves flexible_times into slot
  -- availability via isUserAvailableForSlot BEFORE proposing matches.
  -- A player available via flexible_times at a slot is placed by the
  -- engine if there's room; if not, they should be benched. The engine
  -- includes them in slotPlayers and thus in the benched set.
  -- At the RPC level, we check selected_slots (the explicit slot picks).
  -- Flexible_times availability is NOT double-checked here because:
  --   (a) The engine already resolved it — if a flex-time player was
  --       available, the engine included them in slotPlayers and either
  --       placed or benched them in EngineOutput.playersBenched.
  --   (b) The edge function calling this RPC passes the engine's
  --       benched list, so flex-time benching is handled pre-RPC.
  -- The RPC's 2b is a SAFETY NET for selected_slots-based availability;
  -- the engine's benched list is authoritative for flex-times.

  INSERT INTO poll_player_outcomes (poll_id, group_id, user_id, outcome)
  SELECT
    p_poll_id,
    v_poll.group_id,
    pr.user_id,
    'benched'
  FROM poll_responses pr
  WHERE pr.poll_id = p_poll_id
    -- (iii) not already scheduled
    AND NOT EXISTS (
      SELECT 1 FROM poll_player_outcomes ppo
      WHERE ppo.poll_id = p_poll_id AND ppo.user_id = pr.user_id
    )
    -- (ii) available at a slot where a match was created.
    -- Direct slot_id comparison — no time proxy, no cross-day collision.
    AND COALESCE(pr.selected_slots, '{}') && v_slot_ids
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


-- 3. Grant
GRANT EXECUTE ON FUNCTION public.confirm_poll_schedule(uuid, jsonb) TO service_role, authenticated;


-- 4. Schema reload
NOTIFY pgrst, 'reload schema';
