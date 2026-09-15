-- ── Court Booking Commercial Infrastructure ────────────────────────────────────

-- 1. Mark The Padel Team Bristol as PPA-native bookable
ALTER TABLE padel_venues
ADD COLUMN IF NOT EXISTS ppa_bookable boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS price_pence integer DEFAULT 3600,
ADD COLUMN IF NOT EXISTS price_per_player_pence integer DEFAULT 900;

UPDATE padel_venues
SET ppa_bookable = true,
    price_pence = 3600,
    price_per_player_pence = 900
WHERE venue_id = '237aa440-7f1a-40ea-95b2-5296fbe01a40';

-- 2. Extend advance booking window for TPT Bristol
UPDATE court_availability_settings
SET max_advance_days = 21
WHERE venue_id = '237aa440-7f1a-40ea-95b2-5296fbe01a40';

-- 3. Add missing columns to existing court_bookings table
ALTER TABLE court_bookings
ADD COLUMN IF NOT EXISTS guest_players          jsonb       NOT NULL DEFAULT '[]',
ADD COLUMN IF NOT EXISTS paid_player_ids        jsonb       NOT NULL DEFAULT '[]',
ADD COLUMN IF NOT EXISTS payment_links          jsonb       NOT NULL DEFAULT '{}',
ADD COLUMN IF NOT EXISTS payment_links_sent     boolean     NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS payment_deadline       timestamptz,
ADD COLUMN IF NOT EXISTS total_price_pence      integer     NOT NULL DEFAULT 3600,
ADD COLUMN IF NOT EXISTS price_per_player_pence integer     NOT NULL DEFAULT 900,
ADD COLUMN IF NOT EXISTS booker_stripe_pi_id    text;

-- Backfill booking_reference for any null rows
UPDATE court_bookings
SET booking_reference = upper(left(replace(gen_random_uuid()::text,'-',''),8))
WHERE booking_reference IS NULL;

-- 4. User loyalty stamps — stored per-venue in a simple table
CREATE TABLE IF NOT EXISTS user_venue_stamps (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  venue_id       uuid        NOT NULL,
  stamp_count    int         NOT NULL DEFAULT 0,
  lifetime_stamps int        NOT NULL DEFAULT 0,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, venue_id)
);

ALTER TABLE user_venue_stamps ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "user_venue_stamps_own"
    ON user_venue_stamps FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "user_venue_stamps_insert"
    ON user_venue_stamps FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "user_venue_stamps_update"
    ON user_venue_stamps FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 5. Venue rewards table
CREATE TABLE IF NOT EXISTS venue_rewards (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  venue_id        uuid        NOT NULL,
  reward_type     text        NOT NULL,
  status          text        NOT NULL DEFAULT 'available',
  earned_at       timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz DEFAULT now() + interval '6 months',
  redeemed_at     timestamptz,
  redemption_code text        NOT NULL DEFAULT upper(left(replace(gen_random_uuid()::text,'-',''),8))
);

ALTER TABLE venue_rewards ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "venue_rewards_own"
    ON venue_rewards FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "venue_rewards_service"
    ON venue_rewards FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
