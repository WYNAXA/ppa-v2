-- === FILE: supabase/migrations/20260910120900_backfill_existing_founder_seq.sql ===

update public.venue_contracts set founder_seq = 1
  where id = '0dd7cb70-40d5-4c68-92a3-e698d67eb984' and founder_seq is null;  -- GB
update public.venue_contracts set founder_seq = 1
  where id = '782eeac1-37ba-4120-a0ba-2459d9c68f7a' and founder_seq is null;  -- IT
