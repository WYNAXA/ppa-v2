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

// TS kernels: re-export the spec so there is only ONE TS implementation (cannot drift).
const tsKernel = (importPath: string) =>
  WARN + '\nexport * from ' + JSON.stringify(importPath) + '\n'

writeFileSync(join(root, 'src/lib/setClassification.ts'),
  tsKernel('../../scripts/codegen/set-classification.spec.ts'))

writeFileSync(join(root, 'supabase/functions/_shared/setClassification.ts'),
  tsKernel('../../../scripts/codegen/set-classification.spec.ts'))

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

console.log('codegen OK: src/lib/setClassification.ts, supabase/functions/_shared/setClassification.ts, supabase/migrations/20260626000003_classify_set_sql.generated.sql')
