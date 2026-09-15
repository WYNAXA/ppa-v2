-- ── Two-tier user model: source tracking + venue managers ─────────────────────

-- Source tracking on events
ALTER TABLE events
ADD COLUMN IF NOT EXISTS source_type text DEFAULT 'player',
ADD COLUMN IF NOT EXISTS source_venue_id uuid,
ADD COLUMN IF NOT EXISTS is_official boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS registration_open boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS registration_deadline timestamptz,
ADD COLUMN IF NOT EXISTS entry_fee_pence int DEFAULT 0,
ADD COLUMN IF NOT EXISTS target_radius_miles int DEFAULT 10;

-- Source tracking on leagues
ALTER TABLE leagues
ADD COLUMN IF NOT EXISTS source_type text DEFAULT 'player',
ADD COLUMN IF NOT EXISTS source_venue_id uuid,
ADD COLUMN IF NOT EXISTS is_official boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS is_open_registration boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS entry_fee_pence int DEFAULT 0;

-- Profile account type
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS account_type text DEFAULT 'player',
ADD COLUMN IF NOT EXISTS is_verified boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS verified_venue_id uuid;

-- Venue managers table
CREATE TABLE IF NOT EXISTS venue_managers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'manager',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(venue_id, user_id)
);

ALTER TABLE venue_managers ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "venue_managers_view" ON venue_managers FOR SELECT TO authenticated
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "venue_managers_insert" ON venue_managers FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
