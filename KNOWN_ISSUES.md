# Known Issues — Open Investigations

## Career ELO / matches_played drift — ROOT-CAUSED & FIXED 2026-07-28

**Resolution:** Root cause found — **match deletion never reversed the profile
aggregates**. `apply_match_elo` did `internal_ranking += delta` and
`matches_played += 1` at verification time, but the delete path (client direct
deletes + the old `delete_match_cascade`) removed `match_results`/`rating_history`
without undoing those profile writes. So stored career values drifted ABOVE a
clean rebuild by a variable per-player amount (= each player's deleted-but-
processed matches). The "impossible void counts" were a red herring (void sets
are skipped before `apply_match_elo`, so they never counted).

**Fix (migration `20260728000003`):** `delete_match_cascade` now reverses each
player's summed `rating_change` out of `internal_ranking` and decrements
`matches_played` before deleting `rating_history` (and now also deletes
`ranking_changes`). `MatchDetail.handleDeleteMatch` calls this RPC instead of
direct table deletes. `peak_elo` is intentionally left as-is (running max).

**Remaining:** run `rebuild-ratings` ONCE to clear the *historical* drift already
baked in by past hard-deletes. This is now safe (deletion no longer re-drifts,
and the `_shared/elo.ts` deploy-blocker syntax error is fixed). Verify the
migration on staging before pushing, since it mutates live ratings.

---

## (historical) Career ELO / matches_played drift (PARKED 2026-06-25)

**Status:** Superseded by the resolution above — kept for context.
Do NOT run a rebuild until the migration above is pushed.

**Symptom:** rebuild-ratings dry-run shows stored career ELO + matches_played drifted
from a clean rebuild. matches_played delta was reported ~uniform -1, but the
"one void match per player" hypothesis was DISPROVEN.

**Evidence that disproves the simple hypothesis:** void-match counts per player are
wildly variable (Christian 21, Kieran 18, Alex 17 ... down to 1), not ~1 each.
Some players have impossible counts: Mike Taylor = 2 void matches but stored_mp 1;
Phil Manavopoulos = 9 void / 9 stored; Sam = 3 / 3. A player having MORE void
matches than total stored matches should not be possible under normal logic.

**Implication:** the problem is likely in the MATCH DATA itself (how matches were
created/voided historically), not just the rating computation. Running the rebuild
now could lock in a wrong answer if the void classification or match data is the
real bug.

**Scope of impact:** career/global ELO (profiles.internal_ranking) shown on player
profiles + global leaderboard. LEAGUE standings/leaderboards/jerseys are SEPARATE
and verified correct (all 3 leagues reconciled ALL MATCH on 2026-06-25).

**Next investigation should answer:**
1. Why do players have impossible void-match counts (more void than total)?
2. Are these void matches legitimate data or creation/voiding bugs?
3. Is the void classification correct, or are real matches being marked void?
4. What is the CORRECT matches_played — does career count void matches or not?
5. Only after the above: is rebuild-ratings the right repair, or does match data need fixing first?

**Do NOT:** run rebuild-ratings dry_run:false / apply the rebuild until 1-5 are answered.
