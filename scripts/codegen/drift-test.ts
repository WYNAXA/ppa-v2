// Cross-runtime drift guard: spec TS classifyKernel vs Postgres classify_set_sql.
// Runs every (g1,g2) in 0..9 through both runtimes and asserts identical output.
// Usage: node scripts/codegen/drift-test.ts   (needs $DB_URL or falls back to pooler)
import { classifyKernel } from './set-classification.spec.ts'
import { execFileSync } from 'node:child_process'

const PSQL = '/usr/local/opt/libpq/bin/psql'
const CONN = process.env.PPA_DB_URL ?? ''
if (!CONN) {
  console.error('drift-test: set PPA_DB_URL (e.g. postgresql://user:pass@host:5432/postgres)')
  process.exit(2)
}

const MAX = 9
const pairs: Array<[number, number]> = []
for (let a = 0; a <= MAX; a++) for (let b = 0; b <= MAX; b++) pairs.push([a, b])

// Build one VALUES list and ask Postgres to classify all pairs in a single round-trip.
const values = pairs.map(([a, b]) => `(${a},${b})`).join(',')
const sql = `
  SELECT g.a, g.b, c.is_completed, c.is_void, c.winner
  FROM (VALUES ${values}) AS g(a,b)
  CROSS JOIN LATERAL classify_set_sql(g.a, g.b) c
  ORDER BY g.a, g.b;
`
const raw = execFileSync(PSQL, [CONN, '-tA', '-F', ',', '-c', sql], { encoding: 'utf8' })
const sqlRows = new Map<string, { completed: boolean; isVoid: boolean; winner: number }>()
for (const line of raw.trim().split('\n')) {
  const [a, b, comp, vd, win] = line.split(',')
  sqlRows.set(`${a},${b}`, { completed: comp === 't', isVoid: vd === 't', winner: Number(win) })
}

let mismatches = 0
for (const [a, b] of pairs) {
  const ts = classifyKernel(a, b)
  const pg = sqlRows.get(`${a},${b}`)
  if (!pg) { console.error(`MISSING SQL row for ${a},${b}`); mismatches++; continue }
  if (ts.completed !== pg.completed || ts.isVoid !== pg.isVoid || ts.winner !== pg.winner) {
    console.error(`DRIFT at ${a},${b}: TS=${JSON.stringify(ts)} SQL=${JSON.stringify(pg)}`)
    mismatches++
  }
}

if (mismatches > 0) {
  console.error(`drift-test FAILED: ${mismatches} mismatch(es) across ${pairs.length} pairs`)
  process.exit(1)
}
console.log(`drift-test OK: TS spec and SQL agree on all ${pairs.length} input pairs`)
