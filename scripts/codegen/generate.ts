// Generator: reads set-classification.spec.ts, emits all runtime copies.
// Run with: node scripts/codegen/generate.ts   (Node >=23 strips types natively)
import {
  COMPLETED_MIN_GAMES, COMPLETED_MIN_DIFF, TIEBREAK_HIGH, TIEBREAK_LOW, VOID_MAX_TOTAL,
} from './set-classification.spec.ts'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const specPath = 'scripts/codegen/set-classification.spec.ts'
const WARN = '// !!! GENERATED FILE - DO NOT EDIT. Source: ' + specPath + '\n// Regenerate with: npm run codegen\n'

// Vite kernel: re-export the spec. Vite resolves the cross-tree path fine.
const viteKernel = WARN + '\nexport * from ' + JSON.stringify('../../scripts/codegen/set-classification.spec.ts') + '\n'
writeFileSync(join(root, 'src/lib/setClassification.ts'), viteKernel)

// Deno kernel: SELF-CONTAINED inline copy (no cross-tree import). The Supabase
// edge bundler cannot reach outside supabase/functions/, so this file inlines
// the constants + classifyKernel rather than re-exporting the spec. It is a
// GENERATED copy — codegen:check + the drift test keep it in sync with the spec.
const denoKernel = `${WARN}
export const COMPLETED_MIN_GAMES = ${COMPLETED_MIN_GAMES}
export const COMPLETED_MIN_DIFF = ${COMPLETED_MIN_DIFF}
export const TIEBREAK_HIGH = ${TIEBREAK_HIGH}
export const TIEBREAK_LOW = ${TIEBREAK_LOW}
export const VOID_MAX_TOTAL = ${VOID_MAX_TOTAL}

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
`
writeFileSync(join(root, 'supabase/functions/_shared/setClassification.ts'), denoKernel)

// SQL function: templated from the SAME constants the TS executes.
const sql = `-- !!! GENERATED FILE - DO NOT EDIT. Source: ${specPath}
-- Regenerate with: npm run codegen
CREATE OR REPLACE FUNCTION public.classify_set_sql(p_g1 int, p_g2 int)
RETURNS TABLE (is_completed boolean, is_void boolean, winner int)
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT
    comp,
    (NOT comp) AND (p_g1 + p_g2) < ${VOID_MAX_TOTAL},
    CASE WHEN p_g1 > p_g2 THEN 1 WHEN p_g2 > p_g1 THEN 2 ELSE 0 END
  FROM (
    SELECT (GREATEST(p_g1, p_g2) >= ${COMPLETED_MIN_GAMES} AND ABS(p_g1 - p_g2) >= ${COMPLETED_MIN_DIFF})
        OR (GREATEST(p_g1, p_g2) = ${TIEBREAK_HIGH} AND LEAST(p_g1, p_g2) = ${TIEBREAK_LOW}) AS comp
  ) c;
$$;
`
writeFileSync(join(root, 'supabase/migrations/20260626000003_classify_set_sql.generated.sql'), sql)

console.log('codegen OK: src/lib (re-export), supabase/functions/_shared (self-contained), migration SQL')
