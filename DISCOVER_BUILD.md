# Discover — build brief

The fourth tab. Replaces Community. Written 13–14 Sep 2026.

Everything in **Part 1** is already applied to the live database and verified.
You are building the client only. **Do not write migrations.**

---

## Part 1 — what the database already gives you

### `discover_feed()`

```
discover_feed(p_lat double precision DEFAULT NULL,
              p_lng double precision DEFAULT NULL,
              p_radius_miles double precision DEFAULT 25,
              p_days integer DEFAULT 28,
              p_limit integer DEFAULT 50)
```

Returns rows of:

| column | notes |
|---|---|
| `kind` | `open_match` \| `event` \| `venue_event` \| `league` \| `coaching` |
| `id` | the row to open. **For `venue_event` this is the OCCURRENCE id**, not the event id |
| `title`, `subtitle` | |
| `starts_at` | timestamptz |
| `venue_id` | a `padel_venues.venue_id`, nullable |
| `venue_name` | nullable |
| `latitude`, `longitude`, `distance_miles` | distance is null when the viewer or the item has no point |
| `price_pence`, `currency` | both nullable |
| `spots_left` | nullable — null means uncapped, not zero |

**`SECURITY INVOKER`.** RLS decides what each viewer sees. Do **not** add
client-side visibility filtering on top of it — that would be a second copy of
the rules, and the copy will drift.

If `p_lat`/`p_lng` are null it falls back to the viewer's
`profiles.latitude/longitude`. If that is also null it skips the radius filter
rather than returning nothing. Pass the user's location when you have it.

Ordering is already **soonest day first, nearest within the day**. Do not
re-sort.

### Event visibility

`events.visibility` is of type `public.audience`:

| value | who sees it | who can create it |
|---|---|---|
| `private` | the author only | anyone |
| `connections` | people the author is connected to | anyone |
| `group` | approved members of `group_id` | that group's admins |
| `public` | any signed-in user | venue staff and platform admins publish directly; anyone else submits as `pending` |

The domain also allows `venue_members`, which `events` does not use yet.

`group_id` no longer means "is this private" — it means which group owns it.
A `group` event must have a `group_id`; the others must not.

The feed shows **`public` and `connections`**. Group events stay on Today and
the group's own page; private events belong to their author.

---

## Part 2 — Step 0: diagnose. No code until this is approved.

Regenerate types first — several columns and the RPC landed recently:

```bash
npx supabase gen types typescript --project-id timbjfihsxqfrqrxwdny > src/lib/database.types.ts
```

Report, with file and line numbers, quoting the current code:

- **A.** `src/components/shared/BottomNav.tsx` — the `community` nav item (key,
  path, `activePaths`) and how its label is translated.
- **B.** `src/App.tsx` — the `/people` routes, the `/community` redirect block
  around line 292, and what `RedirectCommunity` does.
- **C.** `src/pages/People.tsx` — every section it renders, in order, and where
  each one's data comes from.
- **D.** `src/components/people/ClubThisWeek.tsx` — the exact query that selects
  which league to show. I believe it selects on `leagues.linked_group_ids`
  intersecting the user's groups rather than `league_members.user_id = me`.
  Confirm or correct me with the actual code.
- **E.** Where "put up an open match" is created today, and what `/open-matches`
  (`OpenMatchesPage`) currently renders. It is routed but in no tab's
  `activePaths` and no tile links to it.
- **F.** `src/components/people/CreateEventSheet.tsx` — how it currently
  constructs an event row.

For each change you will later make, state whether it is **(a) root-cause,
(b) a workaround** or **(c) a display patch**, and justify why it is not (b)
or (c).

---

## Part 3 — the build

### 1. Rename the tab

`nav.community` → `nav.discover` in **all 8 locales** (en, es, fr, it, pt, sv,
ar, hi). BottomNav item key `community` → `discover`, path `/discover`,
`activePaths: ['/discover', '/leagues', '/compete', '/players']`.

Check before removing `/coaches` and `/play/book-court` from the Courts tab's
`activePaths` — if Courts still owns those pages, leave them.

### 2. Routes

`/discover` → the new `DiscoverPage`. Sub-routes `/discover/groups`,
`/discover/players`, `/discover/events`, `/discover/connections` take over from
the `/people` equivalents.

`/people` and `/people/*` redirect to `/discover/*` preserving path, query and
hash — use exactly the `RedirectCommunity` pattern already in `App.tsx`, and
chain `/community/*` through it. **Do not delete the `/community` redirects** —
they are in push notifications already delivered.

### 3. `DiscoverPage` — `src/pages/Discover.tsx`

**Header.** Title "Discover" (32/34/800, -0.02em). A location pill on the
right showing city + radius ("Bristol · 25 mi"): 32px tall, pill radius, card
background, hairline border, 12/16/600 ink-2. Tapping it changes the radius
(25 / 50 / 100 miles).

**Search.** Full-width 44px control-radius button, card background, hairline
border, magnifier icon in ink-3, placeholder 13/18 ink-3, navigates to
`/search`.

**Filter row.** Horizontally scrolling pills, 34px tall, 7px gap, 20px side
padding. Selected = ink background, white 13/18/700. Unselected = card
background, hairline border, ink-2 13/18/600. Each carries a count — the number
of rows that filter would leave, **computed from the feed you already have, not
a second query**. Zero counts render in ink-4, non-zero in court.

Filters: All · Games (`open_match`) · Events (`event` + `venue_event`) ·
Leagues (`league`) · Coaching (`coaching`).

**Feed.** Grouped by day with a section header — 11/14/700 uppercase 0.06em
ink-2 — followed by a hairline rule filling the row.

**Card.** Card background, hairline border, card radius, overflow hidden.

- Badge row: kind badge in court-50 background / court-700 text, 11/14/700,
  0.05em, 3px 8px, pill radius. If the row is official, a second badge: ink
  background, ball text, same metrics.
- Title 19/23/700, -0.01em.
- Venue line 13/18 ink-2: `venue_name · distance` ("1.4 mi", one decimal,
  tabular-nums). **Omit the distance entirely when null** — no "—", no
  "nearby".
- Meta row 13/18 ink-2: clock icon + time range; ticket icon + price formatted
  from `price_pence`/`currency` using the existing helper in `src/lib/money.ts`.
  Omit either when null.
- Footer strip: 1px hairline top, surface background, 11px 14px. Left:
  organiser or subtitle, 12/16 ink-3. Right: the action, 13/18/700 court-700,
  with a chevron or external-link icon.

**Card destinations by kind:**

| kind | goes to |
|---|---|
| `open_match` | `/matches/:id` |
| `event` | `external_link` when the row has one, else the event detail |
| `venue_event` | `/play/events/:id` — id is the occurrence |
| `league` | `/compete/leagues/:id` |
| `coaching` | the coach or venue detail, whichever exists |

**Empty state.** This is **not** an edge case — it is currently four fifths of
the screen. Render it whenever the feed is shorter than 3 rows, below whatever
rows exist. Panel-radius block, ink background, 16px padding:

- "That's everything within *{radius}* miles" — 15/20/700 white
- one line 13/18 in `#8C9A95` saying nothing is open near them
- primary: full-width 44px control-radius **ball** button, ink text 14/18/800 —
  "Put up a game". **This is the only ball on the screen.**
- two secondary 40px buttons side by side, 1px `#2A3833` border, white
  13/18/600: "Start a league" and "Create an event".

Keep the radius control in the header pill, not in the empty state.

**Tokens** — from DESIGN.md, do not invent values:

```
court #0F5D54   court-50 #EAF5F3   court-100 #CDE7E2   court-700 #0A473F
ball  #E4FF57   ink #0B1512   ink-2 #46534F   ink-3 #7C8B86   ink-4 #B6C0BB
surface #FBFAF7   card #FFFFFF   hairline #E4E7E4
radii: control 10, card 12, panel 18, pill 999. Hit targets 44px.
```

**No photo well anywhere.** Two of 6,099 venues have a photo.

All strings through i18next in all 8 locales. No hardcoded English — see
`8eb5cba` for what that costs to undo later.

### 4. `DirectoryGrid` becomes the filter row

The six tiles were the *content* of the Community tab, and two of them
(Venues → `/play/book-court`, Coaches → `/coaches`) ejected the user into the
Courts tab — which is why they cannot stay as equal tiles.

Keep the four directory pages reachable — groups, players, coaches, venues —
from a single **Browse** row below the feed, not from tiles that look like feed
filters.

### 5. `ClubThisWeek` moves to Home, and its bug is fixed

`/home` is already "what's mine, now". Move it there.

Its league selection must use `league_members.user_id = me`, **not** leagues
linked to a group the user is in. The reported bug: the Leagues count said 1
while the table below showed *PPAT Summer League 2026*, which the user is not
in. Two definitions of "my league" on one screen.

### 6. Create event

`src/components/people/CreateEventSheet.tsx` is currently group-scoped. Give it
a visibility selector and make it reachable from Discover as well as from a
group:

| choice | writes |
|---|---|
| Just me | `visibility 'private'`, `group_id null` |
| My connections | `visibility 'connections'`, `group_id null` |
| *{group name}* | `visibility 'group'`, `group_id` set |
| Everyone | `visibility 'public'`, `group_id null` |

"Everyone" behaves differently depending on who is asking, and the UI must say
so rather than letting the insert fail:

- platform admin, or staff of the venue named in `source_venue_id` — publishes
  immediately (`status 'published'`)
- anyone else — submits for review (`status 'pending'`, `is_official false`,
  `source_type 'player'`), and the sheet says the event will appear once
  reviewed

**Do not let the form send `status 'published'` for that second case** — RLS
rejects it and the user sees a raw error.

A `public` event **must** carry either `padel_venue_id` or its own
`latitude`/`longitude`, and a `start_time`. Enforce that in the form, with the
venue picker reading discoverable venues, not a free-text box.

Do not add a client-side check of who may publish beyond shaping the form. RLS
is the authority and already enforces it.

### 7. Delete `People.tsx`

Once every part of it has a home. Do not leave it routed.

---

## Part 4 — report

**Step 2.** Every caller or consumer you touched, with before/after effect. If
a helper signature changed, list every call site.

**Step 3.** `npm run build`. `tsc` is authoritative. Report the result; do not
commit.

---

## Constraints

- No fallback that re-queries the underlying tables when `discover_feed`
  returns nothing. Empty means empty, and the empty state is designed for it.
- No client-side permission filter on feed rows.
- No loading skeleton with fake rows — use the existing loading pattern.
- Expect **one row** for a Bristol account (PadelFest Bristol, 19 Sept). The
  empty state is what you will mostly be looking at. That is the real data, not
  a bug in your build.
