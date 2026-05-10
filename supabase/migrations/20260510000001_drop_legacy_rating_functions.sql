-- ── Drop legacy rating functions and triggers ──────────────────────────────
-- These functions were applied via SQL Editor (not tracked in migrations).
-- They operate on the old 0-100 scale and are replaced by the process-elo
-- Edge Function (0-3000 scale) + Database Webhook.
--
-- Drop triggers FIRST (they reference the functions).

-- Triggers on match_results
DROP TRIGGER IF EXISTS trigger_league_ranking_on_verify ON match_results;
DROP TRIGGER IF EXISTS trigger_update_wins_losses ON match_results;
DROP TRIGGER IF EXISTS trigger_match_result_verified ON match_results;
DROP TRIGGER IF EXISTS trigger_auto_record_ranking ON match_results;

-- Legacy functions
DROP FUNCTION IF EXISTS update_padel_pals_rankings(uuid);
DROP FUNCTION IF EXISTS update_league_points(uuid);
DROP FUNCTION IF EXISTS handle_match_result_verified();
DROP FUNCTION IF EXISTS check_match_achievements(uuid);
DROP FUNCTION IF EXISTS check_and_award_milestones();
DROP FUNCTION IF EXISTS get_most_improved_players(integer);
DROP FUNCTION IF EXISTS auto_record_ranking_after_match();
