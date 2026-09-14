# Discover v3 — one scope: near you

**Supersedes `DISCOVER_V2_STRUCTURE.md` for the `/discover` tab only.** The tile
pages, the routing work and the 3-tap budget from v2 all stand and are not
re-litigated here.

Written 14 Sep 2026, after the third UAT on this tab.

---

## 0. The error being corrected

A tab called **Discover** whose first and largest block is headed **"Yours"** is
arguing with its own name. That is the whole defect. Two rounds were spent
treating it as a labelling problem — adding the word "Yours", then adding a
count for events — when the scope itself was wrong.

The six tiles were never wrong. The scope behind them was.

| tile | v2 meaning | v3 meaning |
|---|---|---|
| Groups | groups I'm in — **3** | groups near me — **1** |
| Players | my connections — **17** | players near me — **34** |
| Coaches | coaches I've booked — **0** | places offering coaching near me — **7** |
| Venues | venues I've played — **4** | clubs near me — **17** |
| Leagues | leagues I'm in — **1** | leagues taking entries near me — **0** |
| Events | events I said yes to — **1** | public events near me — **1** |

**The rule that replaces v2's rule:** on `/discover`, every count is *near you*.
One scope, no qualifying header needed, because there is nothing to disambiguate
from. "Yours" leaves the tab entirely — groups, leagues and connections already
moved to Today in `b59689f`, and each tile page still opens with **Mine** above
**Near you**, so nothing becomes unreachable and the tap budget is untouched.

---

## 1. The hero card — and why it is NOT a radius slider

The ask was for the top card to be *"a filter or driving force for the page."*
Half of that is right and half of it is dead on arrival. Measured 14 Sep from
51.4545 / -2.5879:

| radius | clubs | players |
|---|---|---|
| 10 mi | 17 | 34 |
| 25 mi | 17 | 34 |
| 50 mi | 17 | 34 |
| 100 mi | 46 | 39 |

**Every venue and every player within fifty miles of Bristol is already within
ten.** A radius control as the page's driving force would be a control that
changes no number for the only person testing it. Distance is not the axis with
variance in this data; time is.

So the radius survives as a **chip on the hero** — visible, tappable, honest —
and the *driving force* is the single most compelling live thing inside it.

### State A — something is on

Dark `ink` panel. Scope line (`Bristol` · `25 mi ⌄`) across the top, then the
item: badge, title at 24/26/800, one metadata line (venue · distance · time ·
price), and the `ball` on the action. Today that is PadelFest Bristol →
`external_link`.

### State B — nothing is on  ← **this is the common case**

Bristol is the only place in the database with a public event. Outside PadelFest
weekend, and everywhere that is not Bristol, State B is what every user sees. It
is designed first-class, not as an "empty state".

Same panel, same chip, same `ball`. Only the subject changes:

> **0 OPEN GAMES NEAR YOU**
> **Be the one who posts**
> 34 players within 25 miles will see it. Pick a court and a time — they come to you.
> **[ + Put up a game ]**  [ Book a court ]

The reach sentence is what makes the card work, and it is true. It turns posting
from shouting into reach. **The number in it must be the live count, never a
hardcoded string** — it is the same number the Players tile shows.

**One `ball` per screen**: it lives on the hero in both states. Everything below
is quiet by design — six tiles competing with a hero is how v1 lost the action
entirely.

### The floor

One dashed line under the grid, not a panel, offering **Widen to 100 mi** — 100
because it is the only radius that moves the numbers. 50 is offered to nobody,
because 50 returns exactly what 25 returns.

---

## 2. Data defects found while measuring this — fix before the UI

Each one makes a number on the new Discover wrong. All verified today.

### 2.1 `groups.latitude` / `groups.longitude` exist and are NULL on all 8 rows
Fix class: **root-cause, data + write path.** No schema change is needed — the
columns are already there (`double precision`, nullable). Two parts:
1. Backfill from `city` where present (5 of 8 say Bristol, 1 Farnham, 1 Surat).
2. **Group creation must set them.** Until it does, every new group is invisible
   to a distance query and the backfill is a patch that decays. Anchor them the
   same way `events` and `matches` were anchored — a `padel_venue_id` the group
   plays at is better than a geocoded city string, because it is a real point.

### 2.2 The Groups tile reads 1, and that 1 cannot be joined
`BS3 Padel Players` is the only `visibility='public'` group, and its
`join_mode='closed'`. Sending a user two taps deep to a door that does not open
is worse than showing 0. **The Groups tile and page must count and list only
groups a stranger can act on** — `visibility` public/open AND `join_mode` in
(`open`,`request`). Expect that count to be **0** today. Show 0.

### 2.3 `PadelwithPeter Coaching` has `coaching_available = false`
The one dedicated coach business in Bristol is flagged as not offering coaching.
This is why the Coaches tile has been wrong in three different ways across three
UATs — there are two populations (`coaching_available` venues, and rows that
*are* a coach) and no column distinguishes them. **Name the tile "Coaching" and
define it as one thing: places within the radius where you can be coached.**
Then fix the flag on that row.

### 2.4 Duplicate rows in the directory, visible in his own city
- `Padel4all Lockleaze` (2.4 mi) **and** `Padel4all Bristol, Lockleaze` (3.0 mi)
- `Social Sports Society PADEL` (4.0 mi) **and** `S3 Padel Bristol Filton - Social Sports Society` (4.0 mi)

That is 2 of 17 nearby clubs duplicated — **~12% in the one city that matters
most**. Exact-name matching finds only 10 duplicate pairs across all 6,097 rows;
these are near-name, so the real rate is higher. `venues_name_city_uniq` was
added to `venues`, **not** `padel_venues`. The directory has no dedupe at all.

### 2.5 The directory is a city-scrape, not a national directory
219 UK rows. London 77, Edinburgh 22, Manchester 20, Bristol 13, Liverpool 11.
**No Bath. No Cardiff. No Swindon. No Gloucester.** That is why 25 mi and 50 mi
return identical results — the gap is not radius, it is coverage. Bath is 12
miles away and has padel; the app says it does not exist.

This is the supply problem behind every empty number on this tab, and no UI
change touches it.

### 2.6 Players 34 is not really "near you"
93 profiles, 47 geocoded, 34 of those within 10 miles. The tile will read 34
because 72% of every geocoded user in the app lives near him. It is honest
today and becomes misleading the moment the app grows outside Bristol —
it is correct by construction, not by luck, so no change is needed, but do not
mistake it for evidence of local density.

---

## 3. The build

### Step 0 — diagnose, no code until reported
1. Where `Discover.tsx` computes each of the six counts today (file + line), and
   which query each one runs.
2. Whether `discover_feed()` is called for the counts or separately.
3. Every place the string `discover.yours` (or its locale key) is referenced.
4. Whether any other page reads the *mine*-scoped counts, so they are **moved**
   rather than duplicated.

For each change, state whether it is **(a) root-cause, (b) a workaround** or
**(c) a display patch**, and justify why it is not (b) or (c).

### Step 1 — one RPC for the six numbers
The six counts are six round trips today. Add
`discover_counts(p_lat, p_lng, p_radius_miles default 25)` returning one row of
six integers, `SECURITY INVOKER` so RLS still decides what the caller may see —
the same choice made for `discover_feed()`, for the same reason: the RPC must
not restate permission rules.

Definitions, fixed here so they cannot drift:

| field | definition |
|---|---|
| `venues` | `padel_venues` `status='active'`, within radius |
| `players` | `profiles` with coordinates, within radius, excluding self |
| `coaching` | `padel_venues` `status='active' AND coaching_available`, within radius |
| `groups` | joinable (§2.2) **and** geocoded, within radius |
| `leagues` | open to entry, within radius |
| `events` | `visibility IN ('public','connections') AND status='published'`, future, within radius |

### Step 2 — the hero
One component, two states, one `ball`. State B's reach number comes from the
same `players` field — not a second query, not a constant.

### Step 3 — remove "Yours" from `/discover`
Delete the header and the mine-scoped count queries. Confirm each destination
still exists on Today or on its tile page before deleting anything.

### Step 4 — locales
Every new string through i18next in all 8 locales (en, es, fr, it, pt, sv, ar,
hi). Arabic needs all six plural forms on any count string. `8eb5cba` is what
it costs to undo later.

### Step 5 — report
Every caller touched, before/after. Every helper whose signature changed, with
all call sites. `npm run build` green. **Before reporting any change as done,
run the command that would prove it false and paste the raw output — not a
summary of it.** Do not commit.

---

## 4. Rejection criteria

- **Every number on `/discover` is near-you.** If one is the viewer's own, it is wrong.
- **The hero is never absent and never a shrug.** State B is a first-class screen.
- **One `ball` per screen**, on the hero, both states.
- A tile that cannot show anything because of missing data is **fixed at the
  data layer, not hidden.**
- **A count and the page behind it must agree.** Groups 1 → a page with 1
  joinable group, or Groups 0 → a page that says so.
- **Nothing renders "0" where the truth is "we don't know."** Where the truth
  *is* zero, say zero.
- No horizontal scrolling for primary navigation. Ever.
- ≤3 taps to any noun's detail. Tab, tile, thing.

Tokens, from DESIGN.md — do not invent values:

```
court #0F5D54   court-50 #EAF5F3   court-100 #CDE7E2   court-700 #0A473F
ball  #E4FF57   ink #0B1512   ink-2 #46534F   ink-3 #7C8B86   ink-4 #B6C0BB
surface #FBFAF7   card #FFFFFF   hairline #E4E7E4   warn #A85F00   alert #D9480F
display 32/34/800 · title 24/26/800 · heading 19/23/700 · body 15/20/400
label 13/18/400 · caption 11/14/700 uppercase 0.06em
radii: control 10, card 12, panel 18, pill 999 · hit targets 44px
```
