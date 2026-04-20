// Shared domain types for PPA V2

export interface Profile {
  id: string
  name: string
  email: string
  avatar_url?: string | null
  playtomic_level?: number | null
  ranking_points?: number | null
}

export interface Match {
  id: string
  match_date: string
  match_time: string | null
  match_type: string | null
  status: string
  player_ids: string[]
  context_type: string | null
  booked_venue_name: string | null
  booked_court_number: number | null
  created_by: string | null
  group_id: string | null
  notes: string | null
  created_at: string
  updated_at?: string | null
}

export interface SetScore {
  team1: number | ''
  team2: number | ''
}

export interface MatchResult {
  id: string
  match_id: string
  team1_players: string[]
  team2_players: string[]
  team1_score: number
  team2_score: number
  sets_data: SetScore[] | null
  result_type: string
  verification_status: string
  submitted_by: string | null
  is_friendly: boolean | null
  created_at: string
}

export interface RankingChange {
  id: string
  player_id: string
  match_result_id: string
  points_change: number
  new_ranking: number
  old_ranking: number
}
