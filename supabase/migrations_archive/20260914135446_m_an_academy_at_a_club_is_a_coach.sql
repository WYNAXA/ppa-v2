-- An academy at a club is a coach.
--
-- The third identity group in the review queue: 162 rows flagged "name
-- suggests an academy or school — may be a coach, not a venue". Unlike the
-- shops and the rowing clubs, the name alone does NOT settle these. Plenty of
-- real padel venues trade as "X Padel Academy", and getting it wrong removes
-- a genuine club from the app.
--
-- THE EVIDENCE USED INSTEAD OF THE NAME
--   A coaching business operates AT a venue, so it carries that venue's
--   address. If an academy's coordinates land on a club that is already in the
--   directory under its own row, the academy is the coaching business and the
--   club is the venue — we have both, and counting the academy as a second
--   club double-counts one address.
--
--   Measured over the 162, against active unflagged clubs within 60 metres in
--   the same country:
--     sits on an existing club ........  49   <- this migration
--     alone at its point .............. 113   <- untouched
--
--   The pattern was visible before it was measured: "Escuela Javi Huércano
--   Pádel" and "MindsetPadel Academy" both share an exact coordinate with
--   Vals Sport Ave Maria in Málaga.
--
-- WHY 'coach' AND NOT 'not_padel'
--   These are real padel businesses. 'coach' keeps every one of them in the
--   app and moves them to the tile where a player looking for lessons will
--   find them — which is the tile that now works, since 20260914132312 fixed
--   coaching_available on every coach row. The failure mode if a call here is
--   wrong is that a venue appears under Coaching instead of Clubs. Nothing
--   disappears. That is a far softer landing than the shops, and it is why 49
--   can be done on this evidence while 113 cannot.
--
-- FIX CLASS: root-cause on the data.
--
-- BLAST RADIUS
--   venue_type 'coach' removes these rows from discover_counts.venues (which
--   requires 'club') and from venue_duplicate_candidates (which filters
--   venue_type='club' — correctly, since an academy at a club is not a
--   duplicate of it). The CHECK constraint added in 20260914132312 requires a
--   coach row to have coaching_available, so that is set here too. status
--   stays 'active'; nothing is deleted.
--
-- STILL OPEN: the 113 that stand alone. Their names name a sport but their
--   coordinates prove nothing, and some are certainly clubs. They keep their
--   flag and stay counted until there is evidence, not a heuristic.

with acad as (
  select venue_id, venue_name, latitude::float8 la, longitude::float8 lo, country_code
  from public.padel_venues
  where needs_review and status = 'active'
    and review_reason like 'name suggests an academy%'
),
hosted as (
  select a.venue_id
  from acad a
  where exists (
    select 1 from public.padel_venues c
     where c.status = 'active' and c.venue_type = 'club' and c.merged_into is null
       and c.venue_id <> a.venue_id and not c.needs_review
       and c.country_code = a.country_code
       and abs(c.latitude::float8  - a.la) < 0.0025
       and abs(c.longitude::float8 - a.lo) < 0.0025
       and public.haversine_miles(a.la, a.lo, c.latitude::float8, c.longitude::float8) * 1609.34 <= 60
  )
)
update public.padel_venues pv
   set venue_type         = 'coach',
       coaching_available = true,
       needs_review       = false,
       review_reason      = null,
       classified_by      = 'migration:2026-09-14-academy-hosted-at-a-club',
       classified_at      = now(),
       updated_at         = now()
  from hosted h
 where pv.venue_id = h.venue_id;
