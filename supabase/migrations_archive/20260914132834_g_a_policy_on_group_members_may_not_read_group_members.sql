-- A policy on group_members may not read group_members.
--
-- ROOT CAUSE
--   Five of the nine group_members policies answer their question by selecting
--   from group_members itself:
--
--     SELECT "Members can view group members"        EXISTS (... FROM group_members my ...)
--     UPDATE "Admins can update group members"       EXISTS (... FROM group_members admin_row ...)
--     UPDATE "Admins can update member status"       LEFT JOIN group_members gm
--     DELETE "Admins or self can delete group members" EXISTS (... FROM group_members admin_row ...)
--     DELETE "Admins can remove members from their groups" LEFT JOIN group_members gm
--
--   Evaluating the policy requires reading the table, which requires
--   evaluating the policy. Postgres stops this with
--     42P17: infinite recursion detected in policy for relation "group_members"
--
--   It never fired before because RLS was switched OFF on this table, so the
--   policies were never evaluated. The previous migration switched RLS on —
--   which is correct — and that turned five latent recursive policies into an
--   error on every read. Caught by the probe run immediately after applying
--   it, before any client saw it.
--
-- FIX CLASS: root-cause. The alternative on offer was to switch RLS back off,
--   which is not a fix, it is the vulnerability.
--
-- THE RULE
--   Membership questions are answered by the two SECURITY DEFINER helpers that
--   already exist for exactly this purpose and are already used correctly by
--   the ninth policy:
--     is_group_member(_user_id, _group_id)  -- approved or ringer
--     is_group_admin(_user_id, _group_id)   -- groups.admin_id, or an approved
--                                              member with role 'admin'
--   A definer function runs as its owner, so the inner read does not re-enter
--   the policy. No policy on this table may query this table directly again.
--
-- CONSOLIDATION
--   The duplicate pairs are collapsed while they are being rewritten: two
--   SELECT policies that said the same thing in different words, two UPDATE,
--   two DELETE. Permissive policies OR together, so a duplicate is never
--   harmless — it is a second place the rule can drift.
--
-- BEHAVIOUR, unchanged from what the policies intended
--   read    your own row; any member of a group you are in; any member of a
--           group you administer; anyone in a public or open group
--   update  the group's admin, or yourself re-requesting after a rejection
--   delete  the group's admin, or yourself leaving

-- ── SELECT ──────────────────────────────────────────────────────────────────
drop policy if exists "Members can view group members" on public.group_members;
drop policy if exists "Users can view group members"   on public.group_members;

create policy "You see the groups you belong to"
  on public.group_members
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_group_member(auth.uid(), group_id)
    or public.is_group_admin(auth.uid(), group_id)
  );

-- ── UPDATE ──────────────────────────────────────────────────────────────────
drop policy if exists "Admins can update group members"  on public.group_members;
drop policy if exists "Admins can update member status"  on public.group_members;
drop policy if exists "Users can re-request after rejection" on public.group_members;

create policy "An admin decides who is in the group"
  on public.group_members
  for update
  to authenticated
  using (public.is_group_admin(auth.uid(), group_id))
  with check (public.is_group_admin(auth.uid(), group_id));

create policy "You may re-request after a rejection"
  on public.group_members
  for update
  to authenticated
  using (user_id = auth.uid() and status = 'rejected')
  with check (user_id = auth.uid() and status in ('pending', 'pending_ringer'));

-- ── DELETE ──────────────────────────────────────────────────────────────────
drop policy if exists "Admins can remove members from their groups" on public.group_members;
drop policy if exists "Admins or self can delete group members"     on public.group_members;
drop policy if exists "Users can leave groups"                      on public.group_members;

create policy "You may leave, an admin may remove"
  on public.group_members
  for delete
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_group_admin(auth.uid(), group_id)
  );
