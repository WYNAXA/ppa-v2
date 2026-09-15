-- ════════════════════════════════════════════════════════════════════════════
-- Block 1: Configurable result-entry window (default 7 days = 168 hours)
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO public.app_settings (key, value)
VALUES ('result_window_hours', '168')
ON CONFLICT (key) DO NOTHING;


-- ════════════════════════════════════════════════════════════════════════════
-- Block 2: Admin override columns on match_results
--
-- When a group admin enters a result after the window has closed, we store
-- who did it and why.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.match_results
  ADD COLUMN IF NOT EXISTS admin_override_by     uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS admin_override_reason text;

COMMENT ON COLUMN public.match_results.admin_override_by IS
  'If a group admin entered this result after the result window closed, their user id.';
COMMENT ON COLUMN public.match_results.admin_override_reason IS
  'Required reason when a group admin enters a late result (e.g. "team was away on holiday").';
