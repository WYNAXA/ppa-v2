-- Make match visibility mean something, and give an open match an audience.
--
-- ── PART 1: the policy that defeated all the others ────────────────────────
--
--   `matches_open_select` read:
--       USING ((is_open = true) OR (auth.uid() IS NOT NULL))
--
--   Postgres ORs permissive policies together, so the right-hand side being
--   true for every account meant the five carefully scoped policies beside it
--   did nothing at all. Every private group's fixtures — with notes,
--   organizer_notes, travel_notes, booking_notes, drivers, venue and the full
--   player list — were readable by any signed-in user.
--
--   Dropping it was audited first, not assumed. Of the 35 places the app reads
--   `matches`, 34 already filter by player_ids-containing-me, group_id,
--   league_id or is_open, all of which the remaining policies cover. Every
--   league match carries a group_id and every league member is in that group,
--   so LeagueDetail is covered too. The one genuinely global read is the text
--   search in Search.tsx, which today lets any account search every private
--   match by venue name or date — narrowing that is the fix, not a regression.
--
-- ── PART 2: an open match needs to say who it is open TO ───────────────────
--
--   "Anyone can view open matches" was `USING (is_open = true)`, which is right
--   for a match posted to the world and wrong for "I'm free Thursday, anyone
--   about?" sent to the people you actually play with.
--
--   `open_audience` defaults to 'open' so every existing open match keeps
--   exactly the visibility it has today. Only the new broadcast flow sets
--   'connections'.

-- ── The connection test ────────────────────────────────────────────────────
-- SECURITY DEFINER because player_connections is row-scoped to its own
-- participants; a policy needs to answer "are these two connected" about a
-- pair that does not include the reader.
create or replace function public.are_connected(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.player_connections pc
    where pc.status = 'accepted'
      and ((pc.user_id = a and pc.connected_user_id = b)
        or (pc.user_id = b and pc.connected_user_id = a))
  );
$$;

revoke all on function public.are_connected(uuid, uuid) from public;
grant execute on function public.are_connected(uuid, uuid) to authenticated;

-- ── The audience column ────────────────────────────────────────────────────
alter table public.matches
  add column if not exists open_audience text not null default 'open';

alter table public.matches
  drop constraint if exists matches_open_audience_check;

alter table public.matches
  add constraint matches_open_audience_check
  check (open_audience in ('connections', 'groups', 'open'));

comment on column public.matches.open_audience is
  'Who an is_open match is visible to. ''open'' = anyone (the default, and what '
  'Push-to-open creates). ''connections'' = the creator''s accepted '
  'player_connections only. ''groups'' = members of the creator''s groups. '
  'Meaningless when is_open is false.';

-- ── Replace the two over-broad SELECT policies ─────────────────────────────
drop policy if exists "matches_open_select" on public.matches;
drop policy if exists "Anyone can view open matches" on public.matches;

create policy "Open matches are visible to their audience"
  on public.matches
  for select
  to authenticated
  using (
    is_open = true
    and (
      open_audience = 'open'
      or (open_audience = 'connections'
          and created_by is not null
          and public.are_connected(created_by, auth.uid()))
      or (open_audience = 'groups'
          and group_id is not null
          and exists (
            select 1 from public.group_members gm
            where gm.group_id = matches.group_id
              and gm.user_id = auth.uid()
              and gm.status in ('approved', 'ringer')
          ))
    )
  );

-- The creator and the players still see their own through the existing
-- "Players can view their matches" and "Users can view matches" policies, so a
-- broadcast is never invisible to the person who made it.

create index if not exists matches_open_audience_idx
  on public.matches (is_open, open_audience, match_date)
  where is_open = true;
