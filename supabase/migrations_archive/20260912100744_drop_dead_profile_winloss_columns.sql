-- Drop dead leaderboard schema: orphaned functions and unused columns.
--
-- WHY this is safe:
--
-- 1. update_leaderboard_stats() and update_player_wins_losses() exist on live
--    but are attached to zero triggers on zero tables (verified against live
--    via pg_trigger across all tables, 2026-09-12 — zero trigger attachments).
--    They are never called by any
--    RPC, edge function, or client code — zero hits across ppa-v2, venue-manager,
--    and ppa-ios.
--
-- 2. Both functions write to columns that NO LONGER EXIST on profiles:
--    total_matches, individual_games_won, individual_games_lost. If either
--    function were ever fired it would throw a "column does not exist" error.
--
-- 3. profiles.total_wins and profiles.total_losses have zero reads and zero
--    writes anywhere in the codebase. No query selects them, no UI renders
--    them, no edge function or RPC touches them. Values on live are stale
--    fossils — e.g. one player stores 14W/3L against 44W/18L actual (from
--    verified match_results).
--
-- 4. These functions exist on live with NO migration file in the repo. This
--    migration corrects the repo/live divergence.
--
-- NOT touched by this migration:
--   - profiles.matches_played — actively used by the ELO K-factor
--     (process-elo, rebuild-ratings), experience tiers (PlayerProfile),
--     is_provisional flag, and MatchStakes preview. It reconciles exactly
--     with rating_history. Leave it alone.
--   - league_standings.matches_played — active league mechanics.
--
-- CASCADE is defensive only. Verified on live 2026-09-12: pg_depend shows zero
-- dependent objects on either function, and zero non-auto dependencies on
-- profiles.total_wins / total_losses (no views, indexes, RLS policies or
-- constraints). Nothing beyond the two functions is dropped.

-- 1. Drop the orphaned functions (and any triggers that call them).
DROP FUNCTION IF EXISTS public.update_leaderboard_stats() CASCADE;
DROP FUNCTION IF EXISTS public.update_player_wins_losses() CASCADE;

-- 2. Drop the dead columns.
ALTER TABLE public.profiles DROP COLUMN IF EXISTS total_wins;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS total_losses;
