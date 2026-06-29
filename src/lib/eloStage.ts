// TUNABLE
const WINDOW = 5
const DEAD_BAND = 25
const TRAJECTORY_CUTOFF = 8

export type EloStage = 'new' | 'building' | 'climbing' | 'steady' | 'dipping'

export function classifyEloStage(
  matchesPlayed: number,
  eloHistory: number[],
): { stage: EloStage; delta: number; window: number } {
  if (matchesPlayed <= 0 || eloHistory.length === 0) {
    return { stage: 'new', delta: 0, window: 0 }
  }
  if (matchesPlayed <= 2) {
    return { stage: 'new', delta: 0, window: 0 }
  }
  if (matchesPlayed < TRAJECTORY_CUTOFF) {
    return { stage: 'building', delta: 0, window: matchesPlayed }
  }
  // matchesPlayed >= TRAJECTORY_CUTOFF — compute trajectory
  const len = eloHistory.length
  const windowSize = Math.min(WINDOW, len)
  const startIdx = len - windowSize
  const delta = eloHistory[len - 1] - eloHistory[startIdx]

  let stage: EloStage
  if (delta > DEAD_BAND) stage = 'climbing'
  else if (delta < -DEAD_BAND) stage = 'dipping'
  else stage = 'steady'

  return { stage, delta, window: windowSize }
}
