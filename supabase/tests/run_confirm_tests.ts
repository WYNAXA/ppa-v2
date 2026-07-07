/**
 * Integration tests for confirm_poll_schedule RPC.
 * Connects to the live Supabase DB via the service role key and runs
 * the three test cases (bad responder, overlap, happy path).
 *
 * Run: deno run --allow-net --allow-read --allow-env supabase/tests/run_confirm_tests.ts
 *
 * Requires: VITE_SUPABASE_URL and VITE_SUPABASE_SERVICE_ROLE_KEY in .env
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// Load env
const envText = await Deno.readTextFile(".env");
const env: Record<string, string> = {};
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.+)$/);
  if (m) env[m[1]] = m[2];
}

const url = env.VITE_SUPABASE_URL;
const serviceKey = env.VITE_SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing VITE_SUPABASE_URL or service role key in .env");
  Deno.exit(1);
}

const supabase = createClient(url, serviceKey);

// ── Test IDs ─────────────────────────────────────────────────────────────────
const GROUP_ID   = "aaaaaaaa-0000-0000-0000-000000000001";
const POLL_ID    = "bbbbbbbb-0000-0000-0000-000000000001";
const P1 = "00000000-0000-0000-0000-000000000001";
const P2 = "00000000-0000-0000-0000-000000000002";
const P3 = "00000000-0000-0000-0000-000000000003";
const P4 = "00000000-0000-0000-0000-000000000004";
const P5 = "00000000-0000-0000-0000-000000000005"; // flex-time-only benched
const P6 = "00000000-0000-0000-0000-000000000006"; // non-responder

// ── Setup ────────────────────────────────────────────────────────────────────
async function setup() {
  // Ensure profiles exist
  for (const [id, name] of [
    [P1, "Player 1"], [P2, "Player 2"], [P3, "Player 3"],
    [P4, "Player 4"], [P5, "Player 5 (flex-only)"], [P6, "Player 6 (non-resp)"],
  ]) {
    await supabase.from("profiles").upsert({ id, name }, { onConflict: "id" });
  }

  // Ensure group exists
  await supabase.from("groups").upsert({
    id: GROUP_ID, name: "Test Group", admin_id: P1, visibility: "public",
  }, { onConflict: "id" });

  // Ensure poll exists and is open
  await supabase.from("polls").upsert({
    id: POLL_ID, group_id: GROUP_ID, status: "open",
    week_start_date: "2026-07-06", created_by: P1,
    time_slots: [{ id: "mon19", day: "Monday", start_time: "19:00", end_time: "20:30" }],
  }, { onConflict: "id" });

  // Reset poll status
  await supabase.from("polls").update({ status: "open" }).eq("id", POLL_ID);

  // Ensure poll_responses for p1-p5 (NOT p6)
  for (const uid of [P1, P2, P3, P4, P5]) {
    await supabase.from("poll_responses").upsert({
      poll_id: POLL_ID, user_id: uid,
      selected_slots: uid === P5 ? [] : ["mon19"],
    }, { onConflict: "poll_id,user_id" });
  }

  // Clean prior test data
  await supabase.from("poll_player_outcomes").delete().eq("poll_id", POLL_ID);
  await supabase.from("matches").delete().eq("poll_id", POLL_ID);
  await supabase.from("polls").update({ status: "open" }).eq("id", POLL_ID);
}

async function resetPoll() {
  await supabase.from("poll_player_outcomes").delete().eq("poll_id", POLL_ID);
  await supabase.from("matches").delete().eq("poll_id", POLL_ID);
  await supabase.from("polls").update({ status: "open" }).eq("id", POLL_ID);
}

const schedule = [
  {
    player_ids: [P1, P2, P3, P4],
    match_date: "2026-07-06",
    match_time: "19:00:00",
    slot_id: "mon19",
  },
];

let passed = 0;
let failed = 0;

function ok(label: string) { console.log(`  OK: ${label}`); passed++; }
function fail(label: string) { console.log(`  FAIL: ${label}`); failed++; }

// ── TEST A: bad responder ────────────────────────────────────────────────────
async function testA() {
  console.log("\n=== TEST A: bad responder (p6 never responded) ===");
  await resetPoll();

  const { error } = await supabase.rpc("confirm_poll_schedule", {
    p_poll_id: POLL_ID,
    p_schedule: schedule,
    p_benched_ids: [P6],  // p6 has NO poll_responses row
  });

  if (error) {
    if (error.message.includes("did not respond")) ok("raised: " + error.message);
    else fail("raised unexpected error: " + error.message);
  } else {
    fail("should have raised, but succeeded");
    return;
  }

  // Verify rollback
  const { count: matchCount } = await supabase.from("matches")
    .select("*", { count: "exact", head: true }).eq("poll_id", POLL_ID);
  const { count: outcomeCount } = await supabase.from("poll_player_outcomes")
    .select("*", { count: "exact", head: true }).eq("poll_id", POLL_ID);
  const { data: poll } = await supabase.from("polls").select("status").eq("id", POLL_ID).single();

  if (matchCount === 0 && outcomeCount === 0 && poll?.status === "open") {
    ok(`full rollback (matches=${matchCount}, outcomes=${outcomeCount}, status=${poll.status})`);
  } else {
    fail(`partial write survived (matches=${matchCount}, outcomes=${outcomeCount}, status=${poll?.status})`);
  }
}

// ── TEST B: scheduled/benched overlap ────────────────────────────────────────
async function testB() {
  console.log("\n=== TEST B: scheduled/benched overlap (p1 in both) ===");
  await resetPoll();

  const { error } = await supabase.rpc("confirm_poll_schedule", {
    p_poll_id: POLL_ID,
    p_schedule: schedule,
    p_benched_ids: [P1],  // p1 is in the match AND in benched
  });

  if (error) {
    if (error.message.includes("BOTH scheduled and benched")) ok("raised: " + error.message);
    else fail("raised unexpected error: " + error.message);
  } else {
    fail("should have raised, but succeeded");
    return;
  }

  // Verify rollback
  const { count: matchCount } = await supabase.from("matches")
    .select("*", { count: "exact", head: true }).eq("poll_id", POLL_ID);
  const { count: outcomeCount } = await supabase.from("poll_player_outcomes")
    .select("*", { count: "exact", head: true }).eq("poll_id", POLL_ID);
  const { data: poll } = await supabase.from("polls").select("status").eq("id", POLL_ID).single();

  if (matchCount === 0 && outcomeCount === 0 && poll?.status === "open") {
    ok(`full rollback (matches=${matchCount}, outcomes=${outcomeCount}, status=${poll.status})`);
  } else {
    fail(`partial write survived (matches=${matchCount}, outcomes=${outcomeCount}, status=${poll?.status})`);
  }
}

// ── TEST C: happy path ───────────────────────────────────────────────────────
async function testC() {
  console.log("\n=== TEST C: happy path (4 scheduled, 1 flex-time benched) ===");
  await resetPoll();

  const { data, error } = await supabase.rpc("confirm_poll_schedule", {
    p_poll_id: POLL_ID,
    p_schedule: schedule,
    p_benched_ids: [P5],  // p5 is flex-time-only benched (has poll_responses row)
  });

  if (error) {
    fail("should succeed but raised: " + error.message);
    return;
  }

  ok("confirm succeeded: " + JSON.stringify(data));

  // Verify all writes
  const { count: matchCount } = await supabase.from("matches")
    .select("*", { count: "exact", head: true }).eq("poll_id", POLL_ID);
  const { count: scheduledCount } = await supabase.from("poll_player_outcomes")
    .select("*", { count: "exact", head: true })
    .eq("poll_id", POLL_ID).eq("outcome", "scheduled");
  const { count: benchedCount } = await supabase.from("poll_player_outcomes")
    .select("*", { count: "exact", head: true })
    .eq("poll_id", POLL_ID).eq("outcome", "benched");
  const { data: poll } = await supabase.from("polls").select("status").eq("id", POLL_ID).single();
  const { data: p5row } = await supabase.from("poll_player_outcomes")
    .select("outcome").eq("poll_id", POLL_ID).eq("user_id", P5).maybeSingle();

  if (matchCount === 1) ok(`matches=${matchCount}`);
  else fail(`matches=${matchCount}, expected 1`);

  if (scheduledCount === 4) ok(`scheduled=${scheduledCount}`);
  else fail(`scheduled=${scheduledCount}, expected 4`);

  if (benchedCount === 1) ok(`benched=${benchedCount}`);
  else fail(`benched=${benchedCount}, expected 1`);

  if (poll?.status === "processed") ok(`status=${poll.status}`);
  else fail(`status=${poll?.status}, expected processed`);

  if (p5row?.outcome === "benched") ok(`p5 outcome=${p5row.outcome}`);
  else fail(`p5 outcome=${p5row?.outcome}, expected benched`);

  // Clean up
  await resetPoll();
}

// ── Run all ──────────────────────────────────────────────────────────────────

await setup();
await testA();
await testB();
await testC();

// Cleanup fixtures
await supabase.from("poll_responses").delete().eq("poll_id", POLL_ID);
await supabase.from("polls").delete().eq("id", POLL_ID);

console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`);
if (failed > 0) Deno.exit(1);
