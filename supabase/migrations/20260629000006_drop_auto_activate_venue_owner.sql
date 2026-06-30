-- Remove the auto-activate trigger that flipped owner claims from pending to
-- active on insert. It bypassed the venue-claim approval gate: any owner-role
-- claim was instantly activated, defeating the pending-review model. The
-- create-new-venue flow sets status='active' explicitly in code, so it does not
-- depend on this trigger. Claims now correctly remain 'pending' until approved.
DROP TRIGGER IF EXISTS trg_venue_users_owner_activate ON public.venue_users;
DROP FUNCTION IF EXISTS auto_activate_venue_owner();
