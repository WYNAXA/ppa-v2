# Discover v3 — the tile pages, rebuilt

**Supersedes `DISCOVER_V3_TILE_PAGES.md`.** That brief made the numbers agree and
left the pages worse than the ones it replaced. Matching a count was a
constraint, not the goal. This brief is the goal.

UAT verbatim:

> 14 clubs - shows 14 and lost the great hero tile at the top - terrible ux now.
> 57 players showing my connections first and then i have to scroll down to Near
> you and then it just shows im connected to most again or connect button and all
> the elo's gone - looks worse now. bad ux. 8 coaching now shows 1 coach and 7
> venues with no mention of a coach. worse ux. 2 group that when i open shows my
> 3 groups and 2 near me, both of which im in anyway. shit ux again.

Every one of those is a symptom. The causes are below, with file and line.

---

## §0 — Root causes, with evidence

Diagnosed before any design was drawn. Each is **fix class (a) root-cause**;
the justification for why it is not (b) a workaround or (c) a display patch is
stated per item.

### 0.1 The ELO is not "gone". It was never read.

```
AllPlayersPage.tsx:153   const ranking = p.meta.internal_ranking as number | null
AllPlayersPage.tsx:163   {ranking != null && ( ...ELO badge... )}
```

`discover_list`'s players branch emits:

```sql
jsonb_build_object('avatar_url', p.avatar_url, 'rating', p.internal_ranking)
```

The key is **`rating`**. `meta.internal_ranking` is `undefined` on every row, so
the badge's guard is false on every row, so the badge never renders. 58 of 58
players within 25 miles of the UAT account have a non-null `internal_ranking` —
the data was always there.

*Not (c):* the badge isn't being hidden to tidy a wrong value; it is reading a
key that does not exist. Reading the right key is the cause corrected.

### 0.2 Every club says "courts unconfirmed", including the nine that have courts.

```
VenuesPage.tsx:105-110   confirmedCourtCount({
                           indoor_courts:   row.meta.indoor_courts,
                           outdoor_courts:  row.meta.outdoor_courts,
                           covered_courts:  row.meta.covered_courts,
                           number_of_courts:row.meta.number_of_courts })
VenuesPage.tsx:112       const platform = row.meta.booking_platform
```

The venues branch emits one pre-computed key, `courts`. None of those four keys
exist in the payload, so `confirmedCourtCount` receives four `undefined`s and
returns `null` for all 14 rows. `booking_platform` did not exist either, so every
external button read "Visit website" instead of the platform name.

Measured, 25 mi: 14 clubs, **9 with a court count**, 12 with a booking URL.

*Two-sided fix.* `courts` is read correctly (client). `booking_platform` is a
real column the page should show, so the payload was widened rather than the
read deleted — see §1.

### 0.3 There is no way to join a group from Discover. At all.

```
AllGroupsPage.tsx:176-178  <button onClick={() => navigate(`/discover/groups/${g.id}`)}>
AllGroupsPage.tsx:204-312  the group preview sheet — 108 lines
AllGroupsPage.tsx:44-99    joinMutation, ringerOfferMutation
```

`setPreviewGroup` is called at :90, :211 and :222 — all three are *inside* the
sheet. Nothing opens it. The sheet, the join mutation and the ringer-offer
mutation are unreachable code.

And the destination has no way in either:

```
GroupDetail.tsx:1705   isPrivateAndNotMember = visibility==='private' && !isMember && !isAdmin
GroupDetail.tsx:2050   ...renders a padlock and nothing else
```

`grep -n "request_to_join\|join_btn\|joinMutation" GroupDetail.tsx` → no match.
GroupDetail handles *invites* (accept/decline) and nothing else for a
non-member. So: a player discovers a group, taps it, and lands on a page with
no join button and a locked tab.

This is the most serious defect in the round. The Groups tile exists so that a
player can join a group; joining is impossible. The UAT account could not hit it
because both groups within 25 miles are ones he is already in.

*Not (b):* the fix is not to restore the modal. A group's own page is where you
join a group. The action moves to `GroupDetail`, once, and the dead sheet goes.

### 0.4 Five controls on the Groups page do nothing.

```
AllGroupsPage.tsx:29   const [activeFilter, setActiveFilter] = useState<string|null>(null)
AllGroupsPage.tsx:30   const [sortBy, setSortBy] = useState('newest')
AllGroupsPage.tsx:127-141  three filter chips + two sort chips
```

`activeFilter` is referenced at 29, 129, 130 and nowhere else. `sortBy` at 30,
136, 137 and nowhere else. Neither touches `filteredGroups` (40-42). Five chips
that highlight when tapped and change nothing.

### 0.5 Coaching renders its discriminator and ignores it.

```
Coaches.tsx:106-123   every row: same GraduationCap icon, same shape
```

`meta.venue_type` distinguishes `'coach'` (a coaching business) from `'club'` (a
club that runs lessons). Measured, 25 mi: **1 coach, 7 clubs.** Presented as one
undifferentiated list under a heading that says "Coaching", which is why UAT read
it as "1 coach and 7 venues with no mention of a coach".

`VenueDetail.tsx` compounds it: `grep -n venue_type VenueDetail.tsx` → no match.
The single real coach routes to a venue page that offers courts and booking.

### 0.6 Hardcoded English.

```
Coaches.tsx:70   <h1 ...>Coaches</h1>
```

Also wrong on the facts: the page is seven-eighths clubs. It is the **Coaching**
page.

### 0.7 Near-you duplicates Mine.

Groups: `myApproved` renders at :149, and the same groups render again at :172
because `discover_list('groups')` counts groups near you regardless of
membership — correctly. Players: `acceptedProfiles` at :126 and the same people
again at :150. Clubs: `recentlyPlayed` at :43 and the same clubs again at :79.

Three pages, same shape, same duplication.

---

## §1 — Server: applied, verified, committed

`20260914180513_q_a_row_carries_what_its_page_needs`

Payload-only change to `discover_list`. Every `WHERE`, the row set, the ordering
and the signature are unchanged, so no count can move.

Added: `venues.booking_platform`, `coaching.booking_platform`,
`groups.allow_ringers`, `groups.auto_approve`, `groups.banner_url`.

Not added, deliberately: `padel_venues.photos` — those URLs embed the Google
Places API key and must never reach a client.

Verified live after applying, UAT coordinates 51.4391 / −2.5898, 25 mi:

```
coaching  8 = 8   MATCH
events   11 = 11  MATCH
groups    5 = 5   MATCH
leagues   0 = 0   MATCH
players  58 = 58  MATCH
venues   14 = 14  MATCH
```

(Service-role identity, so RLS is not applied; as the UAT user the same identity
holds at groups 2, events 1, players 57.)

Repo/live agreement: `md5(schema_migrations.statements[1])` =
`17fe853587314de4db150f39971dbbdd` = md5 of the committed file's contents.

### The payload contract — this is the whole of it

| kind | meta keys |
|---|---|
| `venues` | `courts`, `booking_url`, `booking_platform`, `ppa_bookable`, `coaching` |
| `coaching` | `venue_type`, `booking_url`, `booking_platform` |
| `players` | `avatar_url`, `rating` |
| `groups` | `visibility`, `join_mode`, `allow_ringers`, `auto_approve`, `banner_url`, `member_count`, `my_status` |
| `leagues` | `entry_fee_pence`, `currency`, `status` |
| `events` | `source`, `route`, `start_time`, `entry_fee_pence`, `currency`, `external_link` *(source='event')* / `spots_left`, `padel_venue_id` *(source='venue_event')* |

**Any key read by a page that is not in this table is a defect.** A grep gate
for exactly that is in §5.

---

## §2 — The shape every tile page now has

One idea, applied six times.

> **A tile page is its tile's number, rendered.
> One list. Your relationship to a row is a badge on that row, never a second
> section.**

Four rules follow from it, and they are the whole layout:

1. **Waiting on you** — an action banner pinned at the top, above everything.
   Incoming connection requests, a coaching session you have booked. These have
   a deadline and an action; they are an inbox, not a directory. Renders only
   when non-empty.

2. **Yours, but outside the radius** — one compact horizontal pill strip,
   labelled for what it is ("Your groups elsewhere", "Played before"). Items of
   yours that ARE inside the radius are already in the list below and must not
   appear here. Renders only when non-empty.

3. **The hero** — row 1 of the counted list, promoted to a full-width card with
   an eyebrow that says *why it is the hero*, and one primary action. The hero
   card carries the page's single `bg-ball` element. When promoted, that row is
   **removed** from the list below it — a featured item shown twice is amateur.
   Every page defines a fallback chain so the hero is never absent and never a
   placeholder.

4. **The list** — every remaining counted row, one flat list, sorted for
   usefulness, each row badged with your relationship to it.

The count identity, which the gate in §5 checks mechanically:

```
heroConsumedRows + listRows === tile number          (with no filter applied)
```

A hero that promotes a row consumes 1. A call-to-action hero (the empty case)
consumes 0.

Sorting is a presentation choice and is allowed. **Filtering by distance is
not** — `discover_list` remains the only definition of near-you.

The count moves out of a section heading and into the page header, where it
reads as English instead of as an engineer's label:

```
  Clubs
  14 clubs within 25 miles
```

No `NEAR YOU · 14` heading on any page. Delete it.

---

## §3 — Page by page

Design tokens throughout: `DESIGN.md`. Rows ≥ 64px, tap targets ≥ 44px, one
`bg-ball` per screen. Loading renders **skeleton rows of the real row shape**,
not a spinner.

Back button on all six: `goBack(navigate, '/discover')`.

---

### 3.1 Clubs — `src/pages/people/VenuesPage.tsx`

Measured, UAT, 25 mi: 14 clubs · 1 bookable in-app · 12 with a booking link ·
9 with a known court count · 7 offering coaching.

**Header**

```
  ‹  Clubs
     14 clubs within 25 miles
```

`t('discover.tile_clubs')` / `t('courts.clubs_within', { count })` — both exist,
`clubs_within_one` exists.

**Search** — a name filter over the counted rows. Existing key
`t('courts.search_placeholder')`. Name only. It must not touch distance.

**Chips** — `Bookable here` (`meta.ppa_bookable === true`), `Has coaching`
(`meta.coaching === true`). Both read real payload keys. Both must actually
filter. No other chips.

**Hero — fallback chain, in order:**

1. nearest row with `meta.ppa_bookable === true`
   · eyebrow `t('courts.ppa_venue')` · CTA **ball** `t('courts.book_here')` →
   `/play/book-court?venue_id=<id>`
2. else nearest row with a non-empty `meta.booking_url`
   · eyebrow `t('discover.hero_nearest_club')` · CTA `t('courts.books_via', {
   platform: meta.booking_platform ?? t('venue.website_fallback') })` →
   `openUrl(meta.booking_url)`
3. else nearest row
   · eyebrow `t('discover.hero_nearest_club')` · CTA `t('discover.action_view')`
   → `/venues/<id>`

Hero body: name, `subtitle · distance · N courts` (courts omitted when
`meta.courts` is null — **omit, never "unconfirmed"**).

UAT gets branch 1. A city with no partner gets branch 2. Nowhere gets nothing.

**List** — the other 13. Sort: `ppa_bookable` first, then `distance_miles`.
Row: name; `city · distance · N courts`; trailing control —

- `ppa_bookable` → solid `bg-court` button `t('courts.book_here')`
- else `booking_url` → outline button `t('courts.books_via', { platform })` with
  `ExternalLink`, via `openUrl`
- else → `ChevronRight`, row opens `/venues/<id>`

Badge `t('discover.badge_played_here')` on rows the viewer has played at.

**Outside-radius strip** — `useMyPlayedVenues` rows whose `venue_id` is **not**
in the counted list, as pills, under `t('discover.played_before')`. If every
played venue is inside the radius, this strip does not render.

**Do not touch `src/components/play/CourtsHome.tsx`.** It is imported by
`BookCourt.tsx:1367` as step 1 of the booking flow and has its own radius. It is
not this page.

---

### 3.2 Players — `src/pages/people/AllPlayersPage.tsx`

Measured, UAT, 25 mi: 58 players (57 excluding self) · **58 of 58 have an ELO**
· 3 have an avatar.

The ELO is the thing Playtomic and Padel Mates do not have. It goes on the hero,
on every row, and into the sort. A padel discovery page that hides ratings is
a contact list.

**Header**

```
  ‹  Players
     57 players within 25 miles
```

New key `discover.players_within` / `_one`.

**Waiting on you** — incoming connection requests, `ConnectionRequestCard`, under
`t('people.connection_requests', { count })`. Pinned at the very top. Not a
directory section; an inbox.

**Search** — existing `t('people.search_players')`, name only.

**Sort chips** — `t('discover.sort_closest_level')` (default) /
`t('discover.sort_nearest')`. Two chips, both wired.

**Hero — fallback chain:**

Let `myElo = profile.internal_ranking`, and `candidates` = counted rows with
`state === 'none'` (not connected, no pending either way).

1. `myElo != null` and candidates with `meta.rating != null` exist → the one
   minimising `|meta.rating − myElo|`, ties broken by distance.
   - if `|Δ| ≤ 150` → eyebrow `t('discover.hero_closest_level')`, body line
     `t('discover.hero_elo_delta', { rating, delta })`
   - if `|Δ| > 150` → eyebrow `t('discover.hero_nearest_player')`, and the
     delta line is **omitted**. Do not call a 400-point gap "your level".
2. else nearest candidate → eyebrow `t('discover.hero_nearest_player')`
3. else (every player within the radius is already connected or pending) →
   CTA hero, consumes 0 rows: title
   `t('discover.hero_all_connected_title')`, body
   `t('discover.hero_all_connected_body', { count, radius })`, CTA **ball**
   `t('discover.radius_widen')` → `/discover?r=100`

Hero card: `PlayerAvatar` at `lg`, name, `city · distance`, ELO chip, CTA **ball**
`t('people.connect')`.

**List** — remaining counted rows. Sort: not-connected before connected; within
each group, by `|Δ ELO|` when the "Closest level" chip is active and `myElo` is
known, otherwise by distance.

Row: avatar; name; `city · distance`; **ELO chip reading `meta.rating`**;
trailing control by connection state — `Connect` / `Pending` / `Accept` /
`Connected`. The existing four-state block at :166-188 is correct and stays; only
the `meta` key and the ordering change.

`role` note: the row body button and the action button are siblings inside a
`div`, never nested. Each gets its own `aria-label`.

**Outside-radius strip** — accepted connections whose `user_id` is **not** in the
counted list, as avatar pills, under `t('people.my_connections')`. Connections
inside the radius are in the list, badged `Connected`, and must not be duplicated
here.

**Delete the standalone "My connections" section (:120-138).** It is the
duplication UAT complained about.

---

### 3.3 Coaching — `src/pages/Coaches.tsx`

Measured, UAT, 25 mi: 8 = **1 coach** + **7 clubs that run lessons**.

**Header**

```
  ‹  Coaching
     1 coach and 7 clubs within 25 miles
```

`t('discover.tile_coaching')` for the title — **delete the hardcoded
`<h1>Coaches</h1>` at line 70.** New key `discover.coaching_within_split` with
both counts, plus `discover.coaching_within` for the case where one side is zero.

**Chips** — `t('discover.filter_coaches')` / `t('discover.filter_clubs')`,
filtering on `meta.venue_type`. Both wired.

**Waiting on you** — booked sessions (`myBookings`, the existing query) pinned at
the top under `t('discover.your_sessions')`. Renders only when non-empty. This is
the "Mine" section, correctly re-cast: it is not a directory of coaches, it is
what you have booked.

**Hero — fallback chain:**

1. nearest row with `meta.venue_type === 'coach'` → eyebrow
   `t('people.badge_coach')`, body `city · distance`, CTA **ball**
   `t('discover.action_view')` → `/venues/<id>`
2. else nearest row (a club) → eyebrow `t('discover.hero_lessons_here')`, CTA
   **ball** `t('courts.books_via', { platform })` when `meta.booking_url` is set,
   else `t('discover.action_view')`

UAT gets branch 1 — the one real coach, at the top, named as a coach. That is
the whole of complaint #3.

**List** — remaining counted rows, **grouped by `meta.venue_type` with
sub-headings inside the one list**:

```
  COACHES · n          (rendered only when n ≥ 1 after the hero is removed)
  CLUBS OFFERING LESSONS · m
```

`t('discover.group_coaches', { count })` / `t('discover.group_clubs_lessons', {
count })`. Coach rows: `GraduationCap` on `bg-court-50`. Club rows: `Building2`
on `bg-surface`. Two visibly different row types, because they are two different
things.

n + m + 1 (hero) = 8. Sub-headings are not sections in the §2 sense — they are
the one counted list, structured by the discriminator the payload carries.

**Destination — `src/pages/VenueDetail.tsx`**

`VenueDetail` does not branch on `venue_type`, so the coach lands on a court page.
Add the branch: when the loaded row's `venue_type === 'coach'`, the page renders
the coaching identity — title, `t('people.badge_coach')` chip, contact / booking
link, about — and **hides** the courts summary, the court-count line, the
book-a-court affordance and the "courts unconfirmed" line (`:598`, `:1170`).

*Fix class (a).* The alternative — routing coaches somewhere else, or passing a
flag in the query string — would leave the page rendering a wrong identity for
anyone arriving from search or a share link. The page should render what the row
is.

---

### 3.4 Groups — `src/pages/people/AllGroupsPage.tsx`

Measured, UAT, 25 mi: 5 groups exist; **2 are visible to this user** (RLS,
`can_see_group`); he is a member of both; 4 of the 5 are `join_mode='request'`,
1 is `closed`. He is in 3 groups in total, so one of his is outside the radius.

The honest summary of his situation: *there is nothing near him to join.* The
page must say so and give him the action that changes it. It must not pad the
screen with the same two groups twice.

**Header** — unchanged layout; `+` button stays (`bg-court`, not ball).

```
  ‹  Groups                                    [+]
     2 groups within 25 miles
```

New key `discover.groups_within` / `_one`.

**Outside-radius strip** — `useMyGroups` rows not in the counted list, as pills,
under `t('discover.your_groups_elsewhere')`. UAT sees 1 pill.

**Search** — existing `t('discover.search_groups_placeholder')`.

**Chips — delete the five dead ones (:127-141). Replace with three that work:**

- `t('people.filter_open_to_join')` → `my_status == null && join_mode !== 'closed'`
- `t('people.filter_welcomes_ringers')` → `meta.allow_ringers === true`
- `t('people.filter_most_members')` → sort by `meta.member_count` desc

`near_me` is deleted: the entire list is near you. `newest` is deleted: the
payload carries no creation date, and a chip with nothing behind it is what §0.4
was about.

**Hero — fallback chain:**

1. nearest row with `my_status == null && join_mode !== 'closed'` → eyebrow
   `t('people.open_to_join')`, body `city · distance · N members`, CTA **ball**
   `meta.auto_approve || meta.join_mode === 'open' ? t('people.join_btn') :
   t('people.request_to_join')`, calling the join mutation in place.
2. else → CTA hero, consumes 0 rows. Title
   `t('discover.hero_no_groups_open_title')`, body
   `t('discover.hero_no_groups_open_body', { count, radius })` — which for UAT
   renders as *"The 2 groups within 25 miles are ones you're already in."* — CTA
   **ball** `t('people.create_group_btn')` → opens `CreateGroupSheet`.

UAT gets branch 2. It names his exact situation in one sentence and hands him the
one action that fixes it.

**List** — all counted rows (2 for UAT, since the CTA hero consumes none). Sort:
joinable, then member, then closed; distance within each.

Row structure — outer `div`, body `button`, sibling action `button`. Never a
`<span>` styled as a button inside a `<button>`, which is what :190-194 is today.

| `my_status` / `join_mode` | badge | action |
|---|---|---|
| `approved` | `t('people.member_btn')` | opens the group |
| `ringer` | `t('people.badge_ringer')` | opens the group |
| `pending` | `t('people.requested')` | none; row opens |
| `pending_ringer` | `t('people.ringer_offer_pending')` | none; row opens |
| null, `join_mode='open'` | — | **button** `t('people.join_btn')` |
| null, `join_mode='request'` | — | **button** `t('people.request_to_join')` |
| null, `join_mode='closed'` | `t('people.group_closed')` | none; row opens |

Row subtitle: `city · distance · t('people.members', { count: meta.member_count })`.
`member_count` is in the payload and is currently rendered nowhere.

**Delete** the preview sheet (:204-312), `previewGroup`, `showRingerInfo`, the
`DiscoverGroup` interface, `ringerOfferMutation`, and the now-unused imports
(`motion`, `AnimatePresence`, `MapPin`, `Lock`, `X`, `Globe`, `UserCheck`,
`Info`). All unreachable — see §0.3.

**Keep** `joinMutation`: the hero and the joinable rows call it.

**`src/pages/GroupDetail.tsx` — the join path**

This is the functional hole. Add a sticky bottom action bar for a signed-in
non-member, using the mutations and the i18n keys the deleted sheet already had,
so no new copy is needed:

- `join_mode === 'open' || auto_approve` → `t('people.join_btn')`, inserts
  `group_members{status:'approved'}`
- `join_mode === 'request'` → `t('people.request_to_join')`, inserts
  `{status:'pending'}`; afterwards the bar reads `t('people.group_requested')`
- `allow_ringers` → secondary `t('people.offer_ringer')` with the
  `t('people.ringer_info')` disclosure, inserts `{status:'pending_ringer'}`
- `join_mode === 'closed'` → no bar; the existing padlock state is correct
- duplicate key `23505` → `toast.error(t('people.join_declined_contact_admin'))`

**`GroupDetail.tsx:89` — the group query does not select `join_mode`. Add it.**

Blast radius of that select: the `Group` interface at ~:30, `GroupSettings`
(which writes `visibility`, `auto_approve`, `allow_ringers`, `ringer_approval` at
:1094) — adding a read-only column changes no write. Confirm and state it.

---

### 3.5 Leagues — `src/pages/LeagueDiscovery.tsx`

**Two changes only. Nothing else in this file may be touched.** It lost 36% of
its bytes in an earlier round and took its search box and format filters with it.

1. Header count line → `t('discover.leagues_within', { count })` / `_one`; delete
   the `NEAR YOU · n` heading.
2. Back target → `goBack(navigate, '/discover')`.

Near-you is 0 and Mine is 1 for the UAT account. That is correct: his league is
not open-registration, so it is not in the count. It belongs in the
outside-the-count strip, under `t('discover.your_leagues')`, and the zero state
says so plainly with `t('discover.radius_widen')`. Do not merge the two to avoid
showing a zero.

### 3.6 Events — `src/pages/people/AllEventsPage.tsx`

Same two changes only: header count via `t('discover.events_within', { count })`
/ `_one`, and the back target. `meta.route` is already read correctly at :114.

---

## §4 — New locale keys

Every one in all 8 locales: `en, es, fr, it, pt, sv, ar, hi`. **Arabic needs all
six plural forms** (`_zero`, `_one`, `_two`, `_few`, `_many`, `_other`) for every
counted key.

```
discover.players_within            "{{count}} players within {{radius}} miles"
discover.groups_within             "{{count}} groups within {{radius}} miles"
discover.leagues_within            "{{count}} leagues within {{radius}} miles"
discover.events_within             "{{count}} events within {{radius}} miles"
discover.coaching_within           "{{count}} within {{radius}} miles"
discover.coaching_within_split     "{{coaches}} coaches and {{clubs}} clubs within {{radius}} miles"

discover.hero_nearest_club         "Nearest club"
discover.hero_nearest_player       "Nearest player"
discover.hero_closest_level        "Closest to your level"
discover.hero_elo_delta            "{{rating}} ELO · {{delta}} from you"
discover.hero_all_connected_title  "You know everyone nearby"
discover.hero_all_connected_body   "You're connected to all {{count}} players within {{radius}} miles."
discover.hero_lessons_here         "Lessons here"
discover.hero_no_groups_open_title "Nothing open near you"
discover.hero_no_groups_open_body  "The {{count}} groups within {{radius}} miles are ones you're already in."

discover.sort_closest_level        "Closest level"
discover.sort_nearest              "Nearest"
discover.filter_coaches            "Coaches"
discover.filter_clubs              "Clubs"
discover.group_coaches             "Coaches"
discover.group_clubs_lessons       "Clubs offering lessons"

discover.your_sessions             "Your sessions"
discover.your_groups_elsewhere     "Your groups elsewhere"
discover.your_leagues              "Your leagues"
discover.played_before             "Played before"
discover.badge_played_here         "Played here"
```

Plural `_one` variants required for: `players_within`, `groups_within`,
`leagues_within`, `events_within`, `coaching_within`, `group_coaches`,
`group_clubs_lessons`, `hero_no_groups_open_body`, `hero_all_connected_body`.

---

## §5 — Rejection gates

Run every one. Paste **raw output**, not a summary. A gate that returns nothing
gets its command echoed above the empty result so the reader can see it ran.

### G1 — the count identity, from the running app

For each of the six, at 25 miles, signed in as the UAT account: the number on the
tile, the hero's consumed rows (1 or 0), and the rows rendered in the list.

```
kind      tile   hero   list   hero+list == tile
```

**From the app, not from the code.** Expected for the UAT account:
`Clubs 14 · Players 57 · Coaching 8 · Groups 2 · Leagues 0 · Events 1`.

### G2 — no page defines distance

```
grep -nE 'radius|haversine|venues_near|\b60\b|useState\(60\)' \
  src/pages/people/VenuesPage.tsx src/pages/people/AllPlayersPage.tsx \
  src/pages/Coaches.tsx src/pages/people/AllGroupsPage.tsx \
  src/pages/LeagueDiscovery.tsx src/pages/people/AllEventsPage.tsx
```

Only `useDiscoverRadius()` and the `radius` interpolated into a header string may
appear. Anything else is a second definition of near-you.

### G3 — no page reads a key that is not in the contract

```
grep -rnoE 'meta\.[a-z_]+' src/pages/people/VenuesPage.tsx \
  src/pages/people/AllPlayersPage.tsx src/pages/Coaches.tsx \
  src/pages/people/AllGroupsPage.tsx src/pages/LeagueDiscovery.tsx \
  src/pages/people/AllEventsPage.tsx | sort -u
```

Every key printed must appear in the §1 contract table. This gate is what §0.1
and §0.2 would have caught.

### G4 — no dead state

For every `useState` added or kept in the four rebuilt pages, grep its setter AND
its getter. A variable written by a control and read by nothing is §0.4 again.
Paste the grep for `activeFilter`, `sortBy`, and every new state name.

### G5 — hardcoded strings

```
grep -nE '>[[:space:]]*[A-Z][a-z]+[[:space:]]+[a-z]+[^<{]*<|(placeholder|aria-label|title|alt)="[A-Z][a-z]|toast\.(error|success)\('"'"'[A-Z]' <every file touched> | grep -v "t('"
```

**Run this exact pattern.** A narrower one — single-quoted strings only — was
substituted in an earlier round and reported "(empty)" while English literals
shipped. Anything printed is either routed through `t()` or justified by line
number as pre-existing.

### G6 — locale parity

For each of the 8 locales, the count of keys under `discover:` must be equal.
Print all 8 numbers. Then, separately, print the `ar` entries for every new
plural key and confirm six forms each.

### G7 — files that shrink

Any file losing more than 20% of its bytes gets an itemised list of what was
removed and why. `AllGroupsPage.tsx` will lose roughly 40% — itemise the preview
sheet, the mutations, the interface, the imports, and state where each
capability now lives.

**Replacing a query never authorises removing search, filters, sorting or any
other control the page already had.** Where a control is deleted here it is
because it was proven dead (§0.4) or because its function moved (§0.3) — and the
report says which, per control.

### G8 — the group join path, end to end

From the running app, signed in as a user who is **not** a member: open a
`join_mode='request'` group from the Groups list, tap request, and show the state
before and after. This is §0.3 and it is the reason this round exists.

### G9 — builds

`npm run build` in `ppa-v2`, and typecheck. Green, with the tail of the output.
