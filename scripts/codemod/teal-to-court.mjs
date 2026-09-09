#!/usr/bin/env node
/**
 * Codemod: retire Tailwind's Material `teal-*` scale in favour of `court`.
 *
 * WHY THIS EXISTS
 *   884 sites still use `*-teal-*`. That is Tailwind's default teal — the same
 *   family as the old `#009688` brand colour — so every one of them is a place
 *   the app still renders the *previous* brand next to the new one. It is the
 *   single largest reason the palette flip was only visible on a hero card.
 *
 *   Tokenising the literal `#009688` (a previous pass) fixed the sites that
 *   spelled the hex out. It could not touch the sites that reached the same
 *   colour through Tailwind's scale. This is the other half of that job.
 *
 * CONTRAST
 *   `text-teal-600` (#0D9488) is 3.9:1 on white — under AA, and the most-used
 *   of these at 158 sites. `court` (#0F5D54) is 7.3:1. Every mapping here is
 *   neutral or better.
 *
 * THE LIGHT STEPS
 *   `text-teal-100/200/300` only ever appear as light text ON a dark teal
 *   surface (the Compete hero, the old gradient cards). They map to
 *   `court-100`, which is the palette's light tint and stays legible there.
 *   Fills and borders at those steps map to `court-100` too.
 *
 * USAGE
 *   node scripts/codemod/teal-to-court.mjs            # dry run
 *   node scripts/codemod/teal-to-court.mjs --write
 *   node scripts/codemod/teal-to-court.mjs --strict   # CI: fail on leftovers
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

const P = '(?:text|bg|border(?:-[tblr])?|ring|divide|fill|stroke|from|to|via|placeholder|decoration|accent|caret|shadow|outline)'

const rules = [
  // Light steps — tints, and light text on the dark teal surfaces.
  { re: new RegExp(`\\b(${P})-teal-(?:50)\\b`, 'g'),               to: '$1-court-50',  name: 'teal-50 → court-50' },
  { re: new RegExp(`\\b(${P})-teal-(?:100|200|300)\\b`, 'g'),      to: '$1-court-100', name: 'teal-100/200/300 → court-100' },
  // Mid and dark steps — the brand colour itself.
  { re: new RegExp(`\\b(${P})-teal-(?:400|500|600)\\b`, 'g'),      to: '$1-court',     name: 'teal-400/500/600 → court' },
  { re: new RegExp(`\\b(${P})-teal-(?:700|800|900)\\b`, 'g'),      to: '$1-court-700', name: 'teal-700/800/900 → court-700' },
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

const ANY = /\b[a-z-]+-teal-\d{2,3}\b/

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
  console.log('  no Material teal remains in the app.')
}
console.log('')
