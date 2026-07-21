-- ════════════════════════════════════════════════════════════════════════════
-- Backfill: align match_results.is_friendly with parent match.match_type.
--
-- CANONICAL RULE: is_friendly = (match.match_type = 'friendly').
-- This corrects rows where the two disagree.
--
-- Known inconsistencies:
--   4 'friendly' matches have is_friendly=false → their results moved
--     career ELO when they should not have. ELO REVERSAL IS NOT DONE
--     HERE — flag as a separate decision for Christian.
--   5 'group' matches have is_friendly=true → their results were
--     skipped for ELO when they probably should not have been.
--
-- FOR CHRISTIAN TO RUN — do NOT apply automatically.
-- ════════════════════════════════════════════════════════════════════════════

UPDATE public.match_results mr
SET is_friendly = (m.match_type = 'friendly')
FROM public.matches m
WHERE mr.match_id = m.id
  AND mr.is_friendly IS DISTINCT FROM (m.match_type = 'friendly');
