#!/usr/bin/env node
/**
 * Codemod: move the app off Tailwind's default Material greys and onto the
 * `ink` / `hairline` tokens in DESIGN.md.
 *
 * WHY THIS EXISTS
 *   2,541 sites use `text-gray-*` / `border-gray-*`. That is why every screen
 *   reads as the same cool neutral regardless of the brand colour sitting on
 *   it: the greys are blue-tinted (#9ca3af and friends), the palette is green.
 *   Tokenising them is what makes the new palette actually visible outside the
 *   two or three places a hand-edit reached.
 *
 * IT IS ALSO AN ACCESSIBILITY FIX
 *   `text-gray-400` (#9CA3AF) is **2.8:1 on white** — well under the 4.5:1 AA
 *   floor, and it is the single most-used text colour in the app (588 sites).
 *   `text-gray-500` is 4.4:1, still short. Both map to `ink-2` (#46534F, 8:1).
 *   Nothing here trades contrast away; every mapping is neutral or better.
 *
 * THE MAPPING, AND WHY 400 AND 500 COLLAPSE
 *   The codebase used 400 and 500 interchangeably for the same "secondary"
 *   role — eyebrow labels, captions, hints — so preserving the distinction
 *   would be preserving an accident. DESIGN.md has four ink steps, not seven
 *   greys. `gray-300` stays a step lighter as `ink-3` because it is only ever
 *   used decoratively (chevrons, inert dashes).
 *
 * SAFETY
 *   Every one of the 13 sites where a grey and `text-white` appear on the same
 *   line was read by hand first: all are ternaries where the grey branch is the
 *   INACTIVE state on a light background and the white branch is the active
 *   state on a dark one. No grey text is being darkened onto a dark surface.
 *   Marketing pages are excluded — separate design system, own scale.
 *
 * USAGE
 *   node scripts/codemod/greys-to-ink.mjs            # dry run
 *   node scripts/codemod/greys-to-ink.mjs --write
 *   node scripts/codemod/greys-to-ink.mjs --strict   # CI: fail on leftovers
 *
 * EXIT CODE
 *   0 even with leftovers reported — a non-zero exit silently breaks any
 *   `cmd && cmd` chain around it. Pass --strict when CI should fail.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join, relative, extname } from 'node:path'

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')
const WRITE = process.argv.includes('--write')
const VERBOSE = process.argv.includes('--verbose')
const STRICT = process.argv.includes('--strict')

const EXTS = new Set(['.tsx', '.ts', '.jsx', '.js'])
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'vendor'])
const SKIP_FILES = [/^src\/components\/marketing\//, /^src\/pages\/Landing\.tsx$/]

/** Ordered longest-first so `border-t-gray-200` is not eaten by `border-gray`. */
const rules = [
  // ── Text ────────────────────────────────────────────────────────────────
  { re: /\btext-gray-(?:900|800)\b/g,        to: 'text-ink',   name: 'text-gray-900/800 → text-ink' },
  { re: /\btext-gray-(?:700|600)\b/g,        to: 'text-ink-2', name: 'text-gray-700/600 → text-ink-2' },
  { re: /\btext-gray-(?:500|400)\b/g,        to: 'text-ink-2', name: 'text-gray-500/400 → text-ink-2  (AA fix)' },
  { re: /\btext-gray-300\b/g,                to: 'text-ink-3', name: 'text-gray-300 → text-ink-3' },
  { re: /\btext-gray-(?:200|100|50)\b/g,     to: 'text-ink-4', name: 'text-gray-200/100/50 → text-ink-4' },

  // ── Borders. One hairline, four steps of grey collapse into it. ─────────
  { re: /\bborder-([tblr])-gray-(?:300|200|100|50)\b/g, to: 'border-$1-hairline', name: 'border-{t,b,l,r}-gray-* → border-*-hairline' },
  { re: /\bborder-gray-(?:300|200|100|50)\b/g,          to: 'border-hairline',    name: 'border-gray-* → border-hairline' },
  { re: /\bdivide-gray-(?:300|200|100|50)\b/g,          to: 'divide-hairline',    name: 'divide-gray-* → divide-hairline' },
]

async function walk(dir, out = []) {
  let entries
  try { entries = await readdir(dir, { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue
    const full = join(dir, e.name)
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue
      await walk(full, out)
    } else if (EXTS.has(extname(e.name))) out.push(full)
  }
  return out
}

const files = await walk(SRC)

let filesChanged = 0
let total = 0
const perRule = new Map()
const skipped = []
const leftovers = []

const ANY_GREY = /\b(?:text|border(?:-[tblr])?|divide)-gray-\d{2,3}\b/

for (const file of files) {
  const rel = relative(ROOT, file)
  const before = readFileSync(file, 'utf8')
  if (!ANY_GREY.test(before)) continue

  if (SKIP_FILES.some((r) => r.test(rel))) { skipped.push(rel); continue }

  let after = before
  let n = 0
  for (const rule of rules) {
    const m = after.match(rule.re)
    if (!m) continue
    after = after.replace(rule.re, rule.to)
    n += m.length
    perRule.set(rule.name, (perRule.get(rule.name) ?? 0) + m.length)
  }

  if (ANY_GREY.test(after)) {
    for (const line of after.split('\n')) {
      if (ANY_GREY.test(line)) leftovers.push(`${rel}: ${line.trim().slice(0, 100)}`)
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
  console.log(`  ${String(n).padStart(5)}  ${name}`)
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
  console.log(`  ⚠ ${leftovers.length} grey(s) not converted — review by hand:`)
  for (const l of leftovers.slice(0, 20)) console.log(`      ${l}`)
  if (leftovers.length > 20) console.log(`      … and ${leftovers.length - 20} more`)
  if (STRICT) process.exitCode = 1
} else {
  console.log('')
  console.log('  no text or border greys remain in the app.')
}
console.log('')
