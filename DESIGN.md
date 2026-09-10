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
