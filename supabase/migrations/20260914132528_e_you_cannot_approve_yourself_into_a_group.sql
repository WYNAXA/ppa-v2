-- You cannot approve yourself into a group.
--
-- ROOT CAUSE — live privilege escalation, found 14 Sep while reading the RLS
-- behind the Discover "groups near you" count.
--
--   group_members had TWO permissive INSERT policies. Permissive policies OR
--   together, so the loosest one decides:
--
--     "Users can join groups"           {public}         WITH CHECK (auth.uid() = user_id)
--     "Users can request to join groups" {authenticated} WITH CHECK (user_id = auth.uid()
--                                          AND status IN ('pending','approved','pending_ringer'))
--
--   Neither one mentions the GROUP. The first does not constrain `status` at
--   all. So any signed-in user could insert themselves into ANY group — a
--   private one they had never heard of — with status = 'approved'. No invite
--   code, no request, no admin involved.
--
--   What that unlocks, following the existing policies from there:
--     group_members "Members can view group members" -> every member of that
--       private group, because you are now an approved member of it.
--     matches "Group members can view group matches" -> every match that
--       group has ever played.
--     groups SELECT is USING(true) for authenticated anyway, which hands over
--       the group's invite_code as well.
--
--   Six of the eight groups in the database are private. This was reachable by
--   anyone with an account.
--
-- FIX CLASS: root-cause. Filtering unexpected members out in the client is the
--   display patch and changes nothing about what the API allows. The hole is
--   in the policy, so the policy is what changes.
--
-- THE RULE, stated once
--   You may insert only yourself, only into a group that accepts the kind of
--   membership you are asking for, and you may not choose your own status:
--     'approved'       only if you are the group's admin (creating your own
--                      group), or the group auto-approves requests.
--     'pending'        if the group allows join requests.
--     'pending_ringer' if the group allows ringers.
--   Anything else is refused. Promotion from 'pending' to 'approved' stays
--   where it already was: the admins' UPDATE policy.
--
-- BLAST RADIUS — checked against every current row before applying
--   group_members today: 67 approved, 8 rejected, 4 ringer, 1 pending.
--   groups today: allow_join_requests = true on all 8, allow_ringers = true on
--   all 8, so no legitimate join path that works today stops working.
--   Auto-approve is read from BOTH auto_approve_requests (India group) and
--   auto_approve (PPA Founders) because the schema carries both and they
--   disagree per row — that vocabulary sprawl is noted for a later migration
--   and is NOT resolved by guessing here.
--
--   Group creation still works: the creator sets groups.admin_id = auth.uid()
--   (enforced by the groups INSERT policy), and this policy lets that admin
--   insert themselves as 'approved'.

drop policy if exists "Users can join groups" on public.group_members;
drop policy if exists "Users can request to join groups" on public.group_members;

create policy "A member joins on the group's terms"
  on public.group_members
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
        from public.groups g
       where g.id = group_members.group_id
         and (
           -- the admin seeding their own group
           (group_members.status = 'approved' and g.admin_id = auth.uid())
           -- a group that approves requests automatically
           or (group_members.status = 'approved'
               and (coalesce(g.auto_approve_requests, false) or coalesce(g.auto_approve, false))
               and coalesce(g.allow_join_requests, false))
           -- an ordinary request, waiting on an admin
           or (group_members.status = 'pending'
               and coalesce(g.allow_join_requests, false))
           -- a ringer offer, waiting on an admin
           or (group_members.status = 'pending_ringer'
               and coalesce(g.allow_ringers, false))
         )
    )
  );
