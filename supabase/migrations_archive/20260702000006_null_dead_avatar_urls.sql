-- Null avatar_url values pointing at the retired Supabase project
-- (hbuhwfcnyfjznuvtxzeo), whose storage is gone (HTTP 000). Those photos are
-- unrecoverable; nulling lets affected users fall back to their initials avatar
-- and re-upload. Scoped to the dead domain so no live URL is touched. Idempotent.
UPDATE public.profiles
  SET avatar_url = NULL
  WHERE avatar_url LIKE '%hbuhwfcnyfjznuvtxzeo%';
