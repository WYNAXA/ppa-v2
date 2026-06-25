import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import {
  calculateExpected,
  calculateKFactor,
  applyMultipliers,
  classifyMatch,
  classifySet,
  processTeamElo,
} from '../_shared/elo.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

// ── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  let match_result_id: string | undefined
  let payload: any
  try {
    payload = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: corsHeaders,
    })
  }

  // Supabase Database Webhook payload: { type, record, old_record }
  if (payload?.type && payload?.record) {
    const eventType = payload.type as string
    const isVerified = payload.record?.verification_status === 'verified'

    if (eventType === 'INSERT') {
      // INSERT with verified status → process immediately (admin Quick Result)
      if (!isVerified) {
        return new Response(
          JSON.stringify({ message: 'INSERT not verified, skipping', skipped: true }),
          { headers: corsHeaders }
        )
      }
    } else if (eventType === 'UPDATE') {
      // UPDATE must be a transition TO verified (not already verified before)
      if (!isVerified) {
        return new Response(
          JSON.stringify({ message: 'Not transitioning to verified', skipped: true }),
          { headers: corsHeaders }
        )
      }
      if (payload.old_record?.verification_status === 'verified') {
        return new Response(
          JSON.stringify({ message: 'Already verified, skipping', skipped: true }),
          { headers: corsHeaders }
        )
      }
    } else {
      return new Response(
        JSON.stringify({ message: `Skipping ${eventType} event`, skipped: true }),
        { headers: corsHeaders }
      )
    }

    match_result_id = payload.record?.id
  } else {
    // Legacy direct-invoke: { match_result_id }
    match_result_id = payload?.match_result_id
  }

  if (!match_result_id) {
    return new Response(JSON.stringify({ error: 'match_result_id required' }), {
      status: 400,
      headers: corsHeaders,
    })
  }

  // Fetch match result
  const { data: result, error: resultError } = await supabase
    .from('match_results')
    .select('*')
    .eq('id', match_result_id)
    .single()

  if (resultError || !result) {
    return new Response(JSON.stringify({ error: 'Match result not found' }), {
      status: 404,
      headers: corsHeaders,
    })
  }

  // Idempotency check
  if (result.elo_processed) {
    return new Response(
      JSON.stringify({ message: 'Already processed', skipped: true }),
      { headers: corsHeaders }
    )
  }

  // Fetch the parent match to get league_id
  const { data: matchRow } = await supabase
    .from('matches')
    .select('league_id')
    .eq('id', result.match_id)
    .single()

  const leagueId: string | null = matchRow?.league_id ?? null

  // Only process verified results
  if (result.verification_status !== 'verified') {
    return new Response(
      JSON.stringify({ error: 'Result not yet verified' }),
      { status: 400, headers: corsHeaders }
    )
  }

  // Skip friendly/casual matches
  if (result.is_friendly) {
    await supabase
      .from('match_results')
      .update({ elo_processed: true })
      .eq('id', match_result_id)

    return new Response(
      JSON.stringify({ message: 'Friendly match — ELO not updated', skipped: true }),
      { headers: corsHeaders }
    )
  }

  const team1 = result.team1_players as string[]
  const team2 = result.team2_players as string[]
  const allPlayerIds = [...team1, ...team2]

  // Fetch all player ratings and match counts
  const { data: players } = await supabase
    .from('profiles')
    .select('id, internal_ranking, matches_played, peak_elo')
    .in('id', allPlayerIds)

  // Skip matches containing ghost players (IDs not in profiles)
  const foundIds = new Set((players ?? []).map((p: any) => p.id as string))
  const hasGhost = allPlayerIds.some(id => !foundIds.has(id))
  if (hasGhost) {
    await supabase
      .from('match_results')
      .update({ elo_processed: true })
      .eq('id', match_result_id)

    console.warn(`[process-elo] ghost player detected, skipping match_result ${match_result_id}`)
    return new Response(
      JSON.stringify({ message: 'Ghost player in match, skipped', skipped: true }),
      { headers: corsHeaders }
    )
  }

  const playerRatings: Record<string, number> = {}
  const matchesPlayed: Record<string, number> = {}
  const playerPeaks: Record<string, number> = {}

  players?.forEach((p: any) => {
    playerRatings[p.id] = p.internal_ranking || 1230
    matchesPlayed[p.id] = p.matches_played || 0
    playerPeaks[p.id] = p.peak_elo || 0
  })

  const team1Won = result.result_type === 'team1_win'
  const isDraw = result.result_type === 'draw'
  const sets = (result.sets_data as any[]) || []

  // ── Classify match (delegates to classifySet for single-set) ──
  const classification = classifyMatch(result.result_type, sets)

  if (classification === null) {
    // Void single-set match — mark processed and skip
    await supabase
      .from('match_results')
      .update({ elo_processed: true })
      .eq('id', match_result_id)

    console.warn(`[process-elo] void set, skipping match_result ${match_result_id}`)
    return new Response(
      JSON.stringify({ message: 'Void set (<6 games), skipped', skipped: true }),
      { headers: corsHeaders }
    )
  }

  const { team1Score, team2Score, recordAsDraw, dominant } = classification

  const team1Results = processTeamElo({
    playerIds: team1,
    opponentIds: team2,
    playerRatings,
    matchesPlayed,
    actualScore: team1Score,
    isDominant: dominant,
  })

  const team2Results = processTeamElo({
    playerIds: team2,
    opponentIds: team1,
    playerRatings,
    matchesPlayed,
    actualScore: team2Score,
    isDominant: dominant,
  })

  const allResults = { ...team1Results, ...team2Results }

  // Build the updates array for the atomic RPC
  const updates = Object.entries(allResults).map(([playerId, data]) => {
    const opponentIds = team1.includes(playerId) ? team2 : team1
    const opponentAvg = Math.round(
      opponentIds.reduce((s, id) => s + (playerRatings[id] || 1230), 0) / opponentIds.length
    )
    const onTeam1 = team1.includes(playerId)
    const isWinner = onTeam1 ? team1Won : !team1Won && !isDraw

    return {
      player_id: playerId,
      rating_before: data.ratingBefore,
      rating_after: data.ratingAfter,
      rating_change: data.ratingChange,
      expected_score: data.expectedScore,
      actual_score: onTeam1 ? team1Score : team2Score,
      k_factor: data.kFactor,
      opponent_ids: opponentIds,
      opponent_avg_rating: opponentAvg,
      is_provisional: (matchesPlayed[playerId] || 0) < 10,
      is_winner: isWinner,
    }
  })

  // Apply all writes atomically via a single DB transaction (RPC)
  // Locks player rows with FOR UPDATE (sorted by id → no deadlock),
  // applies rating DELTAS (not absolute overwrites → no concurrent race),
  // inserts rating_history + ranking_changes, sets elo_processed = true,
  // all in one transaction. Crash → full rollback; retry → idempotent.
  const { data: rpcResult, error: rpcError } = await supabase.rpc('apply_match_elo', {
    p_match_result_id: match_result_id,
    p_match_id: result.match_id,
    p_updates: updates,
  })

  if (rpcError) {
    console.error(`[process-elo] apply_match_elo RPC failed:`, rpcError)
    return new Response(
      JSON.stringify({ error: 'ELO application failed', detail: rpcError.message }),
      { status: 500, headers: corsHeaders }
    )
  }

  if (rpcResult?.skipped) {
    return new Response(
      JSON.stringify({ message: 'Already processed', skipped: true }),
      { headers: corsHeaders }
    )
  }

  // Update league_standings if this match belongs to a league
  if (leagueId) {
    const { data: leagueMeta } = await supabase
      .from('leagues')
      .select('match_type, format')
      .eq('id', leagueId)
      .single()
    const usesSeasonElo = leagueMeta?.match_type === 'individual' && leagueMeta?.format === 'round_robin'

    if (usesSeasonElo) {
      // ── Per-set season ELO + standings for set-as-match leagues ──
      // Compute in-memory, then apply atomically via RPC.
      const { data: standRows } = await supabase
        .from('league_standings')
        .select('user_id, season_elo, matches_played')
        .eq('league_id', leagueId)
        .in('user_id', allPlayerIds)

      const runningElo: Record<string, number> = {}
      const runningPlayed: Record<string, number> = {}
      const memberIds: string[] = []
      for (const row of standRows ?? []) {
        runningElo[row.user_id] = row.season_elo ?? 1230
        runningPlayed[row.user_id] = row.matches_played ?? 0
        memberIds.push(row.user_id)
      }

      const setsData = (result.sets_data as any[]) || []
      const setsPayload: any[] = []

      for (const set of setsData) {
        const g1 = (set.team1_score ?? set.team1 ?? 0) as number
        const g2 = (set.team2_score ?? set.team2 ?? 0) as number

        // Classify set via canonical shared rule (void → null → skip)
        const setClass = classifySet(g1, g2)
        if (setClass === null) continue

        const { team1Score: setT1, team2Score: setT2, isDraw: setDraw, isDominant: setDominant } = setClass

        // Compute season ELO changes in-memory (no DB writes)
        const seasonEloUpdates: { user_id: string; new_season_elo: number }[] = []
        for (const uid of memberIds) {
          const oppIds = team1.includes(uid) ? team2 : team1
          const oppAvgSeason = oppIds.reduce((sum: number, oid: string) => sum + (runningElo[oid] ?? 1230), 0) / oppIds.length
          const expected = calculateExpected(runningElo[uid], oppAvgSeason)
          const actual = team1.includes(uid) ? setT1 : setT2
          const seasonK = calculateKFactor(runningPlayed[uid])
          const rawChange = seasonK * (actual - expected)
          const change = applyMultipliers(rawChange, expected, setDominant, actual === 1)
          runningElo[uid] = Math.max(0, Math.min(3000, runningElo[uid] + change))
          runningPlayed[uid] += 1
          seasonEloUpdates.push({ user_id: uid, new_season_elo: runningElo[uid] })
        }

        // Determine winners/losers for standings
        const isCompleted = setT1 === 1 || setT1 === 0
        const winners = setDraw ? [...team1, ...team2]
          : isCompleted ? (setT1 === 1 ? team1 : team2) : (g1 > g2 ? team1 : team2)
        const losers = setDraw ? []
          : isCompleted ? (setT1 === 1 ? team2 : team1) : (g1 > g2 ? team2 : team1)

        setsPayload.push({
          winners,
          losers,
          is_draw: setDraw,
          season_elo_updates: seasonEloUpdates,
        })
      }

      // Apply all sets atomically via a single DB transaction
      if (setsPayload.length > 0) {
        const { data: leagueResult, error: leagueErr } = await supabase.rpc('apply_league_match_standings', {
          p_match_result_id: match_result_id,
          p_league_id: leagueId,
          p_sets: setsPayload,
        })

        if (leagueErr) {
          console.error(`[process-elo] apply_league_match_standings failed:`, leagueErr)
          return new Response(
            JSON.stringify({
              success: false,
              career_elo_applied: true,
              league_standings_failed: true,
              error: leagueErr.message,
            }),
            { status: 500, headers: corsHeaders }
          )
        }

        if (leagueResult?.skipped) {
          console.warn(`[process-elo] league standings already processed for ${match_result_id}`)
        } else {
          console.warn(`[process-elo] league standings applied: ${setsPayload.length} sets for league ${leagueId}`)
        }
      }
    } else {
      // ── Non-ELO league: single match-level standings update ──
      // Route through the same atomic RPC (one "set" = the whole match)
      const winners = recordAsDraw ? [...team1, ...team2]
        : team1Score > team2Score ? team1 : team2
      const losers = recordAsDraw ? []
        : team1Score > team2Score ? team2 : team1

      const { error: leagueErr } = await supabase.rpc('apply_league_match_standings', {
        p_match_result_id: match_result_id,
        p_league_id: leagueId,
        p_sets: [{
          winners,
          losers,
          is_draw: recordAsDraw,
          season_elo_updates: [], // no season ELO for non-ELO leagues
        }],
      })

      if (leagueErr) {
        console.error(`[process-elo] apply_league_match_standings (non-ELO) failed:`, leagueErr)
        return new Response(
          JSON.stringify({
            success: false,
            career_elo_applied: true,
            league_standings_failed: true,
            error: leagueErr.message,
          }),
          { status: 500, headers: corsHeaders }
        )
      }
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      processed: Object.keys(allResults).length,
      changes: allResults,
    }),
    { headers: corsHeaders }
  )
})
