-- Gap introduced in 20260910184726: country_plan_prices was created with a read
-- policy only. It is now the table that decides what every venue pays, and there was
-- no way for a platform admin to change a price without a migration. Matches the
-- policy shape already used by founder_programs, country_pricing and pricing_bands.
--
-- The read policy stays open to anon/authenticated: preview_standard_pricing is
-- SECURITY DEFINER so it does not depend on this, but an owner reading their own
-- plan options directly is harmless -- these are published list prices, not secrets.
--
-- Fix class: root-cause (missing capability, not a workaround).

drop policy if exists country_plan_prices_admin_write on public.country_plan_prices;
create policy country_plan_prices_admin_write on public.country_plan_prices
  for all to authenticated
  using (exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid()))
  with check (exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid()));
