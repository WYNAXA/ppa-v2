#!/usr/bin/env node
/**
 * Codemod: `bg-white` → `bg-card`, so surfaces stop being a literal colour.
 *
 * WHY THIS EXISTS
 *   Dark mode is the last thing on the redesign list and it was described as
 *   "a pass over every screen". After the token codemods it is not: the app is
 *   already 1,958 `text-ink`, 647 `border-hairline`, 541 `bg-court` and 216
 *   `bg-surface`. Those all flip by redefining a token.
 *
 *   `bg-white` does not. It is a literal, it appeared 284 times against 29
 *   `bg-card`, and it is the single thing standing between this app and a dark
 *   mode that is a token swap rather than a rewrite.
 *
 * THIS COMMIT CHANGES NOTHING VISUALLY
 *   `--color-card` is `#FFFFFF`. In light mode `bg-card` and `bg-white` render
 *   identically, so this lands as a zero-pixel diff and can be verified by
 *   screenshot rather than by trust. The dark values are already defined
 *   (`ink-surface` / `ink-card`) and still unwired — that is its own job.
 *
 * WHAT IS DELIBERATELY LEFT ALONE
 *   1. `bg-white/<opacity>` — 16 sites, translucent white over a dark ground
 *      (the Compete hero, the Play sheet's tick row, Home's week strip). Those
 *      are correct as literals and must not follow the surface into the dark.
 *   2. Anything sitting *inside* a `bg-court` or `bg-ink` ground, found by
 *      walking JSX indentation rather than guessing from the same line. There
 *      is exactly one: the Play sheet's primary button on the court panel. It
 *      takes `on-brand`, a token that stays white in both themes, because
 *      "white on the brand colour" is a different idea from "the colour of a
 *      card". Conflating the two is precisely what would put dark text on a
 *      dark ground the day dark mode is switched on.
 *   3. The toggle knob and the QR code ground, for the same reason: they are
 *      white because of what they sit on or what has to scan them, not because
 *      they are surfaces.
 *
 * HOW THE ANCESTOR CHECK WENT WRONG FIRST TIME
 *   A blank line has zero indentation. The first version let that close every
 *   open element, so anything below a blank line inside its parent looked
 *   top-level and the check reported two on-brand sites instead of three —
 *   missing the one case already known by hand. Worth remembering before
 *   trusting an indentation walker.
 *
 *   node scripts/codemod/white-to-card.mjs [--write] [--strict]
 *
 * Exits 0 even with leftovers so it never breaks a `cmd && cmd` chain.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join, relative, extname } from 'node:path'

const ROOT = process.cwd()
const WRITE = process.argv.includes('--write')
const STRICT = process.argv.includes('--strict')
const EXTS = new Set(['.tsx'])
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'vendor'])
const SKIP_FILES = [/^src\/components\/marketing\//, /^src\/pages\/Landing\.tsx$/]

/** Sites that are white because of what they sit on, not because they are surfaces. */
const KEEP = new Set([
  'src/components/play/PlaySheet.tsx:207',            // primary button on the court panel
  'src/components/play/AskVenueSheet.tsx',            // QR ground — scanners need the contrast
  'src/components/community/CreateGroupSheet.tsx:32', // switch knob on a coloured track
])

/**
 * Only these are dark enough that a child must stay light. `court-50` is a
 * tint, not a ground. `scrim` is deliberately absent: a modal sits *above* the
 * dimming layer rather than on it, so it is a card and converts like one.
 */
const DARK = /\bbg-(court|ink)\b(?!-)|\bbg-court-700\b|\bbg-ink-(surface|card)\b/
const WHITE = /\bbg-white(?![/\w-])/g
const OPEN_TAG = /<[A-Za-z]/
const SELF_CLOSING = /\/>\s*$/

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
let changed = 0, converted = 0
const kept = []
const skipped = []

for (const file of files) {
  const rel = relative(ROOT, file)
  const before = readFileSync(file, 'utf8')
  if (!/\bbg-white\b/.test(before)) continue
  if (SKIP_FILES.some((r) => r.test(rel))) { skipped.push(rel); continue }
  if (KEEP.has(rel)) { kept.push(`${rel} (whole file)`); continue }

  const lines = before.split('\n')
  /** @type {Array<[number, boolean]>} indent → is this element on a dark ground */
  const stack = []
  let touched = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // A blank line has no indentation and must not close anything. Getting this
    // wrong silently emptied the stack and misclassified every element that sat
    // below a blank line inside its parent.
    if (line.trim() === '') continue

    const indent = line.length - line.trimStart().length
    while (stack.length && indent <= stack[stack.length - 1][0]) stack.pop()
    const onDark = stack.some(([, d]) => d)

    if (WHITE.test(line)) {
      WHITE.lastIndex = 0
      const site = `${rel}:${i + 1}`
      if (onDark || KEEP.has(site)) {
        kept.push(`${site}  ${line.trim().slice(0, 76)}`)
      } else {
        const n = (line.match(WHITE) || []).length
        lines[i] = line.replace(WHITE, 'bg-card')
        converted += n
        touched = true
      }
      WHITE.lastIndex = 0
    }

    if (OPEN_TAG.test(line) && !SELF_CLOSING.test(line)) {
      const inherited = stack.length ? stack[stack.length - 1][1] : false
      stack.push([indent, DARK.test(line) || inherited])
    }
  }

  if (touched) {
    changed++
    if (WRITE) writeFileSync(file, lines.join('\n'), 'utf8')
  }
}

console.log('')
console.log(WRITE ? '── APPLIED ──' : '── DRY RUN (pass --write to apply) ──')
console.log('')
console.log(`  bg-white → bg-card:  ${converted}`)
console.log(`  files changed:       ${changed}`)
if (skipped.length) console.log(`\n  ${skipped.length} marketing file(s) skipped`)
if (kept.length) {
  console.log(`\n  ${kept.length} left as literal white — on a dark ground, or white by role:`)
  for (const k of kept) console.log(`      ${k}`)
}
console.log('\n  bg-white/<opacity> is never touched: translucent over dark is not a surface.')
if (STRICT && kept.length > 6) process.exitCode = 1
console.log('')
