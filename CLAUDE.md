# CLAUDE.md

## Migrations applied through the Supabase MCP

A migration applied through the MCP gets its version assigned by the database,
not by the filename you chose. After applying, always:

1. Read the assigned version from `supabase_migrations.schema_migrations`
2. Name the repo file with THAT version
3. Verify md5 of the file contents (minus trailing newline) equals
   `md5(statements[1])` for that version
4. Never leave a local-only migration file that recreates something the
   fixed version replaced — on a `db push` it silently undoes the fix

NEVER run `supabase db push` against this project. The local migration
history does not reproduce the live schema, and a push would replay
superseded migrations against production — including ones that recreate
functions a later migration deliberately dropped. Apply through the MCP and
write the file to match, as above. This restriction lifts only when
`supabase migration list` shows zero local-only and zero remote-only rows.

## Migrations with no recorded statements

The following four migrations were applied via `supabase db query -f` on 15 Sep
2026 and registered with a hand-written INSERT into schema_migrations. Their
`statements` column is NULL, so the md5 repo-vs-live check cannot pass for them.
The repo files contain the SQL that was applied, but the database has no record
of the exact text. Do not rely on md5 verification for these versions:

- `20260915110000` — pending_review_and_rejected_status
- `20260915110100` — venue_discovery_targets
- `20260915130000` — booking_claim_whose_turn_rpcs
- `20260915133000` — booking_claim_expiry_cron

Going forward: apply migrations through the Supabase MCP (which records
statements and assigns the version), or have Christian apply via the Dashboard
SQL Editor. Do not use `db query -f` followed by a manual INSERT.

## Testing against live data

1. Never gate-test by writing to live matches with real players. Notifications
   trigger real OneSignal pushes via the `dispatch_notification_to_onesignal`
   trigger. Use disposable test matches with test accounts, or run the function
   inside a transaction that is rolled back.

2. **Never write sentinel values into production rows.** Any write intended to
   prove a constraint or trigger behaves correctly MUST be wrapped so it cannot
   persist. Use one of:
     - `BEGIN; <the test write>; ROLLBACK;` with the result read INSIDE the
       transaction
     - A single `DO` block that raises at the end to force the rollback
   Never "clean up afterwards" — cleanup is what damaged match
   `6b25bb1f-749f-4faf-bcfd-30d75451adee` on 15 Sep 2026 (booked_venue_name
   overwritten with 'should fail', then NULLed by cleanup, leaving a booked
   match with no venue name). The incident was only caught because a human
   queried the row.

3. If the tooling (e.g. `supabase db query --linked`) cannot hold a transaction
   across statements, the test is not safe to run against production. Use a
   local database or a `DO` block instead.

## Matches realtime invalidation

**Rule:** every React Query key that reads from the `matches` table MUST be
invalidated by `useUserMatchesSubscription` in
`src/hooks/useRealtimeSubscription.ts`. When you add a new `useQuery` that
selects from `matches`, add its key to the handler on the same PR.

Current list (2026-09-16):

```
home-next-match    home-quick-stats   home-activity
matches            play-matches       unbooked-matches
handoff-matches    join-open-matches  week-open-matches
open-matches       play-upcoming      week-my-matches
week-group-matches
```

A missing key means a player's view goes stale when another player changes
the same match — the exact bug that kept booked games visible on Home.

## Migrations — ppa-v2 owns them for timbjfihsxqfrqrxwdny

**Rule:** ppa-v2 is the single repo that holds migration files for the shared
Supabase project (ref `timbjfihsxqfrqrxwdny`). venue-manager does NOT have a
migrations directory for this project. Both apps share one database.

Every schema or data change goes through one of these two paths:

1. **`supabase db push`** — write the .sql file first, then push. The file is
   the source of truth.
2. **`execute_sql` (MCP / SQL Editor)** — when applying immediately, write the
   byte-identical .sql file AND record it with
   `INSERT INTO supabase_migrations.schema_migrations (version, statements) VALUES (...)`
   **in the same turn**. Never execute_sql alone.

On 2026-09-16, five migrations were applied via execute_sql and not recorded
until hours later. The divergence was caught manually. This rule exists so it
does not happen again.

## Build checks — `npm run build`, not `tsc --noEmit`

The build gate is:

```
cd /Users/christianshanahan/Documents/ppa-v2 && pwd && npm run build; echo "exit=$?"
```

Nothing else counts as a build check. Specifically:

- **`npx tsc --noEmit` is NOT a build check.** It uses the root `tsconfig.json`
  which has no `compilerOptions` — it misses `noUnusedLocals` and
  `noUnusedParameters` from `tsconfig.app.json`. `npm run build` runs `tsc -b`
  which uses project references and enforces both.
- **Use absolute `cd`, print `pwd` and exit code.** The shell CWD resets between
  calls; pushd/popd silently runs in the wrong directory.
- **A build claim without `pwd` and `exit=0` is not a build claim.**

Two commits shipped broken because of this:
- `ddb3759`: tsc ran in the wrong directory (pushd/popd bug)
- `a726024`: tsc --noEmit passed but npm run build failed (noUnusedLocals)
