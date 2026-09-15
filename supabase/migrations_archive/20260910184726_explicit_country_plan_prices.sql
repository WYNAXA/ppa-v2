-- Prices become a set list, not a formula.
--
-- Root cause of the GBP 304 defect: standard_plans.court_hour_multiple (plus 2, pro 8)
-- was reverse-fitted to a pair of published marketing prices, then applied linearly to
-- real local court-hour prices spanning EUR 15 to AED 300. It could never reproduce the
-- published GBP 49 / GBP 179, and it inverted market value -- Spain, the largest padel
-- market, priced lowest at EUR 120. A formula cannot express "EUR 49 and GBP 49 are the
-- same price", because that is a commercial decision, not an arithmetic result.
--
-- reference_court_hour_minor is kept: it is real data and still snapshotted onto each
-- contract for analytics. It simply stops setting the fee.
--
-- Availability is now "has this country an approved price for this plan" instead of
-- "is the court-hour figure data_backed". Same guard, better question -- it also fixes
-- Finland, a Eurozone country that was blocked only because its court-hour price was a
-- guess, when its price is simply EUR 49 / EUR 179 like every other EUR market.
--
-- Fix class: root-cause.

create table if not exists public.country_plan_prices (
  country_code        text        not null,
  plan_key            text        not null references public.standard_plans(key),
  currency            text        not null,
  monthly_price_minor integer     not null check (monthly_price_minor >= 0),
  updated_at          timestamptz not null default now(),
  primary key (country_code, plan_key)
);

alter table public.country_plan_prices enable row level security;

drop policy if exists country_plan_prices_read on public.country_plan_prices;
create policy country_plan_prices_read on public.country_plan_prices
  for select to anon, authenticated using (true);

-- Tier 1 - parity. The same number in three currencies, by decision.
insert into public.country_plan_prices (country_code, plan_key, currency, monthly_price_minor) values
  ('GB','core','GBP',0), ('GB','plus','GBP',4900), ('GB','pro','GBP',17900),
  ('US','core','USD',0), ('US','plus','USD',4900), ('US','pro','USD',17900),
  ('IE','core','EUR',0), ('IE','plus','EUR',4900), ('IE','pro','EUR',17900),
  ('DE','core','EUR',0), ('DE','plus','EUR',4900), ('DE','pro','EUR',17900),
  ('FR','core','EUR',0), ('FR','plus','EUR',4900), ('FR','pro','EUR',17900),
  ('NL','core','EUR',0), ('NL','plus','EUR',4900), ('NL','pro','EUR',17900),
  ('IT','core','EUR',0), ('IT','plus','EUR',4900), ('IT','pro','EUR',17900),
  ('ES','core','EUR',0), ('ES','plus','EUR',4900), ('ES','pro','EUR',17900),
  ('PT','core','EUR',0), ('PT','plus','EUR',4900), ('PT','pro','EUR',17900),
  ('FI','core','EUR',0), ('FI','plus','EUR',4900), ('FI','pro','EUR',17900),
-- Tier 2 - converted to a round local price point, no uplift for expensive markets.
  ('SE','core','SEK',0), ('SE','plus','SEK',54900),  ('SE','pro','SEK',199000),
  ('NO','core','NOK',0), ('NO','plus','NOK',59000),  ('NO','pro','NOK',209000),
  ('DK','core','DKK',0), ('DK','plus','DKK',36900),  ('DK','pro','DKK',133900),
  ('AE','core','AED',0), ('AE','plus','AED',19900),  ('AE','pro','AED',74900),
  ('SA','core','SAR',0), ('SA','plus','SAR',19900),  ('SA','pro','SAR',74900),
-- Tier 3 - cost-of-living adjusted, roughly 40-55% of base.
  ('BR','core','BRL',0), ('BR','plus','BRL',14900),  ('BR','pro','BRL',54900),
  ('MX','core','MXN',0), ('MX','plus','MXN',49900),  ('MX','pro','MXN',179000),
  ('ZA','core','ZAR',0), ('ZA','plus','ZAR',49900),  ('ZA','pro','ZAR',179000),
  ('IN','core','INR',0), ('IN','plus','INR',199900), ('IN','pro','INR',699900)
-- Argentina is deliberately absent: ARS moves too fast for a fixed price point, so paid
-- plans block there with pricing_unavailable_in_country until a decision is made.
on conflict (country_code, plan_key) do update
  set currency = excluded.currency,
      monthly_price_minor = excluded.monthly_price_minor,
      updated_at = now();

-- preview_standard_pricing: report the approved price and whether the plan is sellable.
drop function if exists public.preview_standard_pricing(uuid);

create function public.preview_standard_pricing(p_venue_id uuid)
returns table(
  plan_key text,
  name text,
  currency text,
  monthly_price_minor integer,
  commission_rate_bps integer,
  is_available boolean,
  pricing_country_code text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_cc  text;
  v_cur text;
begin
  select pv.country_code into v_cc
    from public.padel_venues pv
   where pv.venues_id = p_venue_id
   limit 1;

  -- The country's own currency if it has approved prices; otherwise the resolver's,
  -- so a Core-only venue in an unpriced country still displays coherently.
  select cpp.currency into v_cur
    from public.country_plan_prices cpp
   where cpp.country_code = v_cc
   limit 1;
  if v_cur is null then
    select rp.currency into v_cur from public.resolve_country_pricing(v_cc) rp;
  end if;

  return query
    select sp.key,
           sp.name,
           coalesce(cpp.currency, v_cur),
           case when sp.court_hour_multiple = 0 then 0 else cpp.monthly_price_minor end,
           sp.commission_rate_bps,
           (sp.court_hour_multiple = 0) or (cpp.country_code is not null),
           v_cc
      from public.standard_plans sp
      left join public.country_plan_prices cpp
        on cpp.country_code = v_cc and cpp.plan_key = sp.key
     order by sp.court_hour_multiple;
end $function$;

grant execute on function public.preview_standard_pricing(uuid) to anon, authenticated, service_role;
