-- H1: Player-facing "I play here" signal for unclaimed venues.
--
-- venue_claim_requests doesn't fit — it requires full_name, role, phone, email,
-- verification_note (all NOT NULL), which a player doesn't have and shouldn't fake.
-- This table stores venue_id + user_id only. The Hub admin screen ranks venues
-- by player count so Wynaxa can prioritise outreach.
--
-- Applied in Supabase SQL Editor on 2026-09-16.

CREATE TABLE player_venue_interest (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id   uuid NOT NULL REFERENCES padel_venues(venue_id),
  user_id    uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE (venue_id, user_id)
);

ALTER TABLE player_venue_interest ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players can flag a venue"
  ON player_venue_interest FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Players can read their own flags"
  ON player_venue_interest FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role reads all"
  ON player_venue_interest FOR SELECT
  USING (auth.role() = 'service_role');
