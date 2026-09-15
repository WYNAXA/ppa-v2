-- A private group is private.
--
-- ROOT CAUSE
--   public.groups had TWO permissive SELECT policies, both
--   TO authenticated USING (true):
--     "Authenticated can read groups"
--     "Users can view all groups"
--   Permissive policies OR together, so every signed-in user could read every
--   row of every group. Six of the eight groups in the database are private.
--   Leaked with them: description, rules, city, banner, admin_id — and
--   invite_code, the join secret.
--
--   It surfaced in the client too, not only in theory:
--     pages/people/AllGroupsPage.tsx:40  lists groups with NO visibility
--       filter — the browse directory showed all six private groups to
--       everyone. "open_to_join" is an optional filter the user must choose.
--     pages/Search.tsx:88  searches groups by name with no visibility filter,
--       so typing a private group's name found it.
--
--   Both of those are now fixed by this migration without touching the
--   client, because the rows stop being returned at all. Filtering them in
--   the client would have been the display patch: the API would still hand
--   them over to anyone who asked directly.
--
--   This is the third table with the same defect. leagues was fixed in
--   20260913115439, group_members in 20260914132741. Same shape each time:
--   a scoped policy written, then a USING(true) policy added beside it that
--   made the scoped one dead code.
--
-- WHY IT IS SAFE TO SCOPE THIS NOW — checked against every read in src/
--   There is NO join-by-invite-code route in the app. invite_code appears in
--   exactly two places: a type declaration, and GroupDetail.tsx:90, which
--   loads the group you are already looking at. Nothing resolves a code into
--   a membership. So scoping this policy cannot break an invite flow, because
--   there isn't one. (That it is dead weight in the client while being the
--   most sensitive column on the table is noted, not fixed here.)
--
--   Every other read passes the new policy:
--     WeekMatchView.tsx:292,361   groups for matches you can already see
--     MatchDetail.tsx:2008        admin_id of your match's group
--     useIsGroupAdmin.ts:29       the group you are viewing
--     InviteToGroupSheet.tsx:37   .eq('admin_id', userId) — your own groups
--     CreateGroupSheet.tsx:69     insert; the creator is admin_id = auth.uid()
--     GroupDetail.tsx:90          member or admin; a non-member now gets null
--                                 and hits the existing "group not found"
--                                 screen at GroupDetail.tsx:1863
--   No read in src/ uses select('*') on groups, so no read breaks on columns.
--
-- WHY A SECURITY DEFINER HELPER
--   A policy on groups that selects from group_members would be evaluated
--   against group_members' own policies, which call is_group_admin(), which
--   selects from groups — 42P17 infinite recursion. That is not hypothetical:
--   it is what 20260914132834 exists to fix. can_see_group() runs as its
--   owner, so the inner reads do not re-enter either policy.
--
-- PENDING MEMBERS ARE INCLUDED, deliberately
--   is_group_member() counts only 'approved' and 'ringer'. Someone who has
--   requested to join a private group must still be able to see the group
--   they are waiting on, or the pending state has nothing to render. So
--   can_see_group() accepts pending and pending_ringer as well. 'rejected' is
--   excluded: a declined request does not earn continued visibility.

create or replace function public.can_see_group(_group_id uuid, _user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from public.groups g
     where g.id = _group_id
       and (
         g.visibility in ('public', 'open')
         or g.admin_id = _user_id
       )
  )
  or exists (
    select 1 from public.group_members gm
     where gm.group_id = _group_id
       and gm.user_id  = _user_id
       and gm.status in ('approved', 'ringer', 'pending', 'pending_ringer')
  );
$function$;

grant execute on function public.can_see_group(uuid, uuid) to authenticated;

drop policy if exists "Authenticated can read groups" on public.groups;
drop policy if exists "Users can view all groups"     on public.groups;

create policy "You see public groups and your own"
  on public.groups
  for select
  to authenticated
  using (public.can_see_group(id, auth.uid()));

-- While here: groups had duplicate INSERT and UPDATE policies too, saying the
-- same thing twice. A duplicate policy is never harmless — it is a second
-- place the rule can drift, which is exactly how the USING(true) pair above
-- came to exist.
drop policy if exists "Authenticated can create groups" on public.groups;
drop policy if exists "Users can create groups"         on public.groups;

create policy "You create groups you administer"
  on public.groups
  for insert
  to authenticated
  with check (admin_id = auth.uid());

drop policy if exists "Admin can update group"         on public.groups;
drop policy if exists "Admins can update their groups" on public.groups;

create policy "An admin updates their own group"
  on public.groups
  for update
  to authenticated
  using (admin_id = auth.uid())
  with check (admin_id = auth.uid());

drop policy if exists "Admin can delete group"          on public.groups;
drop policy if exists "Admins can delete their groups"  on public.groups;

create policy "An admin deletes their own group"
  on public.groups
  for delete
  to authenticated
  using (
    admin_id = auth.uid()
    or public.is_group_admin(auth.uid(), id)
  );
