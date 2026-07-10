-- ════════════════════════════════════════════════════════════════════════════
-- Per-match driver declarations — separate from profiles.can_drive ("has a car").
--
-- A player declares "I'm driving THIS match and can take N passengers."
-- This is distinct from:
--   - profiles.can_drive = standing "has a car" fact (profile badge)
--   - poll_responses.additional_responses["I can drive"] = offered to drive
--     when voting (per-poll, used by travelUtils to identify potential drivers)
--
-- match_drivers is the COMMITTED per-match declaration used on match detail.
-- Run each block separately in the SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════


-- 1. Create the table
CREATE TABLE IF NOT EXISTS match_drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  seats_available int NOT NULL DEFAULT 3,
  created_at timestamptz DEFAULT now(),
  UNIQUE(match_id, driver_id)
);

CREATE INDEX IF NOT EXISTS idx_match_drivers_match ON match_drivers(match_id);

ALTER TABLE match_drivers ENABLE ROW LEVEL SECURITY;

CREATE POLICY match_drivers_select ON match_drivers
FOR SELECT TO authenticated
USING (
  driver_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM matches m
    WHERE m.id = match_drivers.match_id
      AND auth.uid() = ANY(COALESCE(m.player_ids, ARRAY[]::uuid[]))
  )
);

CREATE POLICY match_drivers_insert ON match_drivers
FOR INSERT TO authenticated
WITH CHECK (driver_id = auth.uid());

CREATE POLICY match_drivers_delete ON match_drivers
FOR DELETE TO authenticated
USING (driver_id = auth.uid());


-- 2. Schema reload
NOTIFY pgrst, 'reload schema';
