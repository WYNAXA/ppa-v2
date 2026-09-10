# Design system

The tokens live in `src/index.css` (`@theme`) and are mirrored in
`tailwind.config.js`. This file records *why*, so the next person doesn't
reinvent it or quietly drift back.

Canvas of the proposed screens: **Padel Players Redesign** (Artifacts gallery).

---

## Colour

| token | hex | use |
|---|---|---|
| `court` | `#0F5D54` | primary. Large fills, hero cards, primary buttons, active nav. |
| `court-50` / `court-100` | `#EAF5F3` / `#CDE7E2` | tints. Icon wells, positive delta pills, selected slots. |
| `court-700` | `#0A473F` | pressed state for `court`. |
| `line` | `#12A594` | brighter teal. Accents **on dark only** — sparklines, dots, win chips. Fails contrast on white. |
| `ball` | `#E4FF57` | optic yellow. Live / urgent / primary action **on dark**. Never a surface, never body text. |
| `ink` | `#0B1512` | text, and the dark surface. |
| `ink-2` `ink-3` `ink-4` | `#46534F` `#7C8B86` `#B6C0BB` | secondary text, tertiary text, disabled. |
| `surface` | `#FBFAF7` | app background. Warm off-white, deliberately not `#fff`. |
| `card` | `#FFFFFF` | cards sitting on `surface`. |
| `hairline` | `#E4E7E4` | 1px borders. |
| `alert` / `alert-50` | `#D9480F` / `#FDF0E9` | genuine problems only — conflicts, negative ELO, failures. Not for emphasis. |
| `warn` | `#A85F00` | needs attention, **not** failure. Spots open, ringers wanted, awaiting a result, provisional rating. 4.9:1 as text on white *and* as white text on it, so one value covers both roles. |
| `warn-50` / `warn-100` | `#FDF3E6` / `#F2DEBE` | the `warn` surface and its border. |

### Why we moved off the old palette

`#009688` is **Material Design Teal 500**, unmodified from Google's 2014
palette; `#E65100` is **Material Deep Orange 900**. Teal + orange is also the
most common "sporty app" pairing there is. The result reads as a framework
default rather than a brand.

`court` + `ball` is the replacement. The yellow is the padel ball, which makes
the pairing *ours* rather than a swatch pick, and it gives a genuine energy
accent that orange never did because orange was competing with teal rather than
punctuating it.

**Discipline that keeps it working:** `ball` is punctuation. One per screen,
maybe two. The moment it becomes a background it stops meaning "act on this".

### Dark

`ink-surface` `#0B1512` and `ink-card` `#141F1B` are defined and ready. The
dark variant is **still not wired up**, and deliberately so: it was pencilled in
alongside the nav work and pulled back out. Half a dark mode — dark chrome over
light screens — looks broken in a way that no light-only app does, and doing it
properly means a pass over every screen, not a `dark:` variant on the nav. Padel
is played at night; this is not optional long-term, it is simply its own job.

### Contrast floor

`ink-3` `#7C8B86` is **3.6:1 on white** — under the 4.5:1 WCAG AA floor. It is
for large text, icons and rules only. Any label at 13px or below uses `ink-2`
`#46534F` (8:1). The nav labels and the Play sheet were both written against
`ink-3` first and moved; check this before reaching for the lighter grey.

---

## Type

`Archivo` for the app (`font-app`). `Montserrat` stays for the marketing pages
only (`font-display`). Both load in a single Google Fonts request.

| token | px | line | weight |
|---|---|---|---|
| `display` | 32 | 34 | 800, −0.02em |
| `title` | 24 | 26 | 800 |
| `heading` | 19 | 23 | 700 |
| `body` | 15 | 20 | 400 |
| `label` | 13 | 18 | 400 |
| `caption` | 11 | 14 | 700, +0.06em, uppercase |

**Six steps, and 11px is the floor.** The current screens use roughly eight
ad-hoc pixel values (`text-[10px]` through `text-[22px]`), and `BottomNav`
labels are 10px — under the iOS HIG minimum and the most common accessibility
failure in the app today. If a new size feels necessary, it usually means the
hierarchy is wrong.

Apply `.num` to any number that changes in place — ELO, scores, times, counts,
league points — so digits keep their column instead of jittering.

---

## Radii

`control` 10 · `card` 12 · `panel` 18 · `pill` 999. Anything else is a one-off
and should be justified in review.

## Hit targets

44px minimum, always. The centre nav action is 62px.

---

## Migration

The legacy tokens (`teal`, `orange`, `navy`, `cream`, `sidebar`, `deep-teal`,
`mid-teal`) are **still live and still correct** for every screen that hasn't
moved. They are deleted only when the last consumer is migrated — removing them
early drops styling silently rather than erroring.

Order: tokens → nav & routing → Today → match ELO preview → Courts → Club / Me.

### Where it actually got to (2026-09-09)

**Done**

- Tokens, and the brand colour tokenised across 529 sites.
- **Type floor.** 211 sites at 8/9/10px raised to 11px
  (`scripts/codemod/raise-type-floor.mjs`). Size only — `caption` also carries
  weight 700 and +0.06em tracking, so mapping 211 mixed sites onto it would
  have re-weighted half the app under cover of an accessibility fix.
- **Nav & routing.** Five tabs became **Today · Players · [action] · Courts ·
  Me**. The centre control opens a sheet rather than a page; it is not a tab.
  `Courts` takes the freed slot because the booking engine is the part that
  earns. **No route was removed** — `/compete` and `/play` are still live and
  still deep-linkable, they simply no longer own a tab; `/compete` and
  `/leagues` light the `me` tab.
- **Match ELO preview** extracted from `MatchDetail.tsx` into
  `components/match/PointsAtStake.tsx` and rebuilt. A conditional-hook bug came
  out with it: `useMemo` sat *after* the early return on friendly matches, so a
  match flipping friendly → competitive while mounted would crash React.
- **Today** — ground, header and card surfaces.
- Page ground moved to `surface` on Today, Play, Players, Compete, Me and
  Courts, so cards read as cards.

- **Material greys retired.** 2,485 `text-gray-*` / `border-gray-*` sites moved
  to `ink-*` / `hairline` (`scripts/codemod/greys-to-ink.mjs`). This is also the
  biggest accessibility fix in the set: `text-gray-400` is **2.8:1 on white** and
  was the most-used text colour in the app at 588 sites.
- **Material teal retired.** 822 `*-teal-*` sites moved to `court`
  (`scripts/codemod/teal-to-court.mjs`). Tokenising the literal `#009688`
  earlier could not reach these — they got the old brand colour through
  Tailwind's scale instead of the hex, which is why the palette flip was only
  visible on one card.
- **`warn` added, and 418 orange/amber/yellow sites moved onto it**
  (`scripts/codemod/warm-to-warn.mjs`). The palette had `alert` for failures and
  nothing for "needs attention", so 429 attention states were using the *old
  brand accent*. Mapping them to `alert` would have cried wolf.
- **Today** — dark `ink-surface` hero with the court drawn into it, ball-yellow
  countdown, ELO promoted to a 32px tabular figure.
- **You** — the profile hero was a royal-blue gradient with no relationship to
  anything else in the app; it is now court, with the rating as the one
  ball-yellow element.

### Built to the artboards (2026-09-09, second pass)

The first pass repainted the existing screens. It was not the redesign. These
are now built **against the `.dc.html` artboards**, element by element:

- **Today** (`Main.dc.html`) — weekday as the headline, **Needs you** triage
  stack (result awaiting your confirmation · a group match short of players · an
  unanswered availability poll, each with its action inline), court-green next
  match card with the ball countdown pill, **Your week** five-day strip. The
  ranking, poll, win-rate and streak tiles were **removed** from Today: they are
  Me's job, and Today is a screen you answer, not a dashboard you read.
- **Play sheet** (`Play.dc.html`) — "Get a game / Four ways in. Start at the
  top." Find my game gets the court card and the ball accent because it is the
  one that does the work; the other three are rows in descending order of
  effort. A six-tile grid made all six look equally good, which is precisely the
  decision the player needs help with.
- **Bottom nav** (`Main.dc.html`) — 64px bar, 20px radius, **ink** centre action
  62px and 14px proud, the artboard's own icon paths, labels
  **Today · Club · Courts · Me**. The centre mark is the crossed-racket pair as
  signed off.

One deliberate departure: the board specifies `ink-3` for inactive nav labels.
At 11px that is 3.6:1, under AA, so inactive labels use `ink-2`.

- **Match** (`Match.dc.html`) — `components/match/MatchStakes.tsx`. Win split on
  court with the ball bar, then every player's swing both ways as +/− chips, then
  a live "swap these two and it's 58% / 42%" bar computed from the next pairing.
  Replaces the old TeamRow + PointsAtStakeSection pair, which also carried a
  conditional-hook bug (`useMemo` after an early return on friendly matches).
- **Me** (`Me.dc.html`) — `components/shared/EloHero.tsx`. Rating at 44px on
  `ink`, sparkline from `rating_history` in `line` with a `ball` head, the
  K-factor tier spelled out ("Regular · K10" is the honest answer to "why did I
  only gain 4"), last five results as chips, then three stat cards and the badge
  row. The old royal-blue gradient hero and its identity tiles are gone.
- **Club** (`Club.dc.html`) — `components/community/ClubThisWeek.tsx`. Needs
  players → Ringers on call, closest ELO first → league snapshot (top two plus
  you). The ringer sub-line is the *distance* from the fixture's average, not the
  raw rating, because the organiser is trying to keep the game even.
- **Courts** (`Courts.dc.html`) — `components/play/CourtsHome.tsx`. Partner
  venues first and alone under the ball `PPA VENUE` chip, with slots and the
  per-player split; the directory below as an acquisition loop. It renders as the
  landing state of the booking flow; typing hands over to the existing search.

**Not built, deliberately:** the board's "Saturday 10:00 is gone / Join waitlist"
card. Rendering it needs a specific slot the player wanted and was denied, and
nothing in the data models that intent yet. Faking it from a waitlist row would
invert its meaning. The waitlist entry point lives in the Play sheet until the
booking flow records a missed slot.

**Not done, and not pretended otherwise**

- Courts, Players and Me have the new ground but their *contents* are
  unmigrated — they are still the old layouts on a new background.
- Dark mode (see above).
- The semantic type migration. The floor is raised; screens still use ad-hoc
  `text-[Npx]` rather than `display`/`title`/`heading`/`body`/`label`/`caption`.
  1,494 of those sites affect layout, so it goes screen by screen, not by
  codemod.

### Tab labels

The canvas called the tabs **Players** and **Me**. The pages they open are
titled **Community** and **You**, in eight languages. A tab bar that names a
screen differently from the screen makes the app feel like two products stitched
together, so the pages won: **Today · Community · [action] · Courts · You**.
Rename the pages first if the shorter labels are wanted.

### The centre mark

The crossed-racket mark signed off on the design canvas was judged at ~150px.
At its real size — 32px inside a 62px button — the two heads fuse into a rounded
outline that reads as a heart, which in an app means "favourite". A single-racket
alternative was built and rejected; the crossed pair is what shipped, on the
sign-off. It is in `BottomNav.tsx` as `PlayMark`. If it is ever revisited, the
answer is redrawing the crossed pair for 32px — opening the angle between the
heads so they do not close at the top — not rescaling either version.

### The last off-palette families

`scripts/codemod/semantic-colours.mjs` — 503 replacements across 56 files.

UAT reported it as one card: *"when you click on other venues that do have
playtomic it goes blue."* That blue panel was one of 95 blue sites, behind 225
reds, 126 greens, 41 purples and 5 slates. Restyling the reported card would
have left the class untouched.

The mapping is semantic, not chromatic:

| family | → | because |
| --- | --- | --- |
| `red` | `alert` | something is wrong: destructive, failed, negative delta |
| `green` `emerald` `lime` | `court` | something is good: won, confirmed, positive delta |
| `purple` `violet` `fuchsia` | `court` | decorative badge tints; the brand already owns "special" |
| `slate` `zinc` `neutral` `stone` | `surface` / `hairline` / `ink-2` | a neutral pretending to be a hue |
| `blue` `sky` `indigo` `cyan` | *split* | see below |

Blue was carrying *"here is some information"* — external booking platforms,
household links, format explainers. The palette has no info colour, and adding a
fifth hue for a state that needs none is how a palette dies: an informational
note is a plain card. So blue tints became `surface`, blue borders `hairline`,
blue text `ink-2` — and blue *buttons*, which are actions rather than
information, became `court`.

Marketing (`src/components/marketing/`, `src/pages/Landing.tsx`) is excluded and
still runs teal/orange. It is its own system. After this pass **zero** default
Tailwind palette classes remain anywhere else in `src/`, verified against the
built CSS as well as the source.

Two emoji still stand in for icons — `RewardsCard` (🎾 stamps, 🥤 reward) and
`GetTheAppCard` (📲). Emoji render in the platform's palette, not ours, so they
are off-brand by construction; they are on screens UAT has not reached, and are
noted here rather than changed blind.

### The venue panel you could not leave

UAT: *"there is a button to open in playtomic but if i dont want this and view
another venue i cant."*

Root cause was not the colour. Choosing a venue PPA does not book set
`nonPpaVenue`, and the search results, the empty state and the near-you list were
each guarded with `&& !nonPpaVenue` — so the whole list unmounted and was
replaced by the panel. The only way back was a 12px grey text link below the
buttons, with a `hover:` that resolved to its own colour.

Fix class: root-cause. The panel now expands *inside* the venue row it belongs
to (`ExternalVenuePanel` in `BookCourt.tsx`), the list never moves, the chevron
rotates, and tapping the open row closes it — so two venues can be compared.
Making the escape link a visible button would have been the workaround: it leaves
the list destroyed.

On embedding the platform in an iframe, also asked in UAT: Playtomic and
PadelMates both send `X-Frame-Options`/`frame-ancestors`, so the browser refuses
to render them in our frame — and taking a card payment inside a third party's
iframe is not something we should build. `openVenueLink` is the honest
equivalent: it opens their native app if installed, and falls back to the web.

### Open Matches on Community

It sat on `warn-50` behind a 🎾. `warn` means *this needs your attention*; an
open match is an invitation. And the emoji rendered blue on Android, green on
iOS. Open Matches and My Connections are the same kind of thing — two doors to
finding people to play with — so they are now a matched pair on `court-50`, told
apart by their words and glyphs rather than by hue.

### Play with someone

UAT: *"when i click on my connections and then a player it gives me no upcoming
matches with open slots. this is fine but can we have the option to create a
match with this person?"*

Root cause was not a missing button in the empty state. `InviteToMatchSheet`
only knew how to *add someone to a match that already exists*, so the action it
named was impossible for any player without a half-empty fixture in their diary,
and "no upcoming matches with open slots" was a dead end rather than an answer.

Starting a new match is not a fallback for that case — it is the other half of
what "play with this person" means. So the sheet is now **Play with <name>** and
offers both routes, with the new match first, **whether or not** there is
anything to add them to: a player with three open fixtures may still want a
fourth with only this person in it. Showing the create button only when the list
came back empty would have been the patch.

`CreateMatchSheet` gained `defaultPlayers`, which seats the creator first, then
the seeded players, de-duplicated and capped at four — so no caller can seat an
invalid court.

### Colours the codemod could not see

`semantic-colours.mjs` matches Tailwind class names. It cannot see a colour
written as a hex literal in an inline style, and the claim that zero off-palette
colour remained was therefore too strong. A second audit of hex literals found
34 sites, of which these mattered:

- **`#1565C0` on `#f0f4ff`** — the Friendly match type. The app's only blue, on
  the first screen of its most-used flow. The three match types now separate by
  weight rather than hue: Competitive keeps `warn` (something is at stake),
  Friendly is `court` (the ordinary brand case), Casual recedes to `ink-2` (no
  consequence at all). Three steps of emphasis on one palette read more clearly
  than three unrelated hues, and they say something true about the choice.
- **`#00796B` in 8 places** — the *old* brand teal, used as the hover/active
  step under `bg-court`. That step is `court-700`.
- `#2563eb` (the "you are here" map dot), `#004d44` (the Compete hero gradient),
  `#D97706` and `#9CA3AF` (ELO chart chrome), `#1f2937`/`#e5e7eb` (toast chrome
  and step dots) — all tokenised.
- `RARITY_COLORS` carried a purple and a pink and was **exported but never
  imported**. Deleted rather than recoloured.

Two hex ramps are deliberate and stay: `PlayerAvatar`'s eight identity colours
(they must differ per person, and all eight clear 4.5:1), and the two artboard
values `#05302B` (`EloHero`) and `#D7DDD9` (the Play sheet grabber).

### One scrim

The app dimmed the page behind a sheet with `bg-black/40` in 43 places, plus
`/45`, `/50` and `/60` — so a sheet opened from another sheet dimmed by a
different amount depending on which door you came through, and none of the four
matched the artboard. There is now a `--color-scrim` token — `ink` at 84%, the
Play artboard's value, warmer than pure black and dark enough that the sheet
reads as the only live surface — used as `bg-scrim` in all 48 places.

### Ask them

UAT: *"the same happens when you click on Ask them - what does this do and would
it show a qr code or a pop up with a ready made message to forward to the
venue."*

The honest answer to "what does this do" was: nothing the venue's name didn't
already do. `Ask them` called the same `navigate('/venues/:id')` as the row
beside it. The defect was a control whose label described an action it never
performed, so pointing it at a different page would have been the patch.

It now opens `AskVenueSheet` with the message in full — who is asking, what the
app is, and a link to the ForVenues page — and hands it to the player's own
share sheet, with WhatsApp, email and copy beside it. The message is shown
*before* anything is sent: a player is about to put their own name on a message
to their own club, and a share sheet that fires with unseen text is how you get
someone to never press it twice. Nothing is ever sent on their behalf — that is
their relationship with their club, and a message arriving from the app rather
than from them is spam.

**On the QR code**, also asked: a QR only works while you are standing at the
desk with your phone out, and a player who has just noticed their local club is
missing is usually at home. A forwardable message reaches the club either way,
and if they *are* at the desk they can hold up the phone and let the manager
read it. QR is a venue-desk optimisation worth revisiting if the message route
turns out not to convert; it is not the primary answer.

### Ask them — the QR, and not asking a club that is already with us

Both from review of the sheet above.

**The QR is a second mode, not a second sheet.** Away from the club you forward
a message; standing at the desk you hold up a code and let them scan it. Same
ask, two deliveries, so it is a tab inside `AskVenueSheet` rather than another
entry point. Message stays the default — the player who has just noticed their
club is missing is usually not at the club — and the QR view carries a link back
to it. The code is drawn on white with a wide quiet zone whatever the theme: a
scanner needs the contrast, and `surface` is warm enough to cost reads on a dim
phone at a desk.

**A claimed venue is no longer asked.** Five venues were being shown "Ask them"
while already on Padel Players — Preggio Padel, Roshni's Padel Venue and Bristol
Padel Test have active managers; Bandeja Padel Club and Filton Padel are
onboarded with a plan tier. Every one of them was inviting its own manager to
join a platform they are already on.

Root cause: the list knew one fact, `ppa_bookable`, and used it to answer two
questions. `ppa_bookable` means *you can book here in the app today*. It does not
mean *this venue is with us* — a venue is claimed and onboarded well before its
booking goes live, and all five are exactly that. Fix class: root-cause;
special-casing the five names would have been the patch.

The signal is the presence of a row in `venues`, the Hub side of a venue, which
only exists once one has been onboarded. Deliberately **not** `venue_users`: its
RLS lets a player read only their own rows, so querying it from the app returns
empty for everyone and every venue would silently look unclaimed — the same
class of bug as the league snapshot reading a column that does not exist.
`venues` is `Public can read venues`. A `venues_id` pointing at nothing counts as
unclaimed, so the test is the row coming back, not the column being non-null.

Those venues now show an **On PPA** chip and read "on Padel Players — booking
coming soon" instead of their booking platform. Two new keys in all eight
locales.

### Ringers on call

UAT: *"ringer on call is nice but for me it shows 4 names - i dont think they
are ringers for my groups. and if so, why only 4 and what do i do with the
names."*

All three observations were right, and they were one bug.

`useClubWeek` built its own ringer list from `group_members.status = 'approved'`
— which is the *ordinary member* status. A ringer is a specific thing in this
app, `status = 'ringer'`, and the query excluded them by construction. In BS3
Padel Players that meant showing 4 of the 22 regular members while the group's 3
actual ringers stayed invisible. "Only 4" was an arbitrary `.slice(0, 4)`. And
the names did nothing, because there was no request to send from here.

The deeper fault: a complete ringer system already existed — `AskRingersSheet`,
the `ringer_requests` table, the `send_ringer_requests` RPC, per-ringer request
status, and a cross-group pool for players in more than one club. This component
re-implemented a worse version of it beside the real one.

Fix class: root-cause. Swapping `'approved'` for `'ringer'` would have been the
patch — it fixes the names and leaves the duplicate query, the arbitrary cap and
the dead-end list in place. "Ask ringers" now opens the sheet that already does
this properly, which also answers "what do i do with the names": you pick them
and it sends a request that expires 24 hours before the match. The duplicate
query, the `Ringer` type, the `onAskRingers` prop and two orphaned locale keys
in eight languages went with it.

Group ringer counts at the time of the fix, for whoever reads this next: BS3
Padel Players 3, PPAT 1, the other six groups none. A group with no ringers gets
the sheet's own empty state, which offers the network instead.

### Deleting a league used to delete the games

Found while producing the impact report for the test-data cleanup, before
anything was deleted.

`matches.league_id` was `ON DELETE CASCADE`, and `LeagueDetail` has a
**Delete league** button in its Danger Zone whose RLS policy is
`created_by = auth.uid()`. So whoever set a league up could, in two taps, delete
every match played in it. The cascade did not stop at matches — it reached
`match_results`, and from there `ranking_changes`, `match_result_votes`,
`chat_channels`, `match_comments`, `match_peer_votes`, `post_match_votes`,
`match_travel` and `ringer_requests`.

Worse, it left a mess behind. `rating_history.match_result_id` is
`ON DELETE SET NULL`, not cascade, so the rating rows survived as orphans: every
affected player would keep their ELO and keep a Rating History chart full of
movements with no match behind any of them.

Measured on the league then called *Summer Padel League Test*: one click would
have taken **27 matches, 25 results and 88 rating-history rows belonging to 19
real players**, across five weeks of play. None of them was a test account; all
19 had played elsewhere. The name was the only thing about it that was a test.

`20260910000001_league_delete_keeps_matches.sql` changes the rule to
`SET NULL`. A league is an organising layer over matches, not their owner — the
match happened, four people were there, it moved their ratings, and removing the
table it was scored in does not un-play it. Every other league-scoped child
(standings, members, invitations, teams, adjustments, jersey history) has no
meaning without the league and correctly stays `CASCADE`.

The confirmation copy said *"All fixtures and standings will be lost"* — true
about the schedule, silent about the played matches. It now says standings go
and played matches stay, in all eight languages, which is both accurate and much
less frightening.

**Still open:** fixtures a league generated but nobody played now survive as
unattached scheduled matches. That is the right default — a destructive default
is never the safe one — but the deletion flow should offer to clear unplayed
fixtures at the same time. App work, not schema work.

### Put it out there

UAT: *"if one player is open to a match, they could put it out there and other
connections might see it."* Layer A of the availability design note.

**A broadcast is an open match**, not a new kind of object: a time window, one
player, no court. `matches` already carried `window_start`, `window_end`,
`duration_minutes`, `court_requirement`, `is_open` and the ELO band, so this
needed no new table — and it inherits the join flow, the Open Matches page and
the ELO filter. A parallel "availability broadcast" system beside the
open-match system would have been two things to keep in step forever.

**A window, not a time.** Nobody is free at exactly 19:30; they are free after
work until bedtime. A precise time forces a guess the first replier then has to
negotiate away. The match settles inside the window once a second player is in.

**The calendar is deliberately not here.** A gap says when you *could* play,
never when you *want* to. Broadcast from gaps and the first false positive
teaches people to ignore the feature. There is also no device to read: the iOS
app is a WKWebView shell that bridges OneSignal, with no Capacitor, so EventKit
and the Android provider are both out of reach. The honest job for a calendar is
the opposite one — "careful, you have something then" — which
`check_self_conflict` already does for matches.

#### Three things had to be true before this could ship

1. **The audience had to be enforceable.** `matches_open_select` read
   `(is_open = true) OR (auth.uid() IS NOT NULL)`, and Postgres ORs permissive
   policies, so every signed-in account could read every match and no "audience"
   would have meant anything. Dropping it was audited, not assumed: of the 35
   places the app reads `matches`, 34 already filter by player, group or league;
   every league match carries a group and every league member is in it; the one
   global read is the text search, which today lets any account search every
   private match by venue name. Narrowing that is the fix.
2. **An open match had to say who it is open *to*.** `open_audience` —
   `connections` · `groups` · `open`, defaulting to `open` so all 410 existing
   matches kept exactly the visibility they had. Enforced in RLS through
   `are_connected()`, which is SECURITY DEFINER because `player_connections` is
   row-scoped to its own participants and a policy has to ask about a pair that
   does not include the reader.
3. **An unanswered offer must not look like a fixture.** It is created with
   `status = 'open'` and `claim_open_match` promotes it to `scheduled` the
   moment a second player joins — a no-op for Push-to-open matches, which
   already have three players when they open. Today, Your week and Club exclude
   `open`, so a broadcast nobody has answered never appears as "your next
   match".

`claim_open_match` also had a latent bug this exposed: it compared the joiner's
ELO to `open_elo_min`/`max` without a NULL check. A broadcast has no band, and
`NULL < NULL` is NULL rather than false, so it happened to pass — by accident,
not design. Now explicit.

**"Find my game" is gone**, in eight languages. It promised the app "checks
every player's diary — and your household's — then builds the match", and the
button opened a list of group polls. There is no solver: `poll_match_options` is
an unused table and fixtures are arranged by hand in the poll admin view. The
card now says what it does.

**Not done, and not pretended otherwise:** nothing notifies a connection that a
broadcast exists — they see it in Open Matches and on the Play sheet count, but
no push. That is the next thing to build if the feature gets used, and the thing
to measure is what share of broadcasts get a reply.

### Community, reordered

Two UAT notes that turned out to be the same problem: *"Padel courts near you
should likely be more prominent too. as its a great little feature"* and *"if we
have my connections, do we need this below too?"*

The page had a directory grid at the top — Groups, Players, Coaches, Venues,
Events — and then, below it, long list sections for **the same five things**.
The grid was the navigation and the sections were a second copy of it in a
different shape. Nearby Venues sat dead last, at position seven, under five of
those duplicates.

Fix class: root-cause. Moving one section up would have been the patch and would
have left the page still saying everything twice.

- **Padel Courts Near You is now third**, directly under the directory and the
  two link rows. It is the only section on the page carrying *live local
  content* rather than a route you can already reach from a tile, which is
  exactly why it earns the position.
- **The Connections section is gone.** Its four-avatar preview and "show all"
  were the same navigation as the My Connections row eight lines above it, to
  the same destination. The one part that was not a duplicate — somebody waiting
  on a yes or no — is now a conditional strip near the top that disappears when
  there is nothing to answer, instead of a permanent heading with an empty state
  under it.
- The per-connection **Match** and **Group** buttons went with that block. They
  are not lost: `/community/connections` carries both on every connection, and
  the sheets, their state and their imports were removed from Community rather
  than re-added, so there is one copy of that action instead of two.

**Still duplicated, and worth a decision later:** Find Groups, Find Players,
Upcoming Events and Find a Coach are all still list sections for tiles that
already exist in the grid above them. The same argument applies to each; it was
left alone here because reordering is cheap and deleting four sections is a
product call, not a cleanup.

### "It did not save" — it did

UAT: *"it may have asked Phil to confirm who was on Kierans team (kieran entered
the results) and when it did it did not save. he does not need to confirm - just
see it was entered."*

Chased this as a save failure in the core loop. It is not one. The 9 September
match, checked end to end in production:

- Kieran submitted at 20:35:33 and his own confirm was recorded in the same second.
- **Only the opposing pair were notified.** Kier Cox and Adrian Newton got
  "Confirm match result". Phil, on Kieran's team, was never asked — which is
  exactly the behaviour the note asks for.
- Adrian confirmed at 22:08. The result verified, ELO updated, all four were told.

RLS on `match_result_votes` would have allowed Phil's vote had he cast one
(`with_check` is only `auth.uid() = voter_id`), so nothing was refused. There is
no missing row and no failed write.

**What Phil actually saw** is the finding. A teammate of the submitter opens the
match and gets the card that reads *"You submitted this result / Awaiting
verification from opposing team"*. Phil did not submit it. The copy was shown to
everyone on the submitting *team*, so one of the four players was told he had
done something he had not — and that is a very reasonable thing to report as
"it did not save".

Fix class: root-cause, but the cause was in the words rather than the code. The
card now names the submitter when the viewer is not them, using the
`submitterName` already computed six lines above it. Nothing about the flow
changed, because nothing about the flow was wrong.

Worth keeping in mind for the next report of this shape: three surfaces already
gate this correctly — `MatchDetail` splits on `isOnSubmittingTeam`,
`WeekMatchView` uses `isOnOpposingTeam && !hasVoted`, and Today's Needs You
skips anything the viewer's own side submitted. The logic was never the problem.

### Every tile navigates

I proposed deleting "four duplicate sections" from Community and was wrong about
what they were. Checking first: **the tiles did not all navigate.** Groups,
Players and Events called `scrollIntoView` on a section further down the page;
only Coaches and Venues went anywhere. So three of those sections *were* their
tiles' destinations, and deleting them would have broken three of five tiles.

The real defect was smaller and worse: **five tiles, two behaviours, nothing to
tell them apart.** Tapping Coaches left the page; tapping Groups jumped you down
it.

Now all five navigate. `/community/groups` and `/community/players` already
existed and were strict supersets of their inline sections — the same three
filters plus sorting the inline copies never had. Events had no page, which is
why it was the tile blocking a consistent rule, so it got one.

**`AllEventsPage` is not the old section without its limit.** The Community
section queried `events` — group and official events — only. At the time of
writing there were **zero** upcoming rows in that table and **eleven** upcoming
`venue_event_occurrences`. The section was empty while the app held real events
it never showed here; venue events had a detail route and a discovery helper
(`discoverVenueEvents`) and no way in from Community. The page lists both in one
time-ordered stream, because a player looking for something to enter does not
care which of our two tables it came from.

**What came out with the four sections**, all of it unreferenced afterwards and
all of it a second copy of something on the destination pages: `DiscoverCard`,
`UpcomingEventsSection`, `CoachesSection`, `GroupPreviewSheet`,
`useDiscoverGroups`, `useFindPlayers`, `joinMutation`, `ringerOfferMutation`,
`connectMutation`, `acceptInlineMutation`, `getConnectState`, five pieces of
filter state, a `setState`-in-effect, and the whole `refs` prop on
`DirectoryGrid`. **Community.tsx: 1,557 → 800 lines.** Lint went *below*
baseline — 303 → 301 — because the dead effect took two errors with it.

The one thing that needed care: the group preview sheet was only reachable from
the removed Find Groups cards, so `previewGroup` could never be set and both its
mutations were unreachable. `AllGroupsPage` carries its own preview, join and
ringer-offer. Checked before deleting, not after.

### Surfaces stopped being a literal colour

Dark mode was written up above as "a pass over every screen". After the token
codemods it is not. The app is already **1,958 `text-ink`, 647
`border-hairline`, 541 `bg-court`, 216 `bg-surface`** — all of which flip by
redefining a token.

`bg-white` did not. A literal, **284 sites against 29 `bg-card`**, and the single
thing standing between this app and a dark mode that is a token swap rather than
a rewrite. `scripts/codemod/white-to-card.mjs` converts 281 of them.

**This changed nothing visually.** `--color-card` is `#FFFFFF`, so `bg-card` and
`bg-white` render identically today. Proved rather than asserted: four screens
captured before and after and pixel-diffed. Two showed differences until two
runs of the *same* build showed the same differences in the same bands — the
`animate-pulse` skeleton loaders. Masked those and every screen is pixel-identical.

**What is deliberately still white:**

- **`bg-white/<opacity>`, 16 sites.** Translucent white over a dark ground — the
  Compete hero, the Play sheet's tick row, Home's week strip. Correct as
  literals, and they must not follow the surface into the dark.
- **The Play sheet's primary button.** It sits on the `court` panel, so it takes
  a new token, **`on-brand`**, which stays white in both themes. "White on the
  brand colour" is a different idea from "the colour of a card"; conflating them
  is exactly what would put dark text on a dark panel the day dark mode is
  switched on.
- **The toggle knob and the QR code ground** — white because of what they sit on
  and what has to scan them, not because they are surfaces.

**A note on the detection, because it nearly shipped wrong.** Finding which
elements sit inside a `bg-court` ground means walking JSX indentation, and the
first version treated a blank line as zero indentation — which closed every open
element. Anything below a blank line inside its parent looked top-level, and the
check reported two on-brand sites instead of three, missing the one case already
known by hand. It was caught only because that case was known. An indentation
walker needs proving against something you already know the answer to.

**What is left for dark mode itself:** wiring the variant and choosing the dark
values for `court`, `line` and `warn`, which need re-picking rather than
inverting — `court` at `#0F5D54` is nearly black on a dark ground. That is the
job; it is no longer a rewrite.

### Disputed results were a dead end for everyone

UAT: *"when i see disputed i cant do anything - but this is months old."* True,
and it went further than that.

The app has a working dispute flow — `pending` → `submitter_review` →
`opponent_review` → `admin_review` — and each of those states has actions. The
two states at the *end* had none:

- **`disputed`** rendered a grey box whose copy read, literally, *"Legacy
  dispute — pending cleanup"*. No action for anyone, including the group admin.
- **`admin_review`** said *"an admin will resolve this"*. **No code anywhere
  could.** There is no admin resolution UI and never was.

Four results have been sitting in those states since March–May. ELO is applied by
the `dispatch_match_result_to_elo` trigger, which fires only on the transition to
`verification_status = 'verified'` — so **not one of them ever counted**. Four
matches are permanently missing from the ratings of everyone who played them,
and would have stayed missing.

Both states now offer the same resolution, because they are the same situation:
two people disagree and nobody can break the tie. The settle buttons write the
chosen score and set `verified`, which is exactly the write the ordinary accept
path makes — so the existing trigger applies the rating. **No second ELO path**,
which is what would have drifted.

**Two things this needed that were not obvious:**

1. **RLS would have refused it.** The only UPDATE policy on `match_results`
   requires `auth.uid()` to be in the match or on one of the teams. A group admin
   who did not play fails that — precisely the person the flow is for. The button
   would have failed for its intended user and looked like another silent save
   failure, which is the exact bug class fixed earlier the same day.
   `20260910000003` adds a narrow policy: the admin of the group the match
   belongs to, nothing else, with `WITH CHECK` repeating the condition so a
   result cannot be moved out of its group on the way through.
2. **Two of the four have no group at all**, so there is no admin to appeal to.
   Restricting settlement to group admins would have left those two stuck
   forever. Where a match has no group, a participant can settle it — the
   alternative is a permanent dead end, and the existing "Players can update
   match results" policy already allows the write.

None of the four carries a proposed score — they predate the proposal fields —
so only "Keep the submitted score" renders for them. That is handled, not
assumed: the second button is conditional on a proposal existing.

### Availability stopped being public

Security finding 2 from the RLS audit. `polls` and `poll_responses` each carried
a SELECT policy granted to the **`anon`** role with `USING (true)`. The anon key
ships in the public JavaScript bundle by design, so this needed no account at
all: **797 rows** of `selected_slots`, `availability_ranges` and `flexible_times`
— when each named player is free, week by week — readable by anyone who opened
the site.

It is the most sensitive behavioural data in the app, and the exact data class
the availability work was built on top of.

Checked before dropping rather than after: every poll route sits behind `Guard`,
which redirects to `/auth` without a session, so there is no unauthenticated poll
view to break. The correctly scoped policies were already sitting beside these
two and stay — group membership via the poll, for both tables. They are granted
to `public`, which includes authenticated users; for an anonymous reader
`auth.uid()` is null so they match nothing, which is the intended outcome.

**`investor_verification_tokens` was deliberately left alone.** Same shape of
problem — anyone can mint a token for any address and read it straight back — but
nothing in this repo reads that table, so it is consumed by wynaxa.com. Dropping
its SELECT policy blind could break the Founding Supporters sign-in. It needs
that code read first, and it is not urgent: all 7 tokens are used and expired.

### Three dormant guest tables, closed

Security finding 4. `guest_players`, `guest_player_ratings` and
`match_guest_players` each carried one policy for **ALL** commands with
`USING (auth.uid() IS NOT NULL)` — select, insert, update *and delete*, for
anybody with an account, on rows about people who are not users.

**This is a revoke, not a rewrite, because the tables are dormant.** Checked
rather than assumed: no reference anywhere in `src/` or `supabase/functions/`;
no reference in the body of any database function; last write to all three was
**2 May 2026**. The live path is `match_guest_invites`, still being written in
August. Writing an elaborate ownership model for tables nothing reads would be
inventing a contract nobody signed.

Dropping the policy leaves RLS enabled with **no** policy, which denies every
non-service-role request — the correct posture for a dormant table, and
trivially reversible. `service_role` bypasses RLS, so migrations and backups are
unaffected. Verified after applying: RLS on, zero policies, all three.

**Not deleted.** 110 rows across the three, and they are the only record of who
actually played in 35 historical matches. Nothing displays that today, but
deleting is irreversible and closing access is not. Whether they are finished
with is a separate, deliberate decision.

**A correction to my own audit.** The RLS report described these rows as
carrying "names, emails and phone numbers". The columns exist; every one of them
is NULL. The personal data is names only. The write and delete exposure was
real — the sensitivity was overstated, and the data-protection framing I put on
it was wrong.

### A broadcast now tells the people it is for

"Put it out there" shipped visible but unannounced. A connection saw it only if
they happened to open Open Matches or the Play sheet that evening. A feature
whose entire premise is *is anyone about?* cannot wait for people to come
looking.

**A trigger, not a client loop.** The client would have to read the connection
list and fan out N inserts — slow, half-failable, and skippable by anyone who
closes the sheet mid-write. `trg_notify_connections_of_broadcast` fires with the
insert, in the same transaction, and cannot be bypassed. It is the same shape as
the notification `claim_open_match` already sends. Inserting into `notifications`
is all it does: `trg_compute_nav_url` sets the destination and `trg_dispatch_push`
delivers. The type is `open_match_broadcast`, and
`compute_notification_nav_url` already routes `open_match_%` to
`/matches/:related_id`, so the tap lands on the broadcast itself with no change
to that function.

**One tap sends 34 pushes.** That is the real number for the test account, not an
estimate — every accepted connection in both directions. It is also why the rate
limit is the design rather than a detail: **only the first broadcast in a
six-hour window notifies anyone.** Later ones are still created, still listed in
Open Matches, still joinable — they simply do not buzz. Five broadcasts in an
evening from one person is how a feature gets muted at the OS level, and reach is
worth less than not being switched off.

Fires only when the row is genuinely a broadcast: `is_open`, aimed at
`connections`, and exactly one player. Push-to-open matches already have three
players and their own notification path.

### The notification switches were lying

Found while building the above, and worth naming plainly.
`notification_preferences` has a row for all **93** players and five switches —
match reminders, poll reminders, chat, connection requests, match results.
**Nothing read it.** `dispatch_push_notification` pushed every row inserted into
`notifications`, whatever the player had set.

Nobody has muted anything, so this changed no behaviour today. It is not
cosmetic: it is the difference between a switch that works and a switch that
lies, and the app was one settings screen away from lying to 93 people. Shipping
a sixth push type into that — one with no possible off switch, that reaches
everyone you know at once — would have been the patch.

So `open_matches` was added as a sixth category and the dispatcher was taught to
read all six. Types are matched by **prefix**, so new ones inherit sensible
behaviour rather than defaulting to always-push by accident. Anything unmapped
still pushes: an unknown type is more likely to be important than to be spam, and
over-delivery is recoverable where a silently dropped push is invisible.

Verified in rolled-back transactions against production: a broadcast insert wrote
**34** notification rows with the title *"Christian Shanahan is free Saturday
evening"*; with one connection muted, all 34 in-app rows were still written and
the push was skipped for that one user only.

**Still missing, and named rather than hidden: there is no settings UI.** The
switches work now, but a player cannot reach them. That is the next piece, and
until it is built every value stays at its default of `true` — which is exactly
today's behaviour.

### The switches were still lying, and here is what was actually wrong

The migration before this one taught `dispatch_push_notification` to read
`notification_preferences`. **That function has never sent a push.** It reads
`app.settings.service_role_key`, which is not set on this database, so it returns
before it reaches `http_post` — for everybody, on every notification, muted or
not.

The live path is `dispatch_notification_to_onesignal` → the `notify-onesignal`
edge function → OneSignal, and that path checked only `profiles.push_opted_out`.

**My verification was worthless and worth naming.** I watched the dead
dispatcher return early and called that "push suppressed for that user". It
returns early either way. I checked the mechanism and never checked the outcome,
which is the exact failure the fix-class rules exist to catch.

**One gate.** `wants_push(user_id, type)` asks both questions at once — the
master switch and the category — so they cannot be checked in one path and
skipped in another. The edge function calls it in place of its own
`push_opted_out` lookup: one round trip where there were about to be two.
Absent rows mean yes, and unmapped types still push, because over-delivery is
recoverable where a silently dropped push is invisible.

**The dead dispatcher is dropped, not repaired.** Two AFTER INSERT triggers on
`notifications` both trying to send the same push, one quiet only because a
setting is missing, is a latent double-send: set that GUC in a future migration
or restore a backup that has it and every player gets two of everything. Blast
radius checked first — `dispatch_push_notification` is referenced by no other
function body, nothing in `src/`, nothing in `supabase/functions/`, and it is
the only thing in the database that calls the `send-push` endpoint. Every other
path inserts into `notifications`.

**Proof this time, end to end.** Two real notifications inserted, and the HTTP
response the database got back from the edge function read off
`net._http_response`:

| `open_matches` | Response |
| --- | --- |
| muted | `{"skipped":true,"reason":"muted"}` |
| on | `{"ok":true}` — real push delivered |

**A mistake made and caught in the same minute.** The deploy tool defaults
`verify_jwt` to true and I did not pass it. `notify-onesignal` is called by a
database trigger carrying an `x-webhook-secret` header and no JWT, so for **40
seconds** every push would have been rejected at the gateway. Redeployed with it
off, then checked rather than assumed: **zero notifications were inserted in that
window**, so nothing was lost. Luck, not care.

### A settings screen the switches can actually be reached from

Six categories under the push toggle in You → Settings, ordered loudest first —
`open_matches` reaches every accepted connection at once, so it is the one a
player comes here to find.

Each row says what actually arrives rather than naming a database column:
*"Someone is free for a game — when a connection puts a game out there, or an
open match needs a player."* Written in all eight languages, not English with
seven gaps.

**They are disabled while push is off.** The master switch wins inside
`wants_push`, so with push off these change nothing. Six live-looking switches
that have no effect is the same class of lie this entire piece of work exists to
remove. They stay visible so a player can see what they get back, and stay
inert so they cannot be fiddled with pointlessly.

Writes are optimistic — a switch that waits for a round trip feels broken — and
roll back to exactly what the server last returned on failure. The write is an
**upsert**, not an update: the row is created by a signup trigger, but a player
predating that trigger has none, and an update would affect zero rows and report
success.

### One switch, not eight

The toggle markup existed in **eight** hand-written copies across `You`,
`GroupDetail` and `CreateGroupSheet` — same pill, same knob, same
`translate-x-6`, all typed out separately. Eight copies is eight chances to
drift and is exactly where a token change quietly misses a screen. It is now one
component in `components/shared/Toggle.tsx`.

**Proved identical rather than eyeballed.** Old markup and new component
rendered side by side in all four states and diffed at 3× device scale:

| state | differing pixels |
| --- | --- |
| on | **0** |
| off | **0** |
| on, disabled | **0** |
| off, disabled | **0** |

The only behavioural addition is `role="switch"` and `aria-checked`, which no
copy had. A screen reader previously announced every one of these as an
unlabelled button with no state.

### Three courts-near-you, and now one

The Community tab was going to be renamed. Checking what it actually held first
turned up something bigger: **"padel courts near you" existed three times**, and
two of them rendered on the same screen.

| Where | What it was |
| --- | --- |
| `CourtsHome` | The designed one, built to `Courts.dc.html` — partner venues first under the ball-yellow chip, real slots, the per-player split, "Ask them" acquisition rows |
| `BookCourt.tsx` step 1 | A second "Padel venues near you" list rendered **directly underneath CourtsHome** whenever the search box was empty and location was on |
| `Community.tsx` `NearbyVenuesSection` | A third — its own geolocation, its own filters, its own map |

Different data paths too: CourtsHome selected `padel_venues` directly; the other
two called the `venues_near` RPC. Open the Courts tab with location on and you
saw two nearby-venue lists stacked.

**Kept the designed one, took what the others had that it lacked.** Community's
version was the only one with a **map** and **indoor / outdoor / book-in-app
filters**, so those moved into `CourtsHome` rather than dying with it. The other
two are gone.

**A bug the move exposed.** `useVenuesNearby` sliced to 3 partner and 4 other
venues *inside the query*. Filtering after that would have searched a
seven-row window and called the empty result "no courts match these filters" —
a filter that lies. The slice moved to the render, after filtering. It shows in
the screenshots: with **Indoor** on, Bath Padel Centre at 11.9 miles appears,
and under the old order it could not have.

**The prefetch it replaced.** `BookCourt` ran a speculative 12-row `venues_near`
query on every visit. Once the duplicate list below CourtsHome was deleted, its
only remaining job was to act as a lookup table for a tapped venue — data
CourtsHome had already fetched. It is now a single-row fetch on tap.

**A layout defect caught by screenshotting rather than by reasoning.** The three
filter chips and the List/Map toggle did not fit at 390px, and the horizontal
scroller cut "Book in-app" in half — which reads as broken, not swipeable, and
the longer translations make it worse. The row wraps now.

**A dead class, fixed at the root.** `no-scrollbar` was used in **12 places
across 9 files** and defined nowhere. The utility that exists is
`scrollbar-none`. All 12 now use the real one, and 12 carousels that were
supposed to hide their scrollbar finally do.

### Community became People

Not a rename of a word — the tab was holding two unrelated jobs. With courts
gone it holds only people: groups, connections, open matches, events, and the
directory.

**Why not "Players", which was the first answer.** Checking the route table
killed it: **`/players/:playerId` already exists** as the player profile, so
`/players/groups` would have sat directly beside it — and the tab's own
directory tile is called *Players*, giving a tab named Players containing a tile
named Players.

**People collides with neither**, and it is concrete in the way the other three
tabs are: `Today` is a day, `Courts` are courts, `Me` is you. "Community" was
the one abstraction in the set — a label that tells a player nothing about what
is behind it.

**It also retires a translation defect.** `समुदाय` (Hindi) and `المجتمع`
(Arabic) both read as *society* — formal, sociological, and in Indian usage
carrying caste and religious-group weight. Wrong register for a padel app.
`लोग` and `الناس` are everyday words. The eight labels are People, Gente,
Pessoas, Personnes, Persone, Personer, الناس, लोग.

**Old URLs still work, and that is not negotiable.** `/community/*` redirects to
`/people/*` preserving path, query string **and hash** — `/community#connections`
is the destination of every connection-request push notification ever sent, and
dropping the hash to tidy a route table is not a trade worth making. Proved with
five cases rendered through the real route, not asserted.

**The codemod is anchored, not global.** "community" is also an ordinary English
word — `Landing.tsx` uses it three times in prose. Every rule keys off a
prefix that only appears in code, so marketing copy is untouchable by
construction.

**Six cases the codemod missed, found by re-scanning rather than by trusting
it.** The route rule required a quote immediately before `/community`, so it
skipped the two **share links** that interpolate
(`${window.location.origin}/community/groups/${id}`), the notification target
`/community#connections` (ends in `#`, not `/`), a dynamic translation key, and
two internal keys. A codemod you do not grep after is a codemod that quietly
half-worked.

**Dead keys removed, and the rest named rather than swept.** The 14
courts-section strings and three unused title keys are gone from all eight
locales. **31 further orphaned keys** in that namespace were left: they were
orphaned by earlier work, and deleting them belongs in its own commit where the
check is visible, not buried inside a rename.
