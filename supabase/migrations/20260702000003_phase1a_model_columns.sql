-- Phase 1a: additive columns for the match<->booking model. All nullable or safely
-- defaulted so pre-Phase-2 inserts (still coming through the compat view) keep working.
-- Cross-field constraints (game requires match_id, in_app requires payment_state) are
-- deferred to Phase 2, once every writer sets these fields. purpose/source are
-- text+CHECK (not native enums) so the value set can be adjusted with a cheap ALTER.

-- Unambiguous defaults (true for every existing row):
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS reservation_state text NOT NULL DEFAULT 'active'
    CHECK (reservation_state IN ('active','cancelled','completed'));

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS court_requirement text NOT NULL DEFAULT 'needed'
    CHECK (court_requirement IN ('needed','not_needed'));

-- Row-dependent: nullable now, backfilled in Phase 1b, tightened in Phase 2.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS purpose text
    CHECK (purpose IS NULL OR purpose IN ('game','coaching','demo','social','blocked','other'));

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS source text
    CHECK (source IS NULL OR source IN ('in_app','external','venue'));

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS payment_state text
    CHECK (payment_state IS NULL OR payment_state IN ('held','paid','released','refunded'));

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS owner_user_id uuid;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS owner_name text;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS external_venue_ref text;
