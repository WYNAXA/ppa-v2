#!/usr/bin/env node
/**
 * Codemod: raise the minimum type size in the app to 11px.
 *
 * WHY THIS EXISTS
 *   210 sites across 42 files render text at 8, 9 or 10px. The iOS HIG floor
 *   is 11px and this is the single most common accessibility failure in the
 *   current UI — it is also, bluntly, why the app reads as "dense" rather than
 *   "considered". DESIGN.md fixes 11px (`caption`) as the bottom of the scale.
 *
 * WHY IT MAPS TO text-[11px] AND *NOT* text-caption
 *   `caption` is 11px **plus** weight 700 and +0.06em tracking. Those are
 *   deliberate design decisions that are right for eyebrow labels and wrong for
 *   the ~150 body-ish sites in this sweep. Rewriting all 210 to `caption` would
 *   silently re-weight the whole app under cover of an accessibility fix.
 *   So this codemod changes SIZE ONLY — one variable, reviewable as such — and
 *   the semantic move to `caption`/`label` happens screen by screen with eyes
 *   on it, per the migration order in DESIGN.md.
 *
 * USAGE
 *   node scripts/codemod/raise-type-floor.mjs            # dry run
 *   node scripts/codemod/raise-type-floor.mjs --write    # apply
 *   node scripts/codemod/raise-type-floor.mjs --strict   # CI: fail on leftovers
 *
 * EXIT CODE
 *   0 even when leftovers are reported — they are information, not failure, and
 *   a non-zero exit silently breaks any `cmd && cmd` chain around it.
 *   Pass --strict when you want CI to fail.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join, relative, extname } from 'node:path'

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')
const WRITE = process.argv.includes('--write')
const VERBOSE = process.argv.includes('--verbose')
const STRICT = process.argv.includes('--strict')

const FLOOR = 11

const EXTS = new Set(['.tsx', '.ts', '.jsx', '.js'])
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'vendor'])

/**
 * Marketing pages are a separate design system (Montserrat, its own scale) and
 * are viewed on desktop as often as phone. They are out of scope for the app
 * type floor; leaving them alone keeps this diff about the app.
 */
const SKIP_FILES = [/^src\/components\/marketing\//, /^src\/pages\/Landing\.tsx$/]

const rules = [
  {
    name: 'text-[Npx] utility',
    re: /\btext-\[(8|9|10)px\]/g,
    to: `text-[${FLOOR}px]`,
  },
  {
    // Recharts axis ticks and similar inline SVG text. Same floor applies:
    // an axis label is still text a human has to read.
    name: "inline fontSize: N / '<N>px'",
    re: /(\bfontSize:\s*)(?:'(?:8|9|10)px'|"(?:8|9|10)px"|(?:8|9|10))(?=\s*[,}\n])/g,
    to: (_m, prefix) => `${prefix}${FLOOR}`,
  },
]

async function walk(dir, out = []) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue
    const full = join(dir, e.name)
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue
      await walk(full, out)
    } else if (EXTS.has(extname(e.name))) {
      out.push(full)
    }
  }
  return out
}

const files = await walk(SRC)

let filesChanged = 0
let total = 0
const perRule = new Map()
const skipped = []
const leftovers = []

const BELOW_FLOOR = /text-\[(?:[0-9]|10)px\]|fontSize:\s*(?:'(?:[0-9]|10)px'|"(?:[0-9]|10)px"|(?:[0-9]|10))(?=\s*[,}\n])/

for (const file of files) {
  const rel = relative(ROOT, file)
  const before = readFileSync(file, 'utf8')
  if (!BELOW_FLOOR.test(before)) continue

  if (SKIP_FILES.some((r) => r.test(rel))) {
    skipped.push(rel)
    continue
  }

  let after = before
  let n = 0
  for (const rule of rules) {
    const m = after.match(rule.re)
    if (!m) continue
    after = after.replace(rule.re, rule.to)
    n += m.length
    perRule.set(rule.name, (perRule.get(rule.name) ?? 0) + m.length)
  }

  if (BELOW_FLOOR.test(after)) {
    for (const line of after.split('\n')) {
      if (BELOW_FLOOR.test(line)) leftovers.push(`${rel}: ${line.trim().slice(0, 110)}`)
    }
  }

  if (after !== before) {
    filesChanged++
    total += n
    if (VERBOSE) console.log(`  ${rel} — ${n}`)
    if (WRITE) writeFileSync(file, after, 'utf8')
  }
}

console.log('')
console.log(WRITE ? '── APPLIED ──' : '── DRY RUN (pass --write to apply) ──')
console.log('')
for (const [name, n] of [...perRule.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${name}`)
}
console.log('')
console.log(`  files changed:  ${filesChanged}`)
console.log(`  replacements:   ${total}`)

if (skipped.length) {
  console.log('')
  console.log(`  ${skipped.length} marketing file(s) deliberately skipped:`)
  for (const s of skipped) console.log(`      ${s}`)
}

if (leftovers.length) {
  console.log('')
  console.log(`  ⚠ ${leftovers.length} site(s) still below the floor — review by hand:`)
  for (const l of leftovers.slice(0, 25)) console.log(`      ${l}`)
  if (leftovers.length > 25) console.log(`      … and ${leftovers.length - 25} more`)
  if (STRICT) process.exitCode = 1
} else {
  console.log('')
  console.log(`  no app text below ${FLOOR}px remains.`)
}
console.log('')
