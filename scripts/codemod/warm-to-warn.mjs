#!/usr/bin/env node
/**
 * Codemod: move Material orange / amber / yellow onto the `warn` token.
 *
 * WHY THIS EXISTS
 *   429 sites use `*-orange-*`, `*-amber-*` or `*-yellow-*`. They all mean the
 *   same thing — needs attention: spots open, ringers wanted, awaiting a
 *   result, provisional rating — but they say it in three hues and nine
 *   lightness steps, so the same signal looks different on every screen. The
 *   old brand accent was `#E65100` (Material Deep Orange 900), which is also
 *   why so many of these read as "brand" rather than "warning".
 *
 * WHY NOT `alert`
 *   DESIGN.md reserves `alert` for genuine failures — conflicts, negative ELO,
 *   payment errors — and says explicitly it is not for emphasis. Mapping 429
 *   attention states onto it would cry wolf and make real failures invisible.
 *   The palette was missing a step; `warn` is that step.
 *
 * CONTRAST
 *   `warn` `#A85F00` clears 4.9:1 as text on white AND as white text on it, so
 *   the one value serves both the text and the filled-chip role. Every mapping
 *   below is neutral or better than what it replaces — `text-amber-400`
 *   (#FBBF24, 1.7:1 on white) was failing badly.
 *
 * USAGE
 *   node scripts/codemod/warm-to-warn.mjs            # dry run
 *   node scripts/codemod/warm-to-warn.mjs --write
 *   node scripts/codemod/warm-to-warn.mjs --strict   # CI: fail on leftovers
 *
 * EXIT CODE
 *   0 even with leftovers — a non-zero exit silently breaks a `cmd && cmd`
 *   chain. Pass --strict when CI should fail.
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

const HUE = '(?:orange|amber|yellow)'

const rules = [
  // Tints: the 50s are surfaces, the 100–300s are borders and icon wells.
  { re: new RegExp(`\\b(bg|from|to|via)-${HUE}-50\\b`, 'g'),            to: '$1-warn-50',  name: 'bg/gradient -50 → warn-50' },
  { re: new RegExp(`\\b(border(?:-[tblr])?)-${HUE}-(?:50|100)\\b`, 'g'), to: '$1-warn-100', name: 'border -50/-100 → warn-100' },
  { re: new RegExp(`\\b(border(?:-[tblr])?)-${HUE}-(?:200|300)\\b`, 'g'), to: '$1-warn',     name: 'border -200/-300 → warn' },
  { re: new RegExp(`\\b(bg)-${HUE}-(?:100|200|300)\\b`, 'g'),           to: '$1-warn-100', name: 'bg -100/-200/-300 → warn-100' },

  // Solids. Everything from 400 up becomes the one `warn` value: it is legible
  // as text on white and carries white text as a fill, which the old spread of
  // nine steps could not claim.
  { re: new RegExp(`\\b(text|bg|border(?:-[tblr])?|fill|stroke|from|to|via|ring|decoration)-${HUE}-(?:400|500|600|700|800|900)\\b`, 'g'),
    to: '$1-warn', name: 'text/bg/border 400–900 → warn' },
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

const ANY = new RegExp(`\\b[a-z-]+-${HUE}-\\d{2,3}\\b`)

for (const file of files) {
  const rel = relative(ROOT, file)
  const before = readFileSync(file, 'utf8')
  if (!ANY.test(before)) continue
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

  if (ANY.test(after)) {
    for (const line of after.split('\n')) {
      if (ANY.test(line)) leftovers.push(`${rel}: ${line.trim().slice(0, 100)}`)
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
  console.log(`  ⚠ ${leftovers.length} not converted — review by hand:`)
  for (const l of leftovers.slice(0, 20)) console.log(`      ${l}`)
  if (leftovers.length > 20) console.log(`      … and ${leftovers.length - 20} more`)
  if (STRICT) process.exitCode = 1
} else {
  console.log('')
  console.log('  no Material orange/amber/yellow remains in the app.')
}
console.log('')
