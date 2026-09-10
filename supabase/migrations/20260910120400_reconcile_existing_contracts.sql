-- === FILE: supabase/migrations/20260910120400_reconcile_existing_contracts.sql ===
--
-- Reconcile the 2 pre-existing contracts under the regional model.
-- BOTH turned out to be founding partners (Hub Pro, monthly fee fully waived to 0,
-- commission 2.25%), so both are bespoke waivers rather than model-derived prices.
-- Their accepted_at is NULL, so the acceptance-reset trigger does not fire.
--
-- NOTE: live applied this as two steps (an initial version wrongly re-derived Bandeja
-- to the EUR 160 model price, then a correction restored the EUR 0 founding waiver).
-- This committed file reflects the correct END STATE in one step.

-- GB / The Padel Team Bristol — founding partner (first commercial partner).
update public.venue_contracts set
  currency                   = 'GBP',
  plan_tier                  = 'pro',
  commission_rate_bps        = 225,
  monthly_price_pence        = 0,
  pricing_country_code       = 'GB',
  pricing_band_key           = 'uk',
  reference_court_hour_minor = 3800,
  court_hour_multiple        = null,   -- null = manual/bespoke, not model-driven
  special_terms              = 'Founding partner (first commercial partner): Hub Pro, list GBP 304.00/mo waived to GBP 0.00; commission 2.25%.'
where id = '0dd7cb70-40d5-4c68-92a3-e698d67eb984';

update public.venues set
  currency            = 'GBP',
  plan_tier           = 'pro',
  commission_rate_bps = 225,
  monthly_price_pence = 0,
  is_founding_venue   = true
where id = '237aa440-7f1a-40ea-95b2-5296fbe01a40';

-- IT / Bandeja Padel Club — founding partner (Hub Pro fully credited to EUR 0 for the
-- first 12 months). special_terms already documents the Italian-language deal; left as-is.
update public.venue_contracts set
  currency                   = 'EUR',
  plan_tier                  = 'pro',
  commission_rate_bps        = 225,
  monthly_price_pence        = 0,
  pricing_country_code       = 'IT',
  pricing_band_key           = 'eu_core',
  reference_court_hour_minor = 2000,
  court_hour_multiple        = null    -- null = manual/bespoke, not model-driven
where id = '782eeac1-37ba-4120-a0ba-2459d9c68f7a';

update public.venues set
  currency            = 'EUR',
  plan_tier           = 'pro',
  commission_rate_bps = 225,
  monthly_price_pence = 0
where id = '154f7a25-62bb-4492-8976-da68dcb24f75';
