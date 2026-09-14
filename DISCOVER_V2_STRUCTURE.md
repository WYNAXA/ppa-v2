# Discover — build brief v2

**Supersedes v1 entirely.** v1 made the feed the tab. That was wrong and shipped
bugs. This version is built from a full extraction of the router and every
`navigate()` / `to:` / `<Link to>` in the codebase, not from memory.

Written 14 Sep 2026, after UAT.

---

## 0. What v1 got wrong, so it is not repeated

Two of the six Community tiles ejected the user into the Courts tab, and a
duplicate league row sat underneath. **Those were the defects.** v1 deleted the
whole tile pattern and replaced it with a horizontally scrolling filter strip
over `discover_feed()`.

Three consequences, all confirmed in UAT:

1. **The counts lied.** `discover_feed` returns only `is_open = true` matches and
   `visibility = 'open'` leagues — *other people's* things. The strip showed
   **Games 0, Leagues 0** to an account with **5 upcoming games and 1 league**.
2. **Destinations disappeared.** A horizontal strip hides options behind a
   swipe. Events, connections and the coach directory became unreachable.
3. **A component was orphaned.** `DirectoryGrid.tsx` — the six tiles — still
   exists and builds correctly. Its only importer was `People.tsx`, which was
   deleted. Nothing renders it.

**The rule that replaces it:** a tile count means **mine**. Real values for the
UAT account, read from the database: Groups **3**, Players **34**, Coaches **0**,
Venues **4**, Leagues **1**, Events **1**.

---

## 1. The model already exists — copy it, do not invent

`src/pages/LeagueDiscovery.tsx` (route `/leagues`) is already the correct shape:

- line 83 — `myLeagues`, from `league_members`
- line 174 — open leagues, searchable and filtered, excluding ones you are in
- line 241 — renders **My Leagues** above them
- create action present

**Mine → Browse → Create, one screen, one route.** Every other tile page becomes
this. Do not design a new pattern.

This also fixes tap depth arithmetically rather than by judgement:
**tab = 1, tile = 2, the thing = 3.** "Where are mine" stops needing an answer
because Mine is the top of the page.

---

## 2. Verified defects — every one has file and line evidence

### 2.1 The catch-all hides every routing bug — fix this first

`src/App.tsx:335`

```tsx
<Route path="*" element={<Navigate to={session ? '/home' : '/auth'} replace />} />
```

Every broken link in the app silently lands on Today. No 404, no error, no
trace. This is why a link to a nonexistent route survived a build, a review and
a deploy, and why "clicking X takes me to Today" keeps appearing in UAT.

**Replace with a real not-found screen** that shows the attempted path and a
link back to Today. Only `/` keeps a redirect.

Fix class: root-cause. Leaving it while fixing the individual links would
guarantee the next one is invisible too.

### 2.2 Dead link

`src/pages/Discover.tsx:265` links to `/discover/coaches`. **No such route
exists.** The route is `/coaches` (`App.tsx:319`). Result: Coaches → Today.

### 2.3 Orphan routes — nothing anywhere links to them

```
/discover/connections   MyConnectionsPage — built, unreachable
/discover/events        AllEventsPage — built, unreachable
/discover/events/:id    reachable only via a /people/events/:id redirect from GroupDetail
/matches                Matches.tsx, a 777-byte stub
/venues                 ForVenues — a venue-owner sales page inside the player app
```

### 2.4 The Groups page hides your groups

`src/pages/people/AllGroupsPage.tsx:61`

```ts
const filtered = (data ?? []).filter((g) => !myGroupIds.includes(g.id))
```

The Groups directory *excludes* the groups you are in. Yours appear only on
Home. One noun, two screens, and the tile count would disagree with the page.

### 2.5 Three doors to one event

`src/pages/people/AllEventsPage.tsx:153` branches to `/people/events/:id` or
`/play/events/:id` by kind; `/discover/events/:id` is a third route for the same
noun.

### 2.6 PadelFest does nothing

`src/pages/Discover.tsx:89`

```ts
case 'event': return '' // handled inline — external link or detail
```

The card is `onClick={() => dest && navigate(dest)}`. `''` is falsy. The
"handled inline" branch was never written. Dead tap by construction.

### 2.7 "Book via PPA" lands on the Courts list

`src/pages/VenueDetail.tsx:636` navigates to `/play/book-court?venue_id=<id>`.
The route exists; **BookCourtPage ignores the `venue_id` query param**, so the
user gets the generic Courts page. The Padel Team Bristol is
`ppa_bookable = true`, which is why it takes this branch.

### 2.8 External links fail in the installed app — [Likely], verify on device

Every external link uses `window.open(url, '_blank')`. In an installed PWA on
iOS that is frequently blocked, and the service worker then serves `start_url`
— Today. Rocket Padel's `booking_url` is well-formed
(`https://www.rocketpadel.com/club/bristol`), so it is not bad data.

Affects: venue booking links, venue websites, Directions (Google Maps), and the
PadelFest ticket link.

**Enumerate every `window.open` in `src/` and report the list before changing
any of them.** Replace with a real `<a href target="_blank" rel="noopener">`,
which iOS standalone handles correctly. If a click handler must stay, it should
set `window.location.href` as the fallback, never rely on `window.open` alone.

### 2.9 Stale `/people` links

`AllGroupsPage:149`, `AllPlayersPage:98`, `AllEventsPage:113`, plus `You.tsx`,
`GroupDetail.tsx`, `CreatePoll.tsx`, `EventDetail.tsx` all navigate to
`/people…`. These work — `RedirectToDiscover` catches them — but every one is a
wasted hop and a stale reference. Update them all.

`src/components/people/DirectoryGrid.tsx:72` still points the Events tile at
`/people/events`.

---

## 3. The build

### Step 0 — diagnose, no code until approved

Report, with file and line numbers:

- **A.** Every `window.open` call in `src/`, with what it opens.
- **B.** How `BookCourtPage` initialises `selectedVenue`, and whether it reads
  any query param at all.
- **C.** What `AllEventsPage`, `AllGroupsPage`, `AllPlayersPage` and
  `MyConnectionsPage` each render, section by section.
- **D.** Every component that currently renders "my groups" or "my
  connections", so the Mine sections are moved rather than duplicated.

For each change, state whether it is **(a) root-cause, (b) a workaround** or
**(c) a display patch**, and justify why it is not (b) or (c).

### Step 1 — routing truth

1. Delete the `path="*"` redirect. Add `NotFoundPage` showing the attempted
   path and a link to Today.
2. Delete `/matches` and `src/pages/Matches.tsx`.
3. Delete the `/venues` route; link `ForVenues` from the venue claim CTA in
   `VenueDetail` instead, where a venue owner actually is.
4. Delete `/discover/connections` — its page folds into `/discover/players`.
5. Collapse event detail to **one** route, `/discover/events/:id`, handling both
   group events and venue-event occurrences. Redirect `/play/events/:id` and
   `/people/events/:id` to it.
6. Replace every stale `/people…` link with its `/discover…` equivalent
   (§2.9). The redirects stay for URLs already delivered in push
   notifications — `/community#connections` (67 delivered) and
   `/community/groups/<id>` (62) are live — but no source file should rely on
   them.

### Step 2 — Discover becomes the grid

Render `DirectoryGrid` on `/discover`. It already exists and already builds the
3×2 layout. Changes to it:

| tile | route | count |
|---|---|---|
| Groups | `/discover/groups` | groups I am an approved member of |
| Players | `/discover/players` | my accepted connections |
| Coaches | `/coaches` | coaches I have booked (0 today) |
| Venues | `/discover/venues` | venues I have played at |
| Leagues | `/leagues` | leagues I am an active member of |
| Events | `/discover/events` | events near me I could go to |

Every count is the viewer's own, from their own data — never a feed row count.
**A zero still opens its page.** Coaches 0 is a door, not a disappearance.

Delete the horizontal filter strip. Delete the `?filter=` param and the
`/open-matches` redirect that depended on it.

Below the grid: **Near you**, one section, showing the `discover_feed()` rows.
The feed keeps doing its job; it stops pretending to be the tab.

### Step 3 — every tile page becomes Mine → Browse → Create

Copy the structure of `LeagueDiscovery.tsx`. Named sections, never one mixed
list — mixing is what produced a league table for a league the user was not in.

- **Groups** `/discover/groups` — remove the `!myGroupIds.includes` filter at
  `AllGroupsPage:61`; add **My groups** above the browse list; keep Create.
- **Players** `/discover/players` — fold `MyConnectionsPage` in as **My
  connections**, with incoming requests at the top.
- **Coaches** `/coaches` — **Mine** (booked sessions) above the directory.
  With zero rows the Mine section is omitted, not rendered empty.
- **Venues** `/discover/venues` — **Recently played** above the directory.
  Reuse CourtsHome's list; do not write a second venue list.
- **Leagues** `/leagues` — rename the sections to **Mine / Near you /
  Finished**. No structural change. Do not rewrite this page.
- **Events** `/discover/events` — **Going** / **Near you** / **My events**.

### Step 4 — the bugs

1. `Discover.tsx:89` — event cards open `external_link` when present, else
   `/discover/events/:id`. No empty string, ever.
2. `BookCourtPage` — read `venue_id` from the query string and preselect that
   venue. Verify with The Padel Team Bristol.
3. Every `window.open` → a real anchor (§2.8), after reporting the list.
4. `/discover/coaches` → `/coaches`.

### Step 5 — report

Every caller or consumer touched, before/after. Every helper whose signature
changed, with all call sites. `npm run build` green. Do not commit.

---

## 4. The bar

The brief is not finished when it compiles. These are rejection criteria.

- **No horizontal scrolling for primary navigation.** Ever. Every destination
  visible without a gesture.
- **A count means mine.** If a number on screen is not the viewer's own, it is
  wrong.
- **Named sections, never a mixed list.** Mine and Near you are separate and
  labelled.
- **≤3 taps** from app open to any noun's detail. Tab, tile, thing.
- **One `ball` (#E4FF57) per screen**, on the single action that changes state.
- **No photo well** where there are no photos — 2 of 6,099 venues have one.
- **Nothing renders "0" where the truth is "we don't know."**
- **All strings through i18next in all 8 locales.** `8eb5cba` is what it costs
  to undo later.
- **No dead routes, no orphan pages.** If nothing links to it, it goes.

Tokens, from DESIGN.md — do not invent values:

```
court #0F5D54   court-50 #EAF5F3   court-100 #CDE7E2   court-700 #0A473F
ball  #E4FF57   ink #0B1512   ink-2 #46534F   ink-3 #7C8B86   ink-4 #B6C0BB
surface #FBFAF7   card #FFFFFF   hairline #E4E7E4   warn #A85F00   alert #D9480F
display 32/34/800 · title 24/26/800 · heading 19/23/700 · body 15/20/400
label 13/18/400 · caption 11/14/700 uppercase 0.06em
radii: control 10, card 12, panel 18, pill 999 · hit targets 44px
```

The dark `ink` panel is reserved for the thing that is **yours and live** — a
league standing, a fixture, a result waiting on you. It is what the eye lands on
when the page opens, and it is where the features Playtomic and Padel Mates do
not have belong: standings, form, jerseys, a live level.
