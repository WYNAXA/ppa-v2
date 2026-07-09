/**
 * poll-scheduler — unified edge function for poll → match scheduling.
 *
 * Two modes:
 *   { mode: "propose", poll_id, togetherness? }
 *     → runs the ILP engine, returns proposals. No writes.
 *
 *   { mode: "confirm", poll_id, schedule, benched_ids }
 *     → calls confirm_poll_schedule RPC. Atomic write.
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { isUserAvailableForSlot } from "../_shared/timeUtils.ts";
import {
  generateProposals,
  balanceTeamSplit,
  type TimeSlot,
  type PollResponse,
  type BenchHistory,
  type PairingRecord,
  type EngineInput,
  type EngineOutput,
  type ProposedMatch,
} from "../_shared/matchEngine.ts";
import {
  rangesToVirtualSlots,
  computeMatchWindow,
  extractClusters,
  type RangeResponse,
  type TimeRange,
} from "../_shared/rangeAvailability.ts";
import { timeToMinutes } from "../_shared/vendor/scheduling-v1.0.0.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json();
    const { mode, poll_id } = body;

    if (!poll_id) {
      return json({ error: "poll_id is required" }, 400);
    }

    // ── SHARED SETUP (both modes) ──────────────────────────────────────

    // 1. Fetch poll
    const { data: poll, error: pollErr } = await supabase
      .from("polls")
      .select("*, groups(id, name)")
      .eq("id", poll_id)
      .single();

    if (pollErr || !poll) {
      return json({ error: "Poll not found" }, 404);
    }

    const timeSlots: TimeSlot[] = Array.isArray(poll.time_slots)
      ? poll.time_slots
      : [];

    // Range-poll detection: poll_dates set = range model, time_slots = legacy
    const isRange = Array.isArray(poll.poll_dates) && poll.poll_dates.length > 0;

    if (mode === "propose") {
      return await handlePropose(supabase, poll, timeSlots, body.togetherness ?? false, body.balance_teams ?? false, isRange);
    } else if (mode === "recompute") {
      return await handleRecompute(supabase, poll, timeSlots, body.schedule, isRange);
    } else if (mode === "confirm") {
      return await handleConfirm(supabase, poll_id, body.schedule, body.benched_ids);
    } else {
      return json({ error: 'mode must be "propose", "recompute", or "confirm"' }, 400);
    }
  } catch (err: any) {
    console.error("poll-scheduler error:", err);
    return json({ error: err.message ?? "Unknown error" }, 500);
  }
});

// ── MODE: propose ────────────────────────────────────────────────────────────

async function handlePropose(
  supabase: any,
  poll: any,
  timeSlots: TimeSlot[],
  togetherness: boolean,
  balanceTeams: boolean = false,
  isRange: boolean = false,
): Promise<Response> {

  // 2. Fetch poll_responses — select * to be resilient to column additions
  // (max_matches may not exist until migration is applied)
  const selectCols = "user_id, selected_slots, flexible_times, can_play_twice, availability_ranges, preferred_date";

  const { data: responses, error: respErr } = await supabase
    .from("poll_responses")
    .select(selectCols)
    .eq("poll_id", poll.id);

  if (respErr) return json({ error: "Failed to fetch responses" }, 500);
  if (!responses || responses.length < 2) {
    return json({ success: true, proposals: [], message: "Need at least 2 responses" });
  }

  // 3. BRANCH: range vs legacy availability
  let engineTimeSlots: TimeSlot[];
  let engineResponses: PollResponse[];
  let rangesByUser: Map<string, Record<string, TimeRange[]>> | null = null;
  let rangeResponsesRef: RangeResponse[] | null = null;

  if (isRange) {
    // ── RANGE PATH: use the proven sweep-line engine (rangeAvailability.ts) ──
    // Convert availability_ranges → virtual TimeSlots + PollResponses
    // that the existing ILP solver consumes unchanged.
    const rangeResponses: RangeResponse[] = responses
      .filter((r: any) => r.availability_ranges && typeof r.availability_ranges === "object")
      .map((r: any) => ({
        user_id: r.user_id,
        availability_ranges: r.availability_ranges,
        can_play_twice: r.can_play_twice ?? false,
        max_matches: r.max_matches ?? null,
        preferred_date: r.preferred_date ?? null,
      }));

    if (rangeResponses.length < 2) {
      return json({ success: true, proposals: [], message: "Need at least 2 range responses" });
    }

    const virtual = rangesToVirtualSlots(rangeResponses);
    engineTimeSlots = virtual.timeSlots;
    engineResponses = virtual.responses;

    // Build rangesByUser for window computation (used in propose + recompute)
    rangesByUser = new Map();
    for (const r of rangeResponses) {
      rangesByUser.set(r.user_id, r.availability_ranges);
    }
    rangeResponsesRef = rangeResponses;
  } else {
    // ── LEGACY PATH: slot-based availability (unchanged) ──
    engineTimeSlots = timeSlots;
    engineResponses = responses.map((r: any) => ({
      user_id: r.user_id,
      selected_slots: r.selected_slots ?? [],
      flexible_times: r.flexible_times ?? null,
      can_play_twice: r.can_play_twice ?? false,
      max_matches: r.max_matches ?? null,
      preferred_date: r.preferred_date ?? null,
    }));
  }

  // 4. Bench-debt: count of outcome='benched' per user in this group, last 3 months
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  const { data: benchRows } = await supabase
    .from("poll_player_outcomes")
    .select("user_id")
    .eq("group_id", poll.group_id)
    .eq("outcome", "benched")
    .gte("created_at", threeMonthsAgo.toISOString());

  const benchHistory: BenchHistory[] = [];
  if (benchRows) {
    const counts = new Map<string, number>();
    for (const row of benchRows) {
      counts.set(row.user_id, (counts.get(row.user_id) ?? 0) + 1);
    }
    for (const [user_id, bench_count] of counts) {
      benchHistory.push({ user_id, bench_count });
    }
  }

  // 5. Pairing history: recent matches in this group (3 months)
  const { data: recentMatches } = await supabase
    .from("matches")
    .select("player_ids, match_date")
    .eq("group_id", poll.group_id)
    .eq("status", "scheduled")
    .gte("match_date", threeMonthsAgo.toISOString().split("T")[0])
    .order("match_date", { ascending: false });

  const pairingHistory: PairingRecord[] = (recentMatches ?? []).map((m: any) => ({
    player_ids: m.player_ids ?? [],
    match_date: m.match_date,
  }));

  // 6. Run the engine
  const engineInput: EngineInput = {
    weekStartDate: poll.week_start_date ?? "",
    timeSlots: engineTimeSlots,
    responses: engineResponses,
    benchHistory,
    pairingHistory,
    togetherness,
  };

  const output: EngineOutput = await generateProposals(engineInput);

  // 7. Build profile map for UI
  const allPlayerIds = new Set<string>();
  output.matches.forEach(m => m.playerIds.forEach(id => allPlayerIds.add(id)));
  output.playersBenched.forEach(id => allPlayerIds.add(id));

  const profilesMap: Record<string, any> = {};
  if (allPlayerIds.size > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, name, playtomic_level, internal_ranking")
      .in("id", Array.from(allPlayerIds));

    for (const p of profiles ?? []) {
      profilesMap[p.id] = p;
    }
  }

  // 8. ELO-balanced team split (optional, behind balanceTeams toggle)
  // Builds an ELO map from profiles, then for each match of 4 computes
  // the 2v2 split that minimises |sum(team1 ELO) - sum(team2 ELO)|.
  // Does NOT change which 4 players form the match — only assigns teams.
  const eloMap = new Map<string, number>();
  if (balanceTeams) {
    for (const [id, p] of Object.entries(profilesMap)) {
      eloMap.set(id, (p as any).internal_ranking ?? 1300);
    }
  }

  // 9. Return proposals.
  const proposals = output.matches.map((m: ProposedMatch) => {
    // match_time: for range polls, use the window start from the slotId
    // (format: "yyyy-MM-dd_HH:MM_HH:MM"); for legacy, split on "-".
    let matchTime: string;
    if (isRange) {
      // slotId = "2026-07-13_06:00_12:00" → start = "06:00"
      const parts = m.slotId.split("_");
      matchTime = (parts[1] ?? "19:00") + ":00";
    } else {
      matchTime = m.timeSlot.split("-")[0] + ":00";
    }

    const base: any = {
      player_ids: m.playerIds,
      match_date: m.date,
      match_time: matchTime,
      slot_id: m.slotId,
      day: m.day,
      time_slot_display: m.timeSlot,
      diversity_score: m.diversityScore,
      additional_options: {},
    };

    // Range polls: compute the maximal shared window from real player ranges
    if (isRange && rangesByUser && m.playerIds.length >= 2) {
      const parts = m.slotId.split("_");
      const matchDate = parts[0];  // "yyyy-MM-dd"
      const slotStart = timeToMinutes(parts[1]);  // sweep-line window start
      const slotEnd = timeToMinutes(parts[2]);     // sweep-line window end
      const window = computeMatchWindow(m.playerIds, matchDate, slotStart, slotEnd, rangesByUser);
      if (window) {
        base.window_start = window.window_start;
        base.window_end = window.window_end;
        // match_time = window_start (working default)
        base.match_time = window.window_start + ":00";
      }
    }

    if (balanceTeams && m.playerIds.length === 4) {
      const [t1, t2] = balanceTeamSplit(m.playerIds, eloMap);
      base.team1_player_ids = t1;
      base.team2_player_ids = t2;
      base.team1_elo = (eloMap.get(t1[0]) ?? 1300) + (eloMap.get(t1[1]) ?? 1300);
      base.team2_elo = (eloMap.get(t2[0]) ?? 1300) + (eloMap.get(t2[1]) ?? 1300);
      base.elo_gap = Math.abs(base.team1_elo - base.team2_elo);
    }

    return base;
  });

  // Build per-slot availability for swap candidate filtering
  const slotAvailability: Record<string, string[]> = {};
  const slotsWithMatches = new Set(output.matches.map(m => m.slotId));

  if (isRange && rangesByUser) {
    // Range path: filter swap candidates by 60min window constraint
    for (const m of output.matches) {
      if (!slotsWithMatches.has(m.slotId)) continue;
      const parts = m.slotId.split("_");
      const matchDate = parts[0];
      const slotStart = timeToMinutes(parts[1]);
      const slotEnd = timeToMinutes(parts[2]);

      const candidates: string[] = [];
      for (const r of engineResponses) {
        if (!r.selected_slots.includes(m.slotId)) continue;
        // Check if swapping this candidate into ANY position yields >= 60min window
        let eligible = false;
        for (let i = 0; i < m.playerIds.length; i++) {
          if (m.playerIds[i] === r.user_id) { eligible = true; break; }
          const testPids = [...m.playerIds];
          testPids[i] = r.user_id;
          const testWindow = computeMatchWindow(testPids, matchDate, slotStart, slotEnd, rangesByUser);
          if (testWindow) { eligible = true; break; }
        }
        if (eligible) candidates.push(r.user_id);
      }
      slotAvailability[m.slotId] = candidates;
    }
  } else {
    // Legacy path: use isUserAvailableForSlot against real time slots
    for (const slot of timeSlots) {
      if (!slotsWithMatches.has(slot.id)) continue;
      const avail: string[] = [];
      for (const r of engineResponses) {
        if (isUserAvailableForSlot(
          { selected_slots: r.selected_slots ?? [], flexible_times: r.flexible_times ?? {} },
          slot,
        )) avail.push(r.user_id);
      }
      slotAvailability[slot.id] = avail;
    }
  }

  // Extract availability clusters for range polls (includes short groups)
  const clusters = isRange && rangeResponsesRef
    ? extractClusters(rangeResponsesRef)
    : undefined;

  return json({
    success: true,
    proposals,
    players_scheduled: output.playersScheduled,
    players_benched: output.playersBenched,
    total_participation: output.totalParticipation,
    profiles: profilesMap,
    slot_availability: slotAvailability,
    clusters,
  });
}

// ── MODE: recompute ──────────────────────────────────────────────────────────
// Given an admin-EDITED schedule (fixed input — not re-optimised), re-derive
// who is scheduled and who is benched using the SAME isUserAvailableForSlot +
// locked benched definition the engine uses.
//
// Does NOT run the ILP.  Does NOT change the admin's player assignments.
// Only re-derives the two sets from the given schedule + poll responses.

async function handleRecompute(
  supabase: any,
  poll: any,
  timeSlots: TimeSlot[],
  schedule: any[] | undefined,
  isRange: boolean = false,
): Promise<Response> {
  if (!schedule || !Array.isArray(schedule)) {
    return json({ error: "schedule must be a JSON array" }, 400);
  }

  // 1. Fetch all poll responses
  const selectCols = isRange
    ? "user_id, selected_slots, flexible_times, can_play_twice, availability_ranges"
    : "user_id, selected_slots, flexible_times";

  const { data: responses } = await supabase
    .from("poll_responses")
    .select(selectCols)
    .eq("poll_id", poll.id);

  if (!responses) return json({ error: "Failed to fetch responses" }, 500);

  // 2. Build slot-level availability
  const slotPlayers = new Map<string, Set<string>>();

  if (isRange) {
    // Range path: rebuild virtual slots from availability_ranges
    const rangeResponses: RangeResponse[] = responses
      .filter((r: any) => r.availability_ranges && typeof r.availability_ranges === "object")
      .map((r: any) => ({
        user_id: r.user_id,
        availability_ranges: r.availability_ranges,
        can_play_twice: r.can_play_twice ?? false,
        max_matches: r.max_matches ?? null,
        preferred_date: r.preferred_date ?? null,
      }));
    const virtual = rangesToVirtualSlots(rangeResponses);
    // Build slotPlayers from the virtual responses' selected_slots
    for (const slot of virtual.timeSlots) {
      slotPlayers.set(slot.id, new Set<string>());
    }
    for (const r of virtual.responses) {
      for (const sid of r.selected_slots) {
        if (!slotPlayers.has(sid)) slotPlayers.set(sid, new Set());
        slotPlayers.get(sid)!.add(r.user_id);
      }
    }
  } else {
    // Legacy path: isUserAvailableForSlot against real time slots
    for (const slot of timeSlots) {
      const avail = new Set<string>();
      for (const r of responses) {
        if (isUserAvailableForSlot(
          { selected_slots: r.selected_slots ?? [], flexible_times: r.flexible_times ?? {} },
          slot,
        )) {
          avail.add(r.user_id);
        }
      }
      slotPlayers.set(slot.id, avail);
    }
  }

  // 3. Derive scheduled set from the FIXED schedule (admin's edit)
  const scheduledSet = new Set<string>();
  const slotsWithMatches = new Set<string>();
  for (const m of schedule) {
    const pids = m.player_ids ?? m.playerIds ?? [];
    for (const pid of pids) scheduledSet.add(pid);
    const sid = m.slot_id ?? m.slotId;
    if (sid) slotsWithMatches.add(sid);
  }

  // 4. Derive benched set — locked definition:
  //    responded + available at a slot where a match was created + not placed.
  //    A responder available ONLY at slots with NO match is NOT benched.
  const benchedSet = new Set<string>();
  for (const r of responses) {
    if (scheduledSet.has(r.user_id)) continue;
    for (const slotId of slotsWithMatches) {
      if (slotPlayers.get(slotId)?.has(r.user_id)) {
        benchedSet.add(r.user_id);
        break;
      }
    }
  }

  // 5. Build per-slot availability for the swap candidate filter.
  // Only include slots that have matches (the admin can only swap within active slots).
  const slotAvailability: Record<string, string[]> = {};

  // For range polls: build rangesByUser for window-aware swap filtering
  let recomputeRangesByUser: Map<string, Record<string, TimeRange[]>> | null = null;
  if (isRange) {
    recomputeRangesByUser = new Map();
    for (const r of responses) {
      if (r.availability_ranges && typeof r.availability_ranges === "object") {
        recomputeRangesByUser.set(r.user_id, r.availability_ranges);
      }
    }
  }

  // Build match-level data: per match, compute window + filter swap candidates
  const matchWindows: Record<string, { window_start: string; window_end: string } | null> = {};

  for (const m of schedule) {
    const sid = m.slot_id ?? m.slotId;
    if (!sid) continue;
    slotsWithMatches.add(sid);

    if (isRange && recomputeRangesByUser) {
      const pids: string[] = m.player_ids ?? m.playerIds ?? [];
      const parts = sid.split("_");
      const matchDate = parts[0];
      const slotStart = timeToMinutes(parts[1]);
      const slotEnd = timeToMinutes(parts[2]);

      // Recompute window for current players
      const window = computeMatchWindow(pids, matchDate, slotStart, slotEnd, recomputeRangesByUser);
      matchWindows[sid] = window;

      // Filter swap candidates: must be available at slot AND produce >= 60min window
      const slotAvail = slotPlayers.get(sid);
      const candidates: string[] = [];
      if (slotAvail) {
        for (const candidateId of slotAvail) {
          // Try replacing each existing player with the candidate — if ANY swap
          // produces a valid window, the candidate is eligible
          let eligible = false;
          for (let i = 0; i < pids.length; i++) {
            if (pids[i] === candidateId) continue;
            const testPids = [...pids];
            testPids[i] = candidateId;
            const testWindow = computeMatchWindow(testPids, matchDate, slotStart, slotEnd, recomputeRangesByUser);
            if (testWindow) { eligible = true; break; }
          }
          if (eligible) candidates.push(candidateId);
        }
      }
      slotAvailability[sid] = candidates;
    }
  }

  if (!isRange) {
    for (const slotId of slotsWithMatches) {
      const avail = slotPlayers.get(slotId);
      if (avail) slotAvailability[slotId] = Array.from(avail);
    }
  }

  // 6. Players excluded by a drop — responded but not scheduled, not benched, available
  // only at slots WITHOUT a match. They get no outcome row (lack-of-numbers, not unfairness).
  const allRespondentIds = new Set(responses.map((r: any) => r.user_id));
  const excludedCount = allRespondentIds.size - scheduledSet.size - benchedSet.size;

  return json({
    success: true,
    players_scheduled: Array.from(scheduledSet),
    players_benched: Array.from(benchedSet),
    slot_availability: slotAvailability,
    excluded_count: excludedCount,
    match_windows: isRange ? matchWindows : undefined,
  });
}

// ── MODE: confirm ────────────────────────────────────────────────────────────

async function handleConfirm(
  supabase: any,
  pollId: string,
  schedule: any[] | undefined,
  benchedIds: string[] | undefined,
): Promise<Response> {

  if (!schedule || !Array.isArray(schedule)) {
    return json({ error: "schedule must be a JSON array" }, 400);
  }

  // ── CONTRACT: p_schedule keys ──────────────────────────────────────
  // The RPC (confirm_poll_schedule) reads each match via:
  //   v_match->>'match_date'    → ::date
  //   v_match->>'match_time'    → ::time     (must be HH:mm:ss)
  //   v_match->>'slot_id'       → text
  //   v_match->'player_ids'     → jsonb_array_elements_text → ::uuid
  //   v_match->'additional_options' → jsonb
  //   v_match->>'status'        → text (default 'scheduled')
  //
  // Validate and normalize each match object before passing to the RPC.
  const normalizedSchedule = schedule.map((m: any, i: number) => {
    if (!m.player_ids || !Array.isArray(m.player_ids) || m.player_ids.length < 2) {
      throw new Error(`schedule[${i}].player_ids must be an array of 2+ uuids`);
    }
    if (!m.match_date || !/^\d{4}-\d{2}-\d{2}$/.test(m.match_date)) {
      throw new Error(`schedule[${i}].match_date must be yyyy-MM-dd`);
    }
    // match_time: accept "HH:mm" or "HH:mm:ss", normalize to HH:mm:ss
    let matchTime = m.match_time ?? "";
    if (/^\d{2}:\d{2}$/.test(matchTime)) matchTime += ":00";
    if (!/^\d{2}:\d{2}:\d{2}$/.test(matchTime)) {
      throw new Error(`schedule[${i}].match_time must be HH:mm or HH:mm:ss`);
    }

    const normalized: any = {
      player_ids: m.player_ids,
      match_date: m.match_date,
      match_time: matchTime,
      slot_id: m.slot_id ?? null,
      additional_options: m.additional_options ?? {},
      status: m.status ?? "scheduled",
    };
    // Pass through team columns if present (from ELO-balanced split)
    if (Array.isArray(m.team1_player_ids)) normalized.team1_player_ids = m.team1_player_ids;
    if (Array.isArray(m.team2_player_ids)) normalized.team2_player_ids = m.team2_player_ids;
    // Pass through window columns for range-poll matches
    if (m.window_start) normalized.window_start = m.window_start;
    if (m.window_end) normalized.window_end = m.window_end;
    return normalized;
  });

  // ── Call the atomic RPC ────────────────────────────────────────────
  const { data, error } = await supabase.rpc("confirm_poll_schedule", {
    p_poll_id: pollId,
    p_schedule: normalizedSchedule,
    p_benched_ids: benchedIds ?? [],
  });

  if (error) {
    return json({ error: error.message }, 400);
  }

  return json({ success: true, ...data });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function json(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
