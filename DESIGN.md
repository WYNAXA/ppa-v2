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
dark variant is **not wired up yet** — that lands with the nav work. Padel is
played at night; this is not optional long-term.

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
