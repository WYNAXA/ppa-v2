/**
 * ELO preview calculations — mirrors supabase/functions/process-elo/index.ts exactly.
 * Source of truth: process-elo Edge Function (K-factor, expected score, multipliers).
 * This file ONLY computes previews; it never writes to the database.
 */

// ── Core math (identical to process-elo/index.ts) ────────────────────────────

function calculateExpected(playerRating: number, opponentRating: number): number {
  return 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400))
}

export const K_FACTOR_TIERS = [
  { maxMatches: 20 as number | null,   k: 40, nameKey: 'ranking.tier_newcomer' },
  { maxMatches: 50 as number | null,   k: 20, nameKey: 'ranking.tier_learning' },
  { maxMatches: 200 as number | null,  k: 10, nameKey: 'ranking.tier_regular' },
  { maxMatches: null as number | null,  k: 5, nameKey: 'ranking.tier_established' },
]

export function experienceTier(matchesPlayed: number) {
  for (const tier of K_FACTOR_TIERS) {
    if (tier.maxMatches !== null && matchesPlayed <= tier.maxMatches) return tier
  }
  return K_FACTOR_TIERS[K_FACTOR_TIERS.length - 1]
}

function calculateKFactor(matchesPlayed: number): number {
  return experienceTier(matchesPlayed).k
}

function computeDelta(
  playerRating: number,
  opponentAvgRating: number,
  matchesPlayed: number,
  actualScore: number, // 1 = win, 0.5 = draw, 0 = loss
): number {
  const expected = calculateExpected(playerRating, opponentAvgRating)
  const kFactor = calculateKFactor(matchesPlayed)
  const rawChange = kFactor * (actualScore - expected)

  // Upset multiplier (wins only)
  let multiplier = 1.0
  if (actualScore === 1) {
    if (expected < 0.15) multiplier = 1.5
    else if (expected < 0.3) multiplier = 1.25
  }

  return Math.round(rawChange * multiplier)
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface PlayerForPreview {
  id: string
  internal_ranking: number | null | undefined
  matches_played?: number | null
}

export interface OutcomePreview {
  /** Per-player career rating delta (same order as input array) */
  team1Deltas: number[]
  team2Deltas: number[]
  /** League points for this outcome (null = not a league match) */
  team1LeaguePts: number | null
  team2LeaguePts: number | null
}

export interface PointsAtStake {
  team1Wins: OutcomePreview
  draw: OutcomePreview
  team2Wins: OutcomePreview
  /** Whether league points apply to this match */
  isLeagueMatch: boolean
}

/**
 * Preview rating deltas for all three outcomes (team1 wins, draw, team2 wins).
 * Returns null if any player lacks a rating.
 * @param isLeagueMatch - true if the match has a league_id and is competitive
 */
export function previewMatchOutcomes(
  team1: PlayerForPreview[],
  team2: PlayerForPreview[],
  isLeagueMatch = false,
): PointsAtStake | null {
  // All players must have rankings for preview to work
  if (team1.some(p => p.internal_ranking == null) || team2.some(p => p.internal_ranking == null)) {
    return null
  }

  const t1Ratings = team1.map(p => p.internal_ranking!)
  const t2Ratings = team2.map(p => p.internal_ranking!)
  const t1AvgRating = t1Ratings.reduce((s, v) => s + v, 0) / t1Ratings.length
  const t2AvgRating = t2Ratings.reduce((s, v) => s + v, 0) / t2Ratings.length

  function computeTeamDeltas(
    players: PlayerForPreview[],
    opponentAvg: number,
    actualScore: number,
  ): number[] {
    return players.map(p => computeDelta(
      p.internal_ranking!,
      opponentAvg,
      p.matches_played ?? 30, // default assumption: established player
      actualScore,
    ))
  }

  const lp = (win: number, loss: number) => isLeagueMatch ? { team1LeaguePts: win, team2LeaguePts: loss } : { team1LeaguePts: null, team2LeaguePts: null }

  return {
    team1Wins: {
      team1Deltas: computeTeamDeltas(team1, t2AvgRating, 1),
      team2Deltas: computeTeamDeltas(team2, t1AvgRating, 0),
      ...lp(3, 0),
    },
    draw: {
      team1Deltas: computeTeamDeltas(team1, t2AvgRating, 0.5),
      team2Deltas: computeTeamDeltas(team2, t1AvgRating, 0.5),
      ...lp(1, 1),
    },
    team2Wins: {
      team1Deltas: computeTeamDeltas(team1, t2AvgRating, 0),
      team2Deltas: computeTeamDeltas(team2, t1AvgRating, 1),
      ...lp(0, 3),
    },
    isLeagueMatch,
  }
}
