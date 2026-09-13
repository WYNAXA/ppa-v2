# UAT 12–13 Sep 2026 — handover

Covers work across **ppa-v2** and **venue-manager** from Christian's 13-item UAT
list. Written because the phase docs predate it and the next session should not
have to reconstruct any of this.

Migrations live in `venue-manager/supabase/migrations/` — that repo owns the
schema for the shared Supabase project `timbjfihsxqfrqrxwdny`.

---

## 1. The numbers that decide everything else

Every remaining product question turns on these. Measured live, not estimated.

| | count | of 6,077 active clubs |
|---|---|---|
| no court count under ANY of the 4 court columns | 5,794 | 95% |
| has a court count | 283 | 4.7% |
| has a price | 280 | 4.6% |
| has a description | **1** | 0.02% |
| has photos | **2** | 0.03% |
| has a rating | **0** | 0% |
| has `total_reviews` > 0 | 5,264 | 87% |

**The two data sources are disjoint.** This is the single most important fact:

| `external_ref` | venues | with courts | with price |
|---|---|---|---|
| `NULL` (hand pass, 2026-03-30) | 284 | **283** | **280** |
| `google_places:…` | 5,599 | **0** | **0** |
| other | 194 | **0** | **0** |

Every venue with court data has **no** Google Place ID. Every venue with a Place
ID has **no** court data. So the Google Places backfill cannot improve any of the
283 good venues, and can never give the other 5,599 courts or prices. Court
counts need a booking-platform API or the venue itself — there is no third route.

Also live:

- 20 active rows are `venue_type = 'coach'`, not clubs
- 904 pairs of active clubs sit within 160 m of each other
- 6,097 of 6,097 active venues have a latitude/longitude (this is why place
  search needs no geocoder — see §3)

### Columns whose DEFAULT leaks into the UI

Do not render these as fact without checking they were actually set:

- `surface_type` — `DEFAULT 'artificial_grass'`, and 5,882 rows carry exactly that
- `pricing_tier` — `DEFAULT 2`; reads 2 on a venue with no price data and on
  Rocket Padel (£48 peak) alike. The £/££/£££ chip was removed for this reason.
- `parking_available`, `changing_rooms`, `cafe_bar`, `coaching_available`,
  `equipment_rental` — all `DEFAULT false`, ~5,8xx rows on the default. `false`
  means "nobody has told us", NOT "this venue has none". Only render `true`.
- `total_reviews`, `review_count` — `DEFAULT 0`; 0 means unknown
- `booking_url` — `DEFAULT ''`; check `?.trim()`, not `!== null`

---

## 2. What shipped, by UAT item

| # | item | where |
|---|---|---|
| 1, 2 | Community naming; leagues reachable | `BottomNav.tsx`, `People.tsx` |
| 3 | courts/leagues icon | `BottomNav.tsx` |
| 4 | venue search beyond "near me" | `Search.tsx` |
| 5 | claim → QR **or** message | `VenueDetail.tsx`, `AskVenueSheet.tsx` |
| 6 | venue information | `VenueDetail.tsx` — see below |
| 7 | courts vs information vs booking | `CourtsHome.tsx` |
| 8 | "BS1" and nearby | `Search.tsx` + `venues_near_place` RPC |
| 9 | coaches out of venue lists | 5 files — see below |
| 11 | "missing a lot of venues" | review queue — see §4 |
| 12 | booking basics + link | `VenueDetail.tsx` |
| 13 | facelift | **outstanding** |

### Item 6 — `VenueDetail.tsx`

Facilities now union three columns that each hold part of the answer: the five
booleans, `facilities` (14 rows populated) and `amenities` (276 rows).
De-duplicated on the `FACILITY_MAP` key. **Present-only tiles** — the previous
grid drew a greyed-out tile for every facility the venue had not listed, which
asserted absence off the back of a column default.

Also: typical court price block (these columns are in MAJOR units, unlike every
`*_pence` column — they go through `majorToMinor`), `total_reviews` chip,
`surface_type` suppressed when it equals the default, and two real bugs —
`membership_required` is a BOOLEAN and was being interpolated into a string
("Members only — true"), and the court count ignored `number_of_courts`, so
Rocket Padel Bristol (indoor 4, `number_of_courts` 14) displayed 4.

### Item 9 — venue reads audited

All 26 venue reads in ppa-v2 were checked. They split cleanly:

- **Search/browse** (a player is *offered* a venue) → must filter
  `venue_type = 'club'`: `BookCourt`, `CreateMatchSheet`, `EditMatchSheet`,
  `SelfReportBookingSheet`, `CourtsHome`, `Search`, `People` (the venue count).
- **Resolve-by-id** (venue already chosen or referenced) → deliberately
  UNFILTERED: `MatchDetail`, `PayBooking`, `EmbedVenueBooking`, `Waitlist`,
  `You`, `CoachDetail`, `venueEvents`, and the two lookups inside `BookCourt`.
  A venue attached to an existing match or booking must keep resolving whatever
  its classification — same reason it must keep resolving after it closes.

A blanket find-and-replace here breaks existing bookings.

---

## 3. Migrations applied 12–13 Sep

All applied to live and committed to `venue-manager/supabase/migrations/`.

1. **`20260912121500_padel_venues_jsonb_shape_guards`** — three rows stored
   `amenities` double-encoded (a jsonb *string* containing a JSON array, i.e.
   someone passed `JSON.stringify`). All three were Bristol venues with the
   richest data in the table, rendering nothing. Repaired, plus CHECK
   constraints on `amenities`/`facilities`/`photos`/`opening_hours` so the next
   malformed write fails loudly.

2. **`20260912130000_resolve_place_and_venues_near_place`** — `postcode_outcode`,
   `resolve_place`, `venues_near_place`. Turns a typed place into a coordinate
   from our own venue rows; **no geocoder**, because every active venue already
   has lat/lng. Six-tier ladder: full postcode → outcode → city exact → outcode
   prefix → city prefix → address. Matches on the OUTCODE, not a string prefix:
   `postcode LIKE 'BS1%'` also matches BS13 and BS16, which are different
   districts. Consults both `postcode` and `postal_code` because they disagree
   on many rows.

3. **`20260912140000_review_queue_retail_and_academy`** — `flag_venues_for_review()`,
   re-runnable and idempotent. Never re-flags a row an admin has ruled on
   (`classified_by LIKE 'admin:%'`), or the queue can never be emptied.

4. **`20260912150000_venue_enrichment_provenance`** — `venue_enrichment` (one row
   per venue-per-source assertion) and `venue_enrichment_sources` (trust order as
   DATA, not code): `venue_owner` 100 → `admin` 90 → booking platforms 70 →
   `website` 50 → `google_places` 40 → `legacy_manual_2026_03_30` 30.
   `apply_venue_enrichment()` merges per field, highest precedence winning, and
   **skips claimed venues** — a scraper never overwrites what an owner typed.

5. **`20260912160000_venues_needing_enrichment`** — batch selection as a Postgres
   anti-join. The worker originally excluded already-done ids client-side, which
   works at zero rows and breaks at a few thousand when the URL exceeds
   PostgREST's limit. The thing that would have broken it was *progress*.

6. **`20260913090000_venue_duplicate_merge`** — `merged_into`, `status='merged'`,
   `venue_duplicate_candidates()`, `admin_merge_venues()`. Soft merge: the loser
   keeps its primary key so shared `/venues/<id>` links still resolve, and leaves
   the directory via status. Refuses a claimed loser and refuses merge chains.

7. **`20260913091500_venue_duplicate_dismissals`** — a "not duplicates" verdict
   has to stick, or "Scheck Hotel"/"Scheck Club" return forever. Also excludes
   generic words (`padel`, `club`, `academy`, `sport`…) from the shared-name
   signal — every row here is a padel venue, so those carry no identity.

### Edge function

**`enrich-venues-google`** (v5, deployed, platform-admin or service-role only).
Reads Place Details for venues whose `external_ref` is a Place ID and writes
assertions to `venue_enrichment`. Notes:

- Photos are collected into `raw.photo_refs` but **not** written to
  `padel_venues.photos` — a Places photo URL embeds the API key and that table is
  world-readable. Serving them needs a key-side proxy.
- A field Google does not answer is **omitted, never written as null**, so
  "this source doesn't know" can never overwrite a better source.
- Court counts, prices, surface type and the indoor/outdoor split are
  deliberately NOT mapped. Google does not hold them.
- This project has **legacy API keys disabled**; `SUPABASE_SERVICE_ROLE_KEY`
  holds a current `sb_secret_…` value despite the legacy-sounding name. Call it
  with `{"health": true}` to see the runtime's actual credential state.

---

## 4. Outstanding

1. **Google Places backfill** — panel is live at `/admin/venue-review` in
   venue-manager. Health check → Dry run 5 → Run 25/200. Each venue is one
   billed Google call; a full pass is ~5,599. It fills description, real opening
   hours, rating, review count, phone, website. It will NOT fill courts or
   prices (§1).

2. **Item 13, the facelift** — the real constraint is permanent heterogeneity:
   283 venues will only ever have courts+price, 5,599 will only have
   description+hours+rating, almost none have both. Design for "show what's
   confirmed, say plainly what isn't" rather than for a standard set of facts.

3. **Court counts for 5,794 venues** — needs a booking-platform adapter.
   `playtomic-auth-test` exists in the project from April and was never finished;
   `external_ref` is empty on all 281 enriched rows, so it never ran. Needs
   third-party API credentials before it is more than an experiment.

4. **Duplicates** — 904 candidate pairs. Panel is live; merging is one click
   per pair.

5. **Review queue** — 305 rows (was 47). Retail and academy reasons added.

6. **`ppa-ios`** — never audited. Reads the same tables, so it will still show
   coaches among venues and lacks the venue-detail and search work.

7. **Seed data in production**: `padel_venues` has one row with
   `venue_id = 22222222-2222-2222-2222-222222222222` ("Bristol Padel Club",
   3 courts, status active, created 2026-06-29). Decide whether it belongs.

8. **Postcode conflicts**: Rocket Padel Bristol holds `BS1 3XT` in `postcode`
   and `BS4 4EB` in `postal_code`; Surge Padel Bristol `BS13 7TQ` / `BS16 3JB`.
   Both in the review queue.

---

## 5. Traps worth not re-learning

- **Generated files are not source.** `src/lib/setClassification.ts` was a
  re-export of `scripts/codegen/set-classification.spec.ts`. Vite followed it and
  shipped the spec to production, and because `tsconfig.app.json` has
  `"include": ["src"]`, the file executing the scoring rule was never
  type-checked. Both kernels are now self-contained; regenerate with
  `npm run codegen`. Same class: venue-manager's
  `src/integrations/supabase/types.ts` is generated — regenerate, never hand-edit.

- **Nullable keys in Maps.** `league_members.league_id` and
  `padel_venues.venues_id` are both nullable and were both used as Map keys
  unguarded, collapsing every unlinked row into one bogus entry. Fixed in
  `Tournaments.tsx`, `AdminClaims.tsx`, `VenueDetail.tsx`.

- **Nullable RPC args.** The type generator cannot express "required but accepts
  NULL", so it emits `string | undefined`. `?? undefined` is only safe when the
  param has a DEFAULT — check `pg_get_function_arguments` first.
  `conflictCheck.ts` has a param with no default and needs an early return.

- **Uncommitted work is unsafe.** Cowork holds file *snapshots*; two sessions
  with overlapping folders can silently revert each other. Commit early.

- **`.eq()` comes after `.select()`** in supabase-js. Before it, the builder has
  no filter methods.
