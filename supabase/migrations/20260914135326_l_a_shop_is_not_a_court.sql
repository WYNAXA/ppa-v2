-- A shop is not a court.
--
-- The second of the three identity groups in the review queue, read row by
-- row rather than matched by regex. 96 rows flagged "name suggests a shop,
-- not a venue", every one still counted as a club on Discover and still
-- listed in the venue directory.
--
-- WHAT IS ACTUALLY IN THERE
--   Nike Factory Store (Mexico City). adidas Store Hamburg. Salewa Store
--   Bozen. CMP Store Bolzano. SPORTLER Flagship Store. A whiskey store in
--   Bolzano. Tennis restringing shops in Sydney, Melbourne, Chicago, Paris,
--   Auckland and Singapore. Around forty padel racket retailers — the
--   Tienda Padelpoint chain alone accounts for eleven rows across Madrid,
--   Sevilla, Valencia, Marbella, Miami, Palermo, Asunción and Jakarta.
--
--   None of them is a place you can book a court.
--
-- THREE ARE KEPT as 'club', because the evidence points the other way:
--   Padelground | Padel Center & Shop | Kuala Lumpur
--     its URL is book.padelground.my — a booking subdomain. It is a venue
--     that also sells gear.
--   Padel X Summer Club & Retail Store (Miami Beach)
--     "Club &" — a club with a shop attached, not a shop.
--   Outlet Padel Club (Barcelona)
--     Genuinely ambiguous: "Outlet" reads retail, "Padel Club" reads venue,
--     and outletpadelclub.com settles neither. Left as 'club' AND left
--     flagged. A wrong reclassification is worse than an unreviewed row.
--
-- TWO THAT LOOK LIKE EXCEPTIONS AND ARE NOT
--   RBC Padel Pro-Shop (Cape Town) — rbclub.co.za/padel/the-gear/
--   The Racquet Club Pro Shop (Abu Dhabi) — Emirates Palace
--   Both are the pro shop OF a club. The club is a separate row; this row is
--   the shop. Reclassified.
--
-- FIX CLASS: root-cause on the data, same as 20260914134222. The alternative
--   — teaching discover_counts to skip rows whose review_reason contains the
--   word "shop" — couples an RPC to classifier wording and leaves the row
--   wrong for the directory, search, and the Hub.
--
-- BLAST RADIUS
--   None of the 93 is claimed (venues_id null on every row) and none is
--   referenced by a match, event or league — verified before applying.
--   status stays 'active' and nothing is deleted, so setting venue_type back
--   to 'club' fully reverses this.
--
-- REMAINING AFTER THIS: 162 rows flagged "name suggests an academy or school".
--   Not touched. That group is genuinely ambiguous — a large share of real
--   padel clubs trade as "X Padel Academy" — and deserves the same row-by-row
--   reading, not the assumption that the flag is right.

update public.padel_venues
   set venue_type    = 'not_padel',
       needs_review  = false,
       review_reason = null,
       classified_by = 'migration:2026-09-14-shop-not-venue',
       classified_at = now(),
       updated_at    = now()
 where status = 'active'
   and venue_type = 'club'
   and needs_review
   and review_reason = 'name suggests a shop, not a venue'
   and venue_name not in (
     'Padelground | Padel Center & Shop | Kuala Lumpur',
     'Padel X Summer Club & Retail Store',
     'Outlet Padel Club'
   );
