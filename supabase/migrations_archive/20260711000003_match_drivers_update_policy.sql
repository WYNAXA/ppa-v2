-- ════════════════════════════════════════════════════════════════════════════
-- Add UPDATE policy to match_drivers so a driver can update their own row
-- (e.g. toggle offering_lifts). Only SELECT/INSERT/DELETE existed — UPDATE
-- was missing, silently blocking all updates via RLS.
--
-- Run each block separately in the SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════


-- 1. Add UPDATE policy
CREATE POLICY match_drivers_update ON match_drivers
FOR UPDATE TO authenticated
USING (driver_id = auth.uid())
WITH CHECK (driver_id = auth.uid());


-- 2. Schema reload
NOTIFY pgrst, 'reload schema';
