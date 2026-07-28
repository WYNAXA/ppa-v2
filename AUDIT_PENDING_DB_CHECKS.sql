-- PPA-v2 audit — 4 live-DB checks that static analysis + anon REST could not resolve.
-- Run in Supabase SQL editor (project timbjfihsxqfrqrxwdny) or via the Supabase MCP execute_sql.
-- All read-only. Each block prints what to conclude.

-- =====================================================================
-- CHECK 1 (CRITICAL) — Write-side RLS on bookings / court_bookings.
-- Decides the TRUE severity of audit findings C1–C4. We confirmed anon
-- CANNOT read these tables, but that says nothing about whether an
-- ordinary authenticated user can INSERT/UPDATE a booking with an
-- arbitrary price/status/paid_player_ids. This shows every policy.
-- WHAT TO LOOK FOR: an INSERT or UPDATE policy on `bookings` whose
-- WITH CHECK / USING is permissive (e.g. just `auth.uid() IS NOT NULL`
-- or `true`) with no constraint on status/price/paid_player_ids = the
-- exploits are real. If writes are funnelled only through SECURITY
-- DEFINER RPCs and direct INSERT/UPDATE is denied to `authenticated`,
-- the blast radius is much smaller.
-- =====================================================================
select tablename, policyname, cmd, roles, qual as using_expr, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('bookings','court_bookings','booking_payments')
order by tablename, cmd, policyname;

-- Is RLS even enabled + forced on these tables?
select relname,
       relrowsecurity  as rls_enabled,
       relforcerowsecurity as rls_forced
from pg_class
where relname in ('bookings','court_bookings','booking_payments')
  and relnamespace = 'public'::regnamespace;

-- Which roles can directly INSERT/UPDATE the base table (privilege layer under RLS)?
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'bookings'
order by grantee, privilege_type;

-- =====================================================================
-- CHECK 2 (HIGH H3/H4) — Are the two scheduled jobs actually installed?
-- process-booking-deadlines (refunds/releases) and close-expired-polls
-- (which also gates poll auto-scheduling) have NO cron.schedule in the
-- migrations. Confirm whether they exist as live pg_cron jobs.
-- WHAT TO LOOK FOR: rows named like 'close-expired-polls' and something
-- invoking process-booking-deadlines. If absent/inactive, that work
-- silently never runs.
-- =====================================================================
select jobid, schedule, jobname, active, command
from cron.job
order by jobname;

-- =====================================================================
-- CHECK 3 (MEDIUM M6) — Is league_standings in the realtime publication?
-- Two client subscriptions (LeagueDetail live standings, TournamentMode)
-- depend on it. We expect it to be MISSING.
-- FIX if missing: alter publication supabase_realtime add table league_standings;
-- =====================================================================
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
order by tablename;

-- =====================================================================
-- CHECK 4 (MEDIUM M5) — Do the DB webhooks for native push + ELO exist?
-- notify-onesignal (native push) and process-elo are triggered by
-- dashboard-configured Database Webhooks, which are implemented as
-- triggers calling supabase_functions.http_request. List all such
-- triggers so we can see whether they're present (and whether
-- notify-onesignal duplicates the send-push pg_net trigger on
-- notifications INSERT).
-- =====================================================================
select event_object_table as table_name,
       trigger_name,
       action_timing,
       event_manipulation as event,
       action_statement
from information_schema.triggers
where trigger_schema = 'public'
  and action_statement ilike '%http_request%'
order by table_name, trigger_name;

-- Also: any Supabase Database Webhooks registered (if the metadata table exists)
select * from supabase_functions.hooks order by hook_table_id;  -- may error if table absent; ignore if so

-- =====================================================================
-- BONUS — quick sanity on the ELO drift (H1). Compares stored career
-- aggregates against a fresh count of surviving verified matches, to
-- see the drift magnitude per player WITHOUT running a rebuild.
-- Read-only; adjust column/status names if they differ.
-- =====================================================================
-- select p.id, p.name, p.matches_played as stored_mp,
--        count(mr.*) filter (where mr.status = 'verified') as live_verified_results
-- from profiles p
-- left join match_results mr on mr.player_id = p.id  -- adjust join to real schema
-- group by p.id, p.name, p.matches_played
-- having p.matches_played <> count(mr.*) filter (where mr.status = 'verified')
-- order by (p.matches_played - count(mr.*) filter (where mr.status = 'verified')) desc;
