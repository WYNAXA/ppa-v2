#!/usr/bin/env node
/**
 * One-shot: add the keys the redesigned bottom nav and Play sheet need to all
 * eight locale files, in each file's own quoting style.
 *
 * WHY A SCRIPT AND NOT EIGHT HAND EDITS
 *   en.ts uses bare identifiers, the seven translated files use JSON-quoted
 *   keys. Hand-editing eight files invites exactly the kind of drift that leaves
 *   one language silently falling back to English. This inserts into every file
 *   from one source of truth and reports any it could not patch.
 *
 * It is idempotent: a key already present is left alone.
 *
 *   node scripts/codemod/add-nav-keys.mjs           # dry run
 *   node scripts/codemod/add-nav-keys.mjs --write
 */

import { readFileSync, writeFileSync } from 'node:fs'

const WRITE = process.argv.includes('--write')

/** section -> key -> per-locale string */
const ADDITIONS = {
  nav: {
    today:   { en: 'Today',   es: 'Hoy',        fr: "Aujourd'hui", it: 'Oggi',      pt: 'Hoje',      sv: 'Idag',   hi: 'आज',      ar: 'اليوم' },
    players: { en: 'Players', es: 'Jugadores',  fr: 'Joueurs',     it: 'Giocatori', pt: 'Jogadores', sv: 'Spelare', hi: 'खिलाड़ी',  ar: 'اللاعبون' },
    courts:  { en: 'Courts',  es: 'Pistas',     fr: 'Terrains',    it: 'Campi',     pt: 'Campos',    sv: 'Banor',  hi: 'कोर्ट',    ar: 'الملاعب' },
    me:      { en: 'Me',      es: 'Yo',         fr: 'Moi',         it: 'Io',        pt: 'Eu',        sv: 'Jag',    hi: 'मैं',       ar: 'أنا' },
  },
  play: {
    // These two were rendered from inline English fallbacks in Play.tsx, so
    // they never translated. Adding them properly removes the hardcoded string.
    find_coach:  { en: 'Find a coach', es: 'Buscar entrenador', fr: 'Trouver un coach', it: 'Trova un coach', pt: 'Encontrar treinador', sv: 'Hitta tränare', hi: 'कोच खोजें', ar: 'ابحث عن مدرب' },
    my_waitlist: { en: 'My waitlist',  es: 'Mi lista de espera', fr: "Ma liste d'attente", it: 'La mia lista d’attesa', pt: 'Minha lista de espera', sv: 'Min väntelista', hi: 'मेरी प्रतीक्षा सूची', ar: 'قائمة انتظاري' },
    sheet_all:   { en: 'See everything in Play', es: 'Ver todo en Jugar', fr: 'Voir tout dans Jouer', it: 'Vedi tutto in Gioca', pt: 'Ver tudo em Jogar', sv: 'Se allt i Spela', hi: 'प्ले में सब कुछ देखें', ar: 'عرض كل شيء في اللعب' },
    record_result: { en: 'Record a result', es: 'Registrar resultado', fr: 'Saisir un résultat', it: 'Registra un risultato', pt: 'Registar resultado', sv: 'Registrera resultat', hi: 'परिणाम दर्ज करें', ar: 'تسجيل نتيجة' },
  },
}

const LOCALES = ['en', 'es', 'fr', 'it', 'pt', 'sv', 'hi', 'ar']

/** Quote a value for a single-quoted TS literal. */
const sq = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
/** Quote a value for a double-quoted JSON-ish literal. */
const dq = (s) => JSON.stringify(s)

let failures = 0
let added = 0

for (const loc of LOCALES) {
  const path = `src/locales/${loc}.ts`
  let src = readFileSync(path, 'utf8')
  const quoted = /^\s*"common":/m.test(src) // translated files quote their keys
  const perFile = []

  for (const [section, keys] of Object.entries(ADDITIONS)) {
    // Find the opening line of this top-level section, either style.
    const open = new RegExp(`^(\\s*)(?:"${section}"|${section}):\\s*\\{`, 'm')
    const m = src.match(open)
    if (!m) {
      console.error(`  ✗ ${path}: no "${section}" section found`)
      failures++
      continue
    }
    const indent = m[1] + '  '
    const insertAt = m.index + m[0].length

    // Build only the keys that are genuinely missing from this section.
    // Scope the "already present" test to the section body, not the whole file.
    const bodyStart = insertAt
    const bodyEnd = findSectionEnd(src, bodyStart)
    const body = src.slice(bodyStart, bodyEnd)

    const lines = []
    for (const [key, values] of Object.entries(keys)) {
      const present = new RegExp(`(?:^|\\n)\\s*(?:"${key}"|${key})\\s*:`).test(body)
      if (present) continue
      const value = values[loc]
      if (value == null) {
        console.error(`  ✗ ${path}: no ${loc} translation supplied for ${section}.${key}`)
        failures++
        continue
      }
      lines.push(
        quoted
          ? `${indent}${dq(key)}: ${dq(value)},`
          : `${indent}${key}: ${sq(value)},`
      )
      perFile.push(`${section}.${key}`)
    }
    if (!lines.length) continue

    src = src.slice(0, insertAt) + '\n' + lines.join('\n') + src.slice(insertAt)
    added += lines.length
  }

  if (perFile.length) {
    console.log(`  ${path}  +${perFile.length}  (${perFile.join(', ')})`)
    if (WRITE) writeFileSync(path, src, 'utf8')
  } else {
    console.log(`  ${path}  — already complete`)
  }
}

/** Return the index just past the matching close brace of a section body. */
function findSectionEnd(src, from) {
  let depth = 1
  for (let i = from; i < src.length; i++) {
    const c = src[i]
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return src.length
}

console.log('')
console.log(WRITE ? `── APPLIED: ${added} key(s) ──` : `── DRY RUN: would add ${added} key(s) ──`)
if (failures) {
  console.log(`  ⚠ ${failures} problem(s) above`)
  process.exitCode = 1
}
