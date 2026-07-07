-- ════════════════════════════════════════════════════════════════════════════
-- Integration tests for confirm_poll_schedule RPC.
--
-- Run against a live Supabase DB:
--   psql $DATABASE_URL -f supabase/tests/confirm_poll_schedule_test.sql
--
-- Uses savepoints for isolation — each test rolls back its writes.
-- Uses RAISE NOTICE for test output (pgTAP style but no extension needed).
-- ════════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

-- ── Setup: create test fixtures ──────────────────────────────────────────────

BEGIN;

-- Create a test group
INSERT INTO groups (id, name, admin_id, visibility)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'Test Group',
        '00000000-0000-0000-0000-000000000001', 'public')
ON CONFLICT (id) DO NOTHING;

-- Create test profiles (the players)
INSERT INTO profiles (id, name) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Player 1'),
  ('00000000-0000-0000-0000-000000000002', 'Player 2'),
  ('00000000-0000-0000-0000-000000000003', 'Player 3'),
  ('00000000-0000-0000-0000-000000000004', 'Player 4'),
  ('00000000-0000-0000-0000-000000000005', 'Player 5 (flex-only benched)'),
  ('00000000-0000-0000-0000-000000000006', 'Player 6 (non-responder)')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- Create a test poll
INSERT INTO polls (id, group_id, status, week_start_date, time_slots, created_by)
VALUES (
  'bbbbbbbb-0000-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000001',
  'open',
  '2026-07-06',
  '[{"id":"mon19","day":"Monday","start_time":"19:00","end_time":"20:30"}]'::jsonb,
  '00000000-0000-0000-0000-000000000001'
)
ON CONFLICT (id) DO UPDATE SET status = 'open';

-- Create poll responses for p1-p5 (NOT p6)
INSERT INTO poll_responses (poll_id, user_id, selected_slots) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '{mon19}'),
  ('bbbbbbbb-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '{mon19}'),
  ('bbbbbbbb-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', '{mon19}'),
  ('bbbbbbbb-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', '{mon19}'),
  ('bbbbbbbb-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005', '{}')
ON CONFLICT (poll_id, user_id) DO UPDATE SET selected_slots = EXCLUDED.selected_slots;

-- Clean any prior test data
DELETE FROM poll_player_outcomes WHERE poll_id = 'bbbbbbbb-0000-0000-0000-000000000001';
DELETE FROM matches WHERE poll_id = 'bbbbbbbb-0000-0000-0000-000000000001';
UPDATE polls SET status = 'open' WHERE id = 'bbbbbbbb-0000-0000-0000-000000000001';

COMMIT;


-- ══════════════════════════════════════════════════════════════════════════════
-- TEST A: bad responder → RAISES, full rollback
-- ══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_result   jsonb;
  v_matches  int;
  v_outcomes int;
  v_status   text;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== TEST A: bad responder (p6 never responded) ===';

  -- Reset poll to open
  UPDATE polls SET status = 'open' WHERE id = 'bbbbbbbb-0000-0000-0000-000000000001';
  DELETE FROM poll_player_outcomes WHERE poll_id = 'bbbbbbbb-0000-0000-0000-000000000001';
  DELETE FROM matches WHERE poll_id = 'bbbbbbbb-0000-0000-0000-000000000001';

  BEGIN
    -- Call with p6 (non-responder) in benched list
    v_result := confirm_poll_schedule(
      'bbbbbbbb-0000-0000-0000-000000000001'::uuid,
      '[{"player_ids":["00000000-0000-0000-0000-000000000001","00000000-0000-0000-0000-000000000002","00000000-0000-0000-0000-000000000003","00000000-0000-0000-0000-000000000004"],"match_date":"2026-07-06","match_time":"19:00:00","slot_id":"mon19"}]'::jsonb,
      ARRAY['00000000-0000-0000-0000-000000000006']::uuid[]  -- p6: NOT a responder
    );
    RAISE NOTICE 'FAIL: should have raised, got %', v_result;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'OK: raised exception: %', SQLERRM;
  END;

  -- Verify rollback: zero matches, zero outcomes, poll still open
  SELECT count(*) INTO v_matches FROM matches WHERE poll_id = 'bbbbbbbb-0000-0000-0000-000000000001';
  SELECT count(*) INTO v_outcomes FROM poll_player_outcomes WHERE poll_id = 'bbbbbbbb-0000-0000-0000-000000000001';
  SELECT status INTO v_status FROM polls WHERE id = 'bbbbbbbb-0000-0000-0000-000000000001';

  IF v_matches = 0 AND v_outcomes = 0 AND v_status = 'open' THEN
    RAISE NOTICE 'OK: full rollback confirmed (matches=%, outcomes=%, status=%)', v_matches, v_outcomes, v_status;
  ELSE
    RAISE NOTICE 'FAIL: partial write survived (matches=%, outcomes=%, status=%)', v_matches, v_outcomes, v_status;
  END IF;
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TEST B: scheduled/benched overlap → RAISES, full rollback
-- ══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_result   jsonb;
  v_matches  int;
  v_outcomes int;
  v_status   text;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== TEST B: scheduled/benched overlap (p1 in both) ===';

  -- Reset
  UPDATE polls SET status = 'open' WHERE id = 'bbbbbbbb-0000-0000-0000-000000000001';
  DELETE FROM poll_player_outcomes WHERE poll_id = 'bbbbbbbb-0000-0000-0000-000000000001';
  DELETE FROM matches WHERE poll_id = 'bbbbbbbb-0000-0000-0000-000000000001';

  BEGIN
    -- p1 is in the match AND in benched — contradiction
    v_result := confirm_poll_schedule(
      'bbbbbbbb-0000-0000-0000-000000000001'::uuid,
      '[{"player_ids":["00000000-0000-0000-0000-000000000001","00000000-0000-0000-0000-000000000002","00000000-0000-0000-0000-000000000003","00000000-0000-0000-0000-000000000004"],"match_date":"2026-07-06","match_time":"19:00:00","slot_id":"mon19"}]'::jsonb,
      ARRAY['00000000-0000-0000-0000-000000000001']::uuid[]  -- p1: ALSO scheduled
    );
    RAISE NOTICE 'FAIL: should have raised, got %', v_result;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'OK: raised exception: %', SQLERRM;
  END;

  -- Verify rollback
  SELECT count(*) INTO v_matches FROM matches WHERE poll_id = 'bbbbbbbb-0000-0000-0000-000000000001';
  SELECT count(*) INTO v_outcomes FROM poll_player_outcomes WHERE poll_id = 'bbbbbbbb-0000-0000-0000-000000000001';
  SELECT status INTO v_status FROM polls WHERE id = 'bbbbbbbb-0000-0000-0000-000000000001';

  IF v_matches = 0 AND v_outcomes = 0 AND v_status = 'open' THEN
    RAISE NOTICE 'OK: full rollback confirmed (matches=%, outcomes=%, status=%)', v_matches, v_outcomes, v_status;
  ELSE
    RAISE NOTICE 'FAIL: partial write survived (matches=%, outcomes=%, status=%)', v_matches, v_outcomes, v_status;
  END IF;
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TEST C: happy path — valid confirm incl flex-time-only benched
-- ══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_result      jsonb;
  v_matches     int;
  v_scheduled   int;
  v_benched     int;
  v_status      text;
  v_p5_outcome  text;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== TEST C: happy path (4 scheduled, 1 flex-time benched) ===';

  -- Reset
  UPDATE polls SET status = 'open' WHERE id = 'bbbbbbbb-0000-0000-0000-000000000001';
  DELETE FROM poll_player_outcomes WHERE poll_id = 'bbbbbbbb-0000-0000-0000-000000000001';
  DELETE FROM matches WHERE poll_id = 'bbbbbbbb-0000-0000-0000-000000000001';

  -- p5 responded (has poll_responses row) but with selected_slots='{}' (flex-time only).
  -- The engine determined they are benched (available via flex-times at a formed slot).
  v_result := confirm_poll_schedule(
    'bbbbbbbb-0000-0000-0000-000000000001'::uuid,
    '[{"player_ids":["00000000-0000-0000-0000-000000000001","00000000-0000-0000-0000-000000000002","00000000-0000-0000-0000-000000000003","00000000-0000-0000-0000-000000000004"],"match_date":"2026-07-06","match_time":"19:00:00","slot_id":"mon19"}]'::jsonb,
    ARRAY['00000000-0000-0000-0000-000000000005']::uuid[]  -- p5: flex-time-only benched
  );

  RAISE NOTICE 'confirm result: %', v_result;

  -- Verify writes
  SELECT count(*) INTO v_matches FROM matches WHERE poll_id = 'bbbbbbbb-0000-0000-0000-000000000001';
  SELECT count(*) INTO v_scheduled FROM poll_player_outcomes
    WHERE poll_id = 'bbbbbbbb-0000-0000-0000-000000000001' AND outcome = 'scheduled';
  SELECT count(*) INTO v_benched FROM poll_player_outcomes
    WHERE poll_id = 'bbbbbbbb-0000-0000-0000-000000000001' AND outcome = 'benched';
  SELECT status INTO v_status FROM polls WHERE id = 'bbbbbbbb-0000-0000-0000-000000000001';
  SELECT outcome INTO v_p5_outcome FROM poll_player_outcomes
    WHERE poll_id = 'bbbbbbbb-0000-0000-0000-000000000001'
      AND user_id = '00000000-0000-0000-0000-000000000005';

  IF v_matches = 1 AND v_scheduled = 4 AND v_benched = 1 AND v_status = 'processed' AND v_p5_outcome = 'benched' THEN
    RAISE NOTICE 'OK: all writes correct (matches=%, scheduled=%, benched=%, status=%, p5=%)',
      v_matches, v_scheduled, v_benched, v_status, v_p5_outcome;
  ELSE
    RAISE NOTICE 'FAIL: unexpected state (matches=%, scheduled=%, benched=%, status=%, p5=%)',
      v_matches, v_scheduled, v_benched, v_status, v_p5_outcome;
  END IF;

  -- Clean up test C data so tests are idempotent
  DELETE FROM poll_player_outcomes WHERE poll_id = 'bbbbbbbb-0000-0000-0000-000000000001';
  DELETE FROM matches WHERE poll_id = 'bbbbbbbb-0000-0000-0000-000000000001';
  UPDATE polls SET status = 'open' WHERE id = 'bbbbbbbb-0000-0000-0000-000000000001';
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- Cleanup: remove test fixtures
-- ══════════════════════════════════════════════════════════════════════════════

BEGIN;
DELETE FROM poll_player_outcomes WHERE poll_id = 'bbbbbbbb-0000-0000-0000-000000000001';
DELETE FROM poll_responses WHERE poll_id = 'bbbbbbbb-0000-0000-0000-000000000001';
DELETE FROM matches WHERE poll_id = 'bbbbbbbb-0000-0000-0000-000000000001';
DELETE FROM polls WHERE id = 'bbbbbbbb-0000-0000-0000-000000000001';
-- Leave profiles and group (harmless, may be used by other tests)
COMMIT;

\echo ''
\echo '=== ALL TESTS COMPLETE ==='
