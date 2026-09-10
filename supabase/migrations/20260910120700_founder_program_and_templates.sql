-- === FILE: supabase/migrations/20260910120700_founder_program_and_templates.sql ===

create or replace function public.format_money(p_minor integer, p_currency text)
returns text language sql immutable as $function$
  select case upper(p_currency)
    when 'EUR' then '€'  || to_char(p_minor/100.0, 'FM999G999G990D00')
    when 'GBP' then '£'  || to_char(p_minor/100.0, 'FM999G999G990D00')
    when 'USD' then '$'  || to_char(p_minor/100.0, 'FM999G999G990D00')
    when 'BRL' then 'R$' || to_char(p_minor/100.0, 'FM999G999G990D00')
    when 'SEK' then to_char(p_minor/100.0, 'FM999G999G990D00') || ' kr'
    when 'DKK' then to_char(p_minor/100.0, 'FM999G999G990D00') || ' kr'
    when 'NOK' then to_char(p_minor/100.0, 'FM999G999G990D00') || ' kr'
    else upper(p_currency) || ' ' || to_char(p_minor/100.0, 'FM999G999G990D00')
  end;
$function$;

create table if not exists public.contract_terms_templates (
  template_key text not null,
  language     text not null,
  body         text not null,
  updated_at   timestamptz not null default now(),
  primary key (template_key, language)
);
alter table public.contract_terms_templates enable row level security;
create policy terms_templates_read on public.contract_terms_templates for select using (true);
create policy terms_templates_admin_write on public.contract_terms_templates for all
  using  (exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid()))
  with check (exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid()));
grant select on public.contract_terms_templates to anon, authenticated;
grant all    on public.contract_terms_templates to service_role;

insert into public.contract_terms_templates (template_key, language, body) values
 ('founder','en','Founding partner. {{plan_name}} plan — monthly subscription fee (list {{list_price}}) waived in full for the first {{term_months}} months from {{start_date}}. Renewable annually per venue, re-evaluated at each renewal. Transaction commission {{commission_pct}}.'),
 ('founder','it','Partner fondatore. Piano {{plan_name}} — canone mensile di abbonamento (listino {{list_price}}) interamente azzerato per i primi {{term_months}} mesi dal {{start_date}}. Rinnovabile annualmente per ogni circolo, rivalutato a ogni rinnovo. Commissione sulle transazioni {{commission_pct}}.'),
 ('founder','es','Socio fundador. Plan {{plan_name}} — cuota mensual de suscripción (precio de lista {{list_price}}) exenta en su totalidad durante los primeros {{term_months}} meses desde el {{start_date}}. Renovable anualmente por sede, revisable en cada renovación. Comisión por transacción {{commission_pct}}.'),
 ('founder','fr','Partenaire fondateur. Offre {{plan_name}} — abonnement mensuel (tarif public {{list_price}}) intégralement offert pendant les {{term_months}} premiers mois à compter du {{start_date}}. Renouvelable chaque année par établissement, réévalué à chaque renouvellement. Commission sur transaction {{commission_pct}}.'),
 ('founder','de','Gründungspartner. Tarif {{plan_name}} — monatliche Abogebühr (Listenpreis {{list_price}}) für die ersten {{term_months}} Monate ab dem {{start_date}} vollständig erlassen. Jährlich pro Standort verlängerbar, bei jeder Verlängerung neu bewertet. Transaktionsprovision {{commission_pct}}.'),
 ('founder','pt','Parceiro fundador. Plano {{plan_name}} — mensalidade de subscrição (preço de tabela {{list_price}}) totalmente isenta nos primeiros {{term_months}} meses a partir de {{start_date}}. Renovável anualmente por espaço, reavaliada em cada renovação. Comissão por transação {{commission_pct}}.'),
 ('founder','nl','Oprichtende partner. {{plan_name}}-abonnement — maandelijkse abonnementskosten (adviesprijs {{list_price}}) volledig kwijtgescholden gedurende de eerste {{term_months}} maanden vanaf {{start_date}}. Jaarlijks verlengbaar per locatie, bij elke verlenging opnieuw beoordeeld. Transactiecommissie {{commission_pct}}.')
on conflict (template_key, language) do nothing;

create table if not exists public.founder_programs (
  country_code        text primary key,
  cap                 integer not null check (cap > 0),
  plan_tier           text not null default 'pro',
  waive_fee           boolean not null default true,
  monthly_price_minor integer,
  commission_rate_bps integer not null default 225,
  term_months         integer not null default 12,
  enabled             boolean not null default true,
  updated_at          timestamptz not null default now()
);
alter table public.founder_programs enable row level security;
create policy founder_programs_read on public.founder_programs for select
  using (exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid()));
create policy founder_programs_admin_write on public.founder_programs for all
  using  (exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid()))
  with check (exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid()));
grant select, insert, update, delete on public.founder_programs to authenticated;
grant all on public.founder_programs to service_role;

-- CAP = PLACEHOLDER (25). Set the real first-N per country before granting more.
insert into public.founder_programs (country_code, cap, plan_tier, waive_fee, commission_rate_bps, term_months) values
  ('GB', 25, 'pro', true, 225, 12),
  ('IT', 25, 'pro', true, 225, 12)
on conflict (country_code) do nothing;
