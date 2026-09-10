-- A group admin can settle a disputed result in their own group.
--
-- WHY
--   `admin_review` told players "a group admin will resolve this" and no code
--   anywhere could. Four results have been stuck in `disputed` or
--   `admin_review` since March–May. Because ELO is applied by the
--   `dispatch_match_result_to_elo` trigger, which fires only on the transition
--   to `verification_status = 'verified'`, not one of them ever counted: four
--   matches are missing from the ratings of everyone who played them.
--
--   MatchDetail now gives a group admin two buttons — keep the submitted score,
--   or take the proposed one — and both write `verified`, so the existing
--   trigger applies the rating. No second ELO path.
--
-- WHY THIS POLICY IS NEEDED FOR THAT TO WORK
--   The only UPDATE policy on match_results is "Players can update match
--   results", which requires `auth.uid()` to be in the match or on one of the
--   teams. A group admin who did not play in the match fails it — which is
--   precisely the person the resolution flow is for, so the button would have
--   failed for its intended user and looked like another silent save failure.
--
-- SCOPE
--   Deliberately narrow: the admin of the group the match belongs to, and
--   nothing else. It does not grant platform-wide powers, it does not apply to
--   matches with no group, and it mirrors the authority group admins already
--   have over their own fixtures through "Admins can void completed matches".
--
--   WITH CHECK repeats the USING expression so an admin cannot move a result
--   out of their own group on the way through.

create policy "Group admins can settle results in their group"
  on public.match_results
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.matches m
      join public.groups g on g.id = m.group_id
      where m.id = match_results.match_id
        and (
          g.admin_id = auth.uid()
          or exists (
            select 1 from public.group_members gm
            where gm.group_id = g.id
              and gm.user_id = auth.uid()
              and gm.role = 'admin'
              and gm.status = 'approved'
          )
        )
    )
  )
  with check (
    exists (
      select 1
      from public.matches m
      join public.groups g on g.id = m.group_id
      where m.id = match_results.match_id
        and (
          g.admin_id = auth.uid()
          or exists (
            select 1 from public.group_members gm
            where gm.group_id = g.id
              and gm.user_id = auth.uid()
              and gm.role = 'admin'
              and gm.status = 'approved'
          )
        )
    )
  );
