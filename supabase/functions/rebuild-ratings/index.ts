// ── rebuild-ratings Edge Function ────────────────────────────────────────────
// Deterministic full rebuild of all ELO ratings from verified match history.
// Uses the SAME shared ELO module as process-elo — single source of truth.
//
// POST /functions/v1/rebuild-ratings
// Body: { "dry_run": true }   ← preview only (default)
//       { "dry_run": false }  ← commit rebuild
//
// Requires SUPABASE_SERVICE_ROLE_KEY (bypasses RLS).
// ────────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { processTeamElo, classifyMatch } from '../_shared/elo.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function playtomicToElo(level: number): number {
  return Math.max(600, Math.min(2500, Math.round(1500 + (level - 2.5) * 270)))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  let mode: 'dry_run' | 'emit_sql' | 'commit' = 'dry_run'
  try {
    const text = await req.text()
    console.log(`[rebuild-ratings] raw body: ${text}`)
    if (text) {
      const body = JSON.parse(text)
      if (body?.emit_sql === true) mode = 'emit_sql'
      else if (body?.dry_run === false) mode = 'commit'
    }
  } catch (e) {
    console.warn(`[rebuild-ratings] body parse failed, defaulting to dry_run: ${e}`)
  }

  console.log(`[rebuild-ratings] mode=${mode}`)

  // ── 1. Fetch all profiles for seeding ──
  const { data: allProfiles } = await supabase
    .from('profiles')
    .select('id, name, internal_ranking, matches_played, peak_elo, peak_elo_date, playtomic_level')

  if (!allProfiles) {
    return new Response(JSON.stringify({ error: 'Failed to fetch profiles' }), {
      status: 500, headers: corsHeaders,
    })
  }

  // Build seed map + current state map
  const seedElo: Record<string, number> = {}
  const currentState: Record<string, { elo: number; mp: number; peak: number }> = {}
  const nameMap: Record<string, string> = {}

  for (const p of allProfiles) {
    const seed = p.playtomic_level != null ? playtomicToElo(p.playtomic_level) : 1230
    seedElo[p.id] = seed
    currentState[p.id] = {
      elo: p.internal_ranking ?? 1230,
      mp: p.matches_played ?? 0,
      peak: p.peak_elo ?? 0,
    }
    nameMap[p.id] = p.name ?? 'Unknown'
  }

  // ── 2. Fetch all verified non-friendly match results in chronological order ──
  const { data: matchResults, error: mrErr } = await supabase
    .from('match_results')
    .select('id, match_id, team1_players, team2_players, result_type, sets_data, is_friendly, verified_at, created_at')
    .eq('verification_status', 'verified')
    .order('verified_at', { ascending: true, nullsFirst: false })

  if (mrErr || !matchResults) {
    return new Response(JSON.stringify({ error: 'Failed to fetch match_results', detail: mrErr }), {
      status: 500, headers: corsHeaders,
    })
  }

  // Secondary sort: for rows with same verified_at, sort by created_at then id
  matchResults.sort((a: any, b: any) => {
    const va = a.verified_at ?? a.created_at
    const vb = b.verified_at ?? b.created_at
    if (va < vb) return -1
    if (va > vb) return 1
    if (a.created_at < b.created_at) return -1
    if (a.created_at > b.created_at) return 1
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })

  // ── 3. Initialize running state from seeds ──
  const runningRatings: Record<string, number> = {}
  const runningPlayed: Record<string, number> = {}
  const runningPeak: Record<string, number> = {}
  const runningPeakDate: Record<string, string | null> = {}

  for (const p of allProfiles) {
    runningRatings[p.id] = seedElo[p.id]
    runningPlayed[p.id] = 0
    runningPeak[p.id] = seedElo[p.id]
    runningPeakDate[p.id] = null
  }

  // ── 4. Process matches sequentially ──
  const profileIds = new Set(allProfiles.map(p => p.id))
  const ratingHistoryRows: any[] = []
  const rankingChangesRows: any[] = []
  const processedMatchResultIds: string[] = []
  let matchesProcessed = 0
  let matchesSkippedFriendly = 0
  let matchesSkippedVoid = 0
  let matchesSkippedGhost = 0
  let matchesSkippedEmpty = 0

  for (const mr of matchResults) {
    // Skip friendly matches
    if (mr.is_friendly) {
      processedMatchResultIds.push(mr.id)
      matchesSkippedFriendly++
      continue
    }

    const team1 = (mr.team1_players ?? []) as string[]
    const team2 = (mr.team2_players ?? []) as string[]
    if (team1.length === 0 || team2.length === 0) {
      processedMatchResultIds.push(mr.id)
      matchesSkippedEmpty++
      continue
    }

    // Skip matches containing ghost players (IDs not in profiles)
    const allPlayers = [...team1, ...team2]
    const hasGhost = allPlayers.some(pid => !profileIds.has(pid))
    if (hasGhost) {
      processedMatchResultIds.push(mr.id)
      matchesSkippedGhost++
      continue
    }

    // Classify the match
    const classification = classifyMatch(mr.result_type, mr.sets_data ?? [])
    if (classification === null) {
      // Void set — skip, mark processed
      processedMatchResultIds.push(mr.id)
      matchesSkippedVoid++
      continue
    }

    const { team1Score, team2Score, dominant } = classification
    const team1Won = mr.result_type === 'team1_win'
    const isDraw = mr.result_type === 'draw'

    // Ensure all players have running state (handle players not in profiles — guests filtered out)
    for (const pid of [...team1, ...team2]) {
      if (!(pid in runningRatings)) {
        runningRatings[pid] = 1230
        runningPlayed[pid] = 0
        runningPeak[pid] = 1230
        runningPeakDate[pid] = null
      }
    }

    // Compute ELO changes using the shared module
    const team1Results = processTeamElo({
      playerIds: team1,
      opponentIds: team2,
      playerRatings: runningRatings,
      matchesPlayed: runningPlayed,
      actualScore: team1Score,
      isDominant: dominant,
    })

    const team2Results = processTeamElo({
      playerIds: team2,
      opponentIds: team1,
      playerRatings: runningRatings,
      matchesPlayed: runningPlayed,
      actualScore: team2Score,
      isDominant: dominant,
    })

    const allResults = { ...team1Results, ...team2Results }

    // Apply results to running state + build history rows
    for (const [playerId, data] of Object.entries(allResults)) {
      runningRatings[playerId] = data.ratingAfter
      runningPlayed[playerId] = (runningPlayed[playerId] || 0) + 1

      const matchDate = (mr.verified_at ?? mr.created_at ?? '').split('T')[0]
      if (data.ratingAfter > (runningPeak[playerId] ?? 0)) {
        runningPeak[playerId] = data.ratingAfter
        runningPeakDate[playerId] = matchDate
      }

      const opponentIds = team1.includes(playerId) ? team2 : team1
      const opponentAvg = Math.round(
        opponentIds.reduce((s, id) => s + (runningRatings[id] || 1230), 0) / opponentIds.length
      )
      // Note: opponentAvg here uses post-update ratings for opponents already processed
      // in this match. This matches process-elo which reads pre-match ratings (snapshot).
      // But we snapshotted via processTeamElo which uses the runningRatings AT CALL TIME
      // (before we applied this match's results). So this is correct — the snapshot was
      // taken before the for-loop updates. We just need opponent_avg from the snapshot:
      const opponentAvgFromSnapshot = Math.round(
        opponentIds.reduce((s, id) => s + ((team1Results[id]?.ratingBefore ?? team2Results[id]?.ratingBefore) || 1230), 0) / opponentIds.length
      )

      const onTeam1 = team1.includes(playerId)
      const isWinner = onTeam1 ? team1Won : !team1Won && !isDraw

      ratingHistoryRows.push({
        user_id: playerId,
        match_result_id: mr.id,
        rating_before: data.ratingBefore,
        rating_after: data.ratingAfter,
        rating_change: data.ratingChange,
        expected_score: data.expectedScore,
        actual_score: onTeam1 ? team1Score : team2Score,
        k_factor: data.kFactor,
        opponent_ids: opponentIds,
        opponent_avg_rating: opponentAvgFromSnapshot,
        is_provisional: (runningPlayed[playerId] - 1) < 10, // played count BEFORE this match
      })

      rankingChangesRows.push({
        player_id: playerId,
        match_id: mr.match_id,
        match_result_id: mr.id,
        previous_points: data.ratingBefore,
        new_points: data.ratingAfter,
        points_change: data.ratingChange,
        opponent_ids: opponentIds,
        opponent_avg_rating: opponentAvgFromSnapshot,
        is_winner: isWinner,
      })
    }

    processedMatchResultIds.push(mr.id)
    matchesProcessed++
  }

  // ── 5. Build per-player comparison ──
  const playerComparison = allProfiles
    .filter((p) => currentState[p.id].mp > 0 || (runningPlayed[p.id] ?? 0) > 0)
    .map((p) => ({
      id: p.id,
      name: nameMap[p.id],
      seed_elo: seedElo[p.id],
      current_elo: currentState[p.id].elo,
      rebuilt_elo: runningRatings[p.id] ?? seedElo[p.id],
      elo_delta: (runningRatings[p.id] ?? seedElo[p.id]) - currentState[p.id].elo,
      current_matches_played: currentState[p.id].mp,
      rebuilt_matches_played: runningPlayed[p.id] ?? 0,
      mp_delta: (runningPlayed[p.id] ?? 0) - currentState[p.id].mp,
      current_peak_elo: currentState[p.id].peak,
      rebuilt_peak_elo: runningPeak[p.id] ?? seedElo[p.id],
    }))
    .sort((a, b) => Math.abs(b.mp_delta) - Math.abs(a.mp_delta))

  // ── 6. DRY_RUN: return comparison without writing ──
  if (mode === 'dry_run') {
    return new Response(JSON.stringify({
      mode: 'dry_run',
      matches_total: matchResults.length,
      matches_processed: matchesProcessed,
      matches_skipped: matchesSkippedFriendly + matchesSkippedVoid + matchesSkippedGhost + matchesSkippedEmpty,
      skipped_breakdown: { friendly: matchesSkippedFriendly, void: matchesSkippedVoid, ghost: matchesSkippedGhost, empty_teams: matchesSkippedEmpty },
      rating_history_rows: ratingHistoryRows.length,
      ranking_changes_rows: rankingChangesRows.length,
      players: playerComparison,
    }, null, 2), { headers: corsHeaders })
  }

  // ── 6b. EMIT_SQL: output atomic SQL script ──
  if (mode === 'emit_sql') {
    let sql = `-- ══════════════════════════════════════════════════════════════════════════\n`
    sql += `-- REBUILD ALL RATINGS — atomic transaction\n`
    sql += `-- Generated by rebuild-ratings at ${new Date().toISOString()}\n`
    const totalSkipped = matchesSkippedFriendly + matchesSkippedVoid + matchesSkippedGhost + matchesSkippedEmpty
    sql += `-- Matches: ${matchResults.length} total, ${matchesProcessed} processed, ${totalSkipped} skipped\n`
    sql += `--   Skipped: ${matchesSkippedFriendly} friendly, ${matchesSkippedVoid} void, ${matchesSkippedGhost} ghost, ${matchesSkippedEmpty} empty\n`
    sql += `-- Rating history rows: ${ratingHistoryRows.length}\n`
    sql += `-- Ranking changes rows: ${rankingChangesRows.length}\n`
    sql += `-- Players affected: ${playerComparison.length}\n`
    sql += `-- ══════════════════════════════════════════════════════════════════════════\n\n`
    sql += `BEGIN;\n\n`
    sql += `-- Suppress giant_slayer badge trigger during rebuild\n`
    sql += `SET LOCAL app.skip_badge_triggers = 'true';\n\n`

    // 3. Delete existing history
    sql += `-- Clean slate for rebuildable tables\n`
    sql += `DELETE FROM ranking_changes;\n`
    sql += `DELETE FROM rating_history;\n\n`

    // 4. Bulk INSERT rating_history
    sql += `-- Rating history (${ratingHistoryRows.length} rows)\n`
    sql += `INSERT INTO rating_history (\n`
    sql += `  user_id, match_result_id, rating_before, rating_after, rating_change,\n`
    sql += `  expected_score, actual_score, k_factor, opponent_ids, opponent_avg_rating, is_provisional\n`
    sql += `) VALUES\n`
    sql += ratingHistoryRows.map((r, i) => {
      const oppIds = (r.opponent_ids as string[]).map((id: string) => `'${id}'`).join(',')
      return `  ('${r.user_id}', '${r.match_result_id}', ${r.rating_before}, ${r.rating_after}, ${r.rating_change}, ${r.expected_score}, ${r.actual_score}, ${r.k_factor}, ARRAY[${oppIds}]::uuid[], ${r.opponent_avg_rating}, ${r.is_provisional})${i < ratingHistoryRows.length - 1 ? ',' : ';'}`
    }).join('\n')
    sql += '\n\n'

    // 5. Bulk INSERT ranking_changes
    sql += `-- Ranking changes (${rankingChangesRows.length} rows)\n`
    sql += `INSERT INTO ranking_changes (\n`
    sql += `  player_id, match_id, match_result_id, previous_points, new_points,\n`
    sql += `  points_change, opponent_ids, opponent_avg_rating, is_winner\n`
    sql += `) VALUES\n`
    sql += rankingChangesRows.map((r, i) => {
      const oppIds = (r.opponent_ids as string[]).map((id: string) => `'${id}'`).join(',')
      return `  ('${r.player_id}', '${r.match_id}', '${r.match_result_id}', ${r.previous_points}, ${r.new_points}, ${r.points_change}, ARRAY[${oppIds}]::uuid[], ${r.opponent_avg_rating}, ${r.is_winner})${i < rankingChangesRows.length - 1 ? ',' : ';'}`
    }).join('\n')
    sql += '\n\n'

    // 6. Bulk UPDATE profiles using VALUES pattern
    const affectedPlayers = allProfiles.filter(p =>
      (runningPlayed[p.id] ?? 0) > 0 || currentState[p.id].mp > 0
    )
    sql += `-- Update profiles (${affectedPlayers.length} players)\n`
    sql += `UPDATE profiles AS p SET\n`
    sql += `  internal_ranking = v.new_elo,\n`
    sql += `  matches_played = v.new_mp,\n`
    sql += `  is_provisional = v.new_mp < 10,\n`
    sql += `  peak_elo = v.new_peak,\n`
    sql += `  peak_elo_date = v.new_peak_date\n`
    sql += `FROM (VALUES\n`
    sql += affectedPlayers.map((p, i) => {
      const newElo = runningRatings[p.id] ?? seedElo[p.id]
      const newMp = runningPlayed[p.id] ?? 0
      const newPeak = runningPeak[p.id] ?? seedElo[p.id]
      const newPeakDate = runningPeakDate[p.id]
      const peakDateSql = newPeakDate ? `'${newPeakDate}'::date` : 'NULL'
      return `  ('${p.id}'::uuid, ${newElo}, ${newMp}, ${newPeak}, ${peakDateSql})${i < affectedPlayers.length - 1 ? ',' : ''}`
    }).join('\n')
    sql += `\n) AS v(id, new_elo, new_mp, new_peak, new_peak_date)\n`
    sql += `WHERE p.id = v.id;\n\n`

    // 7. Mark all verified match_results as elo_processed
    // Both processed (154) and skipped (23 friendly/void) get elo_processed=true
    // to match process-elo behaviour
    sql += `-- Mark ALL verified match_results as elo_processed (matches process-elo behaviour)\n`
    sql += `UPDATE match_results SET elo_processed = true\n`
    sql += `WHERE verification_status = 'verified' AND elo_processed IS NOT TRUE;\n\n`

    sql += `COMMIT;\n`

    // Return as plain text so it can be copy-pasted into SQL Editor
    return new Response(sql, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/plain; charset=utf-8',
      },
    })
  }

  // ── 7. COMMIT MODE — write everything ──
  console.log(`[rebuild-ratings] COMMITTING: ${matchesProcessed} matches, ${ratingHistoryRows.length} rating_history, ${rankingChangesRows.length} ranking_changes`)

  // Suppress giant_slayer trigger during rebuild
  await supabase.rpc('set_config', { setting: 'app.skip_badge_triggers', value: 'true' }).catch(() => {
    // set_config RPC may not exist yet; fall back to raw SQL
    console.warn('[rebuild-ratings] set_config RPC unavailable, giant_slayer trigger may fire')
  })

  // 7a. Delete existing rating_history and ranking_changes
  const { error: delRH } = await supabase.from('rating_history').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (delRH) console.error('[rebuild-ratings] delete rating_history error:', delRH)

  const { error: delRC } = await supabase.from('ranking_changes').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (delRC) console.error('[rebuild-ratings] delete ranking_changes error:', delRC)

  // 7b. Insert rebuilt rating_history in batches
  for (let i = 0; i < ratingHistoryRows.length; i += 100) {
    const batch = ratingHistoryRows.slice(i, i + 100)
    const { error } = await supabase.from('rating_history').insert(batch)
    if (error) console.error(`[rebuild-ratings] rating_history batch ${i} error:`, error)
  }

  // 7c. Insert rebuilt ranking_changes in batches
  for (let i = 0; i < rankingChangesRows.length; i += 100) {
    const batch = rankingChangesRows.slice(i, i + 100)
    const { error } = await supabase.from('ranking_changes').insert(batch)
    if (error) console.error(`[rebuild-ratings] ranking_changes batch ${i} error:`, error)
  }

  // 7d. Update all profiles
  for (const p of allProfiles) {
    const newElo = runningRatings[p.id] ?? seedElo[p.id]
    const newMp = runningPlayed[p.id] ?? 0
    const newPeak = runningPeak[p.id] ?? seedElo[p.id]
    const newPeakDate = runningPeakDate[p.id] ?? null

    await supabase
      .from('profiles')
      .update({
        internal_ranking: newElo,
        matches_played: newMp,
        is_provisional: newMp < 10,
        peak_elo: newPeak,
        peak_elo_date: newPeakDate,
      })
      .eq('id', p.id)
  }

  // 7e. Mark all processed match_results as elo_processed
  for (let i = 0; i < processedMatchResultIds.length; i += 100) {
    const batch = processedMatchResultIds.slice(i, i + 100)
    await supabase
      .from('match_results')
      .update({ elo_processed: true })
      .in('id', batch)
  }

  return new Response(JSON.stringify({
    mode: 'commit',
    committed: true,
    matches_processed: matchesProcessed,
    matches_skipped: matchesSkippedFriendly + matchesSkippedVoid + matchesSkippedGhost + matchesSkippedEmpty,
    rating_history_rows: ratingHistoryRows.length,
    ranking_changes_rows: rankingChangesRows.length,
    players: playerComparison,
  }, null, 2), { headers: corsHeaders })
})
