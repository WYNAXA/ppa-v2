-- Close three dormant guest tables that any signed-in user could rewrite.
--
-- WHAT WAS WRONG
--   `guest_players`, `guest_player_ratings` and `match_guest_players` each
--   carried one policy for **ALL** commands with `USING (auth.uid() IS NOT
--   NULL)`. Select, insert, update and delete, for anybody with an account —
--   including deleting rows about people who are not users and never agreed to
--   anything.
--
-- WHY THIS IS A REVOKE AND NOT A REWRITE
--   These tables are dormant. Checked, not assumed:
--     · No reference anywhere in `src/` or `supabase/functions/`.
--     · No reference in the body of any database function (`pg_proc.prosrc`).
--     · Last write to all three: 2 May 2026. The live path is
--       `match_guest_invites`, still being written on 10 August.
--
--   Writing an elaborate ownership model for tables nothing reads would be
--   inventing a contract nobody signed. Dropping the policy leaves RLS enabled
--   with no policy, which denies every non-service-role request — the correct
--   posture for a dormant table. `service_role` bypasses RLS, so migrations,
--   backups and any future rehabilitation are unaffected.
--
-- WHY NOT DELETE THE TABLES
--   110 rows across the three, and they are the only record of who actually
--   played in 35 historical matches. Nothing displays that today, but deleting
--   it is irreversible and closing the access is not. If they are genuinely
--   finished with, that is a separate and deliberate decision.
--
-- A CORRECTION TO THE AUDIT THAT PRODUCED THIS
--   The RLS audit described these rows as carrying "names, emails and phone
--   numbers". The columns exist; every one of them is NULL. The personal data
--   here is names only. The write and delete exposure was real; the sensitivity
--   was overstated.

drop policy if exists "Authenticated users can manage guest players" on public.guest_players;
drop policy if exists "Authenticated users can manage guest ratings" on public.guest_player_ratings;
drop policy if exists "Authenticated users can manage match guest players" on public.match_guest_players;
