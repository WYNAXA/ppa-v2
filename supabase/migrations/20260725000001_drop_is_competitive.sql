-- ══════════════════════════════════════════════════════════════════════════════
-- Drop matches.is_competitive
--
-- Vestigial boolean superseded by matches.match_type
-- ('competitive' | 'casual' | 'friendly' | legacy 'group'). Nothing in the
-- frontend or any DB function/trigger read is_competitive — verified by grep
-- and pg_proc scan. It held a stale default (false) on almost all rows and
-- disagreed with match_type where set (e.g. a 'friendly' row flagged true).
--
-- The 18 rows that had is_competitive = true were recorded before dropping;
-- their match_type values (mostly legacy 'group', some 'competitive', one
-- 'friendly') are the source of truth going forward.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE matches DROP COLUMN IF EXISTS is_competitive;
