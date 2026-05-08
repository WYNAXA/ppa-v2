# Code Audit — Anti-Pattern Inventory

**Date:** 2026-05-08
**Scope:** src/ directory, 22,232 lines across 60+ components

## Summary

| Pattern | Instances | Critical | High | Medium | Low |
|---------|-----------|----------|------|--------|-----|
| 1. Date.now()/Math.random() in queryKey | 0 | 0 | 0 | 0 | 0 |
| 2. staleTime: 0 + refetchOnMount: 'always' | 0 | 0 | 0 | 0 | 0 |
| 3. Null-unsafe array methods on player_ids | 4 | 3 | 0 | 0 | 1 |
| 4. Phantom column references | 0 | 0 | 0 | 0 | 0 |
| 5. Embedded Supabase joins on new tables | 0 | 0 | 0 | 0 | 0 |
| 6. console.log in source code | 32 | 0 | 0 | 32 | 0 |
| 7. Missing hook dependencies | 6 | 0 | 0 | 6 | 0 |
| 8. Components over 1000 lines | 5 | 0 | 0 | 0 | 5 |
| **Total** | **42** | **3** | **0** | **38** | **6** |

## Fixes Applied (this commit)

| File | Line | Issue | Fix |
|------|------|-------|-----|
| MatchDetail.tsx | 488 | `data.match.player_ids.filter()` — null crash | `(data.match.player_ids ?? []).filter()` |
| MatchDetail.tsx | 515 | `match.player_ids[i]` — null crash | Use `playerIds[i]` (already null-safe) |
| MatchDetail.tsx | 517 | `match.player_ids.length` — null crash | Use `playerIds.length` |
| MatchDetail.tsx | 609 | `match.player_ids.length === 4` — null crash | Use `playerIds.length` |

---

## Pattern 1: Date.now() / Math.random() in queryKey

**Status: CLEAR**

No instances found. Previously fixed in GroupDetail.tsx (replaced `Date.now()` in queryKey with stable `today` string).

---

## Pattern 2: staleTime: 0 + refetchOnMount: 'always'

**Status: CLEAR**

No instances found. Previously fixed in GroupDetail.tsx.

---

## Pattern 3: Null-unsafe array methods on player_ids

The DB `matches.player_ids` column is `text[] | null`. Most query mappings use `m.player_ids ?? []` but some direct accesses on the raw match object skip the null guard.

### CRITICAL — Fixed

- **MatchDetail.tsx:488** — `data.match.player_ids.filter(...)` crashes if null
- **MatchDetail.tsx:515** — `match.player_ids[i]` crashes if null
- **MatchDetail.tsx:517** — `match.player_ids.length` crashes if null
- **MatchDetail.tsx:609** — `match.player_ids.length === 4` crashes if null

### LOW — Safe (typed as string[] after mapping)

- WeekMatchView.tsx:36, 51, 382 — operates on `MatchCardData.player_ids: string[]`
- GroupDetail.tsx:511, 586 — operates on mapped data with `?? []`

---

## Pattern 4: Phantom column references

**Status: CLEAR**

All `.select()` calls reviewed. Column references match known DB schema:
- `profiles`: id, name, email, avatar_url, playtomic_level, ranking_points, internal_ranking, city
- `matches`: id, match_date, match_time, match_type, status, player_ids, group_id, booked_venue_name, created_manually, poll_id, notes
- `groups`: id, name, description, city, visibility, admin_id, join_mode, invite_code
- `group_members`: id, user_id, group_id, role, status, joined_at
- `rating_history`: rating_after, rating_change, created_at
- `venue_stamps`: stamp_count, lifetime_stamps

No embedded joins on leagues/league_members/league_invitations found in `.select()` calls.

---

## Pattern 5: Embedded Supabase joins on new tables

**Status: CLEAR**

Only one embedded join found: `groups(id, name)` in CreateLeagueSheet.tsx:213 — this is on the well-established `groups` table, not a new table. No joins on leagues, league_members, league_invitations, or notifications.

---

## Pattern 6: console.log statements in source (32 total)

All are stripped in production builds by the `strip-console` Vite plugin. However, they add noise to the source. Listed for cleanup backlog:

| File | Count | Context |
|------|-------|---------|
| CreateLeagueSheet.tsx | 13 | Debug logging for league creation flow |
| RecordResultSheet.tsx | 6 | Debug logging for result submission |
| AvailabilityPoll.tsx | 3 | Generate options debug |
| AuthContext.tsx | 3 | Auth state debug |
| PollAdminView.tsx | 2 | Generate/confirm debug |
| GroupDetail.tsx | 1 | Match query debug |
| BookCourt.tsx | 1 | Availability debug |
| CreateMatchSheet.tsx | 1 | Venue search debug |
| supabase.ts | 1 | Init debug |
| App.tsx | 1 | SW registration (already DEV-gated) |

**Severity: MEDIUM** — No runtime impact (stripped in prod), but clutters source.

---

## Pattern 7: Missing hook dependencies (6 warnings)

| File | Line | Missing Dep | Risk |
|------|------|-------------|------|
| PollAdminView.tsx | 242 | DAY_ORDER | LOW — constant, won't change |
| WeeklyScheduleSelector.tsx | 226 | DAY_ORDER | LOW — constant, won't change |
| BookCourt.tsx | 412 | selectedPlayers.length | MEDIUM — could miss player count changes |
| BookCourt.tsx | 469 | fetchSlots, selectedVenue | MEDIUM — could miss venue/slot updates |
| MatchDetail.tsx | 546 | searchParams | MEDIUM — could miss URL param changes |
| You.tsx | 481 | profile | MEDIUM — could miss profile updates for canDrive |

**Severity: MEDIUM** — These are common in React apps and usually intentional to prevent re-run loops, but should be reviewed individually.

---

## Pattern 8: Components over 1000 lines

| File | Lines | Notes |
|------|-------|-------|
| BookCourt.tsx | 1806 | 5-step booking wizard, complex state |
| LeagueDetail.tsx | 1543 | Multiple tabs, admin panel, standings |
| GroupDetail.tsx | 1475 | Members, matches, polls, events, admin |
| You.tsx | 1283 | Profile editor, settings, household |
| MatchDetail.tsx | 1182 | Match view, result sheet, player slots |

**Severity: LOW** — No runtime impact. These are page-level components with naturally complex UIs. Refactor into sub-components when convenient, not urgent.

---

## Recommended Follow-Up

1. **Remove debug console.log statements** — Replace with no-ops or remove entirely (32 calls)
2. **Review exhaustive-deps warnings** — Evaluate each for correctness vs intentional suppression
3. **Split large components** — Extract tab content from GroupDetail, LeagueDetail into separate files
4. **Enable lint as hard gate** — Fix remaining 96 lint errors, then remove `continue-on-error` from CI
