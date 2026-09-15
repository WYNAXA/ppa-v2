-- Migration 1: Expand padel_venues.status CHECK
--
-- pending_review and rejected have been referenced by live RPCs since they
-- were created, but neither value was ever in the CHECK constraint:
--
--   admin_review_venue:  UPDATE ... SET status = CASE WHEN p_approve THEN 'active' ELSE 'rejected' END
--                        WHERE venue_id = ... AND status = 'pending_review'
--   admin_reject_claim:  UPDATE ... SET status = 'rejected'
--                        WHERE venues_id = ... AND status = 'pending_review'
--
-- Both gate on status = 'pending_review' in their WHERE clause. Since the
-- CHECK has never allowed that value, no row can ever be in it, so both
-- have always updated zero rows. The admin approval workflow -- approve or
-- reject a venue submitted via "Add your venue" -- has never been able to
-- run. Hub AdminClaims.tsx queries .eq('status','pending_review') and has
-- always shown an empty list for the same reason.
--
-- discover_list, venues_near, and the RLS SELECT policy all require
-- status = 'active', so pending_review and rejected rows are invisible
-- to players by construction. Confirmed at baseline lines 4276, 4289,
-- 4531, and 14593.

ALTER TABLE public.padel_venues
  DROP CONSTRAINT IF EXISTS padel_venues_status_check;

ALTER TABLE public.padel_venues
  ADD CONSTRAINT padel_venues_status_check
  CHECK (status IN ('active', 'closed', 'coming_soon', 'merged', 'pending_review', 'rejected'));
