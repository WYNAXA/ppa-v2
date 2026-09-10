-- === FILE: supabase/migrations/20260910120600_founder_language_columns.sql ====

alter table public.country_pricing add column if not exists language text not null default 'en';

update public.country_pricing set language = 'es' where country_code in ('ES','MX','AR');
update public.country_pricing set language = 'it' where country_code = 'IT';
update public.country_pricing set language = 'fr' where country_code = 'FR';
update public.country_pricing set language = 'de' where country_code = 'DE';
update public.country_pricing set language = 'nl' where country_code = 'NL';
update public.country_pricing set language = 'pt' where country_code in ('PT','BR');
update public.country_pricing set language = 'en'
  where country_code in ('GB','US','ZA','IN','AE','SA','FI','SE','DK','NO');

alter table public.venue_contracts add column if not exists founder_seq integer;
