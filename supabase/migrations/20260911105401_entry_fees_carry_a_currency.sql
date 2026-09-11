-- events.entry_fee_pence and leagues.entry_fee_pence stored an amount with no currency
-- anywhere to say what it was denominated in, so both screens printed a pound sign:
--
--   AllEventsPage.tsx:175   £{((r.pricePence ?? 0) / 100).toFixed(2)}
--   LeagueDiscovery.tsx:56  return `£${(pence / 100).toFixed(2)}`
--
-- Fixing only the components was impossible: there was no currency to read. Venue
-- events and coaching sessions already carry one; these two did not, which is the
-- actual inconsistency.
--
-- No backfill is needed or possible: zero events and zero leagues have ever had a
-- non-zero entry fee, and neither table has a venue or country to derive one from.
-- The column is nullable, and the UI renders an amount with no currency as a dash
-- rather than guessing.
--
-- FOLLOW-UP, deliberately not done here: the create-league and create-event flows do
-- not yet ask for a currency. Until they do, any fee set there will display as a dash.
-- That is the honest outcome -- better than confidently showing the wrong symbol --
-- but it does mean the create UI is the next piece of this, not an optional extra.
--
-- Fix class: root-cause (missing data, not a display patch).

alter table public.events  add column if not exists currency text;
alter table public.leagues add column if not exists currency text;

comment on column public.events.currency is
  'ISO-4217 code for entry_fee_pence. Null means unknown — display as a dash, never assume GBP.';
comment on column public.leagues.currency is
  'ISO-4217 code for entry_fee_pence. Null means unknown — display as a dash, never assume GBP.';
