#!/usr/bin/env node
/**
 * Codemod: replace the hardcoded brand colour with the `court` design token.
 *
 * WHY THIS EXISTS
 *   `#009688` appears 537 times across src/. The palette exists as tokens but
 *   almost nothing references it, which is why `--color-teal` is not even
 *   emitted into the built CSS while `--color-navy` is. Changing the brand
 *   colour today means 537 edits; after this codemod it means one line.
 *
 * SAFETY
 *   Run this while `--color-court` is still set to #009688 in src/index.css.
 *   Then the change is PURELY structural — every pixel stays identical and the
 *   diff is reviewable as "literal -> token" with no visual noise. Flipping
 *   --color-court to #0F5D54 afterwards is a separate one-line commit that
 *   rebrands the whole app atomically, and reverts just as atomically.
 *
 * USAGE
 *   node scripts/codemod/tokenise-brand-colour.mjs            # dry run
 *   node scripts/codemod/tokenise-brand-colour.mjs --write    # apply
 *   node scripts/codemod/tokenise-brand-colour.mjs --write --verbose
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join, relative, extname } from 'node:path'

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')
const WRITE = process.argv.includes('--write')
const VERBOSE = process.argv.includes('--verbose')

const HEX = '009688'
const TOKEN = 'court'
const CSS_VAR = 'var(--color-court)'

const EXTS = new Set(['.tsx', '.ts', '.jsx', '.js'])
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'vendor'])

/** Tailwind utility prefixes that accept an arbitrary colour value. */
const UTILITIES = [
  'text', 'bg', 'border', 'ring', 'fill', 'stroke', 'outline', 'shadow',
  'from', 'via', 'to', 'decoration', 'divide', 'accent', 'caret',
  'placeholder', 'border-t', 'border-b', 'border-l', 'border-r',
]

/**
 * Ordered replacements. Tailwind arbitrary values are handled first and most
 * specifically so a bare-string rule can never eat one.
 */
function buildRules() {
  const rules = []

  for (const util of UTILITIES) {
    rules.push({
      name: `${util}-[#${HEX}]`,
      // Matches text-[#009688] including any variant prefix (hover:, md:, …)
      // and any trailing opacity modifier (/50), which stays intact.
      re: new RegExp(`\\b${util}-\\[#${HEX}\\]`, 'gi'),
      to: `${util}-${TOKEN}`,
    })
  }

  // Quoted string literals: '#009688' | "#009688" | `#009688`
  // Covers JS constants, inline styles and SVG attributes alike.
  rules.push({
    name: `'#${HEX}' string literal`,
    re: new RegExp(`(['"\`])#${HEX}\\1`, 'gi'),
    to: (_m, q) => `${q}${CSS_VAR}${q}`,
  })

  return rules
}

async function walk(dir, out = []) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.') continue
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

const rules = buildRules()
const files = await walk(SRC)

let filesChanged = 0
let totalReplacements = 0
const perRule = new Map()
const leftovers = []

for (const file of files) {
  const before = readFileSync(file, 'utf8')
  if (!/#009688/i.test(before)) continue

  let after = before
  let fileCount = 0

  for (const rule of rules) {
    const matches = after.match(rule.re)
    if (!matches) continue
    after = after.replace(rule.re, rule.to)
    fileCount += matches.length
    perRule.set(rule.name, (perRule.get(rule.name) ?? 0) + matches.length)
  }

  // Anything still holding the colour needs a human — report, never guess.
  // Includes rgb()/rgba() spellings of the same value, which no textual rule
  // can safely rewrite because the alpha channel carries design intent.
  const BRAND_OTHER = /#009688|rgba?\(\s*0\s*,\s*150\s*,\s*136/i
  if (BRAND_OTHER.test(after)) {
    for (const line of after.split('\n')) {
      if (BRAND_OTHER.test(line)) {
        leftovers.push(`${relative(ROOT, file)}: ${line.trim().slice(0, 110)}`)
      }
    }
  }

  if (after !== before) {
    filesChanged++
    totalReplacements += fileCount
    if (VERBOSE) console.log(`  ${relative(ROOT, file)} — ${fileCount}`)
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
console.log(`  replacements:   ${totalReplacements}`)

if (leftovers.length) {
  console.log('')
  console.log(`  ⚠ ${leftovers.length} occurrence(s) NOT converted — review by hand:`)
  for (const l of leftovers.slice(0, 25)) console.log(`      ${l}`)
  if (leftovers.length > 25) console.log(`      … and ${leftovers.length - 25} more`)
  process.exitCode = 1
} else {
  console.log('')
  console.log('  no unconverted occurrences remain.')
}
console.log('')
