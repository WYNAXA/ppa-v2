/**
 * Round-robin fixture generator using the circle (polygon) method.
 *
 * For N entities:
 * - If N is odd, a phantom BYE is added to make it even.
 * - Entity[0] is fixed; the rest rotate clockwise each round.
 * - Produces ceil(N-1) rounds, each with floor(N/2) pairings.
 * - Each entity gets exactly one BYE (if N is odd) or zero (if even).
 *
 * @param entities - Array of IDs (team IDs or player IDs)
 * @param roundNumber - 0-indexed round to generate (0 = first round)
 * @returns { pairings: [entityA, entityB][], bye: string | null }
 */
export function generateRoundRobinRound(
  entities: string[],
  roundNumber: number
): { pairings: [string, string][]; bye: string | null } {
  const BYE = '__BYE__'
  const items = [...entities]

  // If odd, add phantom BYE
  if (items.length % 2 !== 0) {
    items.push(BYE)
  }

  const n = items.length
  const totalRounds = n - 1

  // Normalize round number to stay within bounds
  const round = roundNumber % totalRounds

  // Circle method: fix items[0], rotate the rest
  // For round R, the rotated array is:
  //   [items[0], rotated[1], rotated[2], ..., rotated[n-1]]
  // where rotated is items[1..n-1] shifted by R positions
  const fixed = items[0]
  const rotating = items.slice(1)

  // Rotate: shift left by `round` positions
  const rotated = [
    ...rotating.slice(round % rotating.length),
    ...rotating.slice(0, round % rotating.length),
  ]

  const all = [fixed, ...rotated]

  // Pair: first with last, second with second-to-last, etc.
  const pairings: [string, string][] = []
  let bye: string | null = null

  for (let i = 0; i < n / 2; i++) {
    const a = all[i]
    const b = all[n - 1 - i]

    if (a === BYE) {
      bye = b
    } else if (b === BYE) {
      bye = a
    } else {
      pairings.push([a, b])
    }
  }

  return { pairings, bye }
}

/**
 * Calculate total rounds needed for a round-robin tournament.
 * If N is odd, it takes N rounds (each entity gets one bye).
 * If N is even, it takes N-1 rounds.
 */
export function totalRoundsForRoundRobin(entityCount: number): number {
  if (entityCount <= 1) return 0
  return entityCount % 2 === 0 ? entityCount - 1 : entityCount
}
