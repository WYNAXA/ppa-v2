-- A merge repoints the location contract.
--
-- ROOT CAUSE
--   admin_merge_venues() was written before the location contract existed. On
--   13 Sep, three tables gained a foreign key to padel_venues.venue_id:
--     matches.padel_venue_id   (20260913124419)
--     events.padel_venue_id    (20260913124419)
--     leagues.padel_venue_id   (20260913153426)
--   The merge function does not know about them. Merging a venue that has
--   matches would set the loser to status='merged' and leave every one of its
--   matches, events and leagues pointing at a row the directory filters out —
--   silently blanking the venue on those records. The FK is ON DELETE SET
--   NULL, which never fires here, because a merge is not a delete.
--
--   This is a defect introduced BY those three migrations, not by the original
--   function. It has caused no damage yet only because merged_into is non-null
--   on exactly zero rows: the dedupe machinery has never been run.
--
-- FIX CLASS: root-cause. Re-pointing the rows after each merge by hand — the
--   workaround — would leave the next caller of admin_merge_venues to
--   rediscover this, and there are 1,131 candidate pairs waiting.
--
-- SHAPE
--   The body is extracted to _merge_venues(loser, survivor) with NO permission
--   check, and admin_merge_venues becomes the authorisation wrapper over it.
--   That is so a migration or a batch job can merge without forging an
--   auth.uid(), and so there is exactly ONE implementation of what a merge
--   means. Duplicating the body into a migration would have been the patch.
--
--   _merge_venues is deliberately NOT granted to authenticated/anon: it is
--   reachable only by the definer-rights wrapper, which still checks
--   platform_admins.

create or replace function public._merge_venues(
  p_loser_venue_id uuid,
  p_survivor_venue_id uuid,
  p_actor text default 'system'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_loser  public.padel_venues%rowtype;
  v_surv   public.padel_venues%rowtype;
  v_moved  integer := 0;
  v_m      integer := 0;
  v_e      integer := 0;
  v_l      integer := 0;
begin
  if p_loser_venue_id = p_survivor_venue_id then
    return jsonb_build_object('success', false, 'error', 'same_venue');
  end if;

  select * into v_loser from public.padel_venues where venue_id = p_loser_venue_id;
  if not found then return jsonb_build_object('success', false, 'error', 'loser_not_found'); end if;
  select * into v_surv  from public.padel_venues where venue_id = p_survivor_venue_id;
  if not found then return jsonb_build_object('success', false, 'error', 'survivor_not_found'); end if;

  if v_loser.venues_id is not null then
    return jsonb_build_object('success', false, 'error', 'loser_is_claimed',
      'detail', 'The losing venue has been claimed. Resolve with its owner before merging.');
  end if;
  if v_surv.merged_into is not null then
    return jsonb_build_object('success', false, 'error', 'survivor_already_merged',
      'detail', 'Pick the venue that survived that merge instead.');
  end if;

  -- Carry the loser's attributes across as enrichment, so nothing it knew is lost.
  insert into public.venue_enrichment (venue_id, source, external_id, fetched_at, payload, raw)
  select p_survivor_venue_id,
         'legacy_manual_2026_03_30',
         'merged-from:' || p_loser_venue_id::text,
         now(),
         jsonb_strip_nulls(jsonb_build_object(
           'number_of_courts',            nullif(v_loser.number_of_courts, 0),
           'indoor_courts',               nullif(v_loser.indoor_courts, 0),
           'outdoor_courts',              nullif(v_loser.outdoor_courts, 0),
           'covered_courts',              nullif(v_loser.covered_courts, 0),
           'typical_court_price_peak',    v_loser.typical_court_price_peak,
           'typical_court_price_offpeak', v_loser.typical_court_price_offpeak,
           'booking_url',                 nullif(v_loser.booking_url, ''),
           'booking_platform',            nullif(v_loser.booking_platform, ''),
           'phone',                       v_loser.phone,
           'email',                       v_loser.email,
           'website',                     v_loser.website,
           'description',                 v_loser.description,
           'whatsapp_number',             v_loser.whatsapp_number
         )),
         jsonb_build_object('merged_from_name', v_loser.venue_name)
  on conflict do nothing;

  update public.venue_enrichment
     set venue_id = p_survivor_venue_id,
         external_id = coalesce(external_id, '') || ' (via ' || p_loser_venue_id::text || ')'
   where venue_id = p_loser_venue_id
     and not exists (
       select 1 from public.venue_enrichment e2
        where e2.venue_id = p_survivor_venue_id
          and e2.source = venue_enrichment.source
     );
  get diagnostics v_moved = row_count;

  update public.venue_claim_requests      set venue_id = p_survivor_venue_id where venue_id = p_loser_venue_id;
  update public.venue_claim_verifications set venue_id = p_survivor_venue_id where venue_id = p_loser_venue_id;

  -- THE LOCATION CONTRACT. Anything anchored to the loser follows the survivor.
  update public.matches set padel_venue_id = p_survivor_venue_id where padel_venue_id = p_loser_venue_id;
  get diagnostics v_m = row_count;
  update public.events  set padel_venue_id = p_survivor_venue_id where padel_venue_id = p_loser_venue_id;
  get diagnostics v_e = row_count;
  update public.leagues set padel_venue_id = p_survivor_venue_id where padel_venue_id = p_loser_venue_id;
  get diagnostics v_l = row_count;

  -- A dismissal of this pair is now meaningless; a merge is the stronger answer.
  delete from public.venue_duplicate_dismissals
   where (venue_id_a = p_loser_venue_id and venue_id_b = p_survivor_venue_id)
      or (venue_id_a = p_survivor_venue_id and venue_id_b = p_loser_venue_id);

  update public.padel_venues
     set merged_into   = p_survivor_venue_id,
         status        = 'merged',
         needs_review  = false,
         review_reason = null,
         classified_by = p_actor,
         classified_at = now(),
         updated_at    = now()
   where venue_id = p_loser_venue_id;

  perform public.apply_venue_enrichment(p_survivor_venue_id);

  return jsonb_build_object(
    'success', true,
    'merged', v_loser.venue_name,
    'into', v_surv.venue_name,
    'enrichment_rows_moved', v_moved,
    'matches_repointed', v_m,
    'events_repointed', v_e,
    'leagues_repointed', v_l
  );
end;
$function$;

revoke all on function public._merge_venues(uuid, uuid, text) from public, anon, authenticated;

create or replace function public.admin_merge_venues(
  p_loser_venue_id uuid,
  p_survivor_venue_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;
  if not exists (select 1 from public.platform_admins where user_id = v_caller) then
    raise exception 'not_authorised';
  end if;

  return public._merge_venues(p_loser_venue_id, p_survivor_venue_id, 'admin:' || v_caller::text);
end;
$function$;
