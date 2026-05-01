-- Allow 'ringer' and 'banned' as valid group_members status values
ALTER TABLE group_members DROP CONSTRAINT IF EXISTS group_members_status_check;
ALTER TABLE group_members ADD CONSTRAINT group_members_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'invited', 'ringer', 'banned'));

-- Leagues: add prizes column
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS prizes text;
