import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import {
  calculateExpected,
  calculateKFactor,
  applyMultipliers,
  isDominantWin,
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
  const isSingleSet = sets.length === 1

  // ── Single-set classifier ──
  let team1Score: number
  let team2Score: number
  let recordAsDraw: boolean
  let dominant: boolean

  if (isSingleSet) {
    const g1 = (sets[0]?.team1_score ?? sets[0]?.team1 ?? 0) as number
    const g2 = (sets[0]?.team2_score ?? sets[0]?.team2 ?? 0) as number
    const total = g1 + g2
    const maxG = Math.max(g1, g2)
    const minG = Math.min(g1, g2)
    const completed = (maxG >= 6 && Math.abs(g1 - g2) >= 2) || (maxG === 7 && minG === 6)
    const isVoid = !completed && total < 6

    // Void: fewer than 6 games total and set not completed — skip entirely
    if (isVoid) {
      await supabase
        .from('match_results')
        .update({ elo_processed: true })
        .eq('id', match_result_id)

      console.warn(`[process-elo] void set (${g1}-${g2}, <6 games), skipping match_result ${match_result_id}`)
      return new Response(
        JSON.stringify({ message: 'Void set (<6 games), skipped', skipped: true }),
        { headers: corsHeaders }
      )
    }

    if (completed) {
      const t1Won = g1 > g2
      team1Score = t1Won ? 1 : 0
      team2Score = t1Won ? 0 : 1
      recordAsDraw = false
      dominant = isDominantWin(sets)
    } else {
      // unfinishedCounted: proportional ELO, recorded as draw for standings
      team1Score = g1 / total
      team2Score = g2 / total
      recordAsDraw = true
      dominant = false
    }
  } else {
    // Multi-set / fallback — unchanged behaviour
    team1Score = isDraw ? 0.5 : team1Won ? 1 : 0
    team2Score = isDraw ? 0.5 : team1Won ? 0 : 1
    recordAsDraw = isDraw
    dominant = isDominantWin(sets)
  }

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

  // Update profiles and insert rating history
  for (const [playerId, data] of Object.entries(allResults)) {
    const newMatchesPlayed = (matchesPlayed[playerId] || 0) + 1

    const currentPeak = playerPeaks[playerId] ?? 0
    const isPeakUpdate = data.ratingAfter > currentPeak

    await supabase
      .from('profiles')
      .update({
        internal_ranking: data.ratingAfter,
        matches_played: newMatchesPlayed,
        is_provisional: newMatchesPlayed < 10,
        ...(isPeakUpdate ? {
          peak_elo: data.ratingAfter,
          peak_elo_date: new Date().toISOString().split('T')[0],
        } : {}),
      })
      .eq('id', playerId)

    const opponentIds = team1.includes(playerId) ? team2 : team1
    const opponentAvg = Math.round(
      opponentIds.reduce((s, id) => s + (playerRatings[id] || 1230), 0) / opponentIds.length
    )

    await supabase.from('rating_history').upsert(
      {
        user_id: playerId,
        match_result_id,
        rating_before: data.ratingBefore,
        rating_after: data.ratingAfter,
        rating_change: data.ratingChange,
        expected_score: data.expectedScore,
        actual_score: team1.includes(playerId) ? team1Score : team2Score,
        k_factor: data.kFactor,
        opponent_ids: opponentIds,
        opponent_avg_rating: opponentAvg,
        is_provisional: (matchesPlayed[playerId] || 0) < 10,
      },
      { onConflict: 'user_id,match_result_id', ignoreDuplicates: true }
    )

    // Write ranking_changes row (drives Home 7-day and Compete 30-day ELO trend)
    const onTeam1 = team1.includes(playerId)
    const isWinner = onTeam1 ? team1Won : !team1Won && !isDraw
    try {
      await supabase.from('ranking_changes').upsert(
        {
          player_id: playerId,
          match_id: result.match_id,
          match_result_id,
          previous_points: data.ratingBefore,
          new_points: data.ratingAfter,
          points_change: data.ratingChange,
          opponent_ids: opponentIds,
          opponent_avg_rating: opponentAvg,
          is_winner: isWinner,
        },
        { onConflict: 'player_id,match_result_id', ignoreDuplicates: true }
      )
    } catch (err) {
      console.error(`[process-elo] ranking_changes insert failed for ${playerId}:`, err)
    }
  }

  // Mark as processed (set verified_at if missing — admin Quick Result leaves it null)
  await supabase
    .from('match_results')
    .update({
      elo_processed: true,
      ...(!result.verified_at ? { verified_at: new Date().toISOString() } : {}),
    })
    .eq('id', match_result_id)

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
      try {
        const { data: standRows } = await supabase
          .from('league_standings')
          .select('user_id, season_elo, matches_played')
          .eq('league_id', leagueId)
          .in('user_id', allPlayerIds)

        // Build running maps from current standings
        const runningElo: Record<string, number> = {}
        const runningPlayed: Record<string, number> = {}
        const memberIds: string[] = []
        for (const row of standRows ?? []) {
          runningElo[row.user_id] = row.season_elo ?? 1230
          runningPlayed[row.user_id] = row.matches_played ?? 0
          memberIds.push(row.user_id)
        }

        const setsData = (result.sets_data as any[]) || []
        let setsProcessed = 0

        for (const set of setsData) {
          const g1 = (set.team1_score ?? set.team1 ?? 0) as number
          const g2 = (set.team2_score ?? set.team2 ?? 0) as number
          const total = g1 + g2
          const maxG = Math.max(g1, g2)
          const minG = Math.min(g1, g2)
          const completed = (maxG >= 6 && Math.abs(g1 - g2) >= 2) || (maxG === 7 && minG === 6)
          const isVoid = !completed && total < 6

          if (isVoid) continue // skip void sets entirely

          let setT1: number, setT2: number, setDraw: boolean, setDominant: boolean
          if (completed) {
            setT1 = g1 > g2 ? 1 : 0
            setT2 = 1 - setT1
            setDraw = false
            setDominant = Math.abs(g1 - g2) >= 5
          } else {
            // Unfinished but ≥6 games: proportional ELO, W/L by game count
            setT1 = g1 / total
            setT2 = g2 / total
            setDraw = g1 === g2
            setDominant = false
          }

          // Season ELO update for each member (expected from running season ELO, not career)
          for (const uid of memberIds) {
            const oppIds = team1.includes(uid) ? team2 : team1
            const oppAvgSeason = oppIds.reduce((sum: number, oid: string) => sum + (runningElo[oid] ?? 1230), 0) / oppIds.length
            const expected = calculateExpected(runningElo[uid], oppAvgSeason)
            const actual    = team1.includes(uid) ? setT1 : setT2
            const seasonK   = calculateKFactor(runningPlayed[uid])
            const rawChange = seasonK * (actual - expected)
            const change    = applyMultipliers(rawChange, expected, setDominant, actual === 1)
            runningElo[uid] = Math.max(0, Math.min(3000, runningElo[uid] + change))
            runningPlayed[uid] += 1

            await supabase
              .from('league_standings')
              .update({ season_elo: runningElo[uid] })
              .eq('league_id', leagueId)
              .eq('user_id', uid)
          }

          // Standings RPC for this set
          if (setDraw) {
            await supabase.rpc('update_league_standings_draw', {
              p_league_id: leagueId,
              p_player_ids: [...team1, ...team2],
            })
          } else {
            const winners = completed ? (setT1 === 1 ? team1 : team2) : (g1 > g2 ? team1 : team2)
            const losers  = completed ? (setT1 === 1 ? team2 : team1) : (g1 > g2 ? team2 : team1)
            await supabase.rpc('update_league_standings_win', {
              p_league_id: leagueId,
              p_winner_ids: winners,
              p_loser_ids: losers,
            })
          }

          setsProcessed++
        }

        console.warn(`[process-elo] per-set season ELO: ${setsProcessed}/${setsData.length} sets processed for ${memberIds.length} members in league ${leagueId}`)
      } catch (err) {
        console.warn('[process-elo] per-set season ELO failed, continuing:', err)
      }
    } else {
      // ── Non-ELO league: single match-level standings update ──
      if (recordAsDraw) {
        await supabase.rpc('update_league_standings_draw', {
          p_league_id: leagueId,
          p_player_ids: [...team1, ...team2],
        })
      } else {
        const winners = team1Score > team2Score ? team1 : team2
        const losers = team1Score > team2Score ? team2 : team1
        await supabase.rpc('update_league_standings_win', {
          p_league_id: leagueId,
          p_winner_ids: winners,
          p_loser_ids: losers,
        })
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
