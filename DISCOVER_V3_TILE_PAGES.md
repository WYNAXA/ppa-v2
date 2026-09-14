# Discover v3 — the six tile pages

**This is the half of the job that was missed.** `DISCOVER_V3_BUILD.md` specified
the Discover tab and nothing behind it. The tab shipped correct and every one of
the six pages behind it still runs its own older query. UAT found all six.

---

## What the user saw, and why

| tile | tile said | page showed | the page's actual query |
|---|---|---|---|
| Clubs | 14 | 5 rows, "13 clubs within 60 miles" | `VenuesPage.tsx:27` — `useState(60)`, a 60-mile radius |
| Players | 57 | 74, first 17 not tappable | `AllPlayersPage.tsx:29` — **no distance filter at all**, `.limit(100)` |
| Coaching | 8 | 1 | `Coaches.tsx:110` `venues_near(60 mi)` **and** `:130` `.eq('venue_type','coach')` |
| Groups | 0 | 7 | `AllGroupsPage.tsx:40` — **no distance, no scope filter**, `.limit(100)` |
| Leagues | 0 | 1 (his own) | `LeagueDiscovery.tsx:183` — `status='active'`, **no distance** |
| Events | 1 | 1 | `AllEventsPage.tsx:62` — agrees by coincidence |

Seven definitions of "near you" for six nouns.

---

## The server half is done — `discover_list`

Migration `o_the_count_is_the_list`. **The count is now the list, counted:**

```
discover_list(kind, p_lat, p_lng, p_radius_miles, p_limit, p_offset)
discover_counts(...)  =  count(*) of discover_list, per kind
```

A tile cannot disagree with its page, because there is one predicate per noun
and the number is derived from it. Verified live for the UAT account:

```
Clubs     tile 14  list 14  MATCH
Players   tile 57  list 57  MATCH
Coaching  tile  8  list  8  MATCH
Groups    tile  2  list  2  MATCH
Leagues   tile  0  list  0  MATCH
Events    tile  1  list  1  MATCH
```

`discover_list` returns `id, title, subtitle, distance_miles, meta` where `meta`
is a jsonb carrying what each kind needs — courts and `booking_url` for clubs,
`member_count` and `my_status` for groups, `external_link` for events, and so
on. `SECURITY INVOKER`, so RLS still decides what the caller may see.

**Groups also changed meaning, and this was my error.** It required
public/open AND `join_mode <> 'closed'` AND `allow_join_requests`, and excluded
groups you are already in. No other tile does that — Clubs counts clubs you have
played at, Players counts people you are connected to. That is why it read 0
with five groups 1.9 miles away, one of them public and one you are a member of.
"Near you" means near you. Whether you can join belongs on the page.

---

## The client half — what to build

### The rule

**Every tile page is its tile's number, expanded.** One section on each page,
headed "Near you", fed by `discover_list` with the **same kind, same lat/lng,
same radius** the tab used. Nothing else may define near-you.

Below it, a second section headed **Mine** — that page's own existing query for
what belongs to the viewer. Mine keeps its current behaviour. It is separate and
labelled, never mixed into the count.

That is the shape `TilePage.dc.html` on the canvas has always shown.

### Carrying the scope across the navigation

The tab holds `{ lat, lng, radius }` in `useDiscoverScope`. Tapping a tile must
carry it — the page cannot re-derive it or default to 25 while the tab was on
100, or we are back to two definitions.

Pass it in the route: `/discover/venues?r=100`. The page reads `r` and falls
back to 25. Report the approach you take before implementing it; if router state
is cleaner in this codebase, use that and say why.

### Page by page

For each: replace the Near-you query with `discover_list`, keep Mine.

1. **`VenuesPage.tsx`** — delete `useState(60)`. Radius comes from the scope.
   The "13 clubs within 60 miles" line becomes the shared radius, and the count
   in it must be the rows rendered, not a separate number.
2. **`AllPlayersPage.tsx`** — `discover_list('players')`. Also fix what UAT hit:
   **17 rows rendered with no action**. Those are the viewer's existing
   connections. Either give them a "View profile" action or move them to Mine —
   a row that does nothing is a dead tap. Say which you chose and why.
3. **`Coaches.tsx`** — `discover_list('coaching')`. Note this **widens** the
   page: the tile counts clubs offering lessons plus standalone coaches, and the
   page currently shows only `venue_type='coach'` (1 row). 8 is correct.
   `coach_profiles` has 0 rows and is not part of this count.
4. **`AllGroupsPage.tsx`** — `discover_list('groups')` for Near you. Keep My
   groups above it. `meta.my_status` and `meta.join_mode` decide the button:
   already in → Open; joinable → Request; `join_mode='closed'` → no button, and
   the row still opens.
5. **`LeagueDiscovery.tsx`** — `discover_list('leagues')` for the browse
   section. **Near you will be 0 and Mine will be 1.** That is correct and must
   read correctly: the empty Near-you section says so plainly, and the league
   the user is in sits under Mine. Do not merge them to avoid a zero.
6. **`AllEventsPage.tsx`** — `discover_list('events')`. Agrees today; move it
   anyway so it cannot drift.

### Rejection criteria

- **No page may filter by distance itself.** `discover_list` is the only
  definition. Grep for `radius`, `60`, `haversine`, `venues_near` in the six
  files afterwards and paste the raw output.
- A tile's number and the rows on its page must be equal for the same scope.
- No row renders without an action or a destination.
- A zero section says what it is, and Mine sits beside it.
- Every new string through i18next in all 8 locales.

### Report

Per §G of `DISCOVER_V3_BUILD.md`, plus the two checks below. Both have now
failed silently more than once, so neither is optional.

#### The side-by-side, from the running app

For each of the six: the number on the tile, and the number of rows the page
renders, at 25 miles. From the app, not from the code. Expected today for the
UAT account:

```
Clubs 14 · Players 57 · Coaching 8 · Groups 2 · Leagues 0 · Events 1
```

A grep proving no page filters by distance is necessary and not sufficient —
it is exactly the evidence that looked fine while all six pages disagreed with
their tiles.

#### The hardcoded-string check

**Counting locale keys does not catch a string that never reached i18next.**
Three consecutive rounds shipped new English literals while the key-parity
check passed. Run this over every file touched and paste the raw output:

```
grep -nE '>[[:space:]]*[A-Z][a-z]+[[:space:]]+[a-z]+[^<{]*<|(placeholder|aria-label|title|alt)="[A-Z][a-z]|toast\.(error|success)\('"'"'[A-Z]' <files> | grep -v "t('"
```

Anything it prints is either routed through `t()` or justified in the report as
pre-existing, with its line number.

#### When a file shrinks

Any file that loses more than 20% of its bytes gets an itemised list of what
was removed and why. "Replaced the query" does not account for a third of a
file. `LeagueDiscovery.tsx` lost 36% in the first pass and took its search box
and format filters with it — function the user had, deleted silently, on the
page this whole pattern was copied from.

**Replacing the Near-you query never authorises removing search, filters,
sorting or any other control the page already had.**
