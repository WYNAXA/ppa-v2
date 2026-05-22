import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

// ── Core ELO functions ──────────────────────────────────────────────────────

function calculateExpected(
  playerRating: number,
  opponentRating: number,
  homeAdvantage: number = 0
): number {
  return 1 / (1 + Math.pow(10, (opponentRating - playerRating + homeAdvantage) / 400))
}

function calculateKFactor(matchesPlayed: number): number {
  if (matchesPlayed <= 20) return 40
  if (matchesPlayed <= 50) return 20
  if (matchesPlayed <= 200) return 10
  return 5
}

function applyMultipliers(
  ratingChange: number,
  expected: number,
  isDominant: boolean,
  isWin: boolean
): number {
  let multiplier = 1.0

  // Upset multipliers (only for wins)
  if (isWin) {
    if (expected < 0.15) multiplier *= 1.5
    else if (expected < 0.3) multiplier *= 1.25
  }

  // Dominant win multiplier
  if (isDominant && isWin) multiplier *= 1.1

  return Math.round(ratingChange * multiplier)
}

function isDominantWin(setsData: any[]): boolean {
  if (!setsData || setsData.length === 0) return false
  return setsData.every((set: any) => {
    const diff = Math.abs((set.team1_score || set.team1 || 0) - (set.team2_score || set.team2 || 0))
    return diff >= 5
  })
}

function processTeamElo(params: {
  playerIds: string[]
  opponentIds: string[]
  playerRatings: Record<string, number>
  matchesPlayed: Record<string, number>
  actualScore: number // 1 = win, 0 = loss, 0.5 = draw
  isDominant: boolean
}): Record<string, {
  ratingBefore: number
  ratingAfter: number
  ratingChange: number
  expectedScore: number
  kFactor: number
}> {
  const results: Record<string, any> = {}

  const opponentAvgRating =
    params.opponentIds.reduce((sum, id) => sum + (params.playerRatings[id] || 1230), 0) /
    params.opponentIds.length

  for (const playerId of params.playerIds) {
    const playerRating = params.playerRatings[playerId] || 1230
    const played = params.matchesPlayed[playerId] || 0

    const expected = calculateExpected(playerRating, opponentAvgRating)
    const kFactor = calculateKFactor(played)
    const isWin = params.actualScore === 1

    const rawChange = kFactor * (params.actualScore - expected)
    const finalChange = applyMultipliers(rawChange, expected, params.isDominant, isWin)

    const newRating = Math.max(0, Math.min(3000, playerRating + finalChange))

    results[playerId] = {
      ratingBefore: playerRating,
      ratingAfter: newRating,
      ratingChange: newRating - playerRating,
      expectedScore: expected,
      kFactor,
    }
  }

  return results
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

  console.log('[process-elo] INVOKED', {
    type: payload?.type,
    match_result_id: payload?.record?.id ?? payload?.match_result_id ?? 'unknown',
    record_verification_status: payload?.record?.verification_status,
    old_record_verification_status: payload?.old_record?.verification_status,
    record_elo_processed: payload?.record?.elo_processed,
    old_record_elo_processed: payload?.old_record?.elo_processed,
  })

  // Supabase Database Webhook payload: { type, record, old_record }
  if (payload?.type && payload?.record) {
    const eventType = payload.type as string
    const isVerified = payload.record?.verification_status === 'verified'

    if (eventType === 'INSERT') {
      // INSERT with verified status → process immediately (admin Quick Result)
      if (!isVerified) {
        console.log('[process-elo] EARLY RETURN', { reason: 'INSERT not verified' })
        return new Response(
          JSON.stringify({ message: 'INSERT not verified, skipping', skipped: true }),
          { headers: corsHeaders }
        )
      }
    } else if (eventType === 'UPDATE') {
      // UPDATE must be a transition TO verified (not already verified before)
      if (!isVerified) {
        console.log('[process-elo] EARLY RETURN', { reason: 'UPDATE not verified' })
        return new Response(
          JSON.stringify({ message: 'Not transitioning to verified', skipped: true }),
          { headers: corsHeaders }
        )
      }
      if (payload.old_record?.verification_status === 'verified') {
        console.log('[process-elo] EARLY RETURN', { reason: 'Already verified (old_record)' })
        return new Response(
          JSON.stringify({ message: 'Already verified, skipping', skipped: true }),
          { headers: corsHeaders }
        )
      }
    } else {
      console.log('[process-elo] EARLY RETURN', { reason: `Skipping ${eventType} event` })
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
    console.log('[process-elo] EARLY RETURN', { reason: 'Already elo_processed', match_result_id })
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
  const dominant = isDominantWin(result.sets_data as any[] || [])

  const team1Score = isDraw ? 0.5 : team1Won ? 1 : 0
  const team2Score = isDraw ? 0.5 : team1Won ? 0 : 1

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
    if (isDraw) {
      console.log('[process-elo] CALLING update_league_standings_draw', { league_id: leagueId, match_result_id })
      await supabase.rpc('update_league_standings_draw', {
        p_league_id: leagueId,
        p_player_ids: [...team1, ...team2],
      })
    } else {
      const winners = team1Won ? team1 : team2
      const losers = team1Won ? team2 : team1
      console.log('[process-elo] CALLING update_league_standings_win', { league_id: leagueId, match_result_id })
      await supabase.rpc('update_league_standings_win', {
        p_league_id: leagueId,
        p_winner_ids: winners,
        p_loser_ids: losers,
      })
    }
  }

  console.log('[process-elo] COMPLETED', { match_result_id })
  return new Response(
    JSON.stringify({
      success: true,
      processed: Object.keys(allResults).length,
      changes: allResults,
    }),
    { headers: corsHeaders }
  )
})
