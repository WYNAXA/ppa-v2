import type { Json } from './database.types'

/**
 * A set score as stored in the sets_data JSON column.
 *
 * The index signature carries all fields the DB has ever stored — including
 * ones this codebase has never named (team1_players, team2_players,
 * tiebreak_score, and anything added later). The named fields are the ones
 * the UI actually reads; the rest survive the round-trip untouched.
 */
export interface ParsedSetScore {
  team1: number | ''
  team2: number | ''
  [key: string]: unknown
}

/**
 * Parse a `sets_data` JSON column into a typed ParsedSetScore[].
 *
 * Preserves every field on each set object. The only normalisation is the
 * legacy score-key alias: when `team1_score` / `team2_score` are present,
 * their values are written into `team1` / `team2` and the `*_score` keys
 * are deleted. Every SQL reader already uses `COALESCE(team1, team1_score)`,
 * so `team1` wins — this converges the dual-key format rather than
 * perpetuating it.
 *
 * Returns [] on null, non-array, or unparseable input — never throws.
 */
export function parseSetsData(raw: Json | null | undefined): ParsedSetScore[] {
  if (raw == null) return []

  let arr: unknown[]
  if (typeof raw === 'string') {
    try { arr = JSON.parse(raw) } catch { return [] }
    if (!Array.isArray(arr)) return []
  } else if (Array.isArray(raw)) {
    arr = raw
  } else {
    return []
  }

  return arr.map((item) => {
    if (typeof item !== 'object' || item === null) {
      return { team1: '' as const, team2: '' as const }
    }

    // Spread preserves every field — known and unknown.
    const s = { ...(item as Record<string, unknown>) }

    // Canonicalise the legacy *_score keys into team1/team2, then remove them.
    if (s.team1_score !== undefined && s.team1 === undefined) {
      s.team1 = s.team1_score
    }
    if (s.team2_score !== undefined && s.team2 === undefined) {
      s.team2 = s.team2_score
    }
    delete s.team1_score
    delete s.team2_score

    // Ensure team1/team2 are the expected type.
    if (typeof s.team1 !== 'number') s.team1 = ''
    if (typeof s.team2 !== 'number') s.team2 = ''

    return s as ParsedSetScore
  })
}

/**
 * Convert a ParsedSetScore[] back to Json for writing to sets_data /
 * proposed_sets_data. The index signature means every field the original
 * row carried is still on the object — setsToJson just needs to produce
 * a value the Json type accepts.
 */
export function setsToJson(sets: unknown[] | null): Json {
  if (!sets) return null
  return JSON.parse(JSON.stringify(sets)) as Json
}
