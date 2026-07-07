-- ════════════════════════════════════════════════════════════════════════════
-- confirm_poll_schedule rollback test — run in Supabase SQL Editor
--
-- Self-contained: creates fixtures, runs 3 tests, tears down.
-- Prints PASS/FAIL per assertion via RAISE NOTICE.
-- ════════════════════════════════════════════════════════════════════════════

-- ── SETUP ────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_group_id   uuid := 'deadbeef-0000-0000-0000-000000000001';
  v_poll_id    uuid := 'deadbeef-0000-0000-0000-000000000002';
  v_p1         uuid := 'deadbeef-0000-0000-0000-000000000011';
  v_p2         uuid := 'deadbeef-0000-0000-0000-000000000012';
  v_p3         uuid := 'deadbeef-0000-0000-0000-000000000013';
  v_p4         uuid := 'deadbeef-0000-0000-0000-000000000014';
  v_p5_benched uuid := 'deadbeef-0000-0000-0000-000000000015';
  v_p6_nonresp uuid := 'deadbeef-0000-0000-0000-000000000016';

  v_schedule   jsonb;
  v_result     jsonb;
  v_matches    int;
  v_outcomes   int;
  v_status     text;
  v_sched_ct   int;
  v_bench_ct   int;
  v_p5_outcome text;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '══════════════════════════════════════════════════════════';
  RAISE NOTICE 'confirm_poll_schedule rollback test';
  RAISE NOTICE '══════════════════════════════════════════════════════════';

  -- ── Create fixtures ────────────────────────────────────────────────
  INSERT INTO profiles (id, name) VALUES
    (v_p1, 'Test P1'), (v_p2, 'Test P2'), (v_p3, 'Test P3'),
    (v_p4, 'Test P4'), (v_p5_benched, 'Test P5 Benched'),
    (v_p6_nonresp, 'Test P6 NonResp')
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

  INSERT INTO groups (id, name, admin_id, visibility)
  VALUES (v_group_id, 'Rollback Test Group', v_p1, 'public')
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

  INSERT INTO polls (id, group_id, status, week_start_date, created_by, time_slots)
  VALUES (
    v_poll_id, v_group_id, 'open', '2026-07-06', v_p1,
    '[{"id":"mon19","day":"Monday","start_time":"19:00","end_time":"20:30"}]'::jsonb
  )
  ON CONFLICT (id) DO UPDATE SET status = 'open',
    time_slots = '[{"id":"mon19","day":"Monday","start_time":"19:00","end_time":"20:30"}]'::jsonb;

  -- Responses for p1-p5 only. p6 is deliberately NOT a responder.
  INSERT INTO poll_responses (poll_id, user_id, selected_slots) VALUES
    (v_poll_id, v_p1, '{mon19}'),
    (v_poll_id, v_p2, '{mon19}'),
    (v_poll_id, v_p3, '{mon19}'),
    (v_poll_id, v_p4, '{mon19}'),
    (v_poll_id, v_p5_benched, '{}')
  ON CONFLICT (poll_id, user_id) DO UPDATE SET selected_slots = EXCLUDED.selected_slots;

  -- Clean any prior test data
  DELETE FROM poll_player_outcomes WHERE poll_id = v_poll_id;
  DELETE FROM matches WHERE poll_id = v_poll_id;
  UPDATE polls SET status = 'open' WHERE id = v_poll_id;

  v_schedule := jsonb_build_array(jsonb_build_object(
    'player_ids', jsonb_build_array(v_p1, v_p2, v_p3, v_p4),
    'match_date', '2026-07-06',
    'match_time', '19:00:00',
    'slot_id', 'mon19'
  ));

  RAISE NOTICE '';
  RAISE NOTICE '── TEST A: bad responder (p6 never responded) ──';

  -- ══════════════════════════════════════════════════════════════════
  -- TEST A — bad responder → RAISE + full rollback
  -- ══════════════════════════════════════════════════════════════════
  BEGIN
    v_result := confirm_poll_schedule(
      v_poll_id,
      v_schedule,
      ARRAY[v_p6_nonresp]
    );
    RAISE NOTICE 'FAIL: should have raised, got %', v_result;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%did not respond%' THEN
      RAISE NOTICE 'PASS: raised — %', SQLERRM;
    ELSE
      RAISE NOTICE 'FAIL: wrong error — %', SQLERRM;
    END IF;
  END;

  -- Rollback checks
  SELECT count(*) INTO v_matches FROM matches WHERE poll_id = v_poll_id;
  SELECT count(*) INTO v_outcomes FROM poll_player_outcomes WHERE poll_id = v_poll_id;
  SELECT status INTO v_status FROM polls WHERE id = v_poll_id;

  IF v_matches = 0 THEN RAISE NOTICE 'PASS: matches = 0'; ELSE RAISE NOTICE 'FAIL: matches = % (expected 0)', v_matches; END IF;
  IF v_outcomes = 0 THEN RAISE NOTICE 'PASS: outcomes = 0'; ELSE RAISE NOTICE 'FAIL: outcomes = % (expected 0)', v_outcomes; END IF;
  IF v_status = 'open' THEN RAISE NOTICE 'PASS: poll status = open'; ELSE RAISE NOTICE 'FAIL: poll status = % (expected open)', v_status; END IF;

  RAISE NOTICE '';
  RAISE NOTICE '── TEST B: scheduled/benched overlap (p1 in both) ──';

  -- ══════════════════════════════════════════════════════════════════
  -- TEST B — overlap → RAISE + full rollback
  -- ══════════════════════════════════════════════════════════════════

  -- Reset
  DELETE FROM poll_player_outcomes WHERE poll_id = v_poll_id;
  DELETE FROM matches WHERE poll_id = v_poll_id;
  UPDATE polls SET status = 'open' WHERE id = v_poll_id;

  BEGIN
    v_result := confirm_poll_schedule(
      v_poll_id,
      v_schedule,
      ARRAY[v_p1]  -- p1 is in the match AND in benched
    );
    RAISE NOTICE 'FAIL: should have raised, got %', v_result;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%BOTH scheduled and benched%' THEN
      RAISE NOTICE 'PASS: raised — %', SQLERRM;
    ELSE
      RAISE NOTICE 'FAIL: wrong error — %', SQLERRM;
    END IF;
  END;

  -- Rollback checks
  SELECT count(*) INTO v_matches FROM matches WHERE poll_id = v_poll_id;
  SELECT count(*) INTO v_outcomes FROM poll_player_outcomes WHERE poll_id = v_poll_id;
  SELECT status INTO v_status FROM polls WHERE id = v_poll_id;

  IF v_matches = 0 THEN RAISE NOTICE 'PASS: matches = 0'; ELSE RAISE NOTICE 'FAIL: matches = % (expected 0)', v_matches; END IF;
  IF v_outcomes = 0 THEN RAISE NOTICE 'PASS: outcomes = 0'; ELSE RAISE NOTICE 'FAIL: outcomes = % (expected 0)', v_outcomes; END IF;
  IF v_status = 'open' THEN RAISE NOTICE 'PASS: poll status = open'; ELSE RAISE NOTICE 'FAIL: poll status = % (expected open)', v_status; END IF;

  RAISE NOTICE '';
  RAISE NOTICE '── TEST C: happy path (4 scheduled, 1 benched) ──';

  -- ══════════════════════════════════════════════════════════════════
  -- TEST C — happy path → commits fully
  -- ══════════════════════════════════════════════════════════════════

  -- Reset
  DELETE FROM poll_player_outcomes WHERE poll_id = v_poll_id;
  DELETE FROM matches WHERE poll_id = v_poll_id;
  UPDATE polls SET status = 'open' WHERE id = v_poll_id;

  v_result := confirm_poll_schedule(
    v_poll_id,
    v_schedule,
    ARRAY[v_p5_benched]
  );

  RAISE NOTICE 'confirm returned: %', v_result;

  SELECT count(*) INTO v_matches FROM matches WHERE poll_id = v_poll_id;
  SELECT count(*) INTO v_sched_ct FROM poll_player_outcomes
    WHERE poll_id = v_poll_id AND outcome = 'scheduled';
  SELECT count(*) INTO v_bench_ct FROM poll_player_outcomes
    WHERE poll_id = v_poll_id AND outcome = 'benched';
  SELECT status INTO v_status FROM polls WHERE id = v_poll_id;
  SELECT outcome INTO v_p5_outcome FROM poll_player_outcomes
    WHERE poll_id = v_poll_id AND user_id = v_p5_benched;

  IF v_matches = 1 THEN RAISE NOTICE 'PASS: matches = 1'; ELSE RAISE NOTICE 'FAIL: matches = % (expected 1)', v_matches; END IF;
  IF v_sched_ct = 4 THEN RAISE NOTICE 'PASS: scheduled = 4'; ELSE RAISE NOTICE 'FAIL: scheduled = % (expected 4)', v_sched_ct; END IF;
  IF v_bench_ct = 1 THEN RAISE NOTICE 'PASS: benched = 1'; ELSE RAISE NOTICE 'FAIL: benched = % (expected 1)', v_bench_ct; END IF;
  IF v_status = 'processed' THEN RAISE NOTICE 'PASS: poll status = processed'; ELSE RAISE NOTICE 'FAIL: poll status = % (expected processed)', v_status; END IF;
  IF v_p5_outcome = 'benched' THEN RAISE NOTICE 'PASS: p5 outcome = benched'; ELSE RAISE NOTICE 'FAIL: p5 outcome = % (expected benched)', v_p5_outcome; END IF;

  -- ── TEARDOWN ───────────────────────────────────────────────────────
  RAISE NOTICE '';
  RAISE NOTICE '── TEARDOWN ──';

  DELETE FROM poll_player_outcomes WHERE poll_id = v_poll_id;
  DELETE FROM matches WHERE poll_id = v_poll_id;
  DELETE FROM poll_responses WHERE poll_id = v_poll_id;
  DELETE FROM polls WHERE id = v_poll_id;
  DELETE FROM groups WHERE id = v_group_id;
  -- Leave profiles (harmless test users, no FK issues)

  SELECT count(*) INTO v_matches FROM matches WHERE poll_id = v_poll_id;
  SELECT count(*) INTO v_outcomes FROM poll_player_outcomes WHERE poll_id = v_poll_id;

  IF v_matches = 0 AND v_outcomes = 0 THEN
    RAISE NOTICE 'PASS: teardown complete — 0 test rows remain';
  ELSE
    RAISE NOTICE 'FAIL: teardown incomplete — matches=%, outcomes=%', v_matches, v_outcomes;
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '══════════════════════════════════════════════════════════';
  RAISE NOTICE 'ALL TESTS COMPLETE';
  RAISE NOTICE '══════════════════════════════════════════════════════════';
END;
$$;
