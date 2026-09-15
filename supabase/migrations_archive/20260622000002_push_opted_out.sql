-- ── Push opt-out preference ──────────────────────────────────────────────────
-- Single source of truth for push notification delivery across OneSignal
-- (primary) and Web Push (secondary).
--
-- Run this in the Supabase SQL Editor BEFORE deploying the updated
-- edge functions and frontend.
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS push_opted_out boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN profiles.push_opted_out IS
  'When true, ALL push channels (OneSignal + Web Push) skip this user. '
  'Controlled by the You-page toggle and onboarding consent.';
