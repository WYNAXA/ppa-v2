-- ── Part 1: Profile travel columns ───────────────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS can_drive boolean DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS max_passengers int DEFAULT 3;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS travel_radius_miles int DEFAULT 5;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS latitude numeric(10,7);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS longitude numeric(10,7);

-- ── Part 1: Match travel columns ──────────────────────────────────────────────
ALTER TABLE matches ADD COLUMN IF NOT EXISTS travel_notes text;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS poll_id uuid REFERENCES polls(id) ON DELETE SET NULL;
-- drivers jsonb: [{user_id, name, seats_available, passengers:[user_id]}]
ALTER TABLE matches ADD COLUMN IF NOT EXISTS drivers jsonb DEFAULT '[]'::jsonb;

-- ── Part 1: padel_venues lat/lng ─────────────────────────────────────────────
ALTER TABLE padel_venues ADD COLUMN IF NOT EXISTS latitude numeric(10,7);
ALTER TABLE padel_venues ADD COLUMN IF NOT EXISTS longitude numeric(10,7);

-- ── Part 1: travel_requests table ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS travel_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  requester_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined')),
  pickup_location text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(match_id, requester_id, driver_id)
);

ALTER TABLE travel_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Players can view their travel requests" ON travel_requests;
DROP POLICY IF EXISTS "Players can create travel requests" ON travel_requests;
DROP POLICY IF EXISTS "Drivers can update requests" ON travel_requests;

CREATE POLICY "Players can view their travel requests"
ON travel_requests FOR SELECT TO authenticated
USING (auth.uid() = requester_id OR auth.uid() = driver_id);

CREATE POLICY "Players can create travel requests"
ON travel_requests FOR INSERT TO authenticated
WITH CHECK (auth.uid() = requester_id);

CREATE POLICY "Drivers can update requests"
ON travel_requests FOR UPDATE TO authenticated
USING (auth.uid() = driver_id);
