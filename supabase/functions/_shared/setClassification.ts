// !!! GENERATED FILE - DO NOT EDIT. Source: scripts/codegen/set-classification.spec.ts
// Regenerate with: npm run codegen

export const COMPLETED_MIN_GAMES = 6
export const COMPLETED_MIN_DIFF = 2
export const TIEBREAK_HIGH = 7
export const TIEBREAK_LOW = 6
export const VOID_MAX_TOTAL = 6

export interface SetClassification {
  completed: boolean
  isVoid: boolean
  winner: 0 | 1 | 2
}

export function classifyKernel(g1: number, g2: number): SetClassification {
  const maxG = Math.max(g1, g2)
  const minG = Math.min(g1, g2)
  const total = g1 + g2
  const completed =
    (maxG >= COMPLETED_MIN_GAMES && Math.abs(g1 - g2) >= COMPLETED_MIN_DIFF) ||
    (maxG === TIEBREAK_HIGH && minG === TIEBREAK_LOW)
  const isVoid = !completed && total < VOID_MAX_TOTAL
  const winner = g1 > g2 ? 1 : g2 > g1 ? 2 : 0
  return { completed, isVoid, winner }
}
