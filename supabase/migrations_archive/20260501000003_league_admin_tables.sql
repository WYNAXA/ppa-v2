-- League admin tables: adjustments and jerseys

CREATE TABLE IF NOT EXISTS league_adjustments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id   uuid NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  points_delta integer NOT NULL DEFAULT 0,
  reason      text,
  created_by  uuid REFERENCES profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE league_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "league_adjustments_select" ON league_adjustments FOR SELECT USING (true);
CREATE POLICY "league_adjustments_insert" ON league_adjustments FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE TABLE IF NOT EXISTS league_jerseys (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id      uuid NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  jersey_number  integer NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (league_id, user_id),
  UNIQUE (league_id, jersey_number)
);

ALTER TABLE league_jerseys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "league_jerseys_select" ON league_jerseys FOR SELECT USING (true);
CREATE POLICY "league_jerseys_upsert" ON league_jerseys FOR ALL USING (
  EXISTS (SELECT 1 FROM leagues WHERE id = league_id AND created_by = auth.uid())
);
