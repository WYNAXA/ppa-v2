-- ⚠️ ════════════════════════════════════════════════════════════════════════
-- DEPRECATED — DO NOT RE-RUN. 2026-06-23.
--
-- This one-time reset was applied during early development. It is NOT
-- idempotent: TRUNCATE rating_history + resetting elo_processed=false causes
-- the whole match set to be reprocessed, and each reprocess cycle re-increments
-- profiles.matches_played. Running it repeatedly during dev inflated
-- matches_played for nearly every player (e.g. stored 65 vs ~15 actual),
-- corrupting K-factors and ratings.
--
-- The corruption was repaired on 2026-06-23 via the canonical rebuild
-- (rebuild-ratings edge function → atomic SQL), which reconstructs all ratings
-- deterministically from verified match_results. That rebuild is the ONLY
-- approved way to recompute ratings. process-elo (apply_match_elo RPC) handles
-- incremental updates atomically and idempotently.
--
-- If you ever need to fully recompute ratings, use rebuild-ratings — NEVER this.
-- This file is retained for migration history only and must not be re-executed.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Reset all rating data and re-seed BS3 from Playtomic levels ─────────────
-- This is intentionally destructive: legacy rating_history is 0-100 era data,
-- and all internal_ranking values were computed by the broken legacy function.

-- 1. Wipe rating history (legacy 0-100 era data, useless)
TRUNCATE rating_history;

-- 2. Reset all profiles to default 1300
UPDATE profiles
SET internal_ranking = 1300,
    matches_played = 0,
    is_provisional = true,
    peak_elo = NULL,
    peak_elo_date = NULL;

-- 3. Reset match_results processing flags (hygiene — prevents partial state)
UPDATE match_results
SET elo_processed = false;

-- 4. Reset league_standings (season_points were calculated with broken formula)
UPDATE league_standings
SET ranking_points = 0,
    wins = 0,
    losses = 0,
    draws = 0,
    matches_played = 0;

-- 5. Re-seed 18 BS3 players from Playtomic levels
-- Formula: 1500 + (playtomic_level - 2.5) * 270, clamped to [600, 2500]
UPDATE profiles
SET internal_ranking = GREATEST(600, LEAST(2500,
    ROUND(1500 + (playtomic_level - 2.5) * 270)
))
WHERE playtomic_level IS NOT NULL
  AND id IN (
    '80a9cb54-cec2-45a4-a67f-aea27f5f7d36', -- Christian
    '8297d4f6-c6a2-4a8c-8dbe-80c6c13c7ebd', -- Liam
    '0b513cab-55d5-4105-8e5a-263b99cbeaa3', -- James
    '2b090569-5cc1-4547-af52-621b023eb02c', -- Dan Collin
    'f6014e11-6384-4afb-939c-d4b0f68a6be7', -- Simon
    '0c0cbf4b-e26d-46c4-9972-8333efef6a3a', -- Kier Cox
    '522a89ff-12ce-4956-8c3e-e619420cfe07', -- Ben
    'bccb4558-db79-4831-bdaf-bea0673237ff', -- Tim
    'f61d6725-9c71-4a81-af11-8d6a7fd3d058', -- Ramzi
    '971bec06-0b67-4e90-8e00-eae253f6cc55', -- Phil M
    '828cecfe-8f58-414b-92b7-99dd0e0c954d', -- Phil S
    '8a84be55-6343-4fe5-83f7-c91f81f864dc', -- Catherine
    '7d4f2ee5-4e7a-4c7b-b200-24ecfa9e1c75', -- Kieran
    'fbad423c-0288-472a-a966-20d8d64044df', -- Ally
    '0a75573c-e4e0-409b-a991-3a23bd219e85', -- Sam
    '14a54d40-7251-45a0-8398-77fa03bb884e', -- Andy
    'b8e0790f-70ff-4a16-8524-5164ec3144d9', -- Daniel Shuker
    'ab9105c5-ab15-4353-9c0c-e0f9cfc62237'  -- Drew
  );
