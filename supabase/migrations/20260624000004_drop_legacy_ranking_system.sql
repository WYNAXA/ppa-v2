-- ══════════════════════════════════════════════════════════════════════════════
-- Remove the dead legacy 0-100 ranking system, fully replaced by
-- internal_ranking (ELO) + process-elo. No trigger/cron/frontend referenced it.
-- This defuses the "50 pts" landmine (recalculate_all_rankings reset all to 50).
-- ══════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.recalculate_all_rankings();
DROP FUNCTION IF EXISTS public.update_player_rankings();
DROP FUNCTION IF EXISTS public.update_player_rankings_manual(record);

ALTER TABLE profiles
  DROP COLUMN IF EXISTS ranking_points,
  DROP COLUMN IF EXISTS ranking_confidence,
  DROP COLUMN IF EXISTS peak_ranking_points,
  DROP COLUMN IF EXISTS peak_ranking_date;
