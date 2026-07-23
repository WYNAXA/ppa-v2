import { supabase } from '@/lib/supabase'
import { classifyKernel } from '@/lib/setClassification'

export interface SetStats {
  totalSets: number
  wins: number
  draws: number
  losses: number
  winRate: number
}

export async function fetchSetStats(userId: string): Promise<SetStats> {
  const { data } = await supabase
    .from('match_results')
    .select('team1_players, team2_players, sets_data')
    .or(`team1_players.cs.{${userId}},team2_players.cs.{${userId}}`)
    .eq('verification_status', 'verified')
    .not('is_friendly', 'is', true)
    .order('created_at', { ascending: true })

  const results = data ?? []
  let wins = 0, losses = 0, draws = 0

  for (const r of results) {
    const inTeam1 = (r.team1_players as string[]).includes(userId)
    const sets = (r.sets_data ?? []) as Array<Record<string, unknown>>

    for (const s of sets) {
      const g1 = (s.team1 ?? s.team1_score ?? 0) as number
      const g2 = (s.team2 ?? s.team2_score ?? 0) as number
      const { isVoid } = classifyKernel(g1, g2)
      if (isVoid) continue

      if (g1 === g2) {
        draws++
      } else {
        const userTeamWon = (inTeam1 && g1 > g2) || (!inTeam1 && g2 > g1)
        if (userTeamWon) wins++
        else losses++
      }
    }
  }

  const totalSets = wins + losses + draws
  const winRate = totalSets > 0 ? Math.round((wins / totalSets) * 100) : 0

  return { totalSets, wins, draws, losses, winRate }
}
