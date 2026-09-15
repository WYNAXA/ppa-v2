-- Root cause of the hardcoded currency in the admin contracts list.
--
-- AdminContracts.tsx:418 read `const cur = currencySymbol('GBP')` -- a literal, not even
-- a fallback -- so every contract row displayed as pounds regardless of its real currency.
-- An Italian EUR 179 contract showed as GBP 179 on the screen the platform team uses to
-- review deals.
--
-- The reason it was hardcoded is that this function never returned currency: there was
-- nothing correct to use. Fixing only the component would have meant inventing a source.
-- plan_tier and founder_seq come along too -- the list shows deals, and whether a deal is
-- a founder deal is the first thing you want to see on it.
--
-- Blast radius: one consumer, AdminContracts.tsx:348. Additive columns, so a stale build
-- keeps working.
--
-- Fix class: root-cause.

drop function if exists public.admin_list_venue_contracts();

create function public.admin_list_venue_contracts()
returns table(
  venue_id uuid, venue_name text, city text, owner_email text,
  contract_id uuid, status text, signatory_name text, company_name text, vat_number text,
  currency text, plan_tier text, founder_seq integer,
  commission_rate_bps integer, monthly_price_pence integer, monthly_credit_pence integer,
  subscription_free_until timestamptz, start_date date, end_date date, special_terms text,
  accepted_at timestamptz, updated_at timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not exists (select 1 from public.platform_admins where user_id = auth.uid()) then
    raise exception 'not_authorised';
  end if;
  return query
  select v.id, coalesce(v.name, pv.venue_name), coalesce(v.city, pv.city),
    (select p.email from public.venue_users vu join public.profiles p on p.id = vu.user_id
      where vu.venue_id = v.id and vu.role='owner' and vu.status='active' order by vu.created_at limit 1),
    c.id, c.status, c.signatory_name, c.company_name, c.vat_number,
    c.currency, c.plan_tier, c.founder_seq,
    c.commission_rate_bps, c.monthly_price_pence, c.monthly_credit_pence,
    c.subscription_free_until, c.start_date, c.end_date, c.special_terms,
    c.accepted_at, c.updated_at
  from public.venue_contracts c
  join public.venues v on v.id = c.venue_id
  left join public.padel_venues pv on pv.venues_id = v.id
  where c.status = (select x.status from public.venue_contracts x where x.venue_id = c.venue_id
                    order by (x.status='active') desc, x.updated_at desc limit 1)
  order by c.updated_at desc;
end $function$;

grant execute on function public.admin_list_venue_contracts() to authenticated, service_role;
