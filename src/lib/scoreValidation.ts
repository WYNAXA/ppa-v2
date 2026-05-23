/**
 * Tennis set score validation based on scoring_format.
 *
 * Returns null if valid, or an error message string if invalid.
 */

interface SetData {
  team1: number
  team2: number
}

function isValidStandardSet(a: number, b: number): string | null {
  const [hi, lo] = a >= b ? [a, b] : [b, a]

  // 7-6 tiebreak
  if (hi === 7 && lo === 6) return null
  // 7-5
  if (hi === 7 && lo === 5) return null
  // 6-X where X is 0–4 (won with 2-game margin)
  if (hi === 6 && lo <= 4) return null
  // 6-6 drawn set (time limit) — allowed
  if (hi === 6 && lo === 6) return null

  return `Score ${a}-${b} isn't a valid standard tennis set. Standard sets go to 6 games (with 2-game lead), 7-5, or 7-6 tiebreak.`
}

function isValidShortSet(a: number, b: number): string | null {
  const [hi, lo] = a >= b ? [a, b] : [b, a]

  // 4-X where X is 0–2 (won with 2-game margin)
  if (hi === 4 && lo <= 2) return null
  // 4-3 (won by 1 — short set tiebreak at 3-3)
  if (hi === 4 && lo === 3) return null
  // 5-4 tiebreak variant
  if (hi === 5 && lo === 4) return null
  // 4-4 drawn (time limit)
  if (hi === 4 && lo === 4) return null
  // 3-3 drawn (time limit)
  if (hi === 3 && lo === 3) return null

  return `Score ${a}-${b} isn't a valid short set. Short sets are first to 4 games (4-0, 4-1, 4-2, 4-3, or 5-4 tiebreak).`
}

export function validateSetScores(
  sets: SetData[],
  scoringFormat: string | null | undefined,
): string | null {
  // No validation for custom or unknown formats
  if (!scoringFormat || scoringFormat === 'custom') return null

  for (let i = 0; i < sets.length; i++) {
    const { team1, team2 } = sets[i]
    let error: string | null = null

    if (scoringFormat === 'standard' || scoringFormat === 'one_set') {
      error = isValidStandardSet(team1, team2)
    } else if (scoringFormat === 'short_sets') {
      error = isValidShortSet(team1, team2)
    }

    if (error) {
      return `Set ${i + 1}: ${error}`
    }
  }

  return null
}
