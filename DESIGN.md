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
At its real size — 32px inside a 62px button — the two heads fuse into a heart,
which in an app reads as "favourite". It was replaced with a single racket
meeting the ball, which holds its head, throat and handle at 32px. If the
crossed pair is wanted back it needs redrawing for the small size, not
rescaling.
