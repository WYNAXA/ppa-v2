import type { Profile } from './types'

export interface MatchPrediction {
  team1WinProb: number
  team2WinProb: number
  hasRankings: boolean
}

type PlayerWithRanking = Pick<Profile, 'id'> & { internal_ranking?: number | null }

const FALLBACK_RANKING = 1300

function avg(values: number[]): number {
  if (values.length === 0) return FALLBACK_RANKING
  return values.reduce((s, v) => s + v, 0) / values.length
}

export function calculateMatchPrediction(
  team1Players: PlayerWithRanking[],
  team2Players: PlayerWithRanking[],
): MatchPrediction {
  const t1Raw = team1Players.map((p) => p.internal_ranking)
  const t2Raw = team2Players.map((p) => p.internal_ranking)

  const hasRankings =
    t1Raw.some((v) => v != null) || t2Raw.some((v) => v != null)

  const t1Avg = avg(t1Raw.map((v) => v ?? FALLBACK_RANKING))
  const t2Avg = avg(t2Raw.map((v) => v ?? FALLBACK_RANKING))

  // ELO expected score: E = 1 / (1 + 10^((opp - self) / 400))
  const team1WinProb = Math.round(
    (1 / (1 + Math.pow(10, (t2Avg - t1Avg) / 400))) * 100
  )

  return {
    team1WinProb,
    team2WinProb: 100 - team1WinProb,
    hasRankings,
  }
}

export interface Pairing {
  team1Indices: [number, number]
  team2Indices: [number, number]
}

export const PAIRINGS: readonly Pairing[] = [
  { team1Indices: [0, 1], team2Indices: [2, 3] },
  { team1Indices: [0, 2], team2Indices: [1, 3] },
  { team1Indices: [0, 3], team2Indices: [1, 2] },
] as const

export function pairingToTeams(
  playerIds: string[],
  pairingIndex: number,
): { team1: string[]; team2: string[] } {
  const p = PAIRINGS[pairingIndex] ?? PAIRINGS[0]
  return {
    team1: [playerIds[p.team1Indices[0]], playerIds[p.team1Indices[1]]],
    team2: [playerIds[p.team2Indices[0]], playerIds[p.team2Indices[1]]],
  }
}

export function findPairingIndex(
  playerIds: string[],
  team1: string[] | null | undefined,
  team2: string[] | null | undefined,
): number {
  if (!team1 || !team2 || team1.length !== 2 || team2.length !== 2) return 0
  const t1Set = new Set(team1)
  const t2Set = new Set(team2)
  for (let i = 0; i < PAIRINGS.length; i++) {
    const { team1: candT1, team2: candT2 } = pairingToTeams(playerIds, i)
    const candT1Set = new Set(candT1)
    const candT2Set = new Set(candT2)
    const matches =
      candT1.every((id) => t1Set.has(id)) &&
      candT2.every((id) => t2Set.has(id)) &&
      t1Set.size === candT1Set.size &&
      t2Set.size === candT2Set.size
    if (matches) return i
  }
  return 0
}
