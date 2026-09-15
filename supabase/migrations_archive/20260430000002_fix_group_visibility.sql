-- Fix groups that were created with visibility='public' before the type was corrected to 'open'
-- The discover query already handles both 'public' and 'open' but the DB may reject 'public'
-- if there's a check constraint. Migrate all 'public' → 'open'.
UPDATE groups SET visibility = 'open' WHERE visibility = 'public';

-- Also ensure no check constraint blocks 'open' or 'public'
ALTER TABLE groups DROP CONSTRAINT IF EXISTS groups_visibility_check;
ALTER TABLE groups ADD CONSTRAINT groups_visibility_check
  CHECK (visibility IN ('open', 'private', 'public'));
