export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      activities: {
        Row: {
          activity_type: string
          created_at: string
          entity_id: string | null
          group_id: string | null
          id: string
          metadata: Json | null
          user_id: string
        }
        Insert: {
          activity_type: string
          created_at?: string
          entity_id?: string | null
          group_id?: string | null
          id?: string
          metadata?: Json | null
          user_id: string
        }
        Update: {
          activity_type?: string
          created_at?: string
          entity_id?: string | null
          group_id?: string | null
          id?: string
          metadata?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      booking_payments: {
        Row: {
          amount_pence: number
          application_fee_pence: number
          booking_id: string
          covered_player_ids: Json
          created_at: string
          id: string
          payer_id: string | null
          refunded_amount_pence: number
          refunded_at: string | null
          share_count: number
          status: string
          stripe_payment_intent_id: string
          stripe_refund_id: string | null
        }
        Insert: {
          amount_pence: number
          application_fee_pence?: number
          booking_id: string
          covered_player_ids?: Json
          created_at?: string
          id?: string
          payer_id?: string | null
          refunded_amount_pence?: number
          refunded_at?: string | null
          share_count?: number
          status?: string
          stripe_payment_intent_id: string
          stripe_refund_id?: string | null
        }
        Update: {
          amount_pence?: number
          application_fee_pence?: number
          booking_id?: string
          covered_player_ids?: Json
          created_at?: string
          id?: string
          payer_id?: string | null
          refunded_amount_pence?: number
          refunded_at?: string | null
          share_count?: number
          status?: string
          stripe_payment_intent_id?: string
          stripe_refund_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "court_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          booked_by: string
          booker_stripe_customer_id: string | null
          booker_stripe_pi_id: string | null
          booking_reference: string | null
          booking_type: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          court_id: string
          created_at: string | null
          deadline_reminder_sent: boolean
          duration_minutes: number
          end_at: string
          external_venue_ref: string | null
          guest_players: Json
          id: string
          match_id: string | null
          notes: string | null
          occurrence_id: string | null
          owner_name: string | null
          owner_user_id: string | null
          paid_player_ids: Json
          payment_deadline: string | null
          payment_links: Json
          payment_links_sent: boolean
          payment_state: string | null
          player_ids: string[] | null
          price_currency: string | null
          price_per_player_pence: number | null
          purpose: string | null
          recurrence_group_id: string | null
          reservation_state: string
          source: string | null
          start_at: string
          status: string
          stripe_account_id: string | null
          stripe_payment_intent_id: string | null
          total_price_pence: number | null
          updated_at: string | null
          venue_id: string
        }
        Insert: {
          booked_by: string
          booker_stripe_customer_id?: string | null
          booker_stripe_pi_id?: string | null
          booking_reference?: string | null
          booking_type?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          court_id: string
          created_at?: string | null
          deadline_reminder_sent?: boolean
          duration_minutes: number
          end_at: string
          external_venue_ref?: string | null
          guest_players?: Json
          id?: string
          match_id?: string | null
          notes?: string | null
          occurrence_id?: string | null
          owner_name?: string | null
          owner_user_id?: string | null
          paid_player_ids?: Json
          payment_deadline?: string | null
          payment_links?: Json
          payment_links_sent?: boolean
          payment_state?: string | null
          player_ids?: string[] | null
          price_currency?: string | null
          price_per_player_pence?: number | null
          purpose?: string | null
          recurrence_group_id?: string | null
          reservation_state?: string
          source?: string | null
          start_at: string
          status?: string
          stripe_account_id?: string | null
          stripe_payment_intent_id?: string | null
          total_price_pence?: number | null
          updated_at?: string | null
          venue_id: string
        }
        Update: {
          booked_by?: string
          booker_stripe_customer_id?: string | null
          booker_stripe_pi_id?: string | null
          booking_reference?: string | null
          booking_type?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          court_id?: string
          created_at?: string | null
          deadline_reminder_sent?: boolean
          duration_minutes?: number
          end_at?: string
          external_venue_ref?: string | null
          guest_players?: Json
          id?: string
          match_id?: string | null
          notes?: string | null
          occurrence_id?: string | null
          owner_name?: string | null
          owner_user_id?: string | null
          paid_player_ids?: Json
          payment_deadline?: string | null
          payment_links?: Json
          payment_links_sent?: boolean
          payment_state?: string | null
          player_ids?: string[] | null
          price_currency?: string | null
          price_per_player_pence?: number | null
          purpose?: string | null
          recurrence_group_id?: string | null
          reservation_state?: string
          source?: string | null
          start_at?: string
          status?: string
          stripe_account_id?: string | null
          stripe_payment_intent_id?: string | null
          total_price_pence?: number | null
          updated_at?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "venue_event_occurrences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "court_bookings_booked_by_fkey"
            columns: ["booked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "court_bookings_booked_by_fkey"
            columns: ["booked_by"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "court_bookings_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "court_bookings_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "court_bookings_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "court_bookings_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "court_bookings_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_channels: {
        Row: {
          created_at: string | null
          group_id: string | null
          id: string
          match_id: string | null
          name: string
          participants: string[]
          type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          group_id?: string | null
          id?: string
          match_id?: string | null
          name: string
          participants: string[]
          type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          group_id?: string | null
          id?: string
          match_id?: string | null
          name?: string
          participants?: string[]
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_channels_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_channels_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          channel_id: string | null
          created_at: string
          group_id: string
          id: string
          mentions: string[] | null
          message: string
          reply_to_id: string | null
          user_id: string
        }
        Insert: {
          channel_id?: string | null
          created_at?: string
          group_id: string
          id?: string
          mentions?: string[] | null
          message: string
          reply_to_id?: string | null
          user_id: string
        }
        Update: {
          channel_id?: string | null
          created_at?: string
          group_id?: string
          id?: string
          mentions?: string[] | null
          message?: string
          reply_to_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "chat_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_profiles: {
        Row: {
          bio: string | null
          headline: string | null
          specialties: string[]
          updated_at: string
          user_id: string
          years_experience: number | null
        }
        Insert: {
          bio?: string | null
          headline?: string | null
          specialties?: string[]
          updated_at?: string
          user_id: string
          years_experience?: number | null
        }
        Update: {
          bio?: string | null
          headline?: string | null
          specialties?: string[]
          updated_at?: string
          user_id?: string
          years_experience?: number | null
        }
        Relationships: []
      }
      coaching_bookings: {
        Row: {
          created_at: string
          guest_name: string | null
          id: string
          player_id: string | null
          session_id: string
          status: string
        }
        Insert: {
          created_at?: string
          guest_name?: string | null
          id?: string
          player_id?: string | null
          session_id: string
          status?: string
        }
        Update: {
          created_at?: string
          guest_name?: string | null
          id?: string
          player_id?: string | null
          session_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "coaching_bookings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "coaching_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      coaching_sessions: {
        Row: {
          capacity: number
          coach_user_id: string
          court_booking_id: string | null
          court_id: string | null
          created_at: string
          currency: string
          end_at: string
          id: string
          level_max: number | null
          level_min: number | null
          notes: string | null
          price_pence: number | null
          session_type: string
          start_at: string
          status: string
          title: string
          venue_id: string
        }
        Insert: {
          capacity?: number
          coach_user_id: string
          court_booking_id?: string | null
          court_id?: string | null
          created_at?: string
          currency?: string
          end_at: string
          id?: string
          level_max?: number | null
          level_min?: number | null
          notes?: string | null
          price_pence?: number | null
          session_type?: string
          start_at: string
          status?: string
          title: string
          venue_id: string
        }
        Update: {
          capacity?: number
          coach_user_id?: string
          court_booking_id?: string | null
          court_id?: string | null
          created_at?: string
          currency?: string
          end_at?: string
          id?: string
          level_max?: number | null
          level_min?: number | null
          notes?: string | null
          price_pence?: number | null
          session_type?: string
          start_at?: string
          status?: string
          title?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coaching_sessions_court_booking_id_fkey"
            columns: ["court_booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_sessions_court_booking_id_fkey"
            columns: ["court_booking_id"]
            isOneToOne: false
            referencedRelation: "court_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_sessions_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_sessions_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      connections: {
        Row: {
          connected_user_id: string
          created_at: string
          id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          connected_user_id: string
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          connected_user_id?: string
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      contract_terms_templates: {
        Row: {
          body: string
          language: string
          template_key: string
          updated_at: string
        }
        Insert: {
          body: string
          language: string
          template_key: string
          updated_at?: string
        }
        Update: {
          body?: string
          language?: string
          template_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      country_plan_prices: {
        Row: {
          country_code: string
          currency: string
          monthly_price_minor: number
          plan_key: string
          updated_at: string
        }
        Insert: {
          country_code: string
          currency: string
          monthly_price_minor: number
          plan_key: string
          updated_at?: string
        }
        Update: {
          country_code?: string
          currency?: string
          monthly_price_minor?: number
          plan_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "country_plan_prices_plan_key_fkey"
            columns: ["plan_key"]
            isOneToOne: false
            referencedRelation: "standard_plans"
            referencedColumns: ["key"]
          },
        ]
      }
      country_pricing: {
        Row: {
          band_key: string
          confidence: string
          country_code: string
          currency: string
          language: string
          min_fee_minor: number | null
          reference_court_hour_minor: number
          updated_at: string
        }
        Insert: {
          band_key: string
          confidence?: string
          country_code: string
          currency: string
          language?: string
          min_fee_minor?: number | null
          reference_court_hour_minor: number
          updated_at?: string
        }
        Update: {
          band_key?: string
          confidence?: string
          country_code?: string
          currency?: string
          language?: string
          min_fee_minor?: number | null
          reference_court_hour_minor?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "country_pricing_band_key_fkey"
            columns: ["band_key"]
            isOneToOne: false
            referencedRelation: "pricing_bands"
            referencedColumns: ["band_key"]
          },
        ]
      }
      court_availability_settings: {
        Row: {
          allow_cancellation: boolean
          cancellation_notice_hours: number
          close_time: string
          created_at: string | null
          id: string
          indoor_close_time: string | null
          indoor_open_time: string | null
          max_advance_days: number
          min_notice_hours: number
          open_time: string
          outdoor_close_time: string | null
          outdoor_open_time: string | null
          payment_deadline_hours: number
          slot_duration_min: number
          slot_interval_min: number
          turnaround_min: number
          venue_id: string
        }
        Insert: {
          allow_cancellation?: boolean
          cancellation_notice_hours?: number
          close_time?: string
          created_at?: string | null
          id?: string
          indoor_close_time?: string | null
          indoor_open_time?: string | null
          max_advance_days?: number
          min_notice_hours?: number
          open_time?: string
          outdoor_close_time?: string | null
          outdoor_open_time?: string | null
          payment_deadline_hours?: number
          slot_duration_min?: number
          slot_interval_min?: number
          turnaround_min?: number
          venue_id: string
        }
        Update: {
          allow_cancellation?: boolean
          cancellation_notice_hours?: number
          close_time?: string
          created_at?: string | null
          id?: string
          indoor_close_time?: string | null
          indoor_open_time?: string | null
          max_advance_days?: number
          min_notice_hours?: number
          open_time?: string
          outdoor_close_time?: string | null
          outdoor_open_time?: string | null
          payment_deadline_hours?: number
          slot_duration_min?: number
          slot_interval_min?: number
          turnaround_min?: number
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "court_availability_settings_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: true
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      court_block_outs: {
        Row: {
          court_id: string | null
          created_at: string | null
          created_by: string | null
          end_at: string
          id: string
          reason: string | null
          start_at: string
          venue_id: string
        }
        Insert: {
          court_id?: string | null
          created_at?: string | null
          created_by?: string | null
          end_at: string
          id?: string
          reason?: string | null
          start_at: string
          venue_id: string
        }
        Update: {
          court_id?: string | null
          created_at?: string | null
          created_by?: string | null
          end_at?: string
          id?: string
          reason?: string | null
          start_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "court_block_outs_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "court_block_outs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "court_block_outs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "court_block_outs_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      courts: {
        Row: {
          court_name: string | null
          created_at: string | null
          has_roof: boolean | null
          id: string
          is_indoor: boolean | null
          slot_duration_default: number | null
          status: string | null
          surface_type: string | null
          venue_id: string | null
        }
        Insert: {
          court_name?: string | null
          created_at?: string | null
          has_roof?: boolean | null
          id?: string
          is_indoor?: boolean | null
          slot_duration_default?: number | null
          status?: string | null
          surface_type?: string | null
          venue_id?: string | null
        }
        Update: {
          court_name?: string | null
          created_at?: string | null
          has_roof?: boolean | null
          id?: string
          is_indoor?: boolean | null
          slot_duration_default?: number | null
          status?: string | null
          surface_type?: string | null
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "courts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      cron_health_state: {
        Row: {
          alerted_at: string | null
          failures_24h: number
          first_seen_at: string
          jobid: number
          jobname: string
          last_checked_at: string
          last_error: string | null
          last_run_at: string | null
          status: string
        }
        Insert: {
          alerted_at?: string | null
          failures_24h?: number
          first_seen_at?: string
          jobid: number
          jobname: string
          last_checked_at?: string
          last_error?: string | null
          last_run_at?: string | null
          status?: string
        }
        Update: {
          alerted_at?: string | null
          failures_24h?: number
          first_seen_at?: string
          jobid?: number
          jobname?: string
          last_checked_at?: string
          last_error?: string | null
          last_run_at?: string | null
          status?: string
        }
        Relationships: []
      }
      elo_friendly_reversal_backup: {
        Row: {
          captured_at: string | null
          friendly_results: number | null
          name: string | null
          net_change: number | null
          ranking_before_reversal: number | null
          user_id: string | null
        }
        Insert: {
          captured_at?: string | null
          friendly_results?: number | null
          name?: string | null
          net_change?: number | null
          ranking_before_reversal?: number | null
          user_id?: string | null
        }
        Update: {
          captured_at?: string | null
          friendly_results?: number | null
          name?: string | null
          net_change?: number | null
          ranking_before_reversal?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      entertainer_jersey_history: {
        Row: {
          awarded_at: string
          id: string
          league_id: string
          user_id: string
          vote_count: number
          week_start: string
        }
        Insert: {
          awarded_at?: string
          id?: string
          league_id: string
          user_id: string
          vote_count: number
          week_start: string
        }
        Update: {
          awarded_at?: string
          id?: string
          league_id?: string
          user_id?: string
          vote_count?: number
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "entertainer_jersey_history_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entertainer_jersey_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entertainer_jersey_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
        ]
      }
      event_attendees: {
        Row: {
          booked_slot: string | null
          created_at: string | null
          event_id: string | null
          id: string
          paid_at: string | null
          status: string | null
          stripe_pi_id: string | null
          ticket_code: string | null
          user_id: string | null
        }
        Insert: {
          booked_slot?: string | null
          created_at?: string | null
          event_id?: string | null
          id?: string
          paid_at?: string | null
          status?: string | null
          stripe_pi_id?: string | null
          ticket_code?: string | null
          user_id?: string | null
        }
        Update: {
          booked_slot?: string | null
          created_at?: string | null
          event_id?: string | null
          id?: string
          paid_at?: string | null
          status?: string | null
          stripe_pi_id?: string | null
          ticket_code?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_attendees_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_attendees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_attendees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          capacity: number | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          description: string | null
          end_time: string | null
          entry_code: string | null
          entry_fee_pence: number | null
          entry_notes: string | null
          event_type: string | null
          external_link: string | null
          group_id: string | null
          id: string
          image_url: string | null
          image_urls: string[] | null
          is_all_day: boolean | null
          is_official: boolean | null
          is_paid: boolean | null
          is_ticketed: boolean | null
          location: string | null
          max_capacity: number | null
          price: number | null
          registration_deadline: string | null
          registration_open: boolean | null
          requires_ticket: boolean | null
          source_type: string | null
          source_venue_id: string | null
          start_time: string
          status: string | null
          target_radius_miles: number | null
          ticket_price_pence: number | null
          title: string
        }
        Insert: {
          capacity?: number | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          description?: string | null
          end_time?: string | null
          entry_code?: string | null
          entry_fee_pence?: number | null
          entry_notes?: string | null
          event_type?: string | null
          external_link?: string | null
          group_id?: string | null
          id?: string
          image_url?: string | null
          image_urls?: string[] | null
          is_all_day?: boolean | null
          is_official?: boolean | null
          is_paid?: boolean | null
          is_ticketed?: boolean | null
          location?: string | null
          max_capacity?: number | null
          price?: number | null
          registration_deadline?: string | null
          registration_open?: boolean | null
          requires_ticket?: boolean | null
          source_type?: string | null
          source_venue_id?: string | null
          start_time: string
          status?: string | null
          target_radius_miles?: number | null
          ticket_price_pence?: number | null
          title: string
        }
        Update: {
          capacity?: number | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          description?: string | null
          end_time?: string | null
          entry_code?: string | null
          entry_fee_pence?: number | null
          entry_notes?: string | null
          event_type?: string | null
          external_link?: string | null
          group_id?: string | null
          id?: string
          image_url?: string | null
          image_urls?: string[] | null
          is_all_day?: boolean | null
          is_official?: boolean | null
          is_paid?: boolean | null
          is_ticketed?: boolean | null
          location?: string | null
          max_capacity?: number | null
          price?: number | null
          registration_deadline?: string | null
          registration_open?: boolean | null
          requires_ticket?: boolean | null
          source_type?: string | null
          source_venue_id?: string | null
          start_time?: string
          status?: string | null
          target_radius_miles?: number | null
          ticket_price_pence?: number | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      founder_programs: {
        Row: {
          cap: number | null
          commission_rate_bps: number
          country_code: string
          enabled: boolean
          monthly_price_minor: number | null
          plan_tier: string
          term_months: number
          updated_at: string
          waive_fee: boolean
        }
        Insert: {
          cap?: number | null
          commission_rate_bps?: number
          country_code: string
          enabled?: boolean
          monthly_price_minor?: number | null
          plan_tier?: string
          term_months?: number
          updated_at?: string
          waive_fee?: boolean
        }
        Update: {
          cap?: number | null
          commission_rate_bps?: number
          country_code?: string
          enabled?: boolean
          monthly_price_minor?: number | null
          plan_tier?: string
          term_months?: number
          updated_at?: string
          waive_fee?: boolean
        }
        Relationships: []
      }
      group_members: {
        Row: {
          banned_at: string | null
          banned_by: string | null
          group_id: string
          id: string
          joined_at: string | null
          role: Database["public"]["Enums"]["group_role"]
          status: string
          user_id: string
        }
        Insert: {
          banned_at?: string | null
          banned_by?: string | null
          group_id: string
          id?: string
          joined_at?: string | null
          role?: Database["public"]["Enums"]["group_role"]
          status?: string
          user_id: string
        }
        Update: {
          banned_at?: string | null
          banned_by?: string | null
          group_id?: string
          id?: string
          joined_at?: string | null
          role?: Database["public"]["Enums"]["group_role"]
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_banned_by_fkey"
            columns: ["banned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_banned_by_fkey"
            columns: ["banned_by"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
        ]
      }
      group_waitlist: {
        Row: {
          group_id: string | null
          id: string
          requested_at: string | null
          user_id: string | null
        }
        Insert: {
          group_id?: string | null
          id?: string
          requested_at?: string | null
          user_id?: string | null
        }
        Update: {
          group_id?: string | null
          id?: string
          requested_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "group_waitlist_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_waitlist_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_waitlist_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          admin_id: string
          allow_join_requests: boolean | null
          allow_ringers: boolean | null
          auto_approve: boolean | null
          auto_approve_requests: boolean | null
          auto_match_enabled: boolean
          background_image_url: string | null
          banner_url: string | null
          city: string | null
          country: string | null
          created_at: string | null
          description: string | null
          group_rules: string | null
          has_ringer_pool: boolean | null
          id: string
          invite_code: string
          join_mode: string | null
          latitude: number | null
          location: string | null
          longitude: number | null
          max_members: number | null
          max_playtomic_level: number | null
          min_playtomic_level: number | null
          name: string
          ringer_approval: string | null
          rules: string | null
          updated_at: string | null
          visibility: string
        }
        Insert: {
          admin_id: string
          allow_join_requests?: boolean | null
          allow_ringers?: boolean | null
          auto_approve?: boolean | null
          auto_approve_requests?: boolean | null
          auto_match_enabled?: boolean
          background_image_url?: string | null
          banner_url?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          description?: string | null
          group_rules?: string | null
          has_ringer_pool?: boolean | null
          id?: string
          invite_code?: string
          join_mode?: string | null
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          max_members?: number | null
          max_playtomic_level?: number | null
          min_playtomic_level?: number | null
          name: string
          ringer_approval?: string | null
          rules?: string | null
          updated_at?: string | null
          visibility?: string
        }
        Update: {
          admin_id?: string
          allow_join_requests?: boolean | null
          allow_ringers?: boolean | null
          auto_approve?: boolean | null
          auto_approve_requests?: boolean | null
          auto_match_enabled?: boolean
          background_image_url?: string | null
          banner_url?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          description?: string | null
          group_rules?: string | null
          has_ringer_pool?: boolean | null
          id?: string
          invite_code?: string
          join_mode?: string | null
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          max_members?: number | null
          max_playtomic_level?: number | null
          min_playtomic_level?: number | null
          name?: string
          ringer_approval?: string | null
          rules?: string | null
          updated_at?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "groups_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_player_ratings: {
        Row: {
          created_at: string | null
          guest_player_id: string | null
          id: string
          match_id: string | null
          rated_by: string | null
          rating: number
        }
        Insert: {
          created_at?: string | null
          guest_player_id?: string | null
          id?: string
          match_id?: string | null
          rated_by?: string | null
          rating: number
        }
        Update: {
          created_at?: string | null
          guest_player_id?: string | null
          id?: string
          match_id?: string | null
          rated_by?: string | null
          rating?: number
        }
        Relationships: [
          {
            foreignKeyName: "guest_player_ratings_guest_player_id_fkey"
            columns: ["guest_player_id"]
            isOneToOne: false
            referencedRelation: "guest_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_player_ratings_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_players: {
        Row: {
          added_by: string | null
          created_at: string | null
          final_ranking: number | null
          group_id: string | null
          id: string
          invite_email: string | null
          invite_phone: string | null
          invite_sent_at: string | null
          invite_status: string | null
          linked_user_id: string | null
          name: string
          provisional_ranking: number | null
        }
        Insert: {
          added_by?: string | null
          created_at?: string | null
          final_ranking?: number | null
          group_id?: string | null
          id?: string
          invite_email?: string | null
          invite_phone?: string | null
          invite_sent_at?: string | null
          invite_status?: string | null
          linked_user_id?: string | null
          name: string
          provisional_ranking?: number | null
        }
        Update: {
          added_by?: string | null
          created_at?: string | null
          final_ranking?: number | null
          group_id?: string | null
          id?: string
          invite_email?: string | null
          invite_phone?: string | null
          invite_sent_at?: string | null
          invite_status?: string | null
          linked_user_id?: string | null
          name?: string
          provisional_ranking?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "guest_players_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      household_battle_history: {
        Row: {
          completed_at: string | null
          consequence: string | null
          created_at: string
          household_standing_id: string
          id: string
          league_id: string
          loser_id: string
          reward: string | null
          winner_id: string
        }
        Insert: {
          completed_at?: string | null
          consequence?: string | null
          created_at?: string
          household_standing_id: string
          id?: string
          league_id: string
          loser_id: string
          reward?: string | null
          winner_id: string
        }
        Update: {
          completed_at?: string | null
          consequence?: string | null
          created_at?: string
          household_standing_id?: string
          id?: string
          league_id?: string
          loser_id?: string
          reward?: string | null
          winner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_battle_history_household_standing_id_fkey"
            columns: ["household_standing_id"]
            isOneToOne: false
            referencedRelation: "household_league_standings"
            referencedColumns: ["id"]
          },
        ]
      }
      household_league_standings: {
        Row: {
          battle_winner: string | null
          combined_losses: number
          combined_matches: number
          combined_points: number
          combined_wins: number
          consequence_completed: boolean | null
          created_at: string
          household_id: string
          id: string
          last_calculated: string
          league_id: string
          reward_claimed: boolean | null
          updated_at: string
          user1_id: string
          user1_matches: number
          user1_points: number
          user1_wins: number
          user2_id: string
          user2_matches: number
          user2_points: number
          user2_wins: number
        }
        Insert: {
          battle_winner?: string | null
          combined_losses?: number
          combined_matches?: number
          combined_points?: number
          combined_wins?: number
          consequence_completed?: boolean | null
          created_at?: string
          household_id: string
          id?: string
          last_calculated?: string
          league_id: string
          reward_claimed?: boolean | null
          updated_at?: string
          user1_id: string
          user1_matches?: number
          user1_points?: number
          user1_wins?: number
          user2_id: string
          user2_matches?: number
          user2_points?: number
          user2_wins?: number
        }
        Update: {
          battle_winner?: string | null
          combined_losses?: number
          combined_matches?: number
          combined_points?: number
          combined_wins?: number
          consequence_completed?: boolean | null
          created_at?: string
          household_id?: string
          id?: string
          last_calculated?: string
          league_id?: string
          reward_claimed?: boolean | null
          updated_at?: string
          user1_id?: string
          user1_matches?: number
          user1_points?: number
          user1_wins?: number
          user2_id?: string
          user2_matches?: number
          user2_points?: number
          user2_wins?: number
        }
        Relationships: []
      }
      household_link_requests: {
        Row: {
          created_at: string | null
          id: string
          requester_id: string
          responded_at: string | null
          status: string
          target_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          requester_id: string
          responded_at?: string | null
          status?: string
          target_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          requester_id?: string
          responded_at?: string | null
          status?: string
          target_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_link_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_link_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_link_requests_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_link_requests_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          created_at: string | null
          household_member_id: string
          id: string
          relationship: string | null
          status: string
          travel_time_buffer: number | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          household_member_id: string
          id?: string
          relationship?: string | null
          status?: string
          travel_time_buffer?: number | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          household_member_id?: string
          id?: string
          relationship?: string | null
          status?: string
          travel_time_buffer?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "households_household_member_id_fkey"
            columns: ["household_member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "households_household_member_id_fkey"
            columns: ["household_member_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "households_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "households_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
        ]
      }
      investor_interest: {
        Row: {
          amount: string | null
          created_at: string
          email: string
          id: string
          interested: string
          name: string
          phone: string | null
          questions: string | null
          reference: string | null
        }
        Insert: {
          amount?: string | null
          created_at?: string
          email: string
          id?: string
          interested: string
          name: string
          phone?: string | null
          questions?: string | null
          reference?: string | null
        }
        Update: {
          amount?: string | null
          created_at?: string
          email?: string
          id?: string
          interested?: string
          name?: string
          phone?: string | null
          questions?: string | null
          reference?: string | null
        }
        Relationships: []
      }
      investor_profiles: {
        Row: {
          access_granted: boolean
          created_at: string
          email: string
          id: string
          last_login: string | null
          linkedin_url: string | null
          name: string
        }
        Insert: {
          access_granted?: boolean
          created_at?: string
          email: string
          id?: string
          last_login?: string | null
          linkedin_url?: string | null
          name: string
        }
        Update: {
          access_granted?: boolean
          created_at?: string
          email?: string
          id?: string
          last_login?: string | null
          linkedin_url?: string | null
          name?: string
        }
        Relationships: []
      }
      investor_verification_tokens: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          token: string
          used: boolean
        }
        Insert: {
          created_at?: string
          email: string
          expires_at: string
          id?: string
          token: string
          used?: boolean
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          token?: string
          used?: boolean
        }
        Relationships: []
      }
      leaderboard_entries: {
        Row: {
          created_at: string | null
          group_id: string
          id: string
          is_pair: boolean | null
          losses: number | null
          partner_id: string | null
          player_id: string
          points_against: number | null
          points_for: number | null
          ranking: number | null
          total_matches: number | null
          updated_at: string | null
          win_rate: number | null
          wins: number | null
        }
        Insert: {
          created_at?: string | null
          group_id: string
          id?: string
          is_pair?: boolean | null
          losses?: number | null
          partner_id?: string | null
          player_id: string
          points_against?: number | null
          points_for?: number | null
          ranking?: number | null
          total_matches?: number | null
          updated_at?: string | null
          win_rate?: number | null
          wins?: number | null
        }
        Update: {
          created_at?: string | null
          group_id?: string
          id?: string
          is_pair?: boolean | null
          losses?: number | null
          partner_id?: string | null
          player_id?: string
          points_against?: number | null
          points_for?: number | null
          ranking?: number | null
          total_matches?: number | null
          updated_at?: string | null
          win_rate?: number | null
          wins?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "leaderboard_entries_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leaderboard_entries_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leaderboard_entries_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leaderboard_entries_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leaderboard_entries_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
        ]
      }
      league_achievements: {
        Row: {
          awarded_at: string
          badge_color: string | null
          badge_icon: string | null
          category: string
          created_at: string
          id: string
          league_id: string
          rank_position: number
          user_id: string
        }
        Insert: {
          awarded_at?: string
          badge_color?: string | null
          badge_icon?: string | null
          category: string
          created_at?: string
          id?: string
          league_id: string
          rank_position: number
          user_id: string
        }
        Update: {
          awarded_at?: string
          badge_color?: string | null
          badge_icon?: string | null
          category?: string
          created_at?: string
          id?: string
          league_id?: string
          rank_position?: number
          user_id?: string
        }
        Relationships: []
      }
      league_adjustments: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          league_id: string
          points_delta: number
          reason: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          league_id: string
          points_delta?: number
          reason?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          league_id?: string
          points_delta?: number
          reason?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_adjustments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_adjustments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_adjustments_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_adjustments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_adjustments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
        ]
      }
      league_consequences: {
        Row: {
          assigned_at: string
          completed_at: string | null
          consequence_description: string
          consequence_type: string
          created_at: string
          id: string
          league_id: string
          proof_url: string | null
          user_id: string
          verified_by: string | null
        }
        Insert: {
          assigned_at?: string
          completed_at?: string | null
          consequence_description: string
          consequence_type: string
          created_at?: string
          id?: string
          league_id: string
          proof_url?: string | null
          user_id: string
          verified_by?: string | null
        }
        Update: {
          assigned_at?: string
          completed_at?: string | null
          consequence_description?: string
          consequence_type?: string
          created_at?: string
          id?: string
          league_id?: string
          proof_url?: string | null
          user_id?: string
          verified_by?: string | null
        }
        Relationships: []
      }
      league_invitations: {
        Row: {
          created_at: string | null
          expires_at: string | null
          id: string
          invite_token: string | null
          invited_by: string | null
          invited_email: string | null
          invited_user_id: string | null
          league_id: string | null
          source_group_id: string | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          invite_token?: string | null
          invited_by?: string | null
          invited_email?: string | null
          invited_user_id?: string | null
          league_id?: string | null
          source_group_id?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          invite_token?: string | null
          invited_by?: string | null
          invited_email?: string | null
          invited_user_id?: string | null
          league_id?: string | null
          source_group_id?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "league_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_invitations_invited_user_id_fkey"
            columns: ["invited_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_invitations_invited_user_id_fkey"
            columns: ["invited_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_invitations_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      league_jerseys: {
        Row: {
          awarded_week: string
          created_at: string | null
          id: string
          jersey_color: string | null
          jersey_type: string
          league_id: string
          previous_holder: string | null
          reason: string | null
          reason_value: number | null
          user_id: string
        }
        Insert: {
          awarded_week: string
          created_at?: string | null
          id?: string
          jersey_color?: string | null
          jersey_type: string
          league_id: string
          previous_holder?: string | null
          reason?: string | null
          reason_value?: number | null
          user_id: string
        }
        Update: {
          awarded_week?: string
          created_at?: string | null
          id?: string
          jersey_color?: string | null
          jersey_type?: string
          league_id?: string
          previous_holder?: string | null
          reason?: string | null
          reason_value?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_jerseys_previous_holder_fkey"
            columns: ["previous_holder"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_jerseys_previous_holder_fkey"
            columns: ["previous_holder"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_jerseys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_jerseys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
        ]
      }
      league_members: {
        Row: {
          created_at: string | null
          draws: number | null
          id: string
          joined_at: string | null
          league_id: string | null
          losses: number | null
          role: string | null
          season_points: number | null
          status: string | null
          user_id: string | null
          wins: number | null
        }
        Insert: {
          created_at?: string | null
          draws?: number | null
          id?: string
          joined_at?: string | null
          league_id?: string | null
          losses?: number | null
          role?: string | null
          season_points?: number | null
          status?: string | null
          user_id?: string | null
          wins?: number | null
        }
        Update: {
          created_at?: string | null
          draws?: number | null
          id?: string
          joined_at?: string | null
          league_id?: string | null
          losses?: number | null
          role?: string | null
          season_points?: number | null
          status?: string | null
          user_id?: string | null
          wins?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "league_members_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
        ]
      }
      league_ranking_adjustments: {
        Row: {
          adjusted_by: string | null
          created_at: string | null
          id: string
          league_id: string | null
          points_change: number
          reason: string | null
          user_id: string | null
        }
        Insert: {
          adjusted_by?: string | null
          created_at?: string | null
          id?: string
          league_id?: string | null
          points_change: number
          reason?: string | null
          user_id?: string | null
        }
        Update: {
          adjusted_by?: string | null
          created_at?: string | null
          id?: string
          league_id?: string | null
          points_change?: number
          reason?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "league_ranking_adjustments_adjusted_by_fkey"
            columns: ["adjusted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_ranking_adjustments_adjusted_by_fkey"
            columns: ["adjusted_by"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_ranking_adjustments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_ranking_adjustments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
        ]
      }
      league_standings: {
        Row: {
          category: string
          draws: number
          id: string
          league_id: string
          losses: number
          matches_played: number
          ranking_points: number
          season_elo: number
          updated_at: string
          user_id: string
          wins: number
        }
        Insert: {
          category?: string
          draws?: number
          id?: string
          league_id: string
          losses?: number
          matches_played?: number
          ranking_points?: number
          season_elo?: number
          updated_at?: string
          user_id: string
          wins?: number
        }
        Update: {
          category?: string
          draws?: number
          id?: string
          league_id?: string
          losses?: number
          matches_played?: number
          ranking_points?: number
          season_elo?: number
          updated_at?: string
          user_id?: string
          wins?: number
        }
        Relationships: [
          {
            foreignKeyName: "league_standings_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_standings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_standings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
        ]
      }
      league_standings_backup_20260722: {
        Row: {
          category: string | null
          draws: number | null
          id: string | null
          league_id: string | null
          losses: number | null
          matches_played: number | null
          ranking_points: number | null
          season_elo: number | null
          updated_at: string | null
          user_id: string | null
          wins: number | null
        }
        Insert: {
          category?: string | null
          draws?: number | null
          id?: string | null
          league_id?: string | null
          losses?: number | null
          matches_played?: number | null
          ranking_points?: number | null
          season_elo?: number | null
          updated_at?: string | null
          user_id?: string | null
          wins?: number | null
        }
        Update: {
          category?: string | null
          draws?: number | null
          id?: string | null
          league_id?: string | null
          losses?: number | null
          matches_played?: number | null
          ranking_points?: number | null
          season_elo?: number | null
          updated_at?: string | null
          user_id?: string | null
          wins?: number | null
        }
        Relationships: []
      }
      league_standings_backup_20260909: {
        Row: {
          category: string | null
          draws: number | null
          id: string | null
          league_id: string | null
          losses: number | null
          matches_played: number | null
          ranking_points: number | null
          season_elo: number | null
          updated_at: string | null
          user_id: string | null
          wins: number | null
        }
        Insert: {
          category?: string | null
          draws?: number | null
          id?: string | null
          league_id?: string | null
          losses?: number | null
          matches_played?: number | null
          ranking_points?: number | null
          season_elo?: number | null
          updated_at?: string | null
          user_id?: string | null
          wins?: number | null
        }
        Update: {
          category?: string | null
          draws?: number | null
          id?: string | null
          league_id?: string | null
          losses?: number | null
          matches_played?: number | null
          ranking_points?: number | null
          season_elo?: number | null
          updated_at?: string | null
          user_id?: string | null
          wins?: number | null
        }
        Relationships: []
      }
      league_teams: {
        Row: {
          created_at: string
          id: string
          league_id: string
          player1_id: string | null
          player2_id: string | null
          team_name: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          league_id: string
          player1_id?: string | null
          player2_id?: string | null
          team_name?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          league_id?: string
          player1_id?: string | null
          player2_id?: string | null
          team_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "league_teams_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_teams_player1_id_fkey"
            columns: ["player1_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_teams_player1_id_fkey"
            columns: ["player1_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_teams_player2_id_fkey"
            columns: ["player2_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_teams_player2_id_fkey"
            columns: ["player2_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
        ]
      }
      league_tiers: {
        Row: {
          created_at: string
          id: string
          league_id: string
          max_rank: number
          min_rank: number
          promotion_threshold: number | null
          relegation_threshold: number | null
          tier_color: string | null
          tier_icon: string | null
          tier_level: number
          tier_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          league_id: string
          max_rank: number
          min_rank: number
          promotion_threshold?: number | null
          relegation_threshold?: number | null
          tier_color?: string | null
          tier_icon?: string | null
          tier_level: number
          tier_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          league_id?: string
          max_rank?: number
          min_rank?: number
          promotion_threshold?: number | null
          relegation_threshold?: number | null
          tier_color?: string | null
          tier_icon?: string | null
          tier_level?: number
          tier_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      leagues: {
        Row: {
          achievements_enabled: boolean | null
          auto_generate_fixtures: boolean | null
          banner_url: string | null
          break_duration_mins: number | null
          city: string | null
          country: string | null
          courts_available: number | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          description: string | null
          elo_max: number | null
          elo_min: number | null
          entry_fee_pence: number | null
          format: string | null
          gamification_enabled: boolean | null
          id: string
          is_official: boolean | null
          is_open_registration: boolean | null
          linked_group_ids: string[] | null
          match_duration_mins: number | null
          match_type: string | null
          max_elo: number | null
          max_participants: number | null
          max_rounds: number | null
          min_elo: number | null
          min_sets_per_fixture: number
          name: string
          open_join_approval: boolean | null
          prize_scheme: Json | null
          prizes: string | null
          scoring_format: string | null
          season_end: string | null
          season_start: string | null
          source_type: string | null
          source_venue_id: string | null
          status: string | null
          tournament_end: string | null
          tournament_start: string | null
          visibility: string | null
        }
        Insert: {
          achievements_enabled?: boolean | null
          auto_generate_fixtures?: boolean | null
          banner_url?: string | null
          break_duration_mins?: number | null
          city?: string | null
          country?: string | null
          courts_available?: number | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          description?: string | null
          elo_max?: number | null
          elo_min?: number | null
          entry_fee_pence?: number | null
          format?: string | null
          gamification_enabled?: boolean | null
          id?: string
          is_official?: boolean | null
          is_open_registration?: boolean | null
          linked_group_ids?: string[] | null
          match_duration_mins?: number | null
          match_type?: string | null
          max_elo?: number | null
          max_participants?: number | null
          max_rounds?: number | null
          min_elo?: number | null
          min_sets_per_fixture?: number
          name: string
          open_join_approval?: boolean | null
          prize_scheme?: Json | null
          prizes?: string | null
          scoring_format?: string | null
          season_end?: string | null
          season_start?: string | null
          source_type?: string | null
          source_venue_id?: string | null
          status?: string | null
          tournament_end?: string | null
          tournament_start?: string | null
          visibility?: string | null
        }
        Update: {
          achievements_enabled?: boolean | null
          auto_generate_fixtures?: boolean | null
          banner_url?: string | null
          break_duration_mins?: number | null
          city?: string | null
          country?: string | null
          courts_available?: number | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          description?: string | null
          elo_max?: number | null
          elo_min?: number | null
          entry_fee_pence?: number | null
          format?: string | null
          gamification_enabled?: boolean | null
          id?: string
          is_official?: boolean | null
          is_open_registration?: boolean | null
          linked_group_ids?: string[] | null
          match_duration_mins?: number | null
          match_type?: string | null
          max_elo?: number | null
          max_participants?: number | null
          max_rounds?: number | null
          min_elo?: number | null
          min_sets_per_fixture?: number
          name?: string
          open_join_approval?: boolean | null
          prize_scheme?: Json | null
          prizes?: string | null
          scoring_format?: string | null
          season_end?: string | null
          season_start?: string | null
          source_type?: string | null
          source_venue_id?: string | null
          status?: string | null
          tournament_end?: string | null
          tournament_start?: string | null
          visibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leagues_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leagues_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
        ]
      }
      match_comments: {
        Row: {
          comment: string
          created_at: string
          id: string
          match_id: string
          mentions: string[] | null
          reply_to_id: string | null
          user_id: string
        }
        Insert: {
          comment: string
          created_at?: string
          id?: string
          match_id: string
          mentions?: string[] | null
          reply_to_id?: string | null
          user_id: string
        }
        Update: {
          comment?: string
          created_at?: string
          id?: string
          match_id?: string
          mentions?: string[] | null
          reply_to_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_comments_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_comments_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "match_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      match_drivers: {
        Row: {
          created_at: string | null
          driver_id: string
          id: string
          match_id: string
          offering_lifts: boolean
          seats_available: number
        }
        Insert: {
          created_at?: string | null
          driver_id: string
          id?: string
          match_id: string
          offering_lifts?: boolean
          seats_available?: number
        }
        Update: {
          created_at?: string | null
          driver_id?: string
          id?: string
          match_id?: string
          offering_lifts?: boolean
          seats_available?: number
        }
        Relationships: [
          {
            foreignKeyName: "match_drivers_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_drivers_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_drivers_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_guest_invites: {
        Row: {
          accepted_at: string | null
          claimed_by: string | null
          contact: string | null
          created_at: string
          expires_at: string
          guest_name: string
          id: string
          invite_token: string
          invited_by: string | null
          match_id: string
          slot_player_id: string
          status: string
        }
        Insert: {
          accepted_at?: string | null
          claimed_by?: string | null
          contact?: string | null
          created_at?: string
          expires_at?: string
          guest_name: string
          id?: string
          invite_token: string
          invited_by?: string | null
          match_id: string
          slot_player_id: string
          status?: string
        }
        Update: {
          accepted_at?: string | null
          claimed_by?: string | null
          contact?: string | null
          created_at?: string
          expires_at?: string
          guest_name?: string
          id?: string
          invite_token?: string
          invited_by?: string | null
          match_id?: string
          slot_player_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_guest_invites_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_guest_invites_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_guest_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_guest_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_guest_invites_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_guest_players: {
        Row: {
          created_at: string | null
          guest_player_id: string | null
          id: string
          match_id: string | null
        }
        Insert: {
          created_at?: string | null
          guest_player_id?: string | null
          id?: string
          match_id?: string | null
        }
        Update: {
          created_at?: string | null
          guest_player_id?: string | null
          id?: string
          match_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "match_guest_players_guest_player_id_fkey"
            columns: ["guest_player_id"]
            isOneToOne: false
            referencedRelation: "guest_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_guest_players_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_invitations: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          invited_by: string
          invitee_id: string
          is_broadcast: boolean
          match_id: string
          responded_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          invited_by: string
          invitee_id: string
          is_broadcast?: boolean
          match_id: string
          responded_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          invited_by?: string
          invitee_id?: string
          is_broadcast?: boolean
          match_id?: string
          responded_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_invitations_invitee_id_fkey"
            columns: ["invitee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_invitations_invitee_id_fkey"
            columns: ["invitee_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_invitations_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_peer_votes: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          match_id: string
          vote_category: string
          voted_for_id: string
          voter_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          match_id: string
          vote_category: string
          voted_for_id: string
          voter_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          match_id?: string
          vote_category?: string
          voted_for_id?: string
          voter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_peer_votes_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_result_votes: {
        Row: {
          created_at: string | null
          dispute_reason: string | null
          id: string
          match_result_id: string
          proposed_result_type: string | null
          proposed_sets_data: Json | null
          proposed_team1_score: number | null
          proposed_team2_score: number | null
          round: number | null
          vote: string
          voter_id: string
        }
        Insert: {
          created_at?: string | null
          dispute_reason?: string | null
          id?: string
          match_result_id: string
          proposed_result_type?: string | null
          proposed_sets_data?: Json | null
          proposed_team1_score?: number | null
          proposed_team2_score?: number | null
          round?: number | null
          vote: string
          voter_id: string
        }
        Update: {
          created_at?: string | null
          dispute_reason?: string | null
          id?: string
          match_result_id?: string
          proposed_result_type?: string | null
          proposed_sets_data?: Json | null
          proposed_team1_score?: number | null
          proposed_team2_score?: number | null
          round?: number | null
          vote?: string
          voter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_result_votes_match_result_id_fkey"
            columns: ["match_result_id"]
            isOneToOne: false
            referencedRelation: "match_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_result_votes_voter_id_fkey"
            columns: ["voter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_result_votes_voter_id_fkey"
            columns: ["voter_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
        ]
      }
      match_results: {
        Row: {
          admin_override_by: string | null
          admin_override_reason: string | null
          auto_verified: boolean | null
          created_at: string | null
          dispute_reason: string | null
          disputed_at: string | null
          disputed_by: string | null
          elo_processed: boolean | null
          id: string
          incomplete_team1_games: number | null
          incomplete_team2_games: number | null
          is_friendly: boolean | null
          last_proposal_by: string | null
          league_id: string | null
          league_standings_processed: boolean
          match_date: string | null
          match_id: string
          ranking_updated: boolean | null
          result_type: string | null
          review_deadline: string | null
          sets_data: Json | null
          submitted_by: string | null
          team1_players: string[]
          team1_score: number
          team2_players: string[]
          team2_score: number
          updated_at: string | null
          verification_date: string | null
          verification_status: string | null
          verified: boolean | null
          verified_at: string | null
          verified_by: string | null
          voting_closes_at: string | null
        }
        Insert: {
          admin_override_by?: string | null
          admin_override_reason?: string | null
          auto_verified?: boolean | null
          created_at?: string | null
          dispute_reason?: string | null
          disputed_at?: string | null
          disputed_by?: string | null
          elo_processed?: boolean | null
          id?: string
          incomplete_team1_games?: number | null
          incomplete_team2_games?: number | null
          is_friendly?: boolean | null
          last_proposal_by?: string | null
          league_id?: string | null
          league_standings_processed?: boolean
          match_date?: string | null
          match_id: string
          ranking_updated?: boolean | null
          result_type?: string | null
          review_deadline?: string | null
          sets_data?: Json | null
          submitted_by?: string | null
          team1_players: string[]
          team1_score: number
          team2_players: string[]
          team2_score: number
          updated_at?: string | null
          verification_date?: string | null
          verification_status?: string | null
          verified?: boolean | null
          verified_at?: string | null
          verified_by?: string | null
          voting_closes_at?: string | null
        }
        Update: {
          admin_override_by?: string | null
          admin_override_reason?: string | null
          auto_verified?: boolean | null
          created_at?: string | null
          dispute_reason?: string | null
          disputed_at?: string | null
          disputed_by?: string | null
          elo_processed?: boolean | null
          id?: string
          incomplete_team1_games?: number | null
          incomplete_team2_games?: number | null
          is_friendly?: boolean | null
          last_proposal_by?: string | null
          league_id?: string | null
          league_standings_processed?: boolean
          match_date?: string | null
          match_id?: string
          ranking_updated?: boolean | null
          result_type?: string | null
          review_deadline?: string | null
          sets_data?: Json | null
          submitted_by?: string | null
          team1_players?: string[]
          team1_score?: number
          team2_players?: string[]
          team2_score?: number
          updated_at?: string | null
          verification_date?: string | null
          verification_status?: string | null
          verified?: boolean | null
          verified_at?: string | null
          verified_by?: string | null
          voting_closes_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "match_results_disputed_by_fkey"
            columns: ["disputed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_results_disputed_by_fkey"
            columns: ["disputed_by"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_results_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_results_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_results_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_results_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_results_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
        ]
      }
      match_travel: {
        Row: {
          created_at: string | null
          id: string
          is_driver: boolean | null
          match_id: string
          notes: string | null
          passengers: string[] | null
          pickup_buffer_minutes: number | null
          pickup_time: string | null
          travel_method: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_driver?: boolean | null
          match_id: string
          notes?: string | null
          passengers?: string[] | null
          pickup_buffer_minutes?: number | null
          pickup_time?: string | null
          travel_method: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_driver?: boolean | null
          match_id?: string
          notes?: string | null
          passengers?: string[] | null
          pickup_buffer_minutes?: number | null
          pickup_time?: string | null
          travel_method?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_travel_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_travel_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_travel_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          additional_options: Json | null
          booked_at: string | null
          booked_by: string | null
          booked_court_number: number | null
          booked_venue_id: string | null
          booked_venue_name: string | null
          booking_claimed_at: string | null
          booking_claimed_by: string | null
          booking_notes: string | null
          booking_pledge_assigned_randomly: boolean | null
          booking_pledged_at: string | null
          booking_pledged_by: string | null
          booking_reference: string | null
          booking_status: string | null
          bypassed_conflicts: boolean | null
          confirmed_players: string[] | null
          conflict_status: string | null
          context_type: string | null
          court_requirement: string
          created_at: string | null
          created_by: string | null
          created_manually: boolean | null
          drivers: Json | null
          duration_minutes: number | null
          exclude_from_league: boolean
          group_id: string | null
          id: string
          is_open: boolean
          league_id: string | null
          match_date: string
          match_time: string
          match_type: string
          notes: string | null
          open_audience: string
          open_elo_max: number | null
          open_elo_min: number | null
          opened_at: string | null
          opened_by: string | null
          organizer_notes: string | null
          player_ids: string[]
          poll_id: string | null
          poll_slot_id: string | null
          push_deadline_sent: boolean | null
          push_reminder_sent: boolean | null
          push_result_prompt_sent: boolean | null
          requires_confirmation: boolean | null
          result_submitted_at: string | null
          result_submitted_by: string | null
          result_type: string | null
          ringer_info: Json | null
          round_number: number | null
          score_sets: Json | null
          status: string
          team1_id: string | null
          team1_player_ids: string[] | null
          team2_id: string | null
          team2_player_ids: string[] | null
          travel_notes: string | null
          updated_at: string | null
          venue_details: Json | null
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
          voting_closes_at: string | null
          window_end: string | null
          window_start: string | null
          winner_team: string | null
        }
        Insert: {
          additional_options?: Json | null
          booked_at?: string | null
          booked_by?: string | null
          booked_court_number?: number | null
          booked_venue_id?: string | null
          booked_venue_name?: string | null
          booking_claimed_at?: string | null
          booking_claimed_by?: string | null
          booking_notes?: string | null
          booking_pledge_assigned_randomly?: boolean | null
          booking_pledged_at?: string | null
          booking_pledged_by?: string | null
          booking_reference?: string | null
          booking_status?: string | null
          bypassed_conflicts?: boolean | null
          confirmed_players?: string[] | null
          conflict_status?: string | null
          context_type?: string | null
          court_requirement?: string
          created_at?: string | null
          created_by?: string | null
          created_manually?: boolean | null
          drivers?: Json | null
          duration_minutes?: number | null
          exclude_from_league?: boolean
          group_id?: string | null
          id?: string
          is_open?: boolean
          league_id?: string | null
          match_date: string
          match_time: string
          match_type?: string
          notes?: string | null
          open_audience?: string
          open_elo_max?: number | null
          open_elo_min?: number | null
          opened_at?: string | null
          opened_by?: string | null
          organizer_notes?: string | null
          player_ids: string[]
          poll_id?: string | null
          poll_slot_id?: string | null
          push_deadline_sent?: boolean | null
          push_reminder_sent?: boolean | null
          push_result_prompt_sent?: boolean | null
          requires_confirmation?: boolean | null
          result_submitted_at?: string | null
          result_submitted_by?: string | null
          result_type?: string | null
          ringer_info?: Json | null
          round_number?: number | null
          score_sets?: Json | null
          status?: string
          team1_id?: string | null
          team1_player_ids?: string[] | null
          team2_id?: string | null
          team2_player_ids?: string[] | null
          travel_notes?: string | null
          updated_at?: string | null
          venue_details?: Json | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          voting_closes_at?: string | null
          window_end?: string | null
          window_start?: string | null
          winner_team?: string | null
        }
        Update: {
          additional_options?: Json | null
          booked_at?: string | null
          booked_by?: string | null
          booked_court_number?: number | null
          booked_venue_id?: string | null
          booked_venue_name?: string | null
          booking_claimed_at?: string | null
          booking_claimed_by?: string | null
          booking_notes?: string | null
          booking_pledge_assigned_randomly?: boolean | null
          booking_pledged_at?: string | null
          booking_pledged_by?: string | null
          booking_reference?: string | null
          booking_status?: string | null
          bypassed_conflicts?: boolean | null
          confirmed_players?: string[] | null
          conflict_status?: string | null
          context_type?: string | null
          court_requirement?: string
          created_at?: string | null
          created_by?: string | null
          created_manually?: boolean | null
          drivers?: Json | null
          duration_minutes?: number | null
          exclude_from_league?: boolean
          group_id?: string | null
          id?: string
          is_open?: boolean
          league_id?: string | null
          match_date?: string
          match_time?: string
          match_type?: string
          notes?: string | null
          open_audience?: string
          open_elo_max?: number | null
          open_elo_min?: number | null
          opened_at?: string | null
          opened_by?: string | null
          organizer_notes?: string | null
          player_ids?: string[]
          poll_id?: string | null
          poll_slot_id?: string | null
          push_deadline_sent?: boolean | null
          push_reminder_sent?: boolean | null
          push_result_prompt_sent?: boolean | null
          requires_confirmation?: boolean | null
          result_submitted_at?: string | null
          result_submitted_by?: string | null
          result_type?: string | null
          ringer_info?: Json | null
          round_number?: number | null
          score_sets?: Json | null
          status?: string
          team1_id?: string | null
          team1_player_ids?: string[] | null
          team2_id?: string | null
          team2_player_ids?: string[] | null
          travel_notes?: string | null
          updated_at?: string | null
          venue_details?: Json | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          voting_closes_at?: string | null
          window_end?: string | null
          window_start?: string | null
          winner_team?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "polls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team1_id_fkey"
            columns: ["team1_id"]
            isOneToOne: false
            referencedRelation: "league_team_standings"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "matches_team1_id_fkey"
            columns: ["team1_id"]
            isOneToOne: false
            referencedRelation: "league_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team2_id_fkey"
            columns: ["team2_id"]
            isOneToOne: false
            referencedRelation: "league_team_standings"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "matches_team2_id_fkey"
            columns: ["team2_id"]
            isOneToOne: false
            referencedRelation: "league_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          billing_period: string | null
          created_at: string
          discount_pct: number
          expires_at: string | null
          id: string
          price_pence: number | null
          profile_id: string
          started_at: string
          status: string
          tier: string
          venue_id: string
        }
        Insert: {
          billing_period?: string | null
          created_at?: string
          discount_pct?: number
          expires_at?: string | null
          id?: string
          price_pence?: number | null
          profile_id: string
          started_at?: string
          status?: string
          tier?: string
          venue_id: string
        }
        Update: {
          billing_period?: string | null
          created_at?: string
          discount_pct?: number
          expires_at?: string | null
          id?: string
          price_pence?: number | null
          profile_id?: string
          started_at?: string
          status?: string
          tier?: string
          venue_id?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          chat_notifications: boolean | null
          connection_requests: boolean | null
          created_at: string | null
          match_reminders: boolean | null
          match_results: boolean | null
          open_matches: boolean
          poll_reminders: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          chat_notifications?: boolean | null
          connection_requests?: boolean | null
          created_at?: string | null
          match_reminders?: boolean | null
          match_results?: boolean | null
          open_matches?: boolean
          poll_reminders?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          chat_notifications?: boolean | null
          connection_requests?: boolean | null
          created_at?: string | null
          match_reminders?: boolean | null
          match_results?: boolean | null
          open_matches?: boolean
          poll_reminders?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          message: string
          nav_url: string | null
          read: boolean
          related_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          nav_url?: string | null
          read?: boolean
          related_id?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          nav_url?: string | null
          read?: boolean
          related_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          booking_id: string | null
          created_at: string
          id: string
          occurrence_id: string | null
          product_id: string
          quantity: number
          status: string
          stripe_payment_intent_id: string | null
          total_pence: number
          unit_price_pence: number
          user_id: string
          venue_id: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          id?: string
          occurrence_id?: string | null
          product_id: string
          quantity?: number
          status?: string
          stripe_payment_intent_id?: string | null
          total_pence: number
          unit_price_pence: number
          user_id: string
          venue_id: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          id?: string
          occurrence_id?: string | null
          product_id?: string
          quantity?: number
          status?: string
          stripe_payment_intent_id?: string | null
          total_pence?: number
          unit_price_pence?: number
          user_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_items_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "court_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "venue_event_occurrences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      padel_venues: {
        Row: {
          amenities: Json | null
          booking_advance_info: string | null
          booking_advance_member_days: number
          booking_advance_nonmember_days: number
          booking_platform: string | null
          booking_type: string | null
          booking_url: string
          cafe_bar: boolean | null
          changing_rooms: boolean | null
          city: string
          classified_at: string | null
          classified_by: string | null
          coaching_available: boolean | null
          country: string
          country_code: string
          covered_courts: number | null
          created_at: string | null
          currency: string
          description: string | null
          doubles_courts: number | null
          dynamic_pricing_enabled: boolean
          dynamic_pricing_surcharge_pct: number
          dynamic_pricing_threshold_pct: number
          email: string | null
          equipment_rental: boolean | null
          external_ref: string | null
          facilities: Json | null
          full_address: string
          has_roof: boolean | null
          indoor_courts: number | null
          instagram: string | null
          is_members_only: boolean | null
          is_verified: boolean | null
          last_verified_at: string | null
          latitude: number | null
          longitude: number | null
          membership_note: string | null
          membership_required: boolean | null
          needs_review: boolean
          number_of_courts: number
          opening_hours: Json | null
          outdoor_courts: number | null
          panoramic_courts: number | null
          parking_available: boolean | null
          pay_per_play: boolean | null
          phone: string | null
          photos: Json | null
          postal_code: string | null
          postcode: string | null
          ppa_bookable: boolean | null
          price_pence: number | null
          price_per_hour: number | null
          price_per_player_pence: number | null
          pricing_tier: number | null
          rating: number | null
          review_count: number | null
          review_reason: string | null
          singles_courts: number | null
          status: string
          surface_type: string | null
          total_reviews: number | null
          typical_court_price_offpeak: number | null
          typical_court_price_peak: number | null
          updated_at: string | null
          venue_id: string
          venue_name: string
          venue_type: string
          venues_id: string | null
          verified: boolean | null
          website: string | null
          website_url: string | null
          whatsapp_number: string | null
        }
        Insert: {
          amenities?: Json | null
          booking_advance_info?: string | null
          booking_advance_member_days: number
          booking_advance_nonmember_days: number
          booking_platform?: string | null
          booking_type?: string | null
          booking_url?: string
          cafe_bar?: boolean | null
          changing_rooms?: boolean | null
          city: string
          classified_at?: string | null
          classified_by?: string | null
          coaching_available?: boolean | null
          country: string
          country_code: string
          covered_courts?: number | null
          created_at?: string | null
          currency?: string
          description?: string | null
          doubles_courts?: number | null
          dynamic_pricing_enabled?: boolean
          dynamic_pricing_surcharge_pct?: number
          dynamic_pricing_threshold_pct?: number
          email?: string | null
          equipment_rental?: boolean | null
          external_ref?: string | null
          facilities?: Json | null
          full_address: string
          has_roof?: boolean | null
          indoor_courts?: number | null
          instagram?: string | null
          is_members_only?: boolean | null
          is_verified?: boolean | null
          last_verified_at?: string | null
          latitude?: number | null
          longitude?: number | null
          membership_note?: string | null
          membership_required?: boolean | null
          needs_review?: boolean
          number_of_courts: number
          opening_hours?: Json | null
          outdoor_courts?: number | null
          panoramic_courts?: number | null
          parking_available?: boolean | null
          pay_per_play?: boolean | null
          phone?: string | null
          photos?: Json | null
          postal_code?: string | null
          postcode?: string | null
          ppa_bookable?: boolean | null
          price_pence?: number | null
          price_per_hour?: number | null
          price_per_player_pence?: number | null
          pricing_tier?: number | null
          rating?: number | null
          review_count?: number | null
          review_reason?: string | null
          singles_courts?: number | null
          status?: string
          surface_type?: string | null
          total_reviews?: number | null
          typical_court_price_offpeak?: number | null
          typical_court_price_peak?: number | null
          updated_at?: string | null
          venue_id?: string
          venue_name: string
          venue_type?: string
          venues_id?: string | null
          verified?: boolean | null
          website?: string | null
          website_url?: string | null
          whatsapp_number?: string | null
        }
        Update: {
          amenities?: Json | null
          booking_advance_info?: string | null
          booking_advance_member_days?: number
          booking_advance_nonmember_days?: number
          booking_platform?: string | null
          booking_type?: string | null
          booking_url?: string
          cafe_bar?: boolean | null
          changing_rooms?: boolean | null
          city?: string
          classified_at?: string | null
          classified_by?: string | null
          coaching_available?: boolean | null
          country?: string
          country_code?: string
          covered_courts?: number | null
          created_at?: string | null
          currency?: string
          description?: string | null
          doubles_courts?: number | null
          dynamic_pricing_enabled?: boolean
          dynamic_pricing_surcharge_pct?: number
          dynamic_pricing_threshold_pct?: number
          email?: string | null
          equipment_rental?: boolean | null
          external_ref?: string | null
          facilities?: Json | null
          full_address?: string
          has_roof?: boolean | null
          indoor_courts?: number | null
          instagram?: string | null
          is_members_only?: boolean | null
          is_verified?: boolean | null
          last_verified_at?: string | null
          latitude?: number | null
          longitude?: number | null
          membership_note?: string | null
          membership_required?: boolean | null
          needs_review?: boolean
          number_of_courts?: number
          opening_hours?: Json | null
          outdoor_courts?: number | null
          panoramic_courts?: number | null
          parking_available?: boolean | null
          pay_per_play?: boolean | null
          phone?: string | null
          photos?: Json | null
          postal_code?: string | null
          postcode?: string | null
          ppa_bookable?: boolean | null
          price_pence?: number | null
          price_per_hour?: number | null
          price_per_player_pence?: number | null
          pricing_tier?: number | null
          rating?: number | null
          review_count?: number | null
          review_reason?: string | null
          singles_courts?: number | null
          status?: string
          surface_type?: string | null
          total_reviews?: number | null
          typical_court_price_offpeak?: number | null
          typical_court_price_peak?: number | null
          updated_at?: string | null
          venue_id?: string
          venue_name?: string
          venue_type?: string
          venues_id?: string | null
          verified?: boolean | null
          website?: string | null
          website_url?: string | null
          whatsapp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "padel_venues_venues_id_fkey"
            columns: ["venues_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      pairs_rankings: {
        Row: {
          created_at: string | null
          draws: number | null
          id: string
          losses: number | null
          player1_id: string
          player2_id: string
          total_matches: number | null
          updated_at: string | null
          win_percentage: number | null
          wins: number | null
        }
        Insert: {
          created_at?: string | null
          draws?: number | null
          id?: string
          losses?: number | null
          player1_id: string
          player2_id: string
          total_matches?: number | null
          updated_at?: string | null
          win_percentage?: number | null
          wins?: number | null
        }
        Update: {
          created_at?: string | null
          draws?: number | null
          id?: string
          losses?: number | null
          player1_id?: string
          player2_id?: string
          total_matches?: number | null
          updated_at?: string | null
          win_percentage?: number | null
          wins?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pairs_rankings_player1_id_fkey"
            columns: ["player1_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pairs_rankings_player1_id_fkey"
            columns: ["player1_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pairs_rankings_player2_id_fkey"
            columns: ["player2_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pairs_rankings_player2_id_fkey"
            columns: ["player2_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      player_achievements: {
        Row: {
          achievement_description: string | null
          achievement_icon: string | null
          achievement_name: string
          achievement_type: string
          awarded_at: string
          count: number | null
          created_at: string
          id: string
          league_id: string
          metadata: Json | null
          user_id: string
        }
        Insert: {
          achievement_description?: string | null
          achievement_icon?: string | null
          achievement_name: string
          achievement_type: string
          awarded_at?: string
          count?: number | null
          created_at?: string
          id?: string
          league_id: string
          metadata?: Json | null
          user_id: string
        }
        Update: {
          achievement_description?: string | null
          achievement_icon?: string | null
          achievement_name?: string
          achievement_type?: string
          awarded_at?: string
          count?: number | null
          created_at?: string
          id?: string
          league_id?: string
          metadata?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      player_connections: {
        Row: {
          connected_user_id: string
          created_at: string | null
          id: string
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          connected_user_id: string
          created_at?: string | null
          id?: string
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          connected_user_id?: string
          created_at?: string | null
          id?: string
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_connections_connected_user_id_fkey"
            columns: ["connected_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_connections_connected_user_id_fkey"
            columns: ["connected_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_connections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_connections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
        ]
      }
      player_milestones: {
        Row: {
          achieved_at: string
          created_at: string | null
          id: string
          metadata: Json | null
          milestone_description: string
          milestone_name: string
          milestone_type: string
          user_id: string
        }
        Insert: {
          achieved_at?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          milestone_description: string
          milestone_name: string
          milestone_type: string
          user_id: string
        }
        Update: {
          achieved_at?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          milestone_description?: string
          milestone_name?: string
          milestone_type?: string
          user_id?: string
        }
        Relationships: []
      }
      poll_deadline_changes: {
        Row: {
          changed_by: string
          created_at: string
          id: string
          new_deadline: string
          old_deadline: string
          poll_id: string
          reason: string | null
        }
        Insert: {
          changed_by: string
          created_at?: string
          id?: string
          new_deadline: string
          old_deadline: string
          poll_id: string
          reason?: string | null
        }
        Update: {
          changed_by?: string
          created_at?: string
          id?: string
          new_deadline?: string
          old_deadline?: string
          poll_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "poll_deadline_changes_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "polls"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_match_options: {
        Row: {
          auto_scheduled: boolean
          configurations: Json
          created_at: string
          generated_at: string
          id: string
          poll_id: string
          profiles: Json
          selected_at: string | null
          selected_by: string | null
          selected_config_id: number | null
        }
        Insert: {
          auto_scheduled?: boolean
          configurations: Json
          created_at?: string
          generated_at?: string
          id?: string
          poll_id: string
          profiles: Json
          selected_at?: string | null
          selected_by?: string | null
          selected_config_id?: number | null
        }
        Update: {
          auto_scheduled?: boolean
          configurations?: Json
          created_at?: string
          generated_at?: string
          id?: string
          poll_id?: string
          profiles?: Json
          selected_at?: string | null
          selected_by?: string | null
          selected_config_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "poll_match_options_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "polls"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_player_outcomes: {
        Row: {
          created_at: string
          group_id: string
          id: string
          match_id: string | null
          outcome: string
          poll_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          match_id?: string | null
          outcome: string
          poll_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          match_id?: string | null
          outcome?: string
          poll_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "poll_player_outcomes_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_player_outcomes_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_player_outcomes_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "polls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_player_outcomes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_player_outcomes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_responses: {
        Row: {
          additional_responses: Json
          availability_ranges: Json | null
          can_play_twice: boolean | null
          created_at: string | null
          flexible_times: Json | null
          id: string
          max_matches: number | null
          min_internal_ranking: number | null
          min_level: number | null
          poll_id: string
          preferred_date: string | null
          preferred_skill_level: string | null
          selected_levels: Json | null
          selected_rankings: Json | null
          selected_slots: Json
          submitted_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          additional_responses?: Json
          availability_ranges?: Json | null
          can_play_twice?: boolean | null
          created_at?: string | null
          flexible_times?: Json | null
          id?: string
          max_matches?: number | null
          min_internal_ranking?: number | null
          min_level?: number | null
          poll_id: string
          preferred_date?: string | null
          preferred_skill_level?: string | null
          selected_levels?: Json | null
          selected_rankings?: Json | null
          selected_slots?: Json
          submitted_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          additional_responses?: Json
          availability_ranges?: Json | null
          can_play_twice?: boolean | null
          created_at?: string | null
          flexible_times?: Json | null
          id?: string
          max_matches?: number | null
          min_internal_ranking?: number | null
          min_level?: number | null
          poll_id?: string
          preferred_date?: string | null
          preferred_skill_level?: string | null
          selected_levels?: Json | null
          selected_rankings?: Json | null
          selected_slots?: Json
          submitted_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "poll_responses_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "polls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_responses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_responses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
        ]
      }
      polls: {
        Row: {
          additional_options: Json
          close_reason: string | null
          closes_at: string
          created_at: string | null
          created_by: string
          group_id: string
          id: string
          poll_dates: string[] | null
          poll_type: Database["public"]["Enums"]["poll_type"]
          recurrence_pattern: string | null
          status: string
          time_slots: Json
          title: string
          updated_at: string | null
          week_start_date: string
        }
        Insert: {
          additional_options?: Json
          close_reason?: string | null
          closes_at: string
          created_at?: string | null
          created_by: string
          group_id: string
          id?: string
          poll_dates?: string[] | null
          poll_type?: Database["public"]["Enums"]["poll_type"]
          recurrence_pattern?: string | null
          status?: string
          time_slots?: Json
          title: string
          updated_at?: string | null
          week_start_date: string
        }
        Update: {
          additional_options?: Json
          close_reason?: string | null
          closes_at?: string
          created_at?: string | null
          created_by?: string
          group_id?: string
          id?: string
          poll_dates?: string[] | null
          poll_type?: Database["public"]["Enums"]["poll_type"]
          recurrence_pattern?: string | null
          status?: string
          time_slots?: Json
          title?: string
          updated_at?: string | null
          week_start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "polls_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      post_match_votes: {
        Row: {
          category: string
          comment: string | null
          created_at: string | null
          id: string
          match_id: string | null
          voted_for_id: string | null
          voter_id: string | null
        }
        Insert: {
          category: string
          comment?: string | null
          created_at?: string | null
          id?: string
          match_id?: string | null
          voted_for_id?: string | null
          voter_id?: string | null
        }
        Update: {
          category?: string
          comment?: string | null
          created_at?: string | null
          id?: string
          match_id?: string | null
          voted_for_id?: string | null
          voter_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "post_match_votes_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_match_votes_voted_for_id_fkey"
            columns: ["voted_for_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_match_votes_voted_for_id_fkey"
            columns: ["voted_for_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_match_votes_voter_id_fkey"
            columns: ["voter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_match_votes_voter_id_fkey"
            columns: ["voter_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_bands: {
        Row: {
          band_key: string
          default_currency: string
          display_name: string
          min_fee_minor: number | null
          reference_court_hour_minor: number
          updated_at: string
        }
        Insert: {
          band_key: string
          default_currency: string
          display_name: string
          min_fee_minor?: number | null
          reference_court_hour_minor: number
          updated_at?: string
        }
        Update: {
          band_key?: string
          default_currency?: string
          display_name?: string
          min_fee_minor?: number | null
          reference_court_hour_minor?: number
          updated_at?: string
        }
        Relationships: []
      }
      pricing_rules: {
        Row: {
          active: boolean
          court_id: string | null
          created_at: string
          currency: string
          days_of_week: number[] | null
          duration_minutes: number | null
          end_time: string | null
          id: string
          play_type: string | null
          price_basis: string
          price_pence: number
          priority: number
          start_time: string | null
          venue_id: string
        }
        Insert: {
          active?: boolean
          court_id?: string | null
          created_at?: string
          currency?: string
          days_of_week?: number[] | null
          duration_minutes?: number | null
          end_time?: string | null
          id?: string
          play_type?: string | null
          price_basis?: string
          price_pence: number
          priority?: number
          start_time?: string | null
          venue_id: string
        }
        Update: {
          active?: boolean
          court_id?: string | null
          created_at?: string
          currency?: string
          days_of_week?: number[] | null
          duration_minutes?: number | null
          end_time?: string | null
          id?: string
          play_type?: string | null
          price_basis?: string
          price_pence?: number
          priority?: number
          start_time?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_rules_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_rules_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      prizes: {
        Row: {
          created_at: string | null
          group_id: string
          id: string
          league_id: string | null
          prize_description: string
          rank_position: number
          season: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          group_id: string
          id?: string
          league_id?: string | null
          prize_description: string
          rank_position: number
          season?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          group_id?: string
          id?: string
          league_id?: string | null
          prize_description?: string
          rank_position?: number
          season?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prizes_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          price_pence: number
          stock: number | null
          tax_rate: number | null
          type: string
          venue_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          price_pence: number
          stock?: number | null
          tax_rate?: number | null
          type: string
          venue_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          price_pence?: number
          stock?: number | null
          tax_rate?: number | null
          type?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_privacy_settings: {
        Row: {
          created_at: string | null
          show_email_to_group: boolean | null
          show_phone_to_group: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          show_email_to_group?: boolean | null
          show_phone_to_group?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          show_email_to_group?: boolean | null
          show_phone_to_group?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_privacy_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_privacy_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_type: string | null
          address_line1: string | null
          address_line2: string | null
          area: string | null
          availability_preferences: Json | null
          avatar_url: string | null
          best_partner_id: string | null
          can_drive: boolean | null
          city: string | null
          country: string | null
          created_at: string | null
          email: string
          household_partner_id: string | null
          household_rules: Json | null
          id: string
          internal_ranking: number | null
          is_provisional: boolean | null
          is_verified: boolean | null
          latitude: number | null
          longitude: number | null
          matches_played: number | null
          max_passengers: number | null
          name: string
          onboarding_completed_at: string | null
          peak_elo: number | null
          peak_elo_date: string | null
          phone: string | null
          playtomic_level: number | null
          playtomic_verification_pending: boolean | null
          postal_code: string | null
          postcode: string | null
          preferred_language: string | null
          public_history: boolean | null
          push_opted_out: boolean
          push_token: string | null
          ranking_history: Json | null
          reliability_percent: number | null
          show_email: boolean | null
          show_location: boolean | null
          state_province: string | null
          travel_radius_miles: number | null
          updated_at: string | null
          verified_venue_id: string | null
          worst_partner_id: string | null
        }
        Insert: {
          account_type?: string | null
          address_line1?: string | null
          address_line2?: string | null
          area?: string | null
          availability_preferences?: Json | null
          avatar_url?: string | null
          best_partner_id?: string | null
          can_drive?: boolean | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          email: string
          household_partner_id?: string | null
          household_rules?: Json | null
          id: string
          internal_ranking?: number | null
          is_provisional?: boolean | null
          is_verified?: boolean | null
          latitude?: number | null
          longitude?: number | null
          matches_played?: number | null
          max_passengers?: number | null
          name: string
          onboarding_completed_at?: string | null
          peak_elo?: number | null
          peak_elo_date?: string | null
          phone?: string | null
          playtomic_level?: number | null
          playtomic_verification_pending?: boolean | null
          postal_code?: string | null
          postcode?: string | null
          preferred_language?: string | null
          public_history?: boolean | null
          push_opted_out?: boolean
          push_token?: string | null
          ranking_history?: Json | null
          reliability_percent?: number | null
          show_email?: boolean | null
          show_location?: boolean | null
          state_province?: string | null
          travel_radius_miles?: number | null
          updated_at?: string | null
          verified_venue_id?: string | null
          worst_partner_id?: string | null
        }
        Update: {
          account_type?: string | null
          address_line1?: string | null
          address_line2?: string | null
          area?: string | null
          availability_preferences?: Json | null
          avatar_url?: string | null
          best_partner_id?: string | null
          can_drive?: boolean | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          email?: string
          household_partner_id?: string | null
          household_rules?: Json | null
          id?: string
          internal_ranking?: number | null
          is_provisional?: boolean | null
          is_verified?: boolean | null
          latitude?: number | null
          longitude?: number | null
          matches_played?: number | null
          max_passengers?: number | null
          name?: string
          onboarding_completed_at?: string | null
          peak_elo?: number | null
          peak_elo_date?: string | null
          phone?: string | null
          playtomic_level?: number | null
          playtomic_verification_pending?: boolean | null
          postal_code?: string | null
          postcode?: string | null
          preferred_language?: string | null
          public_history?: boolean | null
          push_opted_out?: boolean
          push_token?: string | null
          ranking_history?: Json | null
          reliability_percent?: number | null
          show_email?: boolean | null
          show_location?: boolean | null
          state_province?: string | null
          travel_radius_miles?: number | null
          updated_at?: string | null
          verified_venue_id?: string | null
          worst_partner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_best_partner_id_fkey"
            columns: ["best_partner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_best_partner_id_fkey"
            columns: ["best_partner_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_household_partner_id_fkey"
            columns: ["household_partner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_household_partner_id_fkey"
            columns: ["household_partner_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_worst_partner_id_fkey"
            columns: ["worst_partner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_worst_partner_id_fkey"
            columns: ["worst_partner_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles_ratings_backup_20260909: {
        Row: {
          backed_up_at: string | null
          id: string | null
          internal_ranking: number | null
          is_provisional: boolean | null
          matches_played: number | null
          name: string | null
          peak_elo: number | null
          peak_elo_date: string | null
          playtomic_level: number | null
        }
        Insert: {
          backed_up_at?: string | null
          id?: string | null
          internal_ranking?: number | null
          is_provisional?: boolean | null
          matches_played?: number | null
          name?: string | null
          peak_elo?: number | null
          peak_elo_date?: string | null
          playtomic_level?: number | null
        }
        Update: {
          backed_up_at?: string | null
          id?: string | null
          internal_ranking?: number | null
          is_provisional?: boolean | null
          matches_played?: number | null
          name?: string | null
          peak_elo?: number | null
          peak_elo_date?: string | null
          playtomic_level?: number | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ranking_changes: {
        Row: {
          calculation_details: Json | null
          created_at: string | null
          id: string
          is_winner: boolean
          match_id: string
          match_result_id: string
          new_points: number
          new_rank: number | null
          opponent_avg_rating: number | null
          opponent_ids: string[]
          player_id: string
          points_change: number
          previous_points: number
          previous_rank: number | null
          rank_change: number | null
          score_margin: number | null
        }
        Insert: {
          calculation_details?: Json | null
          created_at?: string | null
          id?: string
          is_winner: boolean
          match_id: string
          match_result_id: string
          new_points: number
          new_rank?: number | null
          opponent_avg_rating?: number | null
          opponent_ids: string[]
          player_id: string
          points_change: number
          previous_points: number
          previous_rank?: number | null
          rank_change?: number | null
          score_margin?: number | null
        }
        Update: {
          calculation_details?: Json | null
          created_at?: string | null
          id?: string
          is_winner?: boolean
          match_id?: string
          match_result_id?: string
          new_points?: number
          new_rank?: number | null
          opponent_avg_rating?: number | null
          opponent_ids?: string[]
          player_id?: string
          points_change?: number
          previous_points?: number
          previous_rank?: number | null
          rank_change?: number | null
          score_margin?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ranking_changes_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ranking_changes_match_result_id_fkey"
            columns: ["match_result_id"]
            isOneToOne: false
            referencedRelation: "match_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ranking_changes_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ranking_changes_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
        ]
      }
      ranking_changes_backup_20260909: {
        Row: {
          calculation_details: Json | null
          created_at: string | null
          id: string | null
          is_winner: boolean | null
          match_id: string | null
          match_result_id: string | null
          new_points: number | null
          new_rank: number | null
          opponent_avg_rating: number | null
          opponent_ids: string[] | null
          player_id: string | null
          points_change: number | null
          previous_points: number | null
          previous_rank: number | null
          rank_change: number | null
          score_margin: number | null
        }
        Insert: {
          calculation_details?: Json | null
          created_at?: string | null
          id?: string | null
          is_winner?: boolean | null
          match_id?: string | null
          match_result_id?: string | null
          new_points?: number | null
          new_rank?: number | null
          opponent_avg_rating?: number | null
          opponent_ids?: string[] | null
          player_id?: string | null
          points_change?: number | null
          previous_points?: number | null
          previous_rank?: number | null
          rank_change?: number | null
          score_margin?: number | null
        }
        Update: {
          calculation_details?: Json | null
          created_at?: string | null
          id?: string | null
          is_winner?: boolean | null
          match_id?: string | null
          match_result_id?: string | null
          new_points?: number | null
          new_rank?: number | null
          opponent_avg_rating?: number | null
          opponent_ids?: string[] | null
          player_id?: string | null
          points_change?: number | null
          previous_points?: number | null
          previous_rank?: number | null
          rank_change?: number | null
          score_margin?: number | null
        }
        Relationships: []
      }
      ranking_history: {
        Row: {
          created_at: string | null
          id: string
          internal_ranking: number
          local_points: number
          recorded_at: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          internal_ranking: number
          local_points?: number
          recorded_at?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          internal_ranking?: number
          local_points?: number
          recorded_at?: string
          user_id?: string
        }
        Relationships: []
      }
      rankings: {
        Row: {
          group_id: string
          id: string
          local_points: number
          losses: number
          total_matches: number
          updated_at: string | null
          user_id: string
          wins: number
        }
        Insert: {
          group_id: string
          id?: string
          local_points?: number
          losses?: number
          total_matches?: number
          updated_at?: string | null
          user_id: string
          wins?: number
        }
        Update: {
          group_id?: string
          id?: string
          local_points?: number
          losses?: number
          total_matches?: number
          updated_at?: string | null
          user_id?: string
          wins?: number
        }
        Relationships: [
          {
            foreignKeyName: "rankings_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rankings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rankings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
        ]
      }
      rating_history: {
        Row: {
          actual_score: number
          created_at: string | null
          expected_score: number
          id: string
          is_provisional: boolean | null
          k_factor: number
          match_result_id: string | null
          opponent_avg_rating: number
          opponent_ids: string[]
          rating_after: number
          rating_before: number
          rating_change: number
          user_id: string
        }
        Insert: {
          actual_score: number
          created_at?: string | null
          expected_score: number
          id?: string
          is_provisional?: boolean | null
          k_factor: number
          match_result_id?: string | null
          opponent_avg_rating: number
          opponent_ids: string[]
          rating_after: number
          rating_before: number
          rating_change: number
          user_id: string
        }
        Update: {
          actual_score?: number
          created_at?: string | null
          expected_score?: number
          id?: string
          is_provisional?: boolean | null
          k_factor?: number
          match_result_id?: string | null
          opponent_avg_rating?: number
          opponent_ids?: string[]
          rating_after?: number
          rating_before?: number
          rating_change?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rating_history_match_result_id_fkey"
            columns: ["match_result_id"]
            isOneToOne: false
            referencedRelation: "match_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rating_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rating_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
        ]
      }
      rating_history_backup_20260909: {
        Row: {
          actual_score: number | null
          created_at: string | null
          expected_score: number | null
          id: string | null
          is_provisional: boolean | null
          k_factor: number | null
          match_result_id: string | null
          opponent_avg_rating: number | null
          opponent_ids: string[] | null
          rating_after: number | null
          rating_before: number | null
          rating_change: number | null
          user_id: string | null
        }
        Insert: {
          actual_score?: number | null
          created_at?: string | null
          expected_score?: number | null
          id?: string | null
          is_provisional?: boolean | null
          k_factor?: number | null
          match_result_id?: string | null
          opponent_avg_rating?: number | null
          opponent_ids?: string[] | null
          rating_after?: number | null
          rating_before?: number | null
          rating_change?: number | null
          user_id?: string | null
        }
        Update: {
          actual_score?: number | null
          created_at?: string | null
          expected_score?: number | null
          id?: string | null
          is_provisional?: boolean | null
          k_factor?: number | null
          match_result_id?: string | null
          opponent_avg_rating?: number | null
          opponent_ids?: string[] | null
          rating_after?: number | null
          rating_before?: number | null
          rating_change?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      relegation_tasks: {
        Row: {
          created_at: string | null
          group_id: string
          id: string
          rank_position: number
          season: string | null
          task_description: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          group_id: string
          id?: string
          rank_position: number
          season?: string | null
          task_description: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          group_id?: string
          id?: string
          rank_position?: number
          season?: string | null
          task_description?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "relegation_tasks_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      ringer_requests: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          match_id: string
          requested_by: string
          responded_at: string | null
          ringer_id: string
          status: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          match_id: string
          requested_by: string
          responded_at?: string | null
          ringer_id: string
          status?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          match_id?: string
          requested_by?: string
          responded_at?: string | null
          ringer_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ringer_requests_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ringer_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ringer_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ringer_requests_ringer_id_fkey"
            columns: ["ringer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ringer_requests_ringer_id_fkey"
            columns: ["ringer_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
        ]
      }
      slot_waitlist: {
        Row: {
          created_at: string
          date: string
          duration_minutes: number
          id: string
          notified_at: string | null
          start_time: string
          status: string
          user_id: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          date: string
          duration_minutes?: number
          id?: string
          notified_at?: string | null
          start_time: string
          status?: string
          user_id: string
          venue_id: string
        }
        Update: {
          created_at?: string
          date?: string
          duration_minutes?: number
          id?: string
          notified_at?: string | null
          start_time?: string
          status?: string
          user_id?: string
          venue_id?: string
        }
        Relationships: []
      }
      spatial_ref_sys: {
        Row: {
          auth_name: string | null
          auth_srid: number | null
          proj4text: string | null
          srid: number
          srtext: string | null
        }
        Insert: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid: number
          srtext?: string | null
        }
        Update: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid?: number
          srtext?: string | null
        }
        Relationships: []
      }
      standard_plans: {
        Row: {
          auto_renew: boolean
          commission_rate_bps: number
          court_hour_multiple: number
          currency: string
          key: string
          monthly_price_pence: number
          name: string
          notice_period_days: number | null
          special_terms: string | null
          updated_at: string
        }
        Insert: {
          auto_renew?: boolean
          commission_rate_bps: number
          court_hour_multiple?: number
          currency?: string
          key: string
          monthly_price_pence?: number
          name: string
          notice_period_days?: number | null
          special_terms?: string | null
          updated_at?: string
        }
        Update: {
          auto_renew?: boolean
          commission_rate_bps?: number
          court_hour_multiple?: number
          currency?: string
          key?: string
          monthly_price_pence?: number
          name?: string
          notice_period_days?: number | null
          special_terms?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      travel_requests: {
        Row: {
          cancellation_reason: string | null
          created_at: string | null
          driver_id: string
          id: string
          match_id: string
          pickup_location: string | null
          pickup_time: string | null
          requester_id: string
          status: string
          updated_at: string | null
        }
        Insert: {
          cancellation_reason?: string | null
          created_at?: string | null
          driver_id: string
          id?: string
          match_id: string
          pickup_location?: string | null
          pickup_time?: string | null
          requester_id: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          cancellation_reason?: string | null
          created_at?: string | null
          driver_id?: string
          id?: string
          match_id?: string
          pickup_location?: string | null
          pickup_time?: string | null
          requester_id?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "travel_requests_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "travel_requests_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "travel_requests_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "travel_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "travel_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
        ]
      }
      user_badges: {
        Row: {
          badge_key: string
          earned_at: string | null
          id: string
          match_result_id: string | null
          tier: string | null
          user_id: string
        }
        Insert: {
          badge_key: string
          earned_at?: string | null
          id?: string
          match_result_id?: string | null
          tier?: string | null
          user_id: string
        }
        Update: {
          badge_key?: string
          earned_at?: string | null
          id?: string
          match_result_id?: string | null
          tier?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_badges_match_result_id_fkey"
            columns: ["match_result_id"]
            isOneToOne: false
            referencedRelation: "match_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_badges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_badges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
        ]
      }
      user_badges_backup_20260725: {
        Row: {
          badge_key: string | null
          earned_at: string | null
          id: string | null
          match_result_id: string | null
          tier: string | null
          user_id: string | null
        }
        Insert: {
          badge_key?: string | null
          earned_at?: string | null
          id?: string | null
          match_result_id?: string | null
          tier?: string | null
          user_id?: string | null
        }
        Update: {
          badge_key?: string | null
          earned_at?: string | null
          id?: string | null
          match_result_id?: string | null
          tier?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_venue_stamps: {
        Row: {
          id: string
          lifetime_stamps: number
          stamp_count: number
          updated_at: string
          user_id: string
          venue_id: string
        }
        Insert: {
          id?: string
          lifetime_stamps?: number
          stamp_count?: number
          updated_at?: string
          user_id: string
          venue_id: string
        }
        Update: {
          id?: string
          lifetime_stamps?: number
          stamp_count?: number
          updated_at?: string
          user_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_venue_stamps_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_venue_stamps_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_activity_log: {
        Row: {
          actor_id: string
          body: string | null
          channel: string | null
          created_at: string
          id: string
          kind: string
          metadata: Json | null
          subject: string | null
          venue_id: string
        }
        Insert: {
          actor_id: string
          body?: string | null
          channel?: string | null
          created_at?: string
          id?: string
          kind: string
          metadata?: Json | null
          subject?: string | null
          venue_id: string
        }
        Update: {
          actor_id?: string
          body?: string | null
          channel?: string | null
          created_at?: string
          id?: string
          kind?: string
          metadata?: Json | null
          subject?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_activity_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_activity_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_activity_log_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_claim_invites: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          padel_venue_id: string
          token: string
          used_at: string | null
          venues_id: string
        }
        Insert: {
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          padel_venue_id: string
          token: string
          used_at?: string | null
          venues_id: string
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          padel_venue_id?: string
          token?: string
          used_at?: string | null
          venues_id?: string
        }
        Relationships: []
      }
      venue_claim_requests: {
        Row: {
          business_phone: string
          company_name: string | null
          company_registration_number: string | null
          contact_email: string
          created_at: string | null
          full_name: string
          id: string
          role_at_venue: string
          user_id: string
          venue_id: string
          venue_website_or_social: string | null
          verification_note: string
        }
        Insert: {
          business_phone: string
          company_name?: string | null
          company_registration_number?: string | null
          contact_email: string
          created_at?: string | null
          full_name: string
          id?: string
          role_at_venue: string
          user_id: string
          venue_id: string
          venue_website_or_social?: string | null
          verification_note: string
        }
        Update: {
          business_phone?: string
          company_name?: string | null
          company_registration_number?: string | null
          contact_email?: string
          created_at?: string | null
          full_name?: string
          id?: string
          role_at_venue?: string
          user_id?: string
          venue_id?: string
          venue_website_or_social?: string | null
          verification_note?: string
        }
        Relationships: []
      }
      venue_claim_verifications: {
        Row: {
          created_at: string | null
          email: string
          expires_at: string
          id: string
          token: string
          used_at: string | null
          user_id: string
          venue_id: string
        }
        Insert: {
          created_at?: string | null
          email: string
          expires_at: string
          id?: string
          token: string
          used_at?: string | null
          user_id: string
          venue_id: string
        }
        Update: {
          created_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          token?: string
          used_at?: string | null
          user_id?: string
          venue_id?: string
        }
        Relationships: []
      }
      venue_contracts: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          auto_renew: boolean | null
          billing_contact_email: string | null
          billing_contact_name: string | null
          commission_rate_bps: number | null
          company_name: string | null
          company_registration: string | null
          court_hour_multiple: number | null
          created_at: string
          created_by: string | null
          currency: string | null
          end_date: string | null
          founder_seq: number | null
          id: string
          monthly_credit_pence: number | null
          monthly_price_pence: number | null
          notes: string | null
          notice_period_days: number | null
          plan_tier: string | null
          pricing_band_key: string | null
          pricing_country_code: string | null
          reference_court_hour_minor: number | null
          signatory_email: string | null
          signatory_name: string | null
          signatory_role: string | null
          signed_at: string | null
          signed_by: string | null
          special_terms: string | null
          start_date: string | null
          status: string
          subscription_free_until: string | null
          updated_at: string
          vat_number: string | null
          venue_id: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          auto_renew?: boolean | null
          billing_contact_email?: string | null
          billing_contact_name?: string | null
          commission_rate_bps?: number | null
          company_name?: string | null
          company_registration?: string | null
          court_hour_multiple?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          end_date?: string | null
          founder_seq?: number | null
          id?: string
          monthly_credit_pence?: number | null
          monthly_price_pence?: number | null
          notes?: string | null
          notice_period_days?: number | null
          plan_tier?: string | null
          pricing_band_key?: string | null
          pricing_country_code?: string | null
          reference_court_hour_minor?: number | null
          signatory_email?: string | null
          signatory_name?: string | null
          signatory_role?: string | null
          signed_at?: string | null
          signed_by?: string | null
          special_terms?: string | null
          start_date?: string | null
          status?: string
          subscription_free_until?: string | null
          updated_at?: string
          vat_number?: string | null
          venue_id: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          auto_renew?: boolean | null
          billing_contact_email?: string | null
          billing_contact_name?: string | null
          commission_rate_bps?: number | null
          company_name?: string | null
          company_registration?: string | null
          court_hour_multiple?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          end_date?: string | null
          founder_seq?: number | null
          id?: string
          monthly_credit_pence?: number | null
          monthly_price_pence?: number | null
          notes?: string | null
          notice_period_days?: number | null
          plan_tier?: string | null
          pricing_band_key?: string | null
          pricing_country_code?: string | null
          reference_court_hour_minor?: number | null
          signatory_email?: string | null
          signatory_name?: string | null
          signatory_role?: string | null
          signed_at?: string | null
          signed_by?: string | null
          special_terms?: string | null
          start_date?: string | null
          status?: string
          subscription_free_until?: string | null
          updated_at?: string
          vat_number?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_contracts_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_contracts_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_contracts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_contracts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_contracts_signed_by_fkey"
            columns: ["signed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_contracts_signed_by_fkey"
            columns: ["signed_by"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_contracts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_customer_notes: {
        Row: {
          author_id: string | null
          created_at: string
          customer_id: string
          id: string
          note: string
          venue_id: string
        }
        Insert: {
          author_id?: string | null
          created_at?: string
          customer_id: string
          id?: string
          note: string
          venue_id: string
        }
        Update: {
          author_id?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          note?: string
          venue_id?: string
        }
        Relationships: []
      }
      venue_event_occurrences: {
        Row: {
          created_at: string
          ends_at: string
          event_id: string
          id: string
          spots_taken: number
          starts_at: string
          status: string
        }
        Insert: {
          created_at?: string
          ends_at: string
          event_id: string
          id?: string
          spots_taken?: number
          starts_at: string
          status?: string
        }
        Update: {
          created_at?: string
          ends_at?: string
          event_id?: string
          id?: string
          spots_taken?: number
          starts_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_event_occurrences_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "venue_events"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_event_participants: {
        Row: {
          id: string
          joined_at: string
          occurrence_id: string
          status: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          occurrence_id: string
          status?: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          occurrence_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_event_participants_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "venue_event_occurrences"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_events: {
        Row: {
          capacity: number | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          level_max: number | null
          level_min: number | null
          name: string
          open_to_join: boolean
          payment_mode: string
          price_per_player: number | null
          recurrence_rule: Json | null
          type: string
          venue_id: string
          visibility: string
        }
        Insert: {
          capacity?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          level_max?: number | null
          level_min?: number | null
          name: string
          open_to_join?: boolean
          payment_mode?: string
          price_per_player?: number | null
          recurrence_rule?: Json | null
          type: string
          venue_id: string
          visibility?: string
        }
        Update: {
          capacity?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          level_max?: number | null
          level_min?: number | null
          name?: string
          open_to_join?: boolean
          payment_mode?: string
          price_per_player?: number | null
          recurrence_rule?: Json | null
          type?: string
          venue_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_onboarding: {
        Row: {
          created_at: string
          current_provider: string | null
          needs: string[]
          offers_coaching: boolean | null
          updated_at: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          current_provider?: string | null
          needs?: string[]
          offers_coaching?: boolean | null
          updated_at?: string
          venue_id: string
        }
        Update: {
          created_at?: string
          current_provider?: string | null
          needs?: string[]
          offers_coaching?: boolean | null
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_onboarding_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: true
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_ratings: {
        Row: {
          created_at: string
          id: string
          rating: number
          review: string | null
          user_id: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          rating: number
          review?: string | null
          user_id: string
          venue_id: string
        }
        Update: {
          created_at?: string
          id?: string
          rating?: number
          review?: string | null
          user_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_ratings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_ratings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_rewards: {
        Row: {
          earned_at: string
          expires_at: string | null
          id: string
          redeemed_at: string | null
          redemption_code: string
          reward_type: string
          status: string
          user_id: string
          venue_id: string
        }
        Insert: {
          earned_at?: string
          expires_at?: string | null
          id?: string
          redeemed_at?: string | null
          redemption_code?: string
          reward_type: string
          status?: string
          user_id: string
          venue_id: string
        }
        Update: {
          earned_at?: string
          expires_at?: string | null
          id?: string
          redeemed_at?: string | null
          redemption_code?: string
          reward_type?: string
          status?: string
          user_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_rewards_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_rewards_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_stripe_accounts: {
        Row: {
          charges_enabled: boolean
          created_at: string
          details_submitted: boolean
          id: string
          onboarded_at: string | null
          payouts_enabled: boolean
          stripe_account_id: string | null
          venue_id: string
        }
        Insert: {
          charges_enabled?: boolean
          created_at?: string
          details_submitted?: boolean
          id?: string
          onboarded_at?: string | null
          payouts_enabled?: boolean
          stripe_account_id?: string | null
          venue_id: string
        }
        Update: {
          charges_enabled?: boolean
          created_at?: string
          details_submitted?: boolean
          id?: string
          onboarded_at?: string | null
          payouts_enabled?: boolean
          stripe_account_id?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_stripe_accounts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: true
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_users: {
        Row: {
          accepted_at: string | null
          created_at: string | null
          id: string
          invited_at: string | null
          invited_by: string | null
          role: string
          status: string
          user_id: string
          venue_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string | null
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          role: string
          status?: string
          user_id: string
          venue_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string | null
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          role?: string
          status?: string
          user_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_users_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venues: {
        Row: {
          address: string | null
          booking_embed_code: string | null
          booking_type: string | null
          booking_url: string | null
          city: string | null
          commission_rate_bps: number
          country: string
          created_at: string | null
          currency: string | null
          deal_notes: string | null
          grandfathered_ppa_bookable: boolean
          has_app_booking: boolean | null
          id: string
          is_founding_venue: boolean
          latitude: number | null
          longitude: number | null
          monthly_price_pence: number | null
          name: string
          plan_tier: string
          source_platform: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_current_period_end: string | null
          subscription_free_until: string | null
          subscription_status: string | null
        }
        Insert: {
          address?: string | null
          booking_embed_code?: string | null
          booking_type?: string | null
          booking_url?: string | null
          city?: string | null
          commission_rate_bps?: number
          country: string
          created_at?: string | null
          currency?: string | null
          deal_notes?: string | null
          grandfathered_ppa_bookable?: boolean
          has_app_booking?: boolean | null
          id?: string
          is_founding_venue?: boolean
          latitude?: number | null
          longitude?: number | null
          monthly_price_pence?: number | null
          name: string
          plan_tier?: string
          source_platform?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_current_period_end?: string | null
          subscription_free_until?: string | null
          subscription_status?: string | null
        }
        Update: {
          address?: string | null
          booking_embed_code?: string | null
          booking_type?: string | null
          booking_url?: string | null
          city?: string | null
          commission_rate_bps?: number
          country?: string
          created_at?: string | null
          currency?: string | null
          deal_notes?: string | null
          grandfathered_ppa_bookable?: boolean
          has_app_booking?: boolean | null
          id?: string
          is_founding_venue?: boolean
          latitude?: number | null
          longitude?: number | null
          monthly_price_pence?: number | null
          name?: string
          plan_tier?: string
          source_platform?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_current_period_end?: string | null
          subscription_free_until?: string | null
          subscription_status?: string | null
        }
        Relationships: []
      }
      voucher_redemptions: {
        Row: {
          amount_pence: number
          booking_id: string | null
          id: string
          redeemed_at: string
          user_id: string | null
          venue_id: string
          voucher_id: string
        }
        Insert: {
          amount_pence: number
          booking_id?: string | null
          id?: string
          redeemed_at?: string
          user_id?: string | null
          venue_id: string
          voucher_id: string
        }
        Update: {
          amount_pence?: number
          booking_id?: string | null
          id?: string
          redeemed_at?: string
          user_id?: string | null
          venue_id?: string
          voucher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voucher_redemptions_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      vouchers: {
        Row: {
          active: boolean
          code: string
          created_at: string
          currency: string | null
          description: string | null
          discount_type: string
          discount_value: number
          id: string
          max_redemptions: number | null
          min_spend_pence: number | null
          per_user_limit: number | null
          times_redeemed: number
          valid_from: string | null
          valid_until: string | null
          venue_id: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          currency?: string | null
          description?: string | null
          discount_type: string
          discount_value: number
          id?: string
          max_redemptions?: number | null
          min_spend_pence?: number | null
          per_user_limit?: number | null
          times_redeemed?: number
          valid_from?: string | null
          valid_until?: string | null
          venue_id: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          currency?: string | null
          description?: string | null
          discount_type?: string
          discount_value?: number
          id?: string
          max_redemptions?: number | null
          min_spend_pence?: number | null
          per_user_limit?: number | null
          times_redeemed?: number
          valid_from?: string | null
          valid_until?: string | null
          venue_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      court_bookings: {
        Row: {
          booked_by: string | null
          booker_stripe_customer_id: string | null
          booker_stripe_pi_id: string | null
          booking_reference: string | null
          booking_type: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          court_id: string | null
          created_at: string | null
          deadline_reminder_sent: boolean | null
          duration_minutes: number | null
          end_at: string | null
          guest_players: Json | null
          id: string | null
          match_id: string | null
          notes: string | null
          occurrence_id: string | null
          paid_player_ids: Json | null
          payment_deadline: string | null
          payment_links: Json | null
          payment_links_sent: boolean | null
          payment_state: string | null
          player_ids: string[] | null
          price_currency: string | null
          price_per_player_pence: number | null
          purpose: string | null
          reservation_state: string | null
          source: string | null
          start_at: string | null
          status: string | null
          stripe_account_id: string | null
          stripe_payment_intent_id: string | null
          total_price_pence: number | null
          updated_at: string | null
          venue_id: string | null
        }
        Insert: {
          booked_by?: string | null
          booker_stripe_customer_id?: string | null
          booker_stripe_pi_id?: string | null
          booking_reference?: string | null
          booking_type?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          court_id?: string | null
          created_at?: string | null
          deadline_reminder_sent?: boolean | null
          duration_minutes?: number | null
          end_at?: string | null
          guest_players?: Json | null
          id?: string | null
          match_id?: string | null
          notes?: string | null
          occurrence_id?: string | null
          paid_player_ids?: Json | null
          payment_deadline?: string | null
          payment_links?: Json | null
          payment_links_sent?: boolean | null
          payment_state?: string | null
          player_ids?: string[] | null
          price_currency?: string | null
          price_per_player_pence?: number | null
          purpose?: string | null
          reservation_state?: string | null
          source?: string | null
          start_at?: string | null
          status?: string | null
          stripe_account_id?: string | null
          stripe_payment_intent_id?: string | null
          total_price_pence?: number | null
          updated_at?: string | null
          venue_id?: string | null
        }
        Update: {
          booked_by?: string | null
          booker_stripe_customer_id?: string | null
          booker_stripe_pi_id?: string | null
          booking_reference?: string | null
          booking_type?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          court_id?: string | null
          created_at?: string | null
          deadline_reminder_sent?: boolean | null
          duration_minutes?: number | null
          end_at?: string | null
          guest_players?: Json | null
          id?: string | null
          match_id?: string | null
          notes?: string | null
          occurrence_id?: string | null
          paid_player_ids?: Json | null
          payment_deadline?: string | null
          payment_links?: Json | null
          payment_links_sent?: boolean | null
          payment_state?: string | null
          player_ids?: string[] | null
          price_currency?: string | null
          price_per_player_pence?: number | null
          purpose?: string | null
          reservation_state?: string | null
          source?: string | null
          start_at?: string | null
          status?: string | null
          stripe_account_id?: string | null
          stripe_payment_intent_id?: string | null
          total_price_pence?: number | null
          updated_at?: string | null
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "venue_event_occurrences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "court_bookings_booked_by_fkey"
            columns: ["booked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "court_bookings_booked_by_fkey"
            columns: ["booked_by"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "court_bookings_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "court_bookings_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "court_bookings_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "court_bookings_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "court_bookings_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      discoverable_venues: {
        Row: {
          amenities: Json | null
          booking_advance_info: string | null
          booking_advance_member_days: number | null
          booking_advance_nonmember_days: number | null
          booking_platform: string | null
          booking_type: string | null
          booking_url: string | null
          cafe_bar: boolean | null
          changing_rooms: boolean | null
          city: string | null
          coaching_available: boolean | null
          country: string | null
          country_code: string | null
          covered_courts: number | null
          created_at: string | null
          currency: string | null
          description: string | null
          doubles_courts: number | null
          dynamic_pricing_enabled: boolean | null
          dynamic_pricing_surcharge_pct: number | null
          dynamic_pricing_threshold_pct: number | null
          email: string | null
          equipment_rental: boolean | null
          external_ref: string | null
          facilities: Json | null
          full_address: string | null
          has_roof: boolean | null
          indoor_courts: number | null
          instagram: string | null
          is_members_only: boolean | null
          is_verified: boolean | null
          last_verified_at: string | null
          latitude: number | null
          longitude: number | null
          membership_note: string | null
          membership_required: boolean | null
          needs_review: boolean | null
          number_of_courts: number | null
          opening_hours: Json | null
          outdoor_courts: number | null
          panoramic_courts: number | null
          parking_available: boolean | null
          pay_per_play: boolean | null
          phone: string | null
          photos: Json | null
          postal_code: string | null
          postcode: string | null
          ppa_bookable: boolean | null
          price_pence: number | null
          price_per_hour: number | null
          price_per_player_pence: number | null
          pricing_tier: number | null
          rating: number | null
          review_count: number | null
          singles_courts: number | null
          status: string | null
          surface_type: string | null
          total_reviews: number | null
          typical_court_price_offpeak: number | null
          typical_court_price_peak: number | null
          updated_at: string | null
          venue_id: string | null
          venue_name: string | null
          venue_type: string | null
          venues_id: string | null
          verified: boolean | null
          website: string | null
          website_url: string | null
          whatsapp_number: string | null
        }
        Insert: {
          amenities?: Json | null
          booking_advance_info?: string | null
          booking_advance_member_days?: number | null
          booking_advance_nonmember_days?: number | null
          booking_platform?: string | null
          booking_type?: string | null
          booking_url?: string | null
          cafe_bar?: boolean | null
          changing_rooms?: boolean | null
          city?: string | null
          coaching_available?: boolean | null
          country?: string | null
          country_code?: string | null
          covered_courts?: number | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          doubles_courts?: number | null
          dynamic_pricing_enabled?: boolean | null
          dynamic_pricing_surcharge_pct?: number | null
          dynamic_pricing_threshold_pct?: number | null
          email?: string | null
          equipment_rental?: boolean | null
          external_ref?: string | null
          facilities?: Json | null
          full_address?: string | null
          has_roof?: boolean | null
          indoor_courts?: number | null
          instagram?: string | null
          is_members_only?: boolean | null
          is_verified?: boolean | null
          last_verified_at?: string | null
          latitude?: number | null
          longitude?: number | null
          membership_note?: string | null
          membership_required?: boolean | null
          needs_review?: boolean | null
          number_of_courts?: number | null
          opening_hours?: Json | null
          outdoor_courts?: number | null
          panoramic_courts?: number | null
          parking_available?: boolean | null
          pay_per_play?: boolean | null
          phone?: string | null
          photos?: Json | null
          postal_code?: string | null
          postcode?: string | null
          ppa_bookable?: boolean | null
          price_pence?: number | null
          price_per_hour?: number | null
          price_per_player_pence?: number | null
          pricing_tier?: number | null
          rating?: number | null
          review_count?: number | null
          singles_courts?: number | null
          status?: string | null
          surface_type?: string | null
          total_reviews?: number | null
          typical_court_price_offpeak?: number | null
          typical_court_price_peak?: number | null
          updated_at?: string | null
          venue_id?: string | null
          venue_name?: string | null
          venue_type?: string | null
          venues_id?: string | null
          verified?: boolean | null
          website?: string | null
          website_url?: string | null
          whatsapp_number?: string | null
        }
        Update: {
          amenities?: Json | null
          booking_advance_info?: string | null
          booking_advance_member_days?: number | null
          booking_advance_nonmember_days?: number | null
          booking_platform?: string | null
          booking_type?: string | null
          booking_url?: string | null
          cafe_bar?: boolean | null
          changing_rooms?: boolean | null
          city?: string | null
          coaching_available?: boolean | null
          country?: string | null
          country_code?: string | null
          covered_courts?: number | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          doubles_courts?: number | null
          dynamic_pricing_enabled?: boolean | null
          dynamic_pricing_surcharge_pct?: number | null
          dynamic_pricing_threshold_pct?: number | null
          email?: string | null
          equipment_rental?: boolean | null
          external_ref?: string | null
          facilities?: Json | null
          full_address?: string | null
          has_roof?: boolean | null
          indoor_courts?: number | null
          instagram?: string | null
          is_members_only?: boolean | null
          is_verified?: boolean | null
          last_verified_at?: string | null
          latitude?: number | null
          longitude?: number | null
          membership_note?: string | null
          membership_required?: boolean | null
          needs_review?: boolean | null
          number_of_courts?: number | null
          opening_hours?: Json | null
          outdoor_courts?: number | null
          panoramic_courts?: number | null
          parking_available?: boolean | null
          pay_per_play?: boolean | null
          phone?: string | null
          photos?: Json | null
          postal_code?: string | null
          postcode?: string | null
          ppa_bookable?: boolean | null
          price_pence?: number | null
          price_per_hour?: number | null
          price_per_player_pence?: number | null
          pricing_tier?: number | null
          rating?: number | null
          review_count?: number | null
          singles_courts?: number | null
          status?: string | null
          surface_type?: string | null
          total_reviews?: number | null
          typical_court_price_offpeak?: number | null
          typical_court_price_peak?: number | null
          updated_at?: string | null
          venue_id?: string | null
          venue_name?: string | null
          venue_type?: string | null
          venues_id?: string | null
          verified?: boolean | null
          website?: string | null
          website_url?: string | null
          whatsapp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "padel_venues_venues_id_fkey"
            columns: ["venues_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      geography_columns: {
        Row: {
          coord_dimension: number | null
          f_geography_column: unknown
          f_table_catalog: unknown
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Relationships: []
      }
      geometry_columns: {
        Row: {
          coord_dimension: number | null
          f_geometry_column: unknown
          f_table_catalog: string | null
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Insert: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Update: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Relationships: []
      }
      league_team_standings: {
        Row: {
          draws: number | null
          game_difference: number | null
          games_lost: number | null
          games_won: number | null
          league_id: string | null
          losses: number | null
          matches_played: number | null
          player1_id: string | null
          player2_id: string | null
          ranking_points: number | null
          team_id: string | null
          team_name: string | null
          wins: number | null
        }
        Relationships: [
          {
            foreignKeyName: "league_teams_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_teams_player1_id_fkey"
            columns: ["player1_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_teams_player1_id_fkey"
            columns: ["player1_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_teams_player2_id_fkey"
            columns: ["player2_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_teams_player2_id_fkey"
            columns: ["player2_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles_with_privacy: {
        Row: {
          availability_preferences: Json | null
          best_partner_id: string | null
          created_at: string | null
          email: string | null
          household_partner_id: string | null
          id: string | null
          internal_ranking: number | null
          name: string | null
          phone: string | null
          playtomic_level: number | null
          reliability_percent: number | null
          updated_at: string | null
          worst_partner_id: string | null
        }
        Insert: {
          availability_preferences?: Json | null
          best_partner_id?: string | null
          created_at?: string | null
          email?: never
          household_partner_id?: string | null
          id?: string | null
          internal_ranking?: number | null
          name?: string | null
          phone?: never
          playtomic_level?: number | null
          reliability_percent?: number | null
          updated_at?: string | null
          worst_partner_id?: string | null
        }
        Update: {
          availability_preferences?: Json | null
          best_partner_id?: string | null
          created_at?: string | null
          email?: never
          household_partner_id?: string | null
          id?: string | null
          internal_ranking?: number | null
          name?: string | null
          phone?: never
          playtomic_level?: number | null
          reliability_percent?: number | null
          updated_at?: string | null
          worst_partner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_best_partner_id_fkey"
            columns: ["best_partner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_best_partner_id_fkey"
            columns: ["best_partner_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_household_partner_id_fkey"
            columns: ["household_partner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_household_partner_id_fkey"
            columns: ["household_partner_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_worst_partner_id_fkey"
            columns: ["worst_partner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_worst_partner_id_fkey"
            columns: ["worst_partner_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_privacy"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _is_active_owner: { Args: { p_venue_id: string }; Returns: boolean }
      _postgis_deprecate: {
        Args: { newname: string; oldname: string; version: string }
        Returns: undefined
      }
      _postgis_index_extent: {
        Args: { col: string; tbl: unknown }
        Returns: unknown
      }
      _postgis_pgsql_version: { Args: never; Returns: string }
      _postgis_scripts_pgsql_version: { Args: never; Returns: string }
      _postgis_selectivity: {
        Args: { att_name: string; geom: unknown; mode?: string; tbl: unknown }
        Returns: number
      }
      _postgis_stats: {
        Args: { ""?: string; att_name: string; tbl: unknown }
        Returns: string
      }
      _st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_crosses: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      _st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_intersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      _st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      _st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      _st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_sortablehash: { Args: { geom: unknown }; Returns: number }
      _st_touches: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_voronoi: {
        Args: {
          clip?: unknown
          g1: unknown
          return_polygons?: boolean
          tolerance?: number
        }
        Returns: unknown
      }
      _st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      accept_connection_request: {
        Args: { p_requester_id: string }
        Returns: undefined
      }
      accept_venue_contract: { Args: { p_contract_id: string }; Returns: Json }
      activate_venue_contract: {
        Args: { p_contract_id: string }
        Returns: Json
      }
      add_venue_activity: {
        Args: {
          p_body: string
          p_kind: string
          p_metadata?: Json
          p_venue_id: string
        }
        Returns: string
      }
      add_venue_teammate: {
        Args: { p_email: string; p_role: string; p_venue_id: string }
        Returns: Json
      }
      addauth: { Args: { "": string }; Returns: boolean }
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              new_dim: number
              new_srid_in: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
      admin_approve_claim: {
        Args: { p_venue_users_user_id: string; p_venue_users_venue_id: string }
        Returns: Json
      }
      admin_billing_venues: {
        Args: never
        Returns: {
          charges_enabled: boolean
          city: string
          commission_rate_bps: number
          contract_accepted_at: string
          contract_id: string
          country: string
          created_at: string
          currency: string
          deal_notes: string
          is_founding_venue: boolean
          monthly_price_pence: number
          owner_email: string
          plan_tier: string
          ppa_bookable: boolean
          subscription_free_until: string
          venue_id: string
          venue_name: string
        }[]
      }
      admin_classify_venue: {
        Args: {
          p_clear_review?: boolean
          p_note?: string
          p_venue_id: string
          p_venue_type?: string
        }
        Returns: Json
      }
      admin_founder_slots: {
        Args: never
        Returns: {
          cap: number
          country_code: string
          enabled: boolean
          remaining: number
          used: number
        }[]
      }
      admin_list_venue_contracts: {
        Args: never
        Returns: {
          accepted_at: string
          city: string
          commission_rate_bps: number
          company_name: string
          contract_id: string
          currency: string
          end_date: string
          founder_seq: number
          monthly_credit_pence: number
          monthly_price_pence: number
          owner_email: string
          plan_tier: string
          signatory_name: string
          special_terms: string
          start_date: string
          status: string
          subscription_free_until: string
          updated_at: string
          vat_number: string
          venue_id: string
          venue_name: string
        }[]
      }
      admin_onboarding_insights: {
        Args: never
        Returns: {
          city: string
          country: string
          created_at: string
          current_provider: string
          needs: string[]
          offers_coaching: boolean
          owner_email: string
          venue_id: string
          venue_name: string
        }[]
      }
      admin_reject_claim: {
        Args: { p_venue_users_user_id: string; p_venue_users_venue_id: string }
        Returns: Json
      }
      admin_resolve_venue_postcode: {
        Args: { p_postcode: string; p_venue_id: string }
        Returns: Json
      }
      admin_review_venue: {
        Args: { p_approve: boolean; p_padel_venue_id: string }
        Returns: Json
      }
      admin_search_venues: {
        Args: { p_q: string }
        Returns: {
          city: string
          country: string
          has_contract: boolean
          has_owner: boolean
          venue_id: string
          venue_name: string
        }[]
      }
      admin_venue_support: { Args: { p_venue_id: string }; Returns: Json }
      apply_league_match_standings: {
        Args: { p_league_id: string; p_match_result_id: string; p_sets: Json }
        Returns: Json
      }
      apply_match_elo: {
        Args: { p_match_id: string; p_match_result_id: string; p_updates: Json }
        Returns: Json
      }
      are_connected: { Args: { a: string; b: string }; Returns: boolean }
      auto_resolve_expired_reviews: { Args: never; Returns: undefined }
      auto_verify_expired_results: { Args: never; Returns: number }
      auto_verify_old_pending_results: { Args: never; Returns: undefined }
      auto_verify_pending_results: { Args: never; Returns: undefined }
      auto_void_disputed_matches: { Args: never; Returns: undefined }
      award_entertainer_jersey: { Args: never; Returns: undefined }
      award_peer_vote_badges: {
        Args: { p_user_ids: string[] }
        Returns: undefined
      }
      award_weekly_jerseys: { Args: never; Returns: undefined }
      book_class: { Args: { p_session_id: string }; Returns: Json }
      calculate_all_league_standings: {
        Args: { p_league_id: string }
        Returns: undefined
      }
      calculate_household_league_standings: {
        Args: { p_league_id: string }
        Returns: undefined
      }
      calculate_league_standings: {
        Args: { p_league_id: string }
        Returns: Json
      }
      calculate_league_tiers: {
        Args: { p_league_id: string }
        Returns: undefined
      }
      calculate_margin_multiplier: {
        Args: { games_diff: number }
        Returns: number
      }
      cancel_class: { Args: { p_session_id: string }; Returns: Json }
      change_plan_contract: {
        Args: { p_plan_key: string; p_venue_id: string }
        Returns: Json
      }
      check_cron_health: { Args: never; Returns: Json }
      check_overdue_matches: { Args: never; Returns: undefined }
      check_self_conflict: {
        Args: {
          p_exclude_match_id?: string
          p_match_date: string
          p_match_time: string
          p_user_id: string
        }
        Returns: {
          conflicting_match_id: string
          conflicting_time: string
        }[]
      }
      claim_match_guest_invite: { Args: { p_token: string }; Returns: Json }
      claim_open_match: { Args: { p_match_id: string }; Returns: Json }
      claim_venue: { Args: { p_padel_venue_id: string }; Returns: string }
      claim_venue_transfer: {
        Args: { p_padel_venue_id: string; p_token: string }
        Returns: Json
      }
      classify_set_sql: {
        Args: { p_g1: number; p_g2: number }
        Returns: {
          is_completed: boolean
          is_void: boolean
          winner: number
        }[]
      }
      cleanup_expired_investor_tokens: { Args: never; Returns: undefined }
      close_expired_polls: { Args: never; Returns: number }
      confirm_invitee_for_match: {
        Args: { p_invitee_id: string; p_match_id: string }
        Returns: Json
      }
      confirm_match_result: {
        Args: { p_match_result_id: string; p_voter_id: string }
        Returns: undefined
      }
      confirm_poll_schedule: {
        Args: { p_benched_ids?: string[]; p_poll_id: string; p_schedule: Json }
        Returns: Json
      }
      confirm_ringer_for_match: {
        Args: { p_match_id: string; p_ringer_id: string }
        Returns: Json
      }
      count_open_match_audience: {
        Args: {
          p_elo_max: number
          p_elo_min: number
          p_exclude_player_ids: string[]
          p_lat: number
          p_lng: number
          p_radius_miles?: number
        }
        Returns: number
      }
      court_utilisation: {
        Args: { p_from: string; p_to: string; p_venue_id: string }
        Returns: {
          avail_minutes: number
          booked_minutes: number
          court_id: string
          court_name: string
          dow: number
          hour: number
          occupancy_pct: number
        }[]
      }
      create_match_guest_invite: {
        Args: {
          p_contact?: string
          p_guest_name: string
          p_match_id: string
          p_replace_player_id?: string
        }
        Returns: Json
      }
      create_owned_venue: { Args: { p: Json }; Returns: Json }
      create_standard_contract: {
        Args: { p_plan_key: string; p_venue_id: string }
        Returns: Json
      }
      cron_health_heartbeat: { Args: never; Returns: undefined }
      delete_match_cascade: { Args: { p_match_id: string }; Returns: undefined }
      delete_user: { Args: never; Returns: Json }
      disablelongtransactions: { Args: never; Returns: string }
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { column_name: string; table_name: string }; Returns: string }
      dropgeometrytable:
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { schema_name: string; table_name: string }; Returns: string }
        | { Args: { table_name: string }; Returns: string }
      enablelongtransactions: { Args: never; Returns: string }
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      format_money: {
        Args: { p_currency: string; p_minor: number }
        Returns: string
      }
      geometry: { Args: { "": string }; Returns: unknown }
      geometry_above: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_below: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_cmp: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_contained_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_distance_box: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_distance_centroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_eq: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_ge: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_gt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_le: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_left: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_lt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overabove: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overbelow: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overleft: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overright: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_right: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_within: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geomfromewkt: { Args: { "": string }; Returns: unknown }
      get_claimable_venue: {
        Args: { p_venue_id: string }
        Returns: {
          city: string
          full_address: string
          postcode: string
          venue_id: string
          venue_name: string
          venues_id: string
          website: string
        }[]
      }
      get_household_conflicts: {
        Args: { _match_date: string; _match_time: string; _user_ids: string[] }
        Returns: {
          conflicting_household_member: string
          conflicting_match_id: string
          conflicting_time: string
          description: string
          household_partner_id: string
          user_id: string
        }[]
      }
      get_league_climbers: {
        Args: { p_league_id: string }
        Returns: {
          elo_gained: number
          user_id: string
        }[]
      }
      get_league_upsets: {
        Args: { p_league_id: string }
        Returns: {
          upset_wins: number
          user_id: string
        }[]
      }
      get_leagues_for_group: {
        Args: { p_group_id: string }
        Returns: {
          achievements_enabled: boolean | null
          auto_generate_fixtures: boolean | null
          banner_url: string | null
          break_duration_mins: number | null
          city: string | null
          country: string | null
          courts_available: number | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          description: string | null
          elo_max: number | null
          elo_min: number | null
          entry_fee_pence: number | null
          format: string | null
          gamification_enabled: boolean | null
          id: string
          is_official: boolean | null
          is_open_registration: boolean | null
          linked_group_ids: string[] | null
          match_duration_mins: number | null
          match_type: string | null
          max_elo: number | null
          max_participants: number | null
          max_rounds: number | null
          min_elo: number | null
          min_sets_per_fixture: number
          name: string
          open_join_approval: boolean | null
          prize_scheme: Json | null
          prizes: string | null
          scoring_format: string | null
          season_end: string | null
          season_start: string | null
          source_type: string | null
          source_venue_id: string | null
          status: string | null
          tournament_end: string | null
          tournament_start: string | null
          visibility: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "leagues"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_leagues_for_groups: {
        Args: { p_group_ids: string[] }
        Returns: {
          achievements_enabled: boolean | null
          auto_generate_fixtures: boolean | null
          banner_url: string | null
          break_duration_mins: number | null
          city: string | null
          country: string | null
          courts_available: number | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          description: string | null
          elo_max: number | null
          elo_min: number | null
          entry_fee_pence: number | null
          format: string | null
          gamification_enabled: boolean | null
          id: string
          is_official: boolean | null
          is_open_registration: boolean | null
          linked_group_ids: string[] | null
          match_duration_mins: number | null
          match_type: string | null
          max_elo: number | null
          max_participants: number | null
          max_rounds: number | null
          min_elo: number | null
          min_sets_per_fixture: number
          name: string
          open_join_approval: boolean | null
          prize_scheme: Json | null
          prizes: string | null
          scoring_format: string | null
          season_end: string | null
          season_start: string | null
          source_type: string | null
          source_venue_id: string | null
          status: string | null
          tournament_end: string | null
          tournament_start: string | null
          visibility: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "leagues"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_match_invite_preview: { Args: { p_token: string }; Returns: Json }
      get_rider_address_for_driver: {
        Args: { p_match_id: string; p_rider_id: string }
        Returns: {
          city: string
          latitude: number
          longitude: number
          postal_code: string
        }[]
      }
      get_venue_activity: {
        Args: { p_limit?: number; p_offset?: number; p_venue_id: string }
        Returns: {
          actor_email: string
          body: string
          channel: string
          created_at: string
          id: string
          kind: string
          metadata: Json
          subject: string
        }[]
      }
      get_verified_peer_vote_counts: {
        Args: { p_user_id?: string }
        Returns: {
          user_id: string
          vote_category: string
          vote_count: number
        }[]
      }
      get_weekly_league_vote_standings: {
        Args: { p_league_id: string; p_week_start?: string }
        Returns: {
          user_id: string
          vote_count: number
        }[]
      }
      gettransactionid: { Args: never; Returns: unknown }
      grant_founder_contract: { Args: { p_venue_id: string }; Returns: Json }
      haversine_miles: {
        Args: { lat1: number; lat2: number; lng1: number; lng2: number }
        Returns: number
      }
      is_auth_user: { Args: { user_id: string }; Returns: boolean }
      is_group_admin: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      is_group_member: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      is_venue_owner: { Args: { p_venue_id: string }; Returns: boolean }
      is_venue_staff: { Args: { p_venue_id: string }; Returns: boolean }
      join_group_by_invite: {
        Args: { _invite_code: string; _user_id: string }
        Returns: Json
      }
      join_league: {
        Args: { p_league_id: string; p_user_id: string }
        Returns: undefined
      }
      join_league_bulk: {
        Args: { p_league_id: string; p_user_ids: string[] }
        Returns: Json
      }
      join_venue_event: {
        Args: {
          p_occurrence_id: string
          p_order_item_id?: string
          p_stripe_pi_id?: string
        }
        Returns: Json
      }
      league_points_for_result: { Args: { p_result: string }; Returns: number }
      leave_match: { Args: { p_match_id: string }; Returns: Json }
      leave_venue_event: { Args: { p_occurrence_id: string }; Returns: Json }
      list_venue_team: {
        Args: { p_venue_id: string }
        Returns: {
          created_at: string
          email: string
          name: string
          role: string
          status: string
          user_id: string
        }[]
      }
      longtransactionsenabled: { Args: never; Returns: boolean }
      notifiable_players: {
        Args: { p_player_ids: string[] }
        Returns: string[]
      }
      notify_platform_admins: {
        Args: { p_message: string; p_title: string; p_type: string }
        Returns: number
      }
      platform_admin_emails: { Args: never; Returns: string[] }
      populate_geometry_columns:
        | { Args: { tbl_oid: unknown; use_typmod?: boolean }; Returns: number }
        | { Args: { use_typmod?: boolean }; Returns: string }
      postgis_constraint_dims: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_srid: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_type: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: string
      }
      postgis_extensions_upgrade: { Args: never; Returns: string }
      postgis_full_version: { Args: never; Returns: string }
      postgis_geos_version: { Args: never; Returns: string }
      postgis_lib_build_date: { Args: never; Returns: string }
      postgis_lib_revision: { Args: never; Returns: string }
      postgis_lib_version: { Args: never; Returns: string }
      postgis_libjson_version: { Args: never; Returns: string }
      postgis_liblwgeom_version: { Args: never; Returns: string }
      postgis_libprotobuf_version: { Args: never; Returns: string }
      postgis_libxml_version: { Args: never; Returns: string }
      postgis_proj_version: { Args: never; Returns: string }
      postgis_scripts_build_date: { Args: never; Returns: string }
      postgis_scripts_installed: { Args: never; Returns: string }
      postgis_scripts_released: { Args: never; Returns: string }
      postgis_svn_version: { Args: never; Returns: string }
      postgis_type_name: {
        Args: {
          coord_dimension: number
          geomname: string
          use_new_name?: boolean
        }
        Returns: string
      }
      postgis_version: { Args: never; Returns: string }
      postgis_wagyu_version: { Args: never; Returns: string }
      preview_standard_pricing: {
        Args: { p_venue_id: string }
        Returns: {
          commission_rate_bps: number
          currency: string
          is_available: boolean
          monthly_price_minor: number
          name: string
          plan_key: string
          pricing_country_code: string
        }[]
      }
      promote_to_group_admin: {
        Args: { p_group_id: string; p_new_admin_id: string }
        Returns: undefined
      }
      push_match_to_open: {
        Args: { p_elo_max: number; p_elo_min: number; p_match_id: string }
        Returns: Json
      }
      rebuild_league_standings: { Args: { p_league_id: string }; Returns: Json }
      record_ranking_snapshot: { Args: never; Returns: undefined }
      redeem_voucher: {
        Args: {
          p_amount_pence: number
          p_booking_id?: string
          p_code: string
          p_user_id?: string
          p_venue_id: string
        }
        Returns: Json
      }
      remove_teammate: {
        Args: { p_user_id: string; p_venue_id: string }
        Returns: Json
      }
      request_household_link: {
        Args: { p_partner_id: string }
        Returns: undefined
      }
      reset_league_season: { Args: { p_league_id: string }; Returns: undefined }
      resolve_country_pricing: {
        Args: { p_country_code: string }
        Returns: {
          band_key: string
          confidence: string
          currency: string
          min_fee_minor: number
          reference_court_hour_minor: number
        }[]
      }
      resolve_court_price: {
        Args: {
          p_court_id?: string
          p_date?: string
          p_duration_minutes?: number
          p_play_type?: string
          p_start_time?: string
          p_user_id?: string
          p_venue_id: string
        }
        Returns: Json
      }
      respond_household_link: {
        Args: { p_accept: boolean; p_request_id: string }
        Returns: undefined
      }
      respond_match_invitation: {
        Args: { p_accept: boolean; p_match_id: string }
        Returns: Json
      }
      respond_ringer_request: {
        Args: { p_accept: boolean; p_match_id: string }
        Returns: Json
      }
      revert_open_match: { Args: { p_match_id: string }; Returns: Json }
      save_venue_onboarding: {
        Args: {
          p_current_provider: string
          p_needs: string[]
          p_offers_coaching: boolean
          p_venue_id: string
        }
        Returns: undefined
      }
      search_claimable_venues: {
        Args: { p_query: string }
        Returns: {
          city: string
          country: string
          full_address: string
          postcode: string
          venue_id: string
          venue_name: string
          venues_id: string
          website: string
        }[]
      }
      self_report_booking: {
        Args: {
          p_booking_reference?: string
          p_court_number?: number
          p_match_id: string
          p_total_cost_pence?: number
          p_venue_id: string
          p_venue_name: string
        }
        Returns: Json
      }
      send_deadline_approaching_alerts: { Args: never; Returns: undefined }
      send_match_invitations: {
        Args: { p_invitee_ids: string[]; p_match_id: string }
        Returns: Json
      }
      send_match_reminders: { Args: never; Returns: undefined }
      send_match_result_prompts: { Args: never; Returns: undefined }
      send_ringer_requests: {
        Args: { p_match_id: string; p_ringer_ids: string[] }
        Returns: Json
      }
      set_teammate_role: {
        Args: { p_role: string; p_user_id: string; p_venue_id: string }
        Returns: Json
      }
      set_venue_commission: {
        Args: {
          p_founding?: boolean
          p_rate_bps?: number
          p_tier?: string
          p_venue_id: string
        }
        Returns: Json
      }
      set_venue_deal: {
        Args: {
          p_deal_notes?: string
          p_founding?: boolean
          p_free_until?: string
          p_monthly_price_pence?: number
          p_rate_bps?: number
          p_tier?: string
          p_venue_id: string
        }
        Returns: Json
      }
      sorted_player_key: { Args: { ids: string[] }; Returns: string }
      st_3dclosestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3ddistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_3dlongestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmakebox: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmaxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dshortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_addpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_angle:
        | { Args: { line1: unknown; line2: unknown }; Returns: number }
        | {
            Args: { pt1: unknown; pt2: unknown; pt3: unknown; pt4?: unknown }
            Returns: number
          }
      st_area:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_asencodedpolyline: {
        Args: { geom: unknown; nprecision?: number }
        Returns: string
      }
      st_asewkt: { Args: { "": string }; Returns: string }
      st_asgeojson:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: {
              geom_column?: string
              maxdecimaldigits?: number
              pretty_bool?: boolean
              r: Record<string, unknown>
            }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_asgml:
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
            }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
      st_askml:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_aslatlontext: {
        Args: { geom: unknown; tmpl?: string }
        Returns: string
      }
      st_asmarc21: { Args: { format?: string; geom: unknown }; Returns: string }
      st_asmvtgeom: {
        Args: {
          bounds: unknown
          buffer?: number
          clip_geom?: boolean
          extent?: number
          geom: unknown
        }
        Returns: unknown
      }
      st_assvg:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_astext: { Args: { "": string }; Returns: string }
      st_astwkb:
        | {
            Args: {
              geom: unknown
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown[]
              ids: number[]
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
      st_asx3d: {
        Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
        Returns: string
      }
      st_azimuth:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_boundingdiagonal: {
        Args: { fits?: boolean; geom: unknown }
        Returns: unknown
      }
      st_buffer:
        | {
            Args: { geom: unknown; options?: string; radius: number }
            Returns: unknown
          }
        | {
            Args: { geom: unknown; quadsegs: number; radius: number }
            Returns: unknown
          }
      st_centroid: { Args: { "": string }; Returns: unknown }
      st_clipbybox2d: {
        Args: { box: unknown; geom: unknown }
        Returns: unknown
      }
      st_closestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_collect: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_concavehull: {
        Args: {
          param_allow_holes?: boolean
          param_geom: unknown
          param_pctconvex: number
        }
        Returns: unknown
      }
      st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_coorddim: { Args: { geometry: unknown }; Returns: number }
      st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_crosses: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_curvetoline: {
        Args: { flags?: number; geom: unknown; tol?: number; toltype?: number }
        Returns: unknown
      }
      st_delaunaytriangles: {
        Args: { flags?: number; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_difference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_disjoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_distance:
        | {
            Args: { geog1: unknown; geog2: unknown; use_spheroid?: boolean }
            Returns: number
          }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_distancesphere:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | {
            Args: { geom1: unknown; geom2: unknown; radius: number }
            Returns: number
          }
      st_distancespheroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_expand:
        | { Args: { box: unknown; dx: number; dy: number }; Returns: unknown }
        | {
            Args: { box: unknown; dx: number; dy: number; dz?: number }
            Returns: unknown
          }
        | {
            Args: {
              dm?: number
              dx: number
              dy: number
              dz?: number
              geom: unknown
            }
            Returns: unknown
          }
      st_force3d: { Args: { geom: unknown; zvalue?: number }; Returns: unknown }
      st_force3dm: {
        Args: { geom: unknown; mvalue?: number }
        Returns: unknown
      }
      st_force3dz: {
        Args: { geom: unknown; zvalue?: number }
        Returns: unknown
      }
      st_force4d: {
        Args: { geom: unknown; mvalue?: number; zvalue?: number }
        Returns: unknown
      }
      st_generatepoints:
        | { Args: { area: unknown; npoints: number }; Returns: unknown }
        | {
            Args: { area: unknown; npoints: number; seed: number }
            Returns: unknown
          }
      st_geogfromtext: { Args: { "": string }; Returns: unknown }
      st_geographyfromtext: { Args: { "": string }; Returns: unknown }
      st_geohash:
        | { Args: { geog: unknown; maxchars?: number }; Returns: string }
        | { Args: { geom: unknown; maxchars?: number }; Returns: string }
      st_geomcollfromtext: { Args: { "": string }; Returns: unknown }
      st_geometricmedian: {
        Args: {
          fail_if_not_converged?: boolean
          g: unknown
          max_iter?: number
          tolerance?: number
        }
        Returns: unknown
      }
      st_geometryfromtext: { Args: { "": string }; Returns: unknown }
      st_geomfromewkt: { Args: { "": string }; Returns: unknown }
      st_geomfromgeojson:
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": string }; Returns: unknown }
      st_geomfromgml: { Args: { "": string }; Returns: unknown }
      st_geomfromkml: { Args: { "": string }; Returns: unknown }
      st_geomfrommarc21: { Args: { marc21xml: string }; Returns: unknown }
      st_geomfromtext: { Args: { "": string }; Returns: unknown }
      st_gmltosql: { Args: { "": string }; Returns: unknown }
      st_hasarc: { Args: { geometry: unknown }; Returns: boolean }
      st_hausdorffdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_hexagon: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_hexagongrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_interpolatepoint: {
        Args: { line: unknown; point: unknown }
        Returns: number
      }
      st_intersection: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_intersects:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_isvaliddetail: {
        Args: { flags?: number; geom: unknown }
        Returns: Database["public"]["CompositeTypes"]["valid_detail"]
        SetofOptions: {
          from: "*"
          to: "valid_detail"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      st_length:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_letters: { Args: { font?: Json; letters: string }; Returns: unknown }
      st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      st_linefromencodedpolyline: {
        Args: { nprecision?: number; txtin: string }
        Returns: unknown
      }
      st_linefromtext: { Args: { "": string }; Returns: unknown }
      st_linelocatepoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_linetocurve: { Args: { geometry: unknown }; Returns: unknown }
      st_locatealong: {
        Args: { geometry: unknown; leftrightoffset?: number; measure: number }
        Returns: unknown
      }
      st_locatebetween: {
        Args: {
          frommeasure: number
          geometry: unknown
          leftrightoffset?: number
          tomeasure: number
        }
        Returns: unknown
      }
      st_locatebetweenelevations: {
        Args: { fromelevation: number; geometry: unknown; toelevation: number }
        Returns: unknown
      }
      st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makebox2d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makeline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makevalid: {
        Args: { geom: unknown; params: string }
        Returns: unknown
      }
      st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_minimumboundingcircle: {
        Args: { inputgeom: unknown; segs_per_quarter?: number }
        Returns: unknown
      }
      st_mlinefromtext: { Args: { "": string }; Returns: unknown }
      st_mpointfromtext: { Args: { "": string }; Returns: unknown }
      st_mpolyfromtext: { Args: { "": string }; Returns: unknown }
      st_multilinestringfromtext: { Args: { "": string }; Returns: unknown }
      st_multipointfromtext: { Args: { "": string }; Returns: unknown }
      st_multipolygonfromtext: { Args: { "": string }; Returns: unknown }
      st_node: { Args: { g: unknown }; Returns: unknown }
      st_normalize: { Args: { geom: unknown }; Returns: unknown }
      st_offsetcurve: {
        Args: { distance: number; line: unknown; params?: string }
        Returns: unknown
      }
      st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_perimeter: {
        Args: { geog: unknown; use_spheroid?: boolean }
        Returns: number
      }
      st_pointfromtext: { Args: { "": string }; Returns: unknown }
      st_pointm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
        }
        Returns: unknown
      }
      st_pointz: {
        Args: {
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_pointzm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_polyfromtext: { Args: { "": string }; Returns: unknown }
      st_polygonfromtext: { Args: { "": string }; Returns: unknown }
      st_project: {
        Args: { azimuth: number; distance: number; geog: unknown }
        Returns: unknown
      }
      st_quantizecoordinates: {
        Args: {
          g: unknown
          prec_m?: number
          prec_x: number
          prec_y?: number
          prec_z?: number
        }
        Returns: unknown
      }
      st_reduceprecision: {
        Args: { geom: unknown; gridsize: number }
        Returns: unknown
      }
      st_relate: { Args: { geom1: unknown; geom2: unknown }; Returns: string }
      st_removerepeatedpoints: {
        Args: { geom: unknown; tolerance?: number }
        Returns: unknown
      }
      st_segmentize: {
        Args: { geog: unknown; max_segment_length: number }
        Returns: unknown
      }
      st_setsrid:
        | { Args: { geog: unknown; srid: number }; Returns: unknown }
        | { Args: { geom: unknown; srid: number }; Returns: unknown }
      st_sharedpaths: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_shortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_simplifypolygonhull: {
        Args: { geom: unknown; is_outer?: boolean; vertex_fraction: number }
        Returns: unknown
      }
      st_split: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_square: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_squaregrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_srid:
        | { Args: { geog: unknown }; Returns: number }
        | { Args: { geom: unknown }; Returns: number }
      st_subdivide: {
        Args: { geom: unknown; gridsize?: number; maxvertices?: number }
        Returns: unknown[]
      }
      st_swapordinates: {
        Args: { geom: unknown; ords: unknown }
        Returns: unknown
      }
      st_symdifference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_symmetricdifference: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_tileenvelope: {
        Args: {
          bounds?: unknown
          margin?: number
          x: number
          y: number
          zoom: number
        }
        Returns: unknown
      }
      st_touches: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_transform:
        | {
            Args: { from_proj: string; geom: unknown; to_proj: string }
            Returns: unknown
          }
        | {
            Args: { from_proj: string; geom: unknown; to_srid: number }
            Returns: unknown
          }
        | { Args: { geom: unknown; to_proj: string }; Returns: unknown }
      st_triangulatepolygon: { Args: { g1: unknown }; Returns: unknown }
      st_union:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
        | {
            Args: { geom1: unknown; geom2: unknown; gridsize: number }
            Returns: unknown
          }
      st_voronoilines: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_voronoipolygons: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_wkbtosql: { Args: { wkb: string }; Returns: unknown }
      st_wkttosql: { Args: { "": string }; Returns: unknown }
      st_wrapx: {
        Args: { geom: unknown; move: number; wrap: number }
        Returns: unknown
      }
      switch_teams: {
        Args: { p_match_id: string; p_team1: string[]; p_team2: string[] }
        Returns: Json
      }
      unlink_household_partner: { Args: never; Returns: undefined }
      unlockrows: { Args: { "": string }; Returns: number }
      update_league_rankings: {
        Args: { _match_result_id: string }
        Returns: undefined
      }
      update_open_match_range: {
        Args: { p_elo_max: number; p_elo_min: number; p_match_id: string }
        Returns: Json
      }
      update_paid_player_ids: {
        Args: { p_booking_id: string; p_paid_player_ids: Json }
        Returns: undefined
      }
      updategeometrysrid: {
        Args: {
          catalogn_name: string
          column_name: string
          new_srid_in: number
          schema_name: string
          table_name: string
        }
        Returns: string
      }
      validate_voucher: {
        Args: {
          p_amount_pence?: number
          p_code: string
          p_user_id?: string
          p_venue_id: string
        }
        Returns: Json
      }
      venues_near: {
        Args: {
          p_lat: number
          p_limit?: number
          p_lng: number
          p_radius_miles?: number
          p_venue_type?: string
        }
        Returns: {
          booking_platform: string
          booking_url: string
          city: string
          country_code: string
          covered_courts: number
          distance_miles: number
          indoor_courts: number
          latitude: number
          longitude: number
          needs_review: boolean
          number_of_courts: number
          outdoor_courts: number
          photos: Json
          postcode: string
          ppa_bookable: boolean
          price_pence: number
          price_per_hour: number
          rating: number
          venue_id: string
          venue_name: string
          venue_type: string
          venues_id: string
        }[]
      }
      verify_claim_token: {
        Args: { p_token: string; p_venue_id: string }
        Returns: Json
      }
      wants_push: {
        Args: { p_type: string; p_user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      group_role: "member" | "admin"
      poll_type: "competitive" | "friendly"
    }
    CompositeTypes: {
      geometry_dump: {
        path: number[] | null
        geom: unknown
      }
      valid_detail: {
        valid: boolean | null
        reason: string | null
        location: unknown
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      group_role: ["member", "admin"],
      poll_type: ["competitive", "friendly"],
    },
  },
} as const
