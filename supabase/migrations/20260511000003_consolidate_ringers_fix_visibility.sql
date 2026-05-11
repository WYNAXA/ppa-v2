-- ── Fix is_group_member to include ringers ──────────────────────────────────
-- Previously only returned true for status='approved', causing RLS to hide
-- group data from ringers.

CREATE OR REPLACE FUNCTION public.is_group_member(_user_id uuid, _group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM group_members
    WHERE user_id = _user_id
    AND group_id = _group_id
    AND status IN ('approved', 'ringer')
  );
$function$;

-- ── Migrate approved group_ringers to group_members ─────────────────────────
-- Only approved entries (skip 2 pending rows from Nov 2025 — stale).
-- ON CONFLICT skips users who already exist in group_members for that group.

INSERT INTO group_members (group_id, user_id, role, status, joined_at)
SELECT gr.group_id, gr.user_id, 'member', 'ringer', gr.created_at
FROM group_ringers gr
WHERE gr.status = 'approved'
ON CONFLICT (group_id, user_id) DO NOTHING;

-- ── Drop legacy group_ringers table ─────────────────────────────────────────
DROP TABLE IF EXISTS group_ringers;
