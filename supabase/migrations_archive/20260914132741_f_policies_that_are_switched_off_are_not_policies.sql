-- Policies that are switched off are not policies.
--
-- ROOT CAUSE — six tables in the public schema have row level security
-- DISABLED while the PostgREST roles hold full grants on them. A policy on a
-- table with relrowsecurity = false is inert: it is documentation, not
-- enforcement. Found 14 Sep by probing the group_members INSERT path as an
-- ordinary authenticated user and watching a self-approve into a private group
-- succeed against a policy that forbids it.
--
--   table                              policies  rls   anon  authenticated
--   group_members                             9  OFF   rw    rw
--   rating_history                            0  OFF   rw    rw
--   league_standings_backup_20260909          0  OFF   rw    rw
--   profiles_ratings_backup_20260909          0  OFF   rw    rw
--   ranking_changes_backup_20260909           0  OFF   rw    rw
--   rating_history_backup_20260909            0  OFF   rw    rw
--
--   (spatial_ref_sys is PostGIS reference data and is left alone.)
--
-- WHAT WAS REACHABLE
--   group_members, 80 rows. Six of the eight groups are private. With RLS off
--   and grants on, any caller could:
--     - read every membership of every private group
--     - insert themselves into any group with status 'approved'
--     - UPDATE any row, including role -> 'admin', on any group
--     - DELETE any member, including the real admin
--   and from an approved membership the existing matches policy
--   ("Group members can view group matches") hands over that group's match
--   history. The nine policies written to prevent all of this never ran.
--
--   rating_history, 765 rows — the ELO ledger. Insertable and updatable by
--   anon. Every legitimate writer (apply_match_elo, award_giant_slayer_on_rating,
--   award_weekly_jerseys, delete_match_cascade) is SECURITY DEFINER, so none
--   of them needs the direct grant that was making this writable.
--
--   The four *_backup_20260909 tables are leftovers of the 9 Sep ratings
--   migration. profiles_ratings_backup_20260909 is a per-user rating snapshot,
--   93 rows, readable by anyone on the internet.
--
-- FIX CLASS: root-cause. Adding more policies would have changed nothing at
--   all while relrowsecurity stayed false — the textbook case of treating the
--   symptom. The tables are switched on, and the grants that made the write
--   paths reachable are withdrawn where no legitimate caller needs them.
--
-- BLAST RADIUS — group_members, enumerated before enabling
--   SELECT  "Members can view group members" covers self, fellow approved
--           members and the group admin. "Users can view group members" covers
--           is_group_member(). Between them, every in-app read of a group you
--           belong to keeps working.
--           GAP FOUND: a non-member browsing a public or open group in the
--           directory could no longer see its members or its member count.
--           A third SELECT policy is added below for exactly that, scoped to
--           visibility in ('public','open') — it grants nothing on the six
--           private groups.
--   INSERT  covered by "A member joins on the group's terms" (previous
--           migration): self only, status decided by the group, not the caller.
--   UPDATE  admins, plus self re-request after rejection.
--   DELETE  admins, plus leaving a group yourself.
--   Service-role callers (edge functions, the Hub's server side) bypass RLS
--   and are unaffected throughout.
--
-- BLAST RADIUS — rating_history
--   get_league_climbers is SECURITY INVOKER and reads this table, so a SELECT
--   policy for authenticated is required and is added. get_league_upsets and
--   the four writers are SECURITY DEFINER and are unaffected by the revoke.

-- ── group_members ───────────────────────────────────────────────────────────
create policy "Anyone may see who is in an open group"
  on public.group_members
  for select
  to authenticated
  using (
    exists (
      select 1 from public.groups g
       where g.id = group_members.group_id
         and g.visibility in ('public', 'open')
    )
  );

alter table public.group_members enable row level security;

-- ── rating_history: readable, never client-writable ─────────────────────────
create policy "Rating history is readable"
  on public.rating_history
  for select
  to authenticated
  using (true);

revoke insert, update, delete on public.rating_history from anon, authenticated;
revoke select on public.rating_history from anon;
alter table public.rating_history enable row level security;

-- ── the 9 Sep backups: no client reaches these at all ───────────────────────
revoke all on public.league_standings_backup_20260909 from anon, authenticated;
revoke all on public.profiles_ratings_backup_20260909 from anon, authenticated;
revoke all on public.ranking_changes_backup_20260909  from anon, authenticated;
revoke all on public.rating_history_backup_20260909   from anon, authenticated;

alter table public.league_standings_backup_20260909 enable row level security;
alter table public.profiles_ratings_backup_20260909 enable row level security;
alter table public.ranking_changes_backup_20260909  enable row level security;
alter table public.rating_history_backup_20260909   enable row level security;
-- No policies on the four: RLS enabled with zero policies denies everything,
-- which is the intent. They are kept, not dropped, because they are backups —
-- dropping them is a separate decision with a separate migration.
