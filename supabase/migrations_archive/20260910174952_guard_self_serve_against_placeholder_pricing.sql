-- Task 5b, server side. country_pricing.confidence is 'data_backed' or 'placeholder';
-- for the 8 placeholder countries (IN, AR, MX, SA, ZA, DK, NO, FI) the reference court
-- price is a guess from <=6 venues, and an unmapped country falls back to the
-- global_default band, which is a guess by definition.
--
-- Blocking this in the picker alone would be a display patch: create_standard_contract
-- is callable directly by any authenticated owner via PostgREST, so the guard has to
-- live where the price is derived. Core (court_hour_multiple = 0) stays available
-- everywhere -- it is free and its commission does not depend on the reference price.
--
-- Fix class: root-cause. Same guard, same error name, as change_plan_contract.

create or replace function public.create_standard_contract(p_venue_id uuid, p_plan_key text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid         uuid := auth.uid();
  v_plan        public.standard_plans;
  v_cc          text;
  v_price       record;
  v_monthly     integer;
  v_contract_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  if not exists (
    select 1 from public.venue_users vu
     where vu.venue_id = p_venue_id
       and vu.user_id  = v_uid
       and vu.role     = 'owner'
       and vu.status   = 'active'
  ) then raise exception 'not_venue_owner'; end if;

  if exists (select 1 from public.venue_contracts
              where venue_id = p_venue_id and status = 'active')
  then raise exception 'active_contract_exists'; end if;

  select * into v_plan from public.standard_plans where key = p_plan_key;
  if not found then raise exception 'invalid_plan'; end if;

  select pv.country_code into v_cc
    from public.padel_venues pv
   where pv.venues_id = p_venue_id
   limit 1;

  select * into v_price from public.resolve_country_pricing(v_cc);

  if v_plan.court_hour_multiple > 0 and v_price.confidence is distinct from 'data_backed' then
    raise exception 'pricing_unavailable_in_country';
  end if;

  if v_plan.court_hour_multiple = 0 then
    v_monthly := 0;
  else
    v_monthly := round(v_plan.court_hour_multiple * v_price.reference_court_hour_minor)::int;
    if v_price.min_fee_minor is not null then
      v_monthly := greatest(v_monthly, v_price.min_fee_minor);
    end if;
  end if;

  insert into public.venue_contracts (
    venue_id, status,
    currency, plan_tier, commission_rate_bps,
    monthly_price_pence, monthly_credit_pence,
    auto_renew, notice_period_days, special_terms,
    start_date, signed_by, signed_at,
    pricing_country_code, pricing_band_key, reference_court_hour_minor, court_hour_multiple
  ) values (
    p_venue_id, 'active',
    v_price.currency, p_plan_key, v_plan.commission_rate_bps,
    v_monthly, 0,
    v_plan.auto_renew, v_plan.notice_period_days, v_plan.special_terms,
    current_date, v_uid, now(),
    v_cc, v_price.band_key, v_price.reference_court_hour_minor, v_plan.court_hour_multiple
  ) returning id into v_contract_id;

  update public.venues set
    commission_rate_bps = v_plan.commission_rate_bps,
    plan_tier           = p_plan_key,
    monthly_price_pence = v_monthly,
    currency            = v_price.currency
  where id = p_venue_id;

  return jsonb_build_object(
    'contract_id', v_contract_id,
    'plan',        p_plan_key,
    'currency',    v_price.currency,
    'monthly_price_minor', v_monthly,
    'pricing_country', v_cc,
    'pricing_band', v_price.band_key,
    'pricing_confidence', v_price.confidence
  );
end $function$;
