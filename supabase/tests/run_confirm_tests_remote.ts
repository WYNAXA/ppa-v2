/**
 * Integration tests for confirm_poll_schedule RPC against remote Supabase DB.
 * Uses the service role key to call the RPC as a privileged caller.
 *
 * Run: deno run --allow-net --allow-read supabase/tests/run_confirm_tests_remote.ts
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const URL = "https://timbjfihsxqfrqrxwdny.supabase.co";
const SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpbWJqZmloc3hxZnJxcnh3ZG55Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjE5MDY3MiwiZXhwIjoyMDg3NzY2NjcyfQ.4j2hXxcmPHgTnHN_fcTW1WcQk3ikzwjwN8hR25zjtpA";

const sb = createClient(URL, SERVICE_KEY);

const GROUP_ID = "aaaaaaaa-0000-0000-0000-000000000001";
const POLL_ID  = "bbbbbbbb-0000-0000-0000-000000000001";
const P1 = "00000000-0000-0000-0000-000000000001";
const P2 = "00000000-0000-0000-0000-000000000002";
const P3 = "00000000-0000-0000-0000-000000000003";
const P4 = "00000000-0000-0000-0000-000000000004";
const P5 = "00000000-0000-0000-0000-000000000005";
const P6 = "00000000-0000-0000-0000-000000000006";

let passed = 0, failed = 0;
function ok(s: string)   { console.log(`  OK: ${s}`); passed++; }
function fail(s: string) { console.log(`  FAIL: ${s}`); failed++; }

async function resetPoll() {
  await sb.from("poll_player_outcomes").delete().eq("poll_id", POLL_ID);
  await sb.from("matches").delete().eq("poll_id", POLL_ID);
  await sb.from("polls").update({ status: "open" }).eq("id", POLL_ID);
}

async function setup() {
  // Profiles
  for (const [id, name] of [[P1,"P1"],[P2,"P2"],[P3,"P3"],[P4,"P4"],[P5,"P5"],[P6,"P6"]]) {
    await sb.from("profiles").upsert({ id, name }, { onConflict: "id" });
  }
  // Group
  await sb.from("groups").upsert({
    id: GROUP_ID, name: "TestGrp", admin_id: P1, visibility: "public",
  }, { onConflict: "id" });
  // Poll
  await sb.from("polls").upsert({
    id: POLL_ID, group_id: GROUP_ID, status: "open", week_start_date: "2026-07-06",
    created_by: P1,
    time_slots: [{ id: "mon19", day: "Monday", start_time: "19:00", end_time: "20:30" }],
  }, { onConflict: "id" });
  await sb.from("polls").update({ status: "open" }).eq("id", POLL_ID);
  // Responses for P1-P5 only (P6 is non-responder)
  for (const uid of [P1, P2, P3, P4, P5]) {
    await sb.from("poll_responses").upsert({
      poll_id: POLL_ID, user_id: uid,
      selected_slots: uid === P5 ? [] : ["mon19"],
    }, { onConflict: "poll_id,user_id" });
  }
  // Clean
  await resetPoll();
}

const schedule = [{
  player_ids: [P1, P2, P3, P4],
  match_date: "2026-07-06",
  match_time: "19:00:00",
  slot_id: "mon19",
}];

// ── Check if RPC exists ──────────────────────────────────────────────────────

async function checkRpcExists(): Promise<boolean> {
  const { error } = await sb.rpc("confirm_poll_schedule", {
    p_poll_id: "00000000-0000-0000-0000-000000000000",
    p_schedule: [],
    p_benched_ids: [],
  });
  if (error && error.message.includes("not found")) return false;
  if (error && error.message.includes("Could not find")) return false;
  return true;
}

// ── TEST A ───────────────────────────────────────────────────────────────────

async function testA() {
  console.log("\n=== TEST A: bad responder (P6 never responded) ===");
  await resetPoll();

  const { error } = await sb.rpc("confirm_poll_schedule", {
    p_poll_id: POLL_ID,
    p_schedule: schedule,
    p_benched_ids: [P6],
  });

  if (error) {
    if (error.message.includes("did not respond")) ok("raised: " + error.message.slice(0, 80));
    else fail("unexpected error: " + error.message.slice(0, 120));
  } else {
    fail("should have raised, but succeeded");
    return;
  }

  const { count: mc } = await sb.from("matches").select("*", { count: "exact", head: true }).eq("poll_id", POLL_ID);
  const { count: oc } = await sb.from("poll_player_outcomes").select("*", { count: "exact", head: true }).eq("poll_id", POLL_ID);
  const { data: poll } = await sb.from("polls").select("status").eq("id", POLL_ID).single();

  if (mc === 0 && oc === 0 && poll?.status === "open")
    ok(`full rollback (matches=${mc}, outcomes=${oc}, status=${poll.status})`);
  else
    fail(`partial write survived (matches=${mc}, outcomes=${oc}, status=${poll?.status})`);
}

// ── TEST B ───────────────────────────────────────────────────────────────────

async function testB() {
  console.log("\n=== TEST B: scheduled/benched overlap (P1 in both) ===");
  await resetPoll();

  const { error } = await sb.rpc("confirm_poll_schedule", {
    p_poll_id: POLL_ID,
    p_schedule: schedule,
    p_benched_ids: [P1],
  });

  if (error) {
    if (error.message.includes("BOTH scheduled and benched")) ok("raised: " + error.message.slice(0, 80));
    else fail("unexpected error: " + error.message.slice(0, 120));
  } else {
    fail("should have raised, but succeeded");
    return;
  }

  const { count: mc } = await sb.from("matches").select("*", { count: "exact", head: true }).eq("poll_id", POLL_ID);
  const { count: oc } = await sb.from("poll_player_outcomes").select("*", { count: "exact", head: true }).eq("poll_id", POLL_ID);
  const { data: poll } = await sb.from("polls").select("status").eq("id", POLL_ID).single();

  if (mc === 0 && oc === 0 && poll?.status === "open")
    ok(`full rollback (matches=${mc}, outcomes=${oc}, status=${poll.status})`);
  else
    fail(`partial write survived (matches=${mc}, outcomes=${oc}, status=${poll?.status})`);
}

// ── TEST C ───────────────────────────────────────────────────────────────────

async function testC() {
  console.log("\n=== TEST C: happy path (4 scheduled, 1 flex-time benched) ===");
  await resetPoll();

  const { data, error } = await sb.rpc("confirm_poll_schedule", {
    p_poll_id: POLL_ID,
    p_schedule: schedule,
    p_benched_ids: [P5],
  });

  if (error) { fail("should succeed: " + error.message.slice(0, 120)); return; }
  ok("confirm succeeded: " + JSON.stringify(data));

  const { count: mc } = await sb.from("matches").select("*", { count: "exact", head: true }).eq("poll_id", POLL_ID);
  const { count: sc } = await sb.from("poll_player_outcomes").select("*", { count: "exact", head: true }).eq("poll_id", POLL_ID).eq("outcome", "scheduled");
  const { count: bc } = await sb.from("poll_player_outcomes").select("*", { count: "exact", head: true }).eq("poll_id", POLL_ID).eq("outcome", "benched");
  const { data: poll } = await sb.from("polls").select("status").eq("id", POLL_ID).single();
  const { data: p5 } = await sb.from("poll_player_outcomes").select("outcome").eq("poll_id", POLL_ID).eq("user_id", P5).maybeSingle();

  if (mc === 1) ok(`matches=${mc}`); else fail(`matches=${mc}, expected 1`);
  if (sc === 4) ok(`scheduled=${sc}`); else fail(`scheduled=${sc}, expected 4`);
  if (bc === 1) ok(`benched=${bc}`); else fail(`benched=${bc}, expected 1`);
  if (poll?.status === "processed") ok(`status=${poll.status}`); else fail(`status=${poll?.status}`);
  if (p5?.outcome === "benched") ok(`p5=${p5.outcome}`); else fail(`p5=${p5?.outcome}`);

  await resetPoll();
}

// ── Run ──────────────────────────────────────────────────────────────────────

console.log("Checking if confirm_poll_schedule RPC exists...");
const exists = await checkRpcExists();
if (!exists) {
  console.log("ERROR: confirm_poll_schedule RPC not found on remote DB.");
  console.log("Apply migrations 20260707000001-4 in the SQL Editor first.");
  Deno.exit(1);
}
console.log("RPC exists. Running tests...");

await setup();
await testA();
await testB();
await testC();

// Cleanup
await sb.from("poll_responses").delete().eq("poll_id", POLL_ID);
await sb.from("polls").delete().eq("id", POLL_ID);

console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`);
if (failed > 0) Deno.exit(1);
