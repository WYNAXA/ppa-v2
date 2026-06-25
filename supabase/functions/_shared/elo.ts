// ── Shared ELO calculation module ────────────────────────────────────────────
// Single source of truth for the ELO formula. Used by:
//   - process-elo (live incremental processing)
//   - rebuild-ratings (full deterministic rebuild)
// ────────────────────────────────────────────────────────────────────────────

export function calculateExpected(
  playerRating: number,
  opponentRating: number,
  homeAdvantage: number = 0
): number {
  return 1 / (1 + Math.pow(10, (opponentRating - playerRating + homeAdvantage) / 400))
}

export function calculateKFactor(matchesPlayed: number): number {
  if (matchesPlayed <= 20) return 40
  if (matchesPlayed <= 50) return 20
  if (matchesPlayed <= 200) return 10
  return 5
}

export function applyMultipliers(
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

// ── Set classification — SINGLE SOURCE OF TRUTH ──────────────────────────────
// Canonical void / completed / unfinished rule for ONE set.
// Thresholds:
//   completed = (max >= 6 AND |g1-g2| >= 2) OR (max == 7 AND min == 6)
//   void      = NOT completed AND (g1 + g2) < 6    → return null (skip)
//   completed → team1Score = g1>g2 ? 1 : 0, isDraw = false, isDominant = |g1-g2| >= 5
//   unfinished (not void) → proportional scores, isDraw = (g1 === g2), isDominant = false
//
// MIRRORS that must stay in sync manually (can't import this module):
//   - src/pages/LeagueDetail.tsx streak computation (~line 190) — frontend, Vite can't import Deno
//   - src/pages/LeagueDetail.tsx isCompletedSet (~line 1248) — completion check only
//   - supabase/migrations/20260624000003_rebuild_league_standings.sql — SQL, can't import TS
// ─────────────────────────────────────────────────────────────────────────────
export function classifySet(
  g1: number,
  g2: number,
): { team1Score: number; team2Score: number; isDraw: boolean; isDominant: boolean } | null {
  const total = g1 + g2
  const maxG = Math.max(g1, g2)
  const minG = Math.min(g1, g2)
  const completed = (maxG >= 6 && Math.abs(g1 - g2) >= 2) || (maxG === 7 && minG === 6)
  const isVoid = !completed && total < 6

  if (isVoid) return null // caller should skip

  if (completed) {
    return {
      team1Score: g1 > g2 ? 1 : 0,
      team2Score: g1 > g2 ? 0 : 1,
      isDraw: false,
      isDominant: Math.abs(g1 - g2) >= 5,
    }
  }

  // Unfinished but not void — proportional scores
  return {
    team1Score: g1 / total,
    team2Score: g2 / total,
    isDraw: g1 === g2,
    isDominant: false,
  }
}

export function isDominantWin(setsData: any[]): boolean {
  if (!setsData || setsData.length === 0) return false
  return setsData.every((set: any) => {
    const diff = Math.abs((set.team1_score || set.team1 || 0) - (set.team2_score || set.team2 || 0))
    return diff >= 5
  })
}

export interface EloResult {
  ratingBefore: number
  ratingAfter: number
  ratingChange: number
  expectedScore: number
  kFactor: number
}

export function processTeamElo(params: {
  playerIds: string[]
  opponentIds: string[]
  playerRatings: Record<string, number>
  matchesPlayed: Record<string, number>
  actualScore: number // 1 = win, 0 = loss, 0.5 = draw
  isDominant: boolean
}): Record<string, EloResult> {
  const results: Record<string, EloResult> = {}

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

/**
 * Classifies a whole match result into team1Score, team2Score, recordAsDraw, dominant.
 * Single-set matches delegate to classifySet() for the canonical void/completed/unfinished rule.
 * Multi-set matches use resultType directly.
 * Returns null for void single-set matches (should be skipped entirely).
 */
export function classifyMatch(
  resultType: string,
  setsData: any[],
): { team1Score: number; team2Score: number; recordAsDraw: boolean; dominant: boolean } | null {
  const sets = setsData || []
  const isSingleSet = sets.length === 1
  const team1Won = resultType === 'team1_win'
  const isDraw = resultType === 'draw'

  if (isSingleSet) {
    const g1 = (sets[0]?.team1_score ?? sets[0]?.team1 ?? 0) as number
    const g2 = (sets[0]?.team2_score ?? sets[0]?.team2 ?? 0) as number
    const setResult = classifySet(g1, g2)

    if (setResult === null) return null // void — caller should skip

    // For career ELO: all unfinished sets are recorded as draws (blanket),
    // distinct from classifySet.isDraw which is true only when g1 === g2.
    // Completed sets return integer scores (1 or 0); unfinished return fractional.
    const isCompleted = setResult.team1Score === 1 || setResult.team1Score === 0
    return {
      team1Score: setResult.team1Score,
      team2Score: setResult.team2Score,
      recordAsDraw: !isCompleted,
      dominant: setResult.isDominant,
    }
  }

  // Multi-set / fallback
  return {
    team1Score: isDraw ? 0.5 : team1Won ? 1 : 0,
    team2Score: isDraw ? 0.5 : team1Won ? 0 : 1,
    recordAsDraw: isDraw,
    dominant: isDominantWin(sets),
  }
}
