/**
 * Community -> People.
 *
 * WHY A CODEMOD AND NOT A FIND-AND-REPLACE
 *   "community" is also an ordinary English word, and Landing.tsx uses it three
 *   times in prose ("a growing community of padel players"). A blind replace
 *   would rewrite marketing copy. Every rule below is anchored to a prefix that
 *   only ever appears in code — `t('community.`, `@/pages/community/`,
 *   `'/community`, `tour.community_` — so prose is untouchable by construction.
 *
 * WHY PEOPLE AND NOT PLAYERS
 *   `/players/:playerId` already exists as the player-profile route, so
 *   `/players/groups` would sit directly beside it; and the tab's own directory
 *   tile is called Players, which would have made a tab named Players
 *   containing a tile named Players. People collides with neither, and it is an
 *   everyday word in all eight languages — which also retires the register
 *   problem in the Hindi and Arabic translations of "Community", where the
 *   chosen words read as "society" rather than "your people here".
 *
 * WHAT THIS DOES NOT DO
 *   The old /community/* URLs keep working. App.tsx gains redirects rather than
 *   losing routes: a bookmarked or shared group link is somebody's real link,
 *   and breaking it to tidy a route table is not a trade worth making.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SRC = 'src'

/** Anchored to code-only prefixes. Order matters: longest first. */
const RULES = [
  // Import paths
  [/@\/components\/community\//g, '@/components/people/'],
  [/@\/pages\/community\//g, '@/pages/people/'],
  // Translation namespaces
  [/t\('community\./g, "t('people."],
  [/'community\.([a-z_0-9]+)'/g, "'people.$1'"],
  [/`community\.([a-z_0-9]+)`/g, '`people.$1`'],
  [/tour\.community_/g, 'tour.people_'],
  [/nav\.community/g, 'nav.people'],
  // Route literals — only ever appear quoted or inside a template path
  [/(['"`])\/community(\/|(?=\1))/g, '$1/people$2'],
  // Symbols and cache keys
  [/\bCommunityPage\b/g, 'PeoplePage'],
  [/'community-player-count'/g, "'people-player-count'"],
]

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(p) && !p.startsWith('src/locales')) out.push(p)
  }
  return out
}

let touched = 0
let edits = 0
for (const file of walk(SRC)) {
  const before = readFileSync(file, 'utf8')
  let after = before
  for (const [re, to] of RULES) after = after.replace(re, to)
  if (after !== before) {
    // Count changed lines rather than matches, so the report is readable.
    const a = before.split('\n')
    const b = after.split('\n')
    const n = a.reduce((acc, line, i) => acc + (line === b[i] ? 0 : 1), 0)
    writeFileSync(file, after)
    touched++
    edits += n
    console.log(`${file}: ${n} lines`)
  }
}
console.log(`\n${touched} files, ${edits} lines`)
