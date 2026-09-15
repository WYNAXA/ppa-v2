-- Point both contract-writing RPCs at the approved price list instead of the
-- court-hour formula. The court-hour figures are still snapshotted onto the contract
-- (pricing_band_key, reference_court_hour_minor, court_hour_multiple) because they are
-- useful context for later analysis -- they just no longer decide what anyone pays.
--
-- pricing_unavailable_in_country now means "no approved price for this country and
-- plan", which is a fact rather than a confidence judgement.
--
-- Fix class: root-cause.

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
  v_listed      public.country_plan_prices;
  v_currency    text;
  v_monthly     integer;
  v_contract_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  if not exists (
    select 1 from public.venue_users vu
     where vu.venue_id = p_venue_id and vu.user_id = v_uid
       and vu.role = 'owner' and vu.status = 'active'
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
  select * into v_listed
    from public.country_plan_prices
   where country_code = v_cc and plan_key = p_plan_key;

  if v_plan.court_hour_multiple = 0 then
    v_monthly  := 0;
    v_currency := coalesce(v_listed.currency,
                           (select currency from public.country_plan_prices
                             where country_code = v_cc limit 1),
                           v_price.currency);
  else
    if v_listed.country_code is null then
      raise exception 'pricing_unavailable_in_country';
    end if;
    v_monthly  := v_listed.monthly_price_minor;
    v_currency := v_listed.currency;
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
    v_currency, p_plan_key, v_plan.commission_rate_bps,
    v_monthly, 0,
    v_plan.auto_renew, v_plan.notice_period_days, v_plan.special_terms,
    current_date, v_uid, now(),
    v_cc, v_price.band_key, v_price.reference_court_hour_minor, v_plan.court_hour_multiple
  ) returning id into v_contract_id;

  update public.venues set
    commission_rate_bps = v_plan.commission_rate_bps,
    plan_tier           = p_plan_key,
    monthly_price_pence = v_monthly,
    currency            = v_currency
  where id = p_venue_id;

  return jsonb_build_object(
    'contract_id', v_contract_id,
    'plan', p_plan_key,
    'currency', v_currency,
    'monthly_price_minor', v_monthly,
    'pricing_country', v_cc
  );
end $function$;

create or replace function public.change_plan_contract(p_venue_id uuid, p_plan_key text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid         uuid := auth.uid();
  v_old         public.venue_contracts;
  v_plan        public.standard_plans;
  v_cc          text;
  v_price       record;
  v_listed      public.country_plan_prices;
  v_currency    text;
  v_monthly     integer;
  v_contract_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  if not exists (
    select 1 from public.venue_users vu
     where vu.venue_id = p_venue_id and vu.user_id = v_uid
       and vu.role = 'owner' and vu.status = 'active'
  ) then raise exception 'not_venue_owner'; end if;

  select * into v_old
    from public.venue_contracts
   where venue_id = p_venue_id and status = 'active'
     for update;
  if not found then raise exception 'no_active_contract'; end if;

  if v_old.founder_seq is not null then
    raise exception 'founder_contract_admin_only';
  end if;

  select * into v_plan from public.standard_plans where key = p_plan_key;
  if not found then raise exception 'invalid_plan'; end if;

  if v_old.plan_tier = p_plan_key then raise exception 'plan_unchanged'; end if;

  select pv.country_code into v_cc
    from public.padel_venues pv
   where pv.venues_id = p_venue_id
   limit 1;

  select * into v_price from public.resolve_country_pricing(v_cc);
  select * into v_listed
    from public.country_plan_prices
   where country_code = v_cc and plan_key = p_plan_key;

  if v_plan.court_hour_multiple = 0 then
    v_monthly  := 0;
    v_currency := coalesce(v_listed.currency, v_old.currency, v_price.currency);
  else
    if v_listed.country_code is null then
      raise exception 'pricing_unavailable_in_country';
    end if;
    v_monthly  := v_listed.monthly_price_minor;
    v_currency := v_listed.currency;
  end if;

  update public.venue_contracts
     set status     = 'superseded',
         updated_at = now(),
         notes      = concat_ws(E'\n', nullif(notes, ''),
                        format('Superseded %s: plan changed %s -> %s by %s',
                               current_date, v_old.plan_tier, p_plan_key, v_uid))
   where id = v_old.id;

  insert into public.venue_contracts (
    venue_id, status,
    signatory_name, signatory_role, signatory_email,
    company_name, company_registration, vat_number,
    billing_contact_name, billing_contact_email,
    currency, plan_tier, commission_rate_bps,
    monthly_price_pence, monthly_credit_pence,
    subscription_free_until,
    auto_renew, notice_period_days, special_terms,
    start_date, signed_by, signed_at, created_by,
    pricing_country_code, pricing_band_key, reference_court_hour_minor, court_hour_multiple
  ) values (
    p_venue_id, 'active',
    v_old.signatory_name, v_old.signatory_role, v_old.signatory_email,
    v_old.company_name, v_old.company_registration, v_old.vat_number,
    v_old.billing_contact_name, v_old.billing_contact_email,
    v_currency, p_plan_key, v_plan.commission_rate_bps,
    v_monthly, 0,
    v_old.subscription_free_until,
    v_plan.auto_renew, v_plan.notice_period_days, v_plan.special_terms,
    current_date, v_uid, now(), v_uid,
    v_cc, v_price.band_key, v_price.reference_court_hour_minor, v_plan.court_hour_multiple
  ) returning id into v_contract_id;

  update public.venues set
    commission_rate_bps = v_plan.commission_rate_bps,
    plan_tier           = p_plan_key,
    monthly_price_pence = v_monthly,
    currency            = v_currency
  where id = p_venue_id;

  return jsonb_build_object(
    'contract_id', v_contract_id,
    'superseded_contract_id', v_old.id,
    'previous_plan', v_old.plan_tier,
    'plan', p_plan_key,
    'currency', v_currency,
    'monthly_price_minor', v_monthly,
    'pricing_country', v_cc
  );
end $function$;
