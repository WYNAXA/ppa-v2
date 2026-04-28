import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

function calculateExpected(playerRating: number, opponentRating: number): number {
  return 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400))
}

function calculateKFactor(matchesPlayed: number): number {
  if (matchesPlayed <= 20) return 40
  if (matchesPlayed <= 50) return 20
  if (matchesPlayed <= 200) return 10
  return 5
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  let player_ids: string[]
  try {
    const body = await req.json()
    player_ids = body.player_ids
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: corsHeaders,
    })
  }

  if (!player_ids || player_ids.length !== 4) {
    return new Response(JSON.stringify({ error: 'Exactly 4 player_ids required' }), {
      status: 400,
      headers: corsHeaders,
    })
  }

  const { data: players, error } = await supabase
    .from('profiles')
    .select('id, name, avatar_url, internal_ranking, matches_played, is_provisional')
    .in('id', player_ids)

  if (error || !players) {
    return new Response(JSON.stringify({ error: 'Failed to fetch players' }), {
      status: 500,
      headers: corsHeaders,
    })
  }

  const playerMap: Record<string, any> = {}
  players.forEach((p: any) => { playerMap[p.id] = p })

  const team1Ids = player_ids.slice(0, 2)
  const team2Ids = player_ids.slice(2, 4)

  const getElo = (id: string) => playerMap[id]?.internal_ranking || 1500
  const getPlayed = (id: string) => playerMap[id]?.matches_played || 0

  const team1AvgElo = (getElo(team1Ids[0]) + getElo(team1Ids[1])) / 2
  const team2AvgElo = (getElo(team2Ids[0]) + getElo(team2Ids[1])) / 2

  const team1WinProb = calculateExpected(team1AvgElo, team2AvgElo)
  const team2WinProb = 1 - team1WinProb

  // Calculate projected ELO ranges for each player
  function projectedRange(playerId: string, teamAvgElo: number, opponentAvgElo: number) {
    const k = calculateKFactor(getPlayed(playerId))
    const expected = calculateExpected(teamAvgElo, opponentAvgElo)
    // Win scenario
    const gainRaw = k * (1 - expected)
    // Loss scenario
    const lossRaw = k * (0 - expected)
    return {
      gainMin: Math.round(k * 0.05),
      gainMax: Math.round(k * 0.95),
      gainExpected: Math.round(gainRaw),
      lossMin: Math.round(k * -0.95),
      lossMax: Math.round(k * -0.05),
      lossExpected: Math.round(lossRaw),
    }
  }

  const team1Players = team1Ids.map((id) => ({
    id,
    name: playerMap[id]?.name || 'Unknown',
    avatar_url: playerMap[id]?.avatar_url || null,
    elo: getElo(id),
    matches_played: getPlayed(id),
    is_provisional: playerMap[id]?.is_provisional ?? true,
    projected: projectedRange(id, team1AvgElo, team2AvgElo),
  }))

  const team2Players = team2Ids.map((id) => ({
    id,
    name: playerMap[id]?.name || 'Unknown',
    avatar_url: playerMap[id]?.avatar_url || null,
    elo: getElo(id),
    matches_played: getPlayed(id),
    is_provisional: playerMap[id]?.is_provisional ?? true,
    projected: projectedRange(id, team2AvgElo, team1AvgElo),
  }))

  return new Response(
    JSON.stringify({
      team1: {
        players: team1Players,
        avgElo: Math.round(team1AvgElo),
        winProbability: team1WinProb,
        winProbabilityPct: Math.round(team1WinProb * 100),
        projectedGainRange: `+${team1Players[0].projected.gainMin} to +${team1Players[0].projected.gainMax}`,
        projectedLossRange: `${team1Players[0].projected.lossMin} to ${team1Players[0].projected.lossMax}`,
      },
      team2: {
        players: team2Players,
        avgElo: Math.round(team2AvgElo),
        winProbability: team2WinProb,
        winProbabilityPct: Math.round(team2WinProb * 100),
        projectedGainRange: `+${team2Players[0].projected.gainMin} to +${team2Players[0].projected.gainMax}`,
        projectedLossRange: `${team2Players[0].projected.lossMin} to ${team2Players[0].projected.lossMax}`,
      },
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
