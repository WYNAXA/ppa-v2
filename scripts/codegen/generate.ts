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

/**
 * The kernel, emitted verbatim into BOTH runtime copies.
 *
 * BOTH targets are SELF-CONTAINED. The Vite copy used to be a re-export of the
 * spec —
 *   export * from '../../scripts/codegen/set-classification.spec.ts'
 * — on the reasoning that "Vite resolves the cross-tree path fine". It does
 * resolve. That was the defect, and it caused three things:
 *
 *  1. Vite followed the import out of `src/` and BUNDLED the spec, so every
 *     production build shipped `dist/assets/set-classification.spec-*.js` to
 *     players. Build tooling in the app bundle.
 *
 *  2. `tsconfig.app.json` has `"include": ["src"]`, so `scripts/` sits outside
 *     the app project. The file actually executing the scoring rule was
 *     therefore NEVER type-checked by `tsc -b` — while the four-line shim
 *     inside `src/` compiled cleanly and made it look as though it were. This
 *     rule decides whether a set counts, and it is imported by LeagueDetail
 *     and You.
 *
 *  3. `codegen:check` diffs `src/lib/setClassification.ts`. When that file was
 *     a shim, the check could only ever confirm the shim was unchanged — it
 *     could not detect drift in the logic it was supposed to be guarding.
 *
 * Inlining fixes all three at once, and it is the pattern the Deno target
 * already used successfully. One body, two writes, so the copies cannot
 * disagree with each other by construction.
 */
const kernelBody = `export const COMPLETED_MIN_GAMES = ${COMPLETED_MIN_GAMES}
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

// Vite / browser kernel. Inside src/, so `tsc -b` checks it and Vite bundles
// nothing from scripts/.
writeFileSync(join(root, 'src/lib/setClassification.ts'), WARN + '\n' + kernelBody)

// Deno / edge kernel. The Supabase edge bundler cannot reach outside
// supabase/functions/, which is why this one was always self-contained.
writeFileSync(join(root, 'supabase/functions/_shared/setClassification.ts'), WARN + '\n' + kernelBody)

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

console.log('codegen OK: src/lib + supabase/functions/_shared (both self-contained), migration SQL')
