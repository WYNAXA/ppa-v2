#!/usr/bin/env node
/**
 * Codemod: the last off-palette families — red, green, blue, purple, slate.
 *
 * WHY THIS EXISTS
 *   491 sites still reach for Tailwind's default palettes. UAT surfaced it as
 *   "when you click on other venues that do have playtomic it goes blue", but
 *   that blue panel is one of 95, and there are 225 reds and 126 greens behind
 *   it. Fixing the reported card and leaving the class is the definition of a
 *   patch.
 *
 * THE MAPPING IS SEMANTIC, NOT CHROMATIC
 *   red    → alert    something is wrong: destructive, failed, negative delta.
 *   green  → court    something is good: won, confirmed, positive delta.
 *   purple → court    decorative badge tints; the brand already owns "special".
 *   slate  → ink-2    it was a neutral pretending to be a hue.
 *   blue   → NEUTRAL for tints and text, court for solid buttons.
 *
 *   Blue is the interesting one. It was carrying "here is some information" —
 *   external booking platforms, household links, format explainers. The palette
 *   has no info colour and inventing one would give the app a fifth hue for a
 *   state that needs none: an informational note is a plain card. Its *buttons*
 *   are still actions, so those go to `court`.
 *
 * SAFETY
 *   Every site where coloured text shares a line with a dark or branded surface
 *   was checked first — there are none, so nothing is being darkened onto a
 *   dark ground. Marketing pages are excluded; they are their own system.
 *
 *   node scripts/codemod/semantic-colours.mjs [--write] [--strict]
 *
 * Exits 0 even with leftovers so it never breaks a `cmd && cmd` chain.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join, relative, extname } from 'node:path'

const ROOT = process.cwd()
const WRITE = process.argv.includes('--write')
const STRICT = process.argv.includes('--strict')
const EXTS = new Set(['.tsx', '.ts', '.jsx', '.js'])
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'vendor'])
const SKIP_FILES = [/^src\/components\/marketing\//, /^src\/pages\/Landing\.tsx$/]

/** Prefixes that take a colour. */
const P = '(?:text|bg|border(?:-[tblr])?|ring|divide|fill|stroke|from|to|via|placeholder|decoration|accent|caret|outline|shadow)'

const rules = [
  // ── red → alert ─────────────────────────────────────────────────────────
  { re: new RegExp(`\\b(bg|from|to|via)-red-(?:50|100)\\b`, 'g'),                to: '$1-alert-50', name: 'red tint → alert-50' },
  { re: new RegExp(`\\b(border(?:-[tblr])?|ring|divide)-red-(?:50|100|200|300)\\b`, 'g'), to: '$1-alert/40', name: 'red border → alert/40' },
  { re: new RegExp(`\\b(${P})-red-(?:200|300|400|500|600|700|800|900)\\b`, 'g'), to: '$1-alert',    name: 'red → alert' },

  // ── green → court ───────────────────────────────────────────────────────
  { re: new RegExp(`\\b(bg|from|to|via)-(?:green|emerald|lime)-(?:50|100)\\b`, 'g'),          to: '$1-court-50',  name: 'green tint → court-50' },
  { re: new RegExp(`\\b(border(?:-[tblr])?|ring|divide)-(?:green|emerald|lime)-(?:50|100|200|300)\\b`, 'g'), to: '$1-court-100', name: 'green border → court-100' },
  { re: new RegExp(`\\b(${P})-(?:green|emerald|lime)-(?:200|300|400|500|600|700|800|900)\\b`, 'g'),          to: '$1-court',     name: 'green → court' },

  // ── purple → court ──────────────────────────────────────────────────────
  { re: new RegExp(`\\b(bg|from|to|via)-(?:purple|violet|fuchsia)-(?:50|100)\\b`, 'g'),          to: '$1-court-50',  name: 'purple tint → court-50' },
  { re: new RegExp(`\\b(border(?:-[tblr])?|ring|divide)-(?:purple|violet|fuchsia)-(?:50|100|200|300)\\b`, 'g'), to: '$1-court-100', name: 'purple border → court-100' },
  { re: new RegExp(`\\b(${P})-(?:purple|violet|fuchsia)-(?:200|300|400|500|600|700|800|900)\\b`, 'g'),          to: '$1-court',     name: 'purple → court' },

  // ── blue: solid buttons are actions, everything else is just a note ─────
  { re: new RegExp(`\\b(bg)-(?:blue|sky|indigo|cyan)-(?:500|600|700|800|900)\\b`, 'g'),  to: '$1-court',     name: 'blue solid → court (it is a button)' },
  { re: new RegExp(`\\b(bg|from|to|via)-(?:blue|sky|indigo|cyan)-(?:50|100)\\b`, 'g'),   to: '$1-surface',   name: 'blue tint → surface' },
  { re: new RegExp(`\\b(border(?:-[tblr])?|ring|divide)-(?:blue|sky|indigo|cyan)-(?:50|100|200|300|400|500|600)\\b`, 'g'), to: '$1-hairline', name: 'blue border → hairline' },
  { re: new RegExp(`\\b(${P})-(?:blue|sky|indigo|cyan)-(?:200|300|400|500|600|700|800|900)\\b`, 'g'), to: '$1-ink-2', name: 'blue text → ink-2' },

  // ── slate/zinc/neutral/stone → ink ──────────────────────────────────────
  { re: new RegExp(`\\b(bg|from|to|via)-(?:slate|zinc|neutral|stone)-(?:50|100|200)\\b`, 'g'),           to: '$1-surface',  name: 'slate tint → surface' },
  { re: new RegExp(`\\b(border(?:-[tblr])?|ring|divide)-(?:slate|zinc|neutral|stone)-\\d{2,3}\\b`, 'g'), to: '$1-hairline', name: 'slate border → hairline' },
  { re: new RegExp(`\\b(${P})-(?:slate|zinc|neutral|stone)-(?:300|400|500|600|700|800|900)\\b`, 'g'),    to: '$1-ink-2',    name: 'slate → ink-2' },
]

async function walk(dir, out = []) {
  let entries
  try { entries = await readdir(dir, { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue
    const full = join(dir, e.name)
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) await walk(full, out) }
    else if (EXTS.has(extname(e.name))) out.push(full)
  }
  return out
}

const files = await walk(join(ROOT, 'src'))
let changed = 0, total = 0
const perRule = new Map(); const leftovers = []; const skipped = []
const ANY = /\b[a-z-]+-(?:red|green|emerald|lime|blue|sky|indigo|cyan|purple|violet|fuchsia|slate|zinc|neutral|stone)-\d{2,3}\b/

for (const file of files) {
  const rel = relative(ROOT, file)
  const before = readFileSync(file, 'utf8')
  if (!ANY.test(before)) continue
  if (SKIP_FILES.some((r) => r.test(rel))) { skipped.push(rel); continue }
  let after = before, n = 0
  for (const r of rules) {
    const m = after.match(r.re); if (!m) continue
    after = after.replace(r.re, r.to); n += m.length
    perRule.set(r.name, (perRule.get(r.name) ?? 0) + m.length)
  }
  if (ANY.test(after)) for (const l of after.split('\n')) if (ANY.test(l)) leftovers.push(`${rel}: ${l.trim().slice(0, 96)}`)
  if (after !== before) { changed++; total += n; if (WRITE) writeFileSync(file, after, 'utf8') }
}

console.log('')
console.log(WRITE ? '── APPLIED ──' : '── DRY RUN (pass --write to apply) ──')
console.log('')
for (const [n, c] of [...perRule.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(c).padStart(4)}  ${n}`)
console.log(`\n  files changed:  ${changed}\n  replacements:   ${total}`)
if (skipped.length) console.log(`\n  ${skipped.length} marketing file(s) skipped:\n      ${skipped.join('\n      ')}`)
if (leftovers.length) {
  console.log(`\n  ⚠ ${leftovers.length} not converted:`)
  for (const l of leftovers.slice(0, 15)) console.log(`      ${l}`)
  if (STRICT) process.exitCode = 1
} else console.log('\n  the app is on the palette.')
console.log('')
