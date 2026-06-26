// ─────────────────────────────────────────────────────────────────────────────
// SET CLASSIFICATION — SINGLE SOURCE OF TRUTH
// ─────────────────────────────────────────────────────────────────────────────
// This file is the ONLY place the void/completion rule is authored.
// The generator (scripts/codegen/generate.ts) emits all runtime copies from it:
//   - src/lib/setClassification.ts                    (Vite / browser kernel)
//   - supabase/functions/_shared/setClassification.ts (Deno / edge kernel)
//   - supabase/migrations/*_classify_set_sql.sql      (Postgres function)
// Never hand-edit a generated file. Change the rule HERE, then run `npm run codegen`.
//
// Canonical rule for ONE set:
//   completed = (max >= 6 AND |g1-g2| >= 2) OR (max == 7 AND min == 6)
//   void      = NOT completed AND (g1 + g2) < 6
//   winner    = 1 if g1>g2, 2 if g2>g1, 0 if draw
// ─────────────────────────────────────────────────────────────────────────────

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
