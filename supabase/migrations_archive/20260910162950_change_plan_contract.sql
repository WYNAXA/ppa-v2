-- Regional pricing, part 2: make a tier change a real server-side operation.
--
-- Why this exists: create-subscription-checkout now bills the venue's ACTIVE
-- contract (currency + amount, server-side). Before this migration there was no
-- way for an owner to move between standard tiers -- create_standard_contract
-- refuses with active_contract_exists and nothing else changes plan_tier. So the
-- hub's "Choose Hub Pro" button would have billed whatever tier the contract
-- already said, silently. This adds the missing operation instead of hiding the
-- button.
--
-- Fix class: root-cause. No defaults, no swallowing; every refusal raises a
-- named error the UI surfaces verbatim.

-- 1. One active contract per venue, enforced. checkout reads the active contract
--    with .maybeSingle(); without this index two active rows would 500 the money
--    path with a raw PostgREST error.
create unique index if not exists venue_contracts_one_active_per_venue
  on public.venue_contracts (venue_id)
  where status = 'active';

-- 2. 'superseded' is a real outcome and is not 'cancelled'. A cancelled contract
--    means the venue left; a superseded one means it was replaced by a newer
--    contract. Conflating them would corrupt churn reporting later.
alter table public.venue_contracts
  drop constraint if exists venue_contracts_status_check;

alter table public.venue_contracts
  add constraint venue_contracts_status_check
  check (status = any (array['draft'::text, 'active'::text, 'superseded'::text, 'expired'::text, 'cancelled'::text]));

-- 3. Acceptance history belongs to the contract that was accepted. Resetting
--    accepted_at when a contract is superseded/expired/cancelled destroys the
--    record of the signature that was legally given. Only a LIVE contract's
--    acceptance can be invalidated by a change of terms.
create or replace function public.reset_contract_acceptance_on_material_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if OLD.accepted_at is not null and NEW.status = 'active' then
    if (
      NEW.commission_rate_bps  is distinct from OLD.commission_rate_bps  or
      NEW.monthly_price_pence  is distinct from OLD.monthly_price_pence  or
      NEW.monthly_credit_pence is distinct from OLD.monthly_credit_pence or
      NEW.plan_tier            is distinct from OLD.plan_tier            or
      NEW.currency             is distinct from OLD.currency             or
      NEW.start_date           is distinct from OLD.start_date           or
      NEW.end_date             is distinct from OLD.end_date
    ) then
      NEW.accepted_at := null;
      NEW.accepted_by := null;

      -- Atomically grant grace if the venue is currently ppa_bookable
      update public.venues set grandfathered_ppa_bookable = true
       where id = NEW.venue_id
         and grandfathered_ppa_bookable = false
         and exists (
           select 1 from public.padel_venues pv
            where pv.venues_id = NEW.venue_id and pv.ppa_bookable = true
         );
    end if;
  end if;
  return NEW;
end;
$function$;

-- 4. Pricing confidence becomes part of the resolved price, not a separate lookup.
--    country_pricing.confidence is 'data_backed' or 'placeholder'. A country with
--    no row at all falls back to the global_default band -- which is a guess for
--    that country by definition, so it reports 'placeholder' too rather than
--    passing an unmapped country off as priced.
drop function if exists public.resolve_country_pricing(text);

create function public.resolve_country_pricing(p_country_code text)
returns table(
  currency text,
  reference_court_hour_minor integer,
  min_fee_minor integer,
  band_key text,
  confidence text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  return query
    select cp.currency, cp.reference_court_hour_minor, cp.min_fee_minor, cp.band_key, cp.confidence
    from public.country_pricing cp
    where cp.country_code = p_country_code;
  if found then return; end if;

  return query
    select b.default_currency, b.reference_court_hour_minor, b.min_fee_minor, b.band_key, 'placeholder'::text
    from public.pricing_bands b
    where b.band_key = 'global_default';
end $function$;

grant execute on function public.resolve_country_pricing(text) to anon, authenticated, service_role;

-- 5. preview_standard_pricing carries the confidence through, so the owner-side
--    plan picker can block a placeholder country without a second round-trip.
drop function if exists public.preview_standard_pricing(uuid);

create function public.preview_standard_pricing(p_venue_id uuid)
returns table(
  plan_key text,
  name text,
  currency text,
  monthly_price_minor integer,
  commission_rate_bps integer,
  pricing_confidence text,
  pricing_country_code text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_cc    text;
  v_price record;
begin
  select pv.country_code into v_cc
    from public.padel_venues pv
   where pv.venues_id = p_venue_id
   limit 1;

  select * into v_price from public.resolve_country_pricing(v_cc);

  return query
    select sp.key,
           sp.name,
           v_price.currency,
           case
             when sp.court_hour_multiple = 0 then 0
             else greatest(
                    round(sp.court_hour_multiple * v_price.reference_court_hour_minor)::int,
                    coalesce(v_price.min_fee_minor, 0)
                  )
           end as monthly_price_minor,
           sp.commission_rate_bps,
           v_price.confidence,
           v_cc
    from public.standard_plans sp
    order by sp.court_hour_multiple;
end $function$;

grant execute on function public.preview_standard_pricing(uuid) to anon, authenticated, service_role;

-- 6. The missing operation: move an active standard contract to a different tier,
--    re-resolved for the venue's country at today's reference price.
--
--    Deliberate refusals (surfaced verbatim, never defaulted around):
--      not_authenticated              caller has no session
--      not_venue_owner                caller is not an active owner of this venue
--      no_active_contract             nothing to change -- use create_standard_contract
--      founder_contract_admin_only    founder deals are an admin instrument; a
--                                     self-serve tier change must not overwrite a
--                                     waived-fee founder contract. Needs its own
--                                     admin RPC, same as convert_to_founder.
--      invalid_plan                   p_plan_key is not a standard_plans row
--      plan_unchanged                 already on this tier
--      pricing_unavailable_in_country the venue's country price is a guess
--                                     (confidence <> 'data_backed'); a paid tier
--                                     must not be signed at a guessed price.
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

  -- Close the old contract first so the one-active-per-venue index holds.
  update public.venue_contracts
     set status     = 'superseded',
         updated_at = now(),
         notes      = concat_ws(
                        E'\n',
                        nullif(notes, ''),
                        format('Superseded %s: plan changed %s -> %s by %s',
                               current_date, v_old.plan_tier, p_plan_key, v_uid)
                      )
   where id = v_old.id;

  -- Carry the signed commercial identity across; re-derive everything priced.
  -- accepted_at is deliberately NOT carried: the terms changed, so the owner
  -- accepts the new agreement.
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
    v_price.currency, p_plan_key, v_plan.commission_rate_bps,
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
    currency            = v_price.currency
  where id = p_venue_id;

  return jsonb_build_object(
    'contract_id',          v_contract_id,
    'superseded_contract_id', v_old.id,
    'previous_plan',        v_old.plan_tier,
    'plan',                 p_plan_key,
    'currency',             v_price.currency,
    'monthly_price_minor',  v_monthly,
    'pricing_country',      v_cc,
    'pricing_band',         v_price.band_key,
    'pricing_confidence',   v_price.confidence
  );
end $function$;

grant execute on function public.change_plan_contract(uuid, text) to authenticated, service_role;
