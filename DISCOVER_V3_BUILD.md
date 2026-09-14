# Discover v3 — the build

Companion to `DISCOVER_V3_NEAR_YOU.md` (the what and why). This is the how.

**Everything in §A is already applied to the live database.** Your first job is
to make the repo agree with it. Nothing in §B may start until §A is green.

---

## A. Make the repo agree with production — ALREADY DONE, skip to §B

**Do not try to query `supabase_migrations.schema_migrations`.** That schema is
not readable with the anon key, and there is no `psql` or Docker on this
machine. That instruction was wrong and is withdrawn.

The 14 files are already written to `ppa-v2/supabase/migrations/`. They were
verified character-for-character against the live
`schema_migrations.statements` before being written — 14 of 14 identical, zero
mismatches. Treat them as correct and do not regenerate or edit them.

```
20260914121859_rocket_padel_bristol_left_playtomic.sql
20260914132123_a_merge_repoints_the_location_contract.sql
20260914132225_b_a_merge_loses_nothing.sql
20260914132312_c_a_coach_coaches.sql
20260914132349_d_a_group_has_a_place.sql
20260914132528_e_you_cannot_approve_yourself_into_a_group.sql
20260914132741_f_policies_that_are_switched_off_are_not_policies.sql
20260914132834_g_a_policy_on_group_members_may_not_read_group_members.sql
20260914132948_h_discover_counts.sql
20260914133905_i_a_private_group_is_private.sql
20260914134037_j_the_clubs_tile_counts_clubs.sql
20260914134222_k_a_rowing_club_is_not_a_padel_club.sql
20260914135326_l_a_shop_is_not_a_court.sql
20260914135446_m_an_academy_at_a_club_is_a_coach.sql
```

`h` and `j` both define `discover_counts()`; `j` supersedes `h`. Both are kept
because both ran — a migration history records what happened, not what we wish
had happened.

The one thing still to do here: **regenerate types in both repos**, because
`groups.padel_venue_id`, `discover_counts()`, `can_see_group()` and
`_merge_venues()` are all new.

```
supabase gen types typescript --project-id timbjfihsxqfrqrxwdny
```

Then `npm run build` green in both repos, and paste the raw output.

<details>
<summary>Superseded original instruction, kept for the record</summary>

Eleven migrations were applied live on 14 Sep and are **not in the repo**:

```
20260914132123  a_merge_repoints_the_location_contract
20260914132225  b_a_merge_loses_nothing
20260914132312  c_a_coach_coaches
20260914132349  d_a_group_has_a_place
20260914132528  e_you_cannot_approve_yourself_into_a_group
20260914132741  f_policies_that_are_switched_off_are_not_policies
20260914132834  g_a_policy_on_group_members_may_not_read_group_members
20260914132948  h_discover_counts
20260914????    i_a_private_group_is_private
20260914????    j_the_clubs_tile_counts_clubs
20260914????    k_a_rowing_club_is_not_a_padel_club
```

(The last three carry the timestamps the query below returns — use those, not
the placeholders.)

Their exact SQL is stored in `supabase_migrations.schema_migrations.statements`.
Pull it down rather than retyping it, so the files are byte-identical to what
ran:

```sql
select version, name, array_to_string(statements, E'\n;\n') as sql
from supabase_migrations.schema_migrations
where version >= '20260914132000'
order by version;
```

Write each as `ppa-v2/supabase/migrations/<version>_<name>.sql`, dropping the
`a_`…`h_` ordering prefixes from the *name* portion of the filename only (the
version already orders them). Do not edit the SQL.

Then regenerate types in **both** repos — `groups.padel_venue_id`,
`discover_counts()` and `_merge_venues()` are all new:

```
supabase gen types typescript --project-id timbjfihsxqfrqrxwdny
```

**Proof required:** paste `git status --porcelain` showing the eight new files,
and `npm run build` green in both repos.

</details>

---

## B. Step 0 — diagnose. No code until this is reported.

Report with file **and line numbers**:

1. **Discover counts.** Where `src/pages/Discover.tsx` computes each of the six
   numbers today, and the query behind each.
2. **Anything rendering "my groups" / "my connections" / "my leagues"** that
   currently lives on Discover, so §C *moves* rather than duplicates it.
3. **`AllGroupsPage.tsx` and `Search.tsx` after the RLS change.** Both used to
   list private groups; RLS now withholds them. Confirm each still renders
   sensibly with a smaller result set and that neither shows a count derived
   from rows it can no longer read.

For every change you later propose, state whether it is **(a) root-cause,
(b) a workaround** or **(c) a display patch**, and justify why it is not (b)
or (c).

---

## C. Discover becomes one scope

### C0. No coordinates is not zero — build this FIRST

**93 profiles. 46 of them have `latitude IS NULL`. That is 49%.**

`discover_counts()` returns all six counts as 0 when it has no point to measure
from, and returns `lat: null, lng: null` to say why. Verified:

```
user with NO coordinates
clubs=0 players=0 coaching=0 groups=0 leagues=0 events=0 open_games=0 | lat=NULL lng=NULL
```

Rendering that grid as six zeros tells half the user base the app is empty.
It is the rejection criterion "nothing renders 0 where the truth is we don't
know", broken on the first screen.

**So: branch on `lat === null` before rendering anything.**

- The grid does not render. Not greyed out, not zeroed — absent.
- The hero becomes a third state: "Where do you play?"
- The radius chip is hidden. There is no radius without a centre.

This is not an error state and must not read like one.

#### C0.1 — THE CARD SETS THE LOCATION. IT DOES NOT NAVIGATE.

**This corrects the first version of this brief, which said the `ball` action
should go to "the location step of the profile". That shipped as
`navigate('/you')` and it is wrong.** Tapping "Set your location" dropped the
user on the whole Me tab with no indication of what to do or how to get back.
Ejecting someone from the surface they are trying to use, to a page that does
not explain itself, is the worst thing this tab does.

The fix: the card sets the location **in place**. The user never leaves
Discover, and the grid fills in behind the card the moment it succeeds.

Everything needed already exists at `Onboarding.tsx:117-153` —
`navigator.geolocation.getCurrentPosition`, `reverseGeocode()` from
`lib/geocode.ts`, and the profile write. **Extract it, do not rewrite it:**

```
useSetMyLocation()   // new shared hook
  → navigator.geolocation.getCurrentPosition
  → reverseGeocode(lat, lng)  → city
  → update profiles { city, latitude, longitude }
  → invalidate ['discover-counts'] and ['discover-feed']
```

Used by **both** Onboarding and the Discover hero. One implementation.

The card's three moments:

1. **Primary `ball`: "Use my location."** Tap → permission prompt → button
   shows a pending state → on success the card disappears and the grid is
   there. No navigation, no toast, no "now go to your profile".
2. **Permission denied, or no geolocation API:** the same card swaps to an
   inline text input — "Type your town or city" — in place. Still no
   navigation.
3. Only if both fail does a small tertiary link to the profile appear.

#### C0.2 — why 49% was really 49%, and the client half of that fix

Of the 46 accounts with no coordinates, **34 had a city and no point.**
Onboarding's manual city field writes `city` alone; only the geolocation branch
writes latitude and longitude (`Onboarding.tsx:117-153`). So most of those users
*did* say where they were and the answer was discarded.

Migration `n_a_city_you_typed_is_still_a_place` backfilled 32 of the 34 from
this database's own venue centroids. **46 → 14 (15%).** Players near the UAT
account went 33 → 57.

**The client half is required or this decays again:** `lib/geocode.ts` has
`reverseGeocode` only. Add `forwardGeocode(query)` against Nominatim's search
endpoint, and make Onboarding's manual city field use it, so typing a city
writes a point. Same hook, same file, no second implementation.

### C1. The counts come from one RPC

Replace the six client-side count queries with a single call:

```ts
supabase.rpc('discover_counts', {
  p_lat: lat ?? null,
  p_lng: lng ?? null,
  p_radius_miles: radius,   // default 25
})
```

It returns one row: `venues, players, coaching, groups, leagues, events,
open_games, radius_miles, lat, lng`. It is `SECURITY INVOKER`, so RLS still
decides what the caller may count — do not re-filter its output in the client.

Live values for the UAT account right now, 25 mi from his profile point
(51.4391, -2.5898):

```
venues 14 · players 33 · coaching 8 · groups 0 · leagues 0 · events 1 · open_games 0
```

`venues` means `venue_type = 'club'` — places you can book a court.
`coaching` means `coaching_available`, which covers both a club that offers
lessons and a standalone coach. One row can be in both, and that is correct.
Do not re-derive either definition in the client.

Tiles, in this order and with these labels:

| tile | label | field | route |
|---|---|---|---|
| 1 | Clubs | `venues` | `/discover/venues` |
| 2 | Players | `players` | `/discover/players` |
| 3 | Coaching | `coaching` | `/coaches` |
| 4 | Groups | `groups` | `/discover/groups` |
| 5 | Leagues | `leagues` | `/leagues` |
| 6 | Events | `events` | `/discover/events` |

A zero renders in `ink-4` and **still opens its page**. A zero is a door.

### C2. "Yours" leaves this tab

Delete the `discover.yours` header and every mine-scoped count query behind it.
Before deleting any destination, confirm it is still reachable from Today or
from its own tile page (§B.5). The section header above the grid becomes
`discover.near_you`, with `discover.within_radius` on the right.

### C3. The hero

One component, at the top, above the grid. It is the **only `ball` on the
screen** — no `ball` anywhere else on Discover.

Structure, both states:

- A scope row: place name on the left, radius chip on the right. The chip is a
  real control (10 / 25 / 50 / 100 mi) and re-calls `discover_counts` with the
  new radius. It is a chip, not a slider, and not the page's subject — see the
  measurements in `DISCOVER_V3_NEAR_YOU.md` §1.
- A body that switches on the data.

**State A — something is on.** Take the first row of `discover_feed()`. Badge,
title at `title` (24/26/800) in white, one metadata line
`venue · distance · time · price`, and the `ball` action. For an event with an
`external_link`, the action opens it via `openUrl()` from `src/lib/openUrl.ts`
— never `window.open`.

**State B — `open_games === 0` and the feed is empty.** Same panel, same chip,
same `ball`. Badge reads `{{count}} open games near you`. Title:
"Be the one who posts". Body: "{{count}} players within {{miles}} miles will
see it. Pick a court and a time — they come to you." — where the player count
is the `players` field from the same RPC response. **Not a second query. Not a
constant.** Action: "Put up a game". Secondary: "Book a court".

State B is the common case, not an edge case: Bristol is the only place in the
database with a public event. Build it first and give it the same care.

### C3b. One location, one radius, two consumers

The tiles come from `discover_counts()` and the hero's State A comes from
`discover_feed()`. **They must be given the same `p_lat`, `p_lng` and
`p_radius_miles`, from one piece of state.** Two location sources on one screen
means the hero can say "1.4 mi" about an event the tiles have already excluded.

Concretely: one `useDiscoverScope()` holding `{ lat, lng, radius }`, both
queries keyed on it, and the radius chip setting it. When the chip moves to
100 mi, both refetch. Report how `discover_feed` is called today
(`Discover.tsx:48-57`) and what it passes for coordinates — if it passes
nothing and relies on the profile fallback, the counts must do the same, not
pass browser geolocation.

### C3c. Delete what `useMineCounts` was holding up

Removing `useMineCounts` orphans whatever it was the only caller of. Check each
and delete the ones nothing else uses:

```
useMyGroups          — also used by Home.tsx / ClubThisWeek: KEEP
useMyConnections     — check Home.tsx
useMyCoachBookings   — likely orphaned
useMyPlayedVenues    — likely orphaned
```

"If nothing links to it, it goes" applies to hooks as well as routes. List each
with its remaining call sites before deleting.

### C4. The floor

One dashed line under the grid: the honest gap, plus **Widen to 100 mi**. Offer
100, never 50 — 50 returns exactly what 25 returns.

---

## D. A group must say where it plays

`groups.padel_venue_id` now exists, with a trigger that derives
`latitude`/`longitude` from it. The backfill covered 6 of 8 rows from `city`.

**The create-group form must ask where the group plays** and set
`padel_venue_id`. Reuse the venue picker that already exists — do not write a
second one; report which component you are reusing. Editing a group must be
able to change it.

Until this ships, the Groups tile can only ever count groups that happen to
have a city string the backfill recognised. That is the decay this prevents.

---

## E. `groups` — already fixed server-side; one client tidy-up left

**Done, live, verified.** `public.groups` had two permissive SELECT policies,
both `USING (true)`, so every signed-in user could read all six private groups
including their `invite_code`. Migration `i_a_private_group_is_private` replaced
them with one scoped policy via a `SECURITY DEFINER` helper, `can_see_group()`.
Its duplicate INSERT/UPDATE/DELETE policy pairs were collapsed at the same time.

Proof, as a user who is in zero groups and administers none:

```
groups visible ..................... 2 of 8   (the public + the open one)
private groups visible ............. 0
Search.tsx finds a private by name . 0
private invite codes readable ...... 0
group_members rows visible ......... 29 of 80
```

And as the UAT account: 4 groups visible, PPA Founders loads, 21 of its
approved+ringer members render, `InviteToGroupSheet`'s `.eq('admin_id', …)`
still returns his group.

This also closed two client-side leaks without touching the client, which is
why it was worth fixing at the policy and not in the UI:

- `AllGroupsPage.tsx:40` listed groups with **no visibility filter** — the
  browse directory was showing all six private groups to everyone.
- `Search.tsx:88` searched group names with no visibility filter.

Both now simply receive fewer rows.

**The one thing left, and it is a client change:**

`GroupDetail.tsx:90` selects `invite_code`, and `GroupDetail.tsx:34` types it.
Those are the *only* two references to `invite_code` in `src/` — nothing
resolves a code into a membership anywhere in the app. It is the most sensitive
column on the table and it is dead weight in the payload. Remove it from the
select and from the `Group` interface. No read in `src/` uses `select('*')` on
groups, so nothing else breaks.

If a join-by-invite-link flow is built later, it must be a `SECURITY DEFINER`
RPC (`group_preview_by_invite(p_code)`) returning name, description and member
count — never a blanket read restored to get at the code.

---

## E2. Two queues that exist and have never been worked

Neither blocks the build. Both are why a number on Discover can still be wrong,
and both are machinery that was built and then left idle — flagging them here
so they stop being invisible.

**The duplicate queue.** `venue_duplicate_candidates()` and
`admin_merge_venues()` have existed since 13 Sep and `merged_into` was non-null
on **zero** rows until today. 1,131 candidate pairs sit within 250 metres, 472
within 50. Two were merged by hand today (both in Bristol). Note that
coordinates alone are **not** proof: 45 pairs share an exact point and most are
genuinely different businesses at one address — "A1Padel Shop" beside "A1Padel
Clinics", a tennis club hosting a padel arena. This needs a review screen in the
Hub, not a rule.

**The classification queue.** 306 active rows were flagged and none had ever
been reviewed. Worked down to 122:

| reason | was | resolved | left |
|---|---|---|---|
| name suggests an academy or school | 162 | 49 → `coach` | 113 |
| name suggests a shop, not a venue | 96 | 93 → `not_padel` | 3 |
| name suggests a different sport | 45 | 42 → `not_padel` | 3 |
| postcode / postal_code disagree | 2 | — | 2 (correctly clubs) |
| booking_platform vs booking_url | 1 | — | 1 (correctly a club) |

Active clubs 6,075 → 5,891. Active coaches 20 → 69. Bristol is unchanged at
14 clubs and 1 coach, so none of this moved a number the UAT account sees.

The 49 academies were decided on evidence, not names: their coordinates land on
a club already in the directory under its own row, so they are the coaching
business and the club is the venue. The 113 that stand alone keep their flag —
some are certainly real clubs, and removing one is worse than leaving it
flagged. The 9 left in the other rows are deliberate keeps, each named in its
migration.

---

## F. Locales

Every new string through i18next in all 8 locales: en, es, fr, it, pt, sv, ar,
hi. Any string carrying a count needs plural forms, and Arabic needs all six
(zero/one/two/few/many/other). New keys at minimum:

```
discover.near_you
discover.within_radius        ({{miles}})
discover.tile.clubs / players / coaching / groups / leagues / events
discover.hero.open_games      (plural, {{count}})
discover.hero.be_first_title
discover.hero.be_first_body   (plural, {{count}}, {{miles}})
discover.hero.put_up_a_game
discover.hero.book_a_court
discover.hero.get_tickets
discover.radius.widen         ({{miles}})
discover.no_location_title
discover.no_location_body
discover.no_location_cta
group.where_you_play
```

`8eb5cba` is what it costs to add these later instead.

---

## G. Report

- Every caller or consumer touched, before/after.
- Every helper whose signature changed, with all call sites.
- `npm run build` green in both repos.
- Locale parity proof: the key count per file, all 8 equal.
- **Before reporting any change as done, run the command that would prove it
  false and paste the raw output — not a summary of it.** No
  `--include` filters, no `| grep -v`, nothing that can hide a miss.
- Do not commit.

---

## H. Rejection criteria

- Every number on `/discover` is near-you. If one is the viewer's own, it is wrong.
- The hero is never absent and never a shrug.
- One `ball` per screen, on the hero, in both states.
- A count and the page behind it agree.
- Nothing renders "0" where the truth is "we don't know". Where the truth is
  zero, say zero.
- No horizontal scrolling for primary navigation.
- ≤3 taps to any noun's detail: tab, tile, thing.
- No `window.open`. `openUrl()` only.

Tokens, from DESIGN.md — do not invent values:

```
court #0F5D54   court-50 #EAF5F3   court-100 #CDE7E2   court-700 #0A473F
ball  #E4FF57   ink #0B1512   ink-2 #46534F   ink-3 #7C8B86   ink-4 #B6C0BB
surface #FBFAF7   card #FFFFFF   hairline #E4E7E4   warn #A85F00   alert #D9480F
display 32/34/800 · title 24/26/800 · heading 19/23/700 · body 15/20/400
label 13/18/400 · caption 11/14/700 uppercase 0.06em
radii: control 10, card 12, panel 18, pill 999 · hit targets 44px
```
