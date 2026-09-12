// Shared domain types for PPA V2

import type { Database, Json } from './database.types'

/**
 * Shorthands over the generated schema.
 *
 * Write payloads in this codebase were typed `Record<string, unknown>` or
 * `Record<string, any>`, which tells TypeScript nothing: it cannot see which
 * columns the object actually sets, so it neither catches a missing NOT NULL
 * column nor a misspelled one. That is how the Mexicano fixture generator in
 * LeagueDetail shipped without `match_time` — a column that is NOT NULL with no
 * default — and failed with a 23502 on every single use.
 *
 * Use `TableInsert<'matches'>` for an insert payload and `TableUpdate<'matches'>`
 * for an update, and the compiler checks the payload against the real table.
 */
export type Row<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']
export type TableInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']
export type TableUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']

export interface Profile {
  id: string
  name: string
  email?: string | null
  avatar_url?: string | null
  playtomic_level?: number | null
  /**
   * Career ELO. Optional because plenty of queries select a narrow column set;
   * declaring it here is what lets the ELO preview stop casting through `any`.
   */
  internal_ranking?: number | null
  matches_played?: number | null
  /**
   * Location and onboarding, previously declared only on a DUPLICATE `Profile`
   * interface inside AuthContext — which typed playtomic_level and
   * internal_ranking as `number` where the columns are nullable, and `email` as
   * a required string. Two Profile types meant two chances to get the schema
   * wrong. All optional because most queries select a narrow column set.
   */
  city?: string | null
  latitude?: number | null
  longitude?: number | null
  onboarding_completed_at?: string | null
}

export interface Match {
  id: string
  match_date: string
  // matches.match_time and match_type are BOTH `NOT NULL` in the database.
  // Typing them nullable here is what made PlayAnotherSheet, RecordResultSheet
  // and MatchDetail's "play another" all fail to typecheck: each copies these
  // straight from a source match into a new insert, and the Insert type
  // correctly refuses a null for a NOT NULL column.
  match_time: string
  match_type: string
  status: string
  player_ids: string[]
  team1_player_ids: string[] | null
  team2_player_ids: string[] | null
  context_type: string | null
  booked_venue_name: string | null
  booked_court_number: number | null
  created_by: string | null
  group_id: string | null
  league_id: string | null
  poll_id: string | null
  notes: string | null
  travel_notes: string | null
  /**
    * matches.drivers is nullable jsonb. No consumer reads this field off `Match`
    * — every driver reader uses travelInfo.drivers (TravelPlayer[]) from
    * lib/travelUtils. Typed as `Json | null` to match the DB column exactly.
    */
  drivers: Json | null
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
  result_type: string | null
  verification_status: string | null
  submitted_by: string | null
  is_friendly: boolean | null
  created_at: string | null
}

export interface RankingChange {
  id: string
  player_id: string
  match_result_id: string
  points_change: number
  new_ranking: number
  old_ranking: number
}
