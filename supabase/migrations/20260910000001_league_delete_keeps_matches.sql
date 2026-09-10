-- Deleting a league must not destroy the matches people played in it.
--
-- WHAT WAS WRONG
--   matches.league_id was ON DELETE CASCADE. LeagueDetail has a "Delete league"
--   button in its Danger Zone, and the RLS policy is `created_by = auth.uid()`
--   — so the person who set a league up could, in two taps, delete every match
--   played in it.
--
--   The cascade did not stop at matches. It reached match_results, and from
--   there ranking_changes, match_result_votes, chat_channels, match_comments,
--   match_peer_votes, post_match_votes, match_travel and ringer_requests.
--
--   And it left a mess behind it, because rating_history.match_result_id is
--   ON DELETE SET NULL rather than CASCADE. So the rating rows survived as
--   orphans: every affected player kept their ELO and kept a Rating History
--   chart full of movements with no match behind any of them.
--
--   Measured on 'Summer Padel League Test' (since renamed) before this
--   migration: one click would have taken 27 matches, 25 results and 88 rating
--   history rows belonging to 19 real players, across five weeks of play.
--
-- WHY SET NULL IS THE RIGHT RULE
--   A league is an organising layer over matches, not their owner. The match
--   happened; four people were there; it moved their ratings. Removing the
--   table it was scored in does not un-play it. Every other league-scoped
--   child — standings, members, invitations, teams, adjustments, jersey
--   history — has no meaning without the league and correctly stays CASCADE.
--   matches.league_id is nullable already, so the match simply stops belonging
--   to a league.
--
-- THE ONE THING THIS DOES NOT SOLVE
--   Fixtures a league generated but nobody played will survive as unattached
--   scheduled matches. That is the right default — a destructive default is
--   never the safe one — but the league-deletion flow should offer to clear
--   unplayed fixtures at the same time. That is app work, not schema work, and
--   it is noted in DESIGN.md.

alter table public.matches
  drop constraint if exists matches_league_id_fkey;

alter table public.matches
  add constraint matches_league_id_fkey
  foreign key (league_id)
  references public.leagues (id)
  on delete set null;
