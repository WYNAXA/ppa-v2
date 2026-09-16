# Booking v1 — getting the game on a court

**The booking screen is not the product. Getting the game booked is.**

Padel Players is the only app that knows who is playing, when they agreed to it,
and whether anyone has actually booked a court. No booking platform knows the
first two. That is the whole position, and today the app throws it away.

---

## §0 What is true today, measured

Every number here came from the live database on 15 Sep 2026.

### Availability

```
active clubs                                5,891
bookable inside Padel Players                   1      The Padel Team Bristol
have a booking_url                          4,371      74%
have a known booking_platform                 280      Playtomic 178, Own 99,
                                                       Padel Mates 1, Custom 1,
                                                       EasyCancha 1
no platform recorded                        5,611      95%
venues claimed in the Hub                       7
venues with Stripe charges enabled              1
courts rows                                    17
court_availability_settings rows                3
```

**Real court availability exists for one venue on earth.** Any design whose
first screen is "pick a time and see which courts are free" is a design for
0.017% of the directory. That is the trap Playskan fell into: it shows you a
time grid it cannot back, sends you to the venue's app, and the venue has never
heard of it.

### The booking-responsibility model already exists

`matches` carries, today:

```
booking_status                     not_booked | claimed | booked
booking_claimed_by  booking_claimed_at
booking_pledged_by  booking_pledged_at
booking_pledge_assigned_randomly
booked_by  booked_at  booked_venue_name  booked_court_number
booking_reference  booking_notes  venue_details
poll_id  poll_slot_id  window_start  window_end  padel_venue_id
```

And it holds real data:

```
booking_status booked        57
booking_status claimed        3
booking_status not_booked    357
booking_pledged_by set        9
pledge assigned randomly      3
```

**Nothing reads or writes it.** `booking_status` appears once in the client
(`MatchDetail.tsx:1493`). `booking_claimed_by`, `booking_pledged_by` and
`booking_pledge_assigned_randomly` appear in **no client file and no database
function** — verified by grep across both. The data was written by something
that has since been deleted.

So the concept was designed, implemented, used, and then lost. This brief
rebuilds it rather than inventing it.

### The live consequence

```
future matches with no court booked          11
polls created                                70
matches that came from a poll                 5
```

Eleven games are agreed and have no court. Seventy polls have been run and five
became a match. The app helps a group decide *when* to play and then abandons
them at the hardest step.

---

## §1 The principle: three tiers, and never pretend

A venue sits in exactly one tier, and the interface says which without ever
making the user work it out.

| tier | what we can truthfully do | count today |
|---|---|---|
| **1 — Book here** | Real courts, real times, pay in the app, split with the group | 1 |
| **2 — Book with `<platform>`** | Hand off to their platform carrying as much of the game as it will accept, then ask what happened | 280 named + 4,091 with a URL |
| **3 — No booking link** | Phone, website, directions. The user books however they like and tells us | 1,520 |

**The honesty rule, and it is not negotiable:**

> **Never render a court, a time slot or a price as available unless a venue
> told us.** For tier 2 and 3 the language is "Check times on Playtomic", never
> "3 courts free at 7pm".

One fabricated availability and the trust is gone, and trust is the only thing
we have that Playtomic doesn't. A user who taps through to Playtomic and finds
the slot gone blames us, correctly, forever.

This is also what makes tier 1 worth buying. The Hub's pitch to a venue becomes
concrete: *inside the app your club is the one that can actually be booked.*

---

## §2 The spine

Two entry points, and they are not the same job.

**A. A game needs a court.** The group agreed a time. Someone has to book it.
This is the differentiator and it must be the loudest thing in the app.

**B. I want to play.** No game yet. Browse, pick a time, find somewhere.

Today the app only has B, badly — a venue directory with a booking button.
A is the one nobody else can build.

---

## §3 Path A — a game needs a court

### 3.1 Home: the thing that needs you

Above everything else on Home, when `booking_status <> 'booked'` on any future
match the viewer is in:

```
  ┌────────────────────────────────────────────┐
  │  NEEDS A COURT                             │
  │                                            │
  │  Thursday 7:00pm · 4 players               │
  │  BS3 Padel Players                         │
  │                                            │
  │  No one has booked this yet                │
  │  [ I'll book it ]        [ Whose turn? ]   │
  └────────────────────────────────────────────┘
```

One card per unbooked future game, newest deadline first. `bg-ball` on
**I'll book it** — this is the single most valuable action in the product.

When someone has claimed it, the same card changes rather than disappearing:

```
  Thursday 7:00pm · BS3 Padel Players
  Sarah is booking this        [ Remind Sarah ]
```

And when it is booked, the card leaves Home entirely and the game shows its
venue and court in the normal fixture list.

### 3.2 Whose turn — fairness you can see

`booking_pledge_assigned_randomly` exists in the schema. **Random is the wrong
mechanic and it should not survive this rebuild.** Random has no memory, so the
same person can be picked three times running and the group learns nothing.

**Whose turn = the player in this game who has booked fewest times for this
group in the last 10 games, ties broken by longest since they last booked.**

```
  ┌────────────────────────────────────────────┐
  │  WHOSE TURN                                │
  │                                            │
  │  Christian    4 bookings   last: 2 wks ago │
  │  Sarah        4            last: 1 wk ago  │
  │  Miguel       2            last: 6 wks ago │← suggested
  │  Emma         1            never           │← suggested
  │                                            │
  │  [ Ask Emma ]     [ I'll do it ]           │
  └────────────────────────────────────────────┘
```

Visible, countable, slightly competitive — the Strava mechanic. Nobody is
assigned against their will: asking sends a notification and the person accepts
or declines. A decline returns the game to unclaimed and tells the group.

Keep `booking_pledge_assigned_randomly` as a column, write `false`, and record
in the migration comment that random selection was deliberately dropped.

### 3.3 The claim

`I'll book it` sets `booking_claimed_by`, `booking_claimed_at`,
`booking_status='claimed'`, and notifies every other player: *"Christian is
booking Thursday 7pm."*

A claim is a promise with a deadline, so it expires. If the game is within 24
hours and still `claimed`, the claim is released, the group is told, and the
card returns to unclaimed. A silent claim that never becomes a booking is worse
than no claim, because everyone stopped worrying about it.

### 3.4 Then, and only then, the venue

The claimant lands on venue selection with **the game already in hand** — date,
time window, player count and the group's usual venues. No re-entering
anything. This is where path A joins path B, with the context filled in.

Ranking: tier 1 first, then venues this group has played at before, then by
distance. The group's own history matters more than proximity — a group that
always plays at Filton wants Filton first even if something opened nearer.

### 3.5 Confirming what happened

Tier 1 books in-app and the match updates itself.

Tier 2 and 3 cannot tell us anything, so we ask — once, well, at the right
moment. When the claimant returns to the app after being sent to a platform:

```
  ┌────────────────────────────────────────────┐
  │  Did you get the court?                    │
  │                                            │
  │  Filton Padel · Thursday 7:00pm            │
  │                                            │
  │  [ Yes, booked ]    [ Not yet ]            │
  └────────────────────────────────────────────┘
```

**Yes** opens the existing `self_report_booking` RPC with venue, date and time
pre-filled; the only things to add are court number and cost, both optional.
**Not yet** keeps the claim alive and says nothing to the group.

`self_report_booking(p_match_id, p_venue_id, p_venue_name, p_court_number,
p_booking_reference, p_total_cost_pence)` already exists, already resolves the
venue across both id spaces, and already guards that the caller is a player in
the match. Use it. Do not write a second one.

**Two routes into self-report, not one.** The handoff prompt is for tier-2/3
bookings that went through the app. But most real bookings never touch the app:
a phone call, WhatsApp, a laptop, a mate who already had the court. Every
"Needs a court" card — unclaimed, claimed by someone else, or claimed by you —
carries an **Already booked** button that opens `SelfReportBookingSheet` with
the match pre-filled and the venue empty for the user to pick. It is secondary
to "I'll book it" (which stays bg-ball primary) because the claim-then-book
path is the differentiator, but the self-report path is the one that covers
reality.

**The booking belongs to the MATCH, not the roster.** If the booker leaves the
game, the match stays booked and the debt stays with the players who were in it
when the cost was recorded. `booking_per_player_pence` is calculated once at
booking time from the player count at that moment. A player joining or leaving
afterwards does not recalculate the split — that is a conversation, not a
formula.

---

## §4 Path B — I want to play

### 4.1 When, then where

The current flow is venue-first. Invert it.

```
  ┌────────────────────────────────────────────┐
  │  When do you want to play?                 │
  │                                            │
  │  [ Today ] [ Tomorrow ] [ Thu ] [ Pick ]   │
  │                                            │
  │  Morning   Afternoon   Evening   Any       │
  └────────────────────────────────────────────┘
```

Two taps and we know the intent.

After the date and window are picked, show open matches needing players at
that time: "N games near you need players on Saturday morning." These are
GAMES needing players, not players being free. Joining one ends the §4 flow.
Creating a new game is below it. A match with no venue has no location — it
is shown without a distance label. (N6b, 2026-09-16)

### 4.1.0.1 WHO sources (N6a, 2026-09-16)

Two sources, clearly separated:
- **Your groups** → pick a group, then its members (with "Ask the usual four")
- **Your connections** → the accepted list, same chip pattern, no group needed

A player with no groups can complete the WHO step via connections alone.
"Ask the usual four" is group-only (derived from group match history).

### 4.1.1 WHO — ask, don't assign (added 2026-09-16)

`matches.player_ids` has a CHECK constraint: max 4. A padel match IS 4 people.
The WHO step picks who to **ask**, not who is in the match:

- Asking is **opt-in**. Nobody is selected by default (L6). A 20-member
  group does not fire 19 push notifications on one tap.
- Two quick-select actions above the chips:
  - **Ask everyone** — selects all members
  - **Ask the usual four** — selects the 3 most frequent co-players from
    the last 20 non-cancelled matches in this group (+ the creator = 4).
    Only shown when the group has ≥ 5 matches of history.
- The user selects a group and/or individual players — no cap on how many.
- `handleCreateMatch` inserts `player_ids: [userId]` only (the creator).
  `is_open = true`, `open_audience = 'groups' | 'connections'`, `status = 'open'`.
- Everyone selected gets a row via `send_match_invitations` RPC (existing).
- The match appears on Home as needing players AND a court — §3.1's card,
  reached from the other direction.
- The tile shows "N invited", not "N players" — until people accept, only
  the creator is confirmed.

The WHO step currently shows the selected group's members only. Connections
and open-match players (§4 mentions both) are absent — that is scope to add,
not something that shipped.

### 4.1.2 WHERE — the list IS the action (L1, 2026-09-16)

The venue list is not a preview — tapping a venue creates the match and
enters the booking flow for that venue. There is no separate "Create game &
find a court" button that navigates away from the list (that was L1: the
button duplicated the list and sent the user to Home).

- Tap a tier 1 venue → match created, into BookCourt with venue pre-selected
- Tap a tier 2/3 venue → match created, into BookCourt with handoff
- "I'll sort the court later" → secondary text link, creates match, goes Home

Time window → match_time mapping:
  Morning → 09:00, Afternoon → 14:00, Evening → 19:00, Any → 19:00.
The window boundaries (06:00–12:00, etc.) are for filtering venues by open
hours, not for the game time. L3: "Saturday morning" created a 06:00 game.

Christian is right that this is the order
Playskan gets correct, and it is correct regardless of whether we hold
availability — because it changes what we *show*, not what we *claim*.

### 4.2 The venue list, tiered and honest

```
  ┌────────────────────────────────────────────┐
  │  BOOK IN THE APP                           │
  │                                            │
  │  The Padel Team Bristol        2.6 mi      │
  │  Thu 7:00pm · 3 courts free · £32          │
  │  [ Book — £8 each ]                        │ ← bg-ball
  └────────────────────────────────────────────┘

  BOOK WITH THEIR PLATFORM · 11

  Filton Padel              1.8 mi   Playtomic  ›
  Surge Padel Bristol       3.1 mi   Playtomic  ›
  Rocket Padel Bristol      4.0 mi   Padel Mates ›

  CALL OR VISIT · 2

  Padel Hub Bristol         2.2 mi   No booking link  ›
```

The real times and the real price appear **only** in the first block, because
that is the only block where we have them. The second block promises exactly
what it can deliver: a fast route into the right screen of the right app.

#### Three open states — none hidden (2026-09-16)

Every venue resolves to one of three states for a chosen time:

| State | Shown? | Style | Label example |
|-------|--------|-------|---------------|
| **OPEN** | Yes | Normal card | (no label — open is the default) |
| **UNKNOWN** | Yes | Normal card | "Hours unknown" |
| **CLOSED** | Yes — at the bottom, dimmed | `opacity-60`, `bg-surface` | "Closed at 19:00 · open 09:00–17:00 Thursday" |

Resolution order:
1. `court_availability_settings` (Hub-declared) — authoritative
2. `opening_hours` jsonb — if trustworthy (not seed default, covers that weekday)
3. Otherwise → UNKNOWN

Hiding a real club because our scrape was thin is worse than listing it
honestly. CLOSED is dimmed but visible — the user can see there is a club
nearby that shuts early, and can adjust their time. Tappable into the
venue profile but not into a handoff.

No fake grid. No greyed-out slots implying knowledge we don't have.

### 4.3 The handoff

Tapping a tier-2 venue does three things in one move:

1. Opens the platform's **app** if installed, its site if not — universal link,
   with `openUrl()` (the iOS PWA fix already in `src/lib/openUrl.ts`)
2. Carries date and time in the URL where the platform accepts them
3. Arms the "Did you get the court?" prompt for when they come back

**This must be verified per platform, not assumed.** Playtomic's club URLs
accept a date parameter on web; whether the app deep link does is a question to
answer with a real device, not a guess. Same for Padel Mates. Gate G4 covers it.

If a platform does not accept a date, we send the user to the club page and say
so: *"Opens Playtomic — you'll need to pick the time there."* Honest beats
seamless-looking.

---

## §5 Push — the moment that matters

Christian's line: *"if in the group we have scheduled the games via our group
poll then the games should be ready and a push notification for who is going to
book when the bookings open."*

Three notifications, no more:

| when | to | says |
|---|---|---|
| A game becomes unbooked and unclaimed | all players | "Thursday 7pm needs a court. Anyone?" |
| Someone claims it | the other players | "Sarah is booking Thursday 7pm" |
| **Booking window opens** | **the claimant only** | **"Courts open now for Thursday. You're booking."** |

The third is the one nobody else can send, and it is the one with a data
problem: **we do not know when each venue releases its courts.** For 5,890 of
5,891 venues we have no such field and inventing one would be fabrication.

So:

- **Tier 1**: the venue sets its release window in the Hub. We know exactly.
- **Tier 2 and 3**: a group-level setting, defaulting to 7 days before at 08:00
  local. The group can change it because the group knows their club. Show it
  as what it is — *"We'll remind you 7 days before, 8am. Change"* — never
  presented as the venue's actual release time.

Push goes through the existing gate: `wants_push(user_id, type)` and
`notification_preferences`. Add one preference key, `booking_reminders`. Nothing
bypasses `wants_push` — that was settled in `one_gate_for_push`.

`nav_url` on the notification points at the match, so the claimant lands on the
game with the venue step one tap away.

---

## §6 What we deliberately do not build

Stating these so nobody adds them later thinking they were forgotten:

1. **Scraped availability.** Not from Playtomic, not from anywhere. It breaks,
   it is against their terms, and a wrong "court free" costs more than a missing
   one.
2. **A court grid for tier 2 and 3.** No greyed slots, no "probably free".
3. **Auto-booking on someone's behalf.** We never put a card into another
   platform.
4. **Random assignment.** Replaced by whose-turn. See §3.2.
5. **A second self-report path.** `self_report_booking` exists and is correct.
6. **Slot waitlist (dormant).** `slot_waitlist` table, `Waitlist.tsx` page
   (`/play/waitlist`), and the DB RPCs are in place. The BookCourt join path
   and PlaySheet badge were removed (2026-09-16) because the availability API
   omits full slots rather than marking them, so the "Full · tap to get
   notified" branch was unreachable dead code. Measured: The Padel Team
   Bristol's busiest slot ever was 2 of 7 courts. A waitlist that triggers at
   7/7 will not fire. Reactivate when a venue actually sells out — the page
   and table are ready, but the BookCourt UI needs full-slot data from the
   API before the join path can render.
7. **Group waitlist.** `group_waitlist` table exists (types only). Zero UI,
   zero queries, zero implementation. Left as-is.

---

## §7 Blast radius

| area | change | note |
|---|---|---|
| `matches` | write `booking_claimed_by/at`, `booking_pledged_by/at`, `booking_status` | columns exist; nothing writes them today |
| `MatchDetail.tsx:1493` | the one existing `booking_status` read | must stay consistent with the new states |
| `BookCourt.tsx:1082` | writes `booking_status='booked'` | tier-1 path, keep |
| `SelfReportBookingSheet.tsx:84` | calls `self_report_booking` | reused, pre-filled |
| `CourtsHome.tsx` | venue picker, `radiusMiles ?? 60`, own search | becomes §4.2's list; it is imported by `BookCourt.tsx:1367` so both paths change together |
| `padel_venues` | needs `booking_release_days`/`booking_release_time`, tier 1 only | new, nullable, Hub-editable |
| `notification_preferences` | `booking_reminders` | new key |
| Hub | venue sets its release window | tier 1 only |

`CourtsHome` was deliberately left alone in the Discover round because it serves
`BookCourt`. This brief is where it changes, and both consumers must be checked
together.

---

## §8 Gates

Every one from the running app, raw output.

**G1 — Home surfaces the real number.** 11 future matches have no court today.
Home must show exactly that many cards for an account in those games. Not 10,
not 12.

**G2 — Claim, and the group is told.** Claim a game on one account; show the
notification arriving on a second. Then show `booking_claimed_by` set in the
database. Both halves.

**G3 — Whose turn is not random.** For a group with booking history, show the
counts the UI displays alongside the query that produced them. Run it twice —
same input, same answer. A random mechanic would not survive this gate, which
is why it is here.

**G4 — The handoff, on a real phone.** With the Playtomic app installed, tap a
tier-2 venue. Report: did it open the app or the browser, and did the date
carry? Answer for Playtomic and Padel Mates separately. If the date does not
carry, say so — the copy changes, and that is fine.

**G5 — No invented availability.** Grep the venue list rendering for any slot,
price or court-count that is not sourced from a tier-1 venue's own data. Paste
the grep. This gate is the honesty rule, mechanised.

**G6 — Claim expiry.** A claim inside 24 hours of the game is released and the
group is told. Show the before and after rows.

**G7 — Push respects the gate.** Show that the booking-window notification
passes through `wants_push` and is suppressed for a user who has turned
`booking_reminders` off.

**G8 — Tier 1 is unaffected.** The Padel Team Bristol still books, pays and
splits exactly as it does today. This brief must not regress the one venue that
already works.
