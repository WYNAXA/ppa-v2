#!/usr/bin/env node
/**
 * Codemod: the last block of Material grey — `bg-gray-*` — onto the tokens.
 *
 * WHY IT WAS LEFT UNTIL LAST
 *   Text and border greys map one-to-one onto `ink-*` / `hairline`. Backgrounds
 *   do not: the same `bg-gray-50` is a page ground in one place, an inset panel
 *   in another and an icon well in a third. So this ran only after every screen
 *   had been looked at, and it uses the narrow mapping below rather than
 *   guessing per site.
 *
 *   bg-gray-50            → surface   (#FBFAF7) the app ground; as an inset on a
 *                                     white card it reads exactly as before, only
 *                                     warm instead of blue-grey.
 *   bg-gray-100 / -200    → hairline  (#E4E7E4) icon wells, skeletons, inert
 *                                     chips — the same job the 1px rule does.
 *   bg-gray-300 / -400    → ink-4     (#B6C0BB) disabled fills.
 *   bg-gray-800 / -900    → ink       (#0B1512) dark chips.
 *
 * Marketing pages are excluded — separate design system.
 *
 *   node scripts/codemod/bg-greys-to-tokens.mjs [--write] [--strict]
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

const rules = [
  { re: /\b(bg|from|to|via)-gray-50\b/g,          to: '$1-surface',  name: 'bg-gray-50 → surface' },
  { re: /\b(bg|from|to|via)-gray-(?:100|200)\b/g, to: '$1-hairline', name: 'bg-gray-100/200 → hairline' },
  { re: /\b(bg|from|to|via)-gray-(?:300|400)\b/g, to: '$1-ink-4',    name: 'bg-gray-300/400 → ink-4' },
  { re: /\b(bg|from|to|via)-gray-(?:800|900)\b/g, to: '$1-ink',      name: 'bg-gray-800/900 → ink' },
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
const ANY = /\b(?:bg|from|to|via)-gray-\d{2,3}\b/

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
  if (ANY.test(after)) for (const l of after.split('\n')) if (ANY.test(l)) leftovers.push(`${rel}: ${l.trim().slice(0, 100)}`)
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
} else console.log('\n  no background greys remain in the app.')
console.log('')
