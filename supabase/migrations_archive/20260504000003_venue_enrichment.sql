-- ── Venue enrichment: rich data fields ───────────────────────────────────────

ALTER TABLE padel_venues
ADD COLUMN IF NOT EXISTS outdoor_courts int DEFAULT 0,
ADD COLUMN IF NOT EXISTS indoor_courts int DEFAULT 0,
ADD COLUMN IF NOT EXISTS covered_courts int DEFAULT 0,
ADD COLUMN IF NOT EXISTS singles_courts boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS opening_hours jsonb DEFAULT '{"monday":{"open":"07:00","close":"22:00"},"tuesday":{"open":"07:00","close":"22:00"},"wednesday":{"open":"07:00","close":"22:00"},"thursday":{"open":"07:00","close":"22:00"},"friday":{"open":"07:00","close":"22:00"},"saturday":{"open":"08:00","close":"21:00"},"sunday":{"open":"08:00","close":"21:00"}}',
ADD COLUMN IF NOT EXISTS pricing_tier int DEFAULT 2,
ADD COLUMN IF NOT EXISTS price_per_hour int DEFAULT 0,
ADD COLUMN IF NOT EXISTS facilities jsonb DEFAULT '[]',
ADD COLUMN IF NOT EXISTS photos jsonb DEFAULT '[]',
ADD COLUMN IF NOT EXISTS description text,
ADD COLUMN IF NOT EXISTS surface_type text DEFAULT 'artificial_grass',
ADD COLUMN IF NOT EXISTS is_members_only boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS membership_note text,
ADD COLUMN IF NOT EXISTS phone text,
ADD COLUMN IF NOT EXISTS email text,
ADD COLUMN IF NOT EXISTS instagram text,
ADD COLUMN IF NOT EXISTS website text,
ADD COLUMN IF NOT EXISTS postcode text,
ADD COLUMN IF NOT EXISTS country_code text DEFAULT 'GB',
ADD COLUMN IF NOT EXISTS rating numeric(3,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS review_count int DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_verified boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS last_verified_at timestamptz;

-- The Padel Team Bristol
UPDATE padel_venues SET
  outdoor_courts = 0, indoor_courts = 7, covered_courts = 0,
  opening_hours = '{"monday":{"open":"07:00","close":"22:00"},"tuesday":{"open":"07:00","close":"22:00"},"wednesday":{"open":"07:00","close":"22:00"},"thursday":{"open":"07:00","close":"22:00"},"friday":{"open":"07:00","close":"22:00"},"saturday":{"open":"08:00","close":"21:00"},"sunday":{"open":"08:00","close":"21:00"}}',
  pricing_tier = 2,
  facilities = '["parking","changing_rooms","coaching","equipment_hire","cafe","showers"]',
  surface_type = 'artificial_grass',
  is_verified = true, last_verified_at = NOW(),
  postcode = 'BS3 2EW', country_code = 'GB',
  description = 'The premier padel venue in Bristol with 7 indoor courts. Home of BS3 Padel Players and available for PPA native booking.'
WHERE venue_name = 'The Padel Team Bristol';

-- Rocket Padel Bristol
UPDATE padel_venues SET
  indoor_courts = 4, pricing_tier = 2,
  facilities = '["parking","changing_rooms","bar","coaching","equipment_hire","showers"]',
  surface_type = 'artificial_grass', postcode = 'BS1 3XT', country_code = 'GB'
WHERE venue_name = 'Rocket Padel Bristol';

-- Surge Padel Bristol
UPDATE padel_venues SET
  outdoor_courts = 2, indoor_courts = 2, pricing_tier = 2,
  facilities = '["parking","changing_rooms","showers"]',
  postcode = 'BS13 7TQ', country_code = 'GB'
WHERE venue_name = 'Surge Padel Bristol';

-- London venues → premium
UPDATE padel_venues SET
  pricing_tier = 3,
  facilities = '["parking","changing_rooms","bar","coaching","equipment_hire","cafe","showers","lockers","viewing_area"]'
WHERE city = 'London' AND pricing_tier = 2;

-- Dublin/Ireland venues
UPDATE padel_venues SET
  country_code = 'IE', pricing_tier = 2,
  facilities = '["parking","changing_rooms","showers"]'
WHERE city IN ('Dublin','Cork','Limerick','Galway','Celbridge') AND country_code = 'GB';

-- David Lloyd venues → members only, premium
UPDATE padel_venues SET
  is_members_only = true, pricing_tier = 3,
  membership_note = 'David Lloyd membership required',
  facilities = '["parking","changing_rooms","bar","coaching","equipment_hire","cafe","showers","lockers","viewing_area"]'
WHERE venue_name ILIKE '%David Lloyd%';

-- ── Venue ratings table ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS venue_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rating int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(venue_id, user_id)
);

ALTER TABLE venue_ratings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "venue_ratings_read" ON venue_ratings FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "venue_ratings_insert" ON venue_ratings FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "venue_ratings_update" ON venue_ratings FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
