-- Blast-radius correction. 20260910184758 repointed create_standard_contract and
-- change_plan_contract at country_plan_prices but MISSED grant_founder_contract, which
-- was still deriving its list price from the retired court-hour formula:
--
--   v_list := round(v_planmult * v_price.reference_court_hour_minor)::int;
--
-- For a GB venue that is 8 * 3800 = GBP 304.00, and it is interpolated into the founder
-- agreement's localized {{list_price}}, so every founder contract would have quoted a
-- price Wynaxa does not sell:
--
--   "Founding partner. Hub Pro plan - monthly subscription fee (list GBP 304.00) waived
--    in full for the first 12 months..."   -> should read GBP 179.00
--
-- The fee itself was already 0 (waive_fee), so no money was miscollected -- but the
-- contract text is the legal record, and it was wrong.
--
-- A founder agreement quotes a list price, so it needs one: if the country has no
-- approved price for the program's tier, this now raises pricing_unavailable_in_country
-- rather than writing an empty or invented figure. Setting that country's price is one
-- insert into country_plan_prices.
--
-- Fix class: root-cause.

create or replace function public.grant_founder_contract(p_venue_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_cc text; v_price record; v_prog public.founder_programs;
  v_listed public.country_plan_prices;
  v_planname text; v_currency text; v_list integer; v_monthly integer;
  v_lang text; v_body text; v_used integer; v_seq integer;
  v_start date := current_date; v_end date; v_contract_id uuid;
begin
  if not exists (select 1 from public.platform_admins pa where pa.user_id = v_uid) then
    raise exception 'not_platform_admin';
  end if;
  if exists (select 1 from public.venue_contracts where venue_id = p_venue_id and status = 'active') then
    raise exception 'active_contract_exists';
  end if;

  select pv.country_code into v_cc from public.padel_venues pv where pv.venues_id = p_venue_id limit 1;
  select * into v_price from public.resolve_country_pricing(v_cc);

  -- Program terms: country row if present, else the '*' global default.
  select * into v_prog from public.founder_programs where country_code = v_cc;
  if not found then select * into v_prog from public.founder_programs where country_code = '*'; end if;
  if not found then raise exception 'no_founder_program'; end if;
  if not v_prog.enabled then raise exception 'founder_program_disabled'; end if;

  -- Cap enforcement only when a cap is set (null = open).
  select count(*) into v_used from public.venue_contracts
    where pricing_country_code = v_cc and founder_seq is not null;
  if v_prog.cap is not null and v_used >= v_prog.cap then
    raise exception 'founder_cap_reached (% of %)', v_used, v_prog.cap;
  end if;
  v_seq := v_used + 1;

  select name into v_planname from public.standard_plans where key = v_prog.plan_tier;

  -- The list price quoted in the agreement is the approved price for this country and
  -- tier. No formula, no fallback.
  select * into v_listed
    from public.country_plan_prices
   where country_code = v_cc and plan_key = v_prog.plan_tier;
  if v_listed.country_code is null then
    raise exception 'pricing_unavailable_in_country';
  end if;
  v_list     := v_listed.monthly_price_minor;
  v_currency := v_listed.currency;

  v_monthly := case when v_prog.waive_fee then 0 else coalesce(v_prog.monthly_price_minor, v_list) end;
  v_end     := v_start + (v_prog.term_months || ' months')::interval;

  v_lang := coalesce((select language from public.country_pricing where country_code = v_cc), 'en');
  select body into v_body from public.contract_terms_templates where template_key='founder' and language=v_lang;
  if v_body is null then
    select body into v_body from public.contract_terms_templates where template_key='founder' and language='en';
  end if;
  v_body := replace(v_body, '{{plan_name}}',    v_planname);
  v_body := replace(v_body, '{{list_price}}',   public.format_money(v_list, v_currency));
  v_body := replace(v_body, '{{term_months}}',  v_prog.term_months::text);
  v_body := replace(v_body, '{{start_date}}',   to_char(v_start, 'DD Mon YYYY'));
  v_body := replace(v_body, '{{commission_pct}}', to_char(v_prog.commission_rate_bps/100.0,'FM990D00') || '%');

  insert into public.venue_contracts (
    venue_id, status, currency, plan_tier, commission_rate_bps,
    monthly_price_pence, monthly_credit_pence, auto_renew, notice_period_days, special_terms,
    start_date, end_date, signed_by, signed_at,
    pricing_country_code, pricing_band_key, reference_court_hour_minor, court_hour_multiple, founder_seq
  ) values (
    p_venue_id, 'active', v_currency, v_prog.plan_tier, v_prog.commission_rate_bps,
    v_monthly, 0, true, 30, v_body,
    v_start, v_end, v_uid, now(),
    v_cc, v_price.band_key, v_price.reference_court_hour_minor, null, v_seq
  ) returning id into v_contract_id;

  update public.venues set
    is_founding_venue = true, plan_tier = v_prog.plan_tier,
    commission_rate_bps = v_prog.commission_rate_bps, monthly_price_pence = v_monthly,
    currency = v_currency
  where id = p_venue_id;

  return jsonb_build_object(
    'contract_id', v_contract_id, 'founder_seq', v_seq, 'cap', v_prog.cap,
    'country', v_cc, 'currency', v_currency, 'list_price_minor', v_list,
    'monthly_price_minor', v_monthly, 'term_months', v_prog.term_months,
    'language', v_lang, 'end_date', v_end
  );
end $function$;
