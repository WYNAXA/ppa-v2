-- A merge loses nothing.
--
-- ROOT CAUSE
--   _merge_venues carries the loser's attributes across as a venue_enrichment
--   payload, and apply_venue_enrichment() is what writes that payload back
--   onto the survivor. The payload listed THIRTEEN keys. apply_venue_enrichment
--   knows how to apply THIRTY-TWO.
--
--   So every merge silently discarded the loser's:
--     coaching_available, is_members_only, parking_available, changing_rooms,
--     cafe_bar, equipment_rental, rating, total_reviews, amenities,
--     facilities, photos, opening_hours, currency, surface_type, instagram,
--     singles_courts, panoramic_courts, booking_advance_info, membership_note
--
--   Concretely, the pair this was found on: "Padel4all Lockleaze" (the older
--   row) has coaching_available = true and 4 outdoor courts; the newer row has
--   the correct Lockleaze Sports Centre coordinates and BS7 9XF but no courts
--   and no coaching. Merging the old into the new under the 13-key payload
--   would have kept the courts and thrown the coaching away — and the Coaching
--   tile on Discover counts exactly that flag.
--
-- FIX CLASS: root-cause. Setting coaching_available by hand on the survivor
--   after each merge is the display patch; it would be wrong again on the next
--   of the 1,131 candidate pairs.
--
-- THE INVARIANT, stated so it stops drifting
--   The payload must carry every column apply_venue_enrichment() can write.
--   If a column is added there, it is added here. That is now checkable: both
--   lists are in this file's sibling function and neither is inferred.
--
-- NOT CARRIED, deliberately: venue_name, city, postcode, latitude, longitude,
--   country_code, venue_type, status, venues_id. The survivor was chosen
--   BECAUSE its identity and location are the right ones. Carrying those would
--   overwrite the reason it survived.

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

  -- Every key apply_venue_enrichment() can write. jsonb_strip_nulls drops the
  -- ones the loser had nothing to say about, and the coalesce() in
  -- apply_venue_enrichment means a key present here never blanks the survivor.
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
           'singles_courts',              nullif(v_loser.singles_courts, 0),
           'panoramic_courts',            nullif(v_loser.panoramic_courts, 0),
           'typical_court_price_peak',    v_loser.typical_court_price_peak,
           'typical_court_price_offpeak', v_loser.typical_court_price_offpeak,
           'currency',                    nullif(v_loser.currency, ''),
           'description',                 nullif(v_loser.description, ''),
           'surface_type',                nullif(v_loser.surface_type, ''),
           'phone',                       nullif(v_loser.phone, ''),
           'email',                       nullif(v_loser.email, ''),
           'website',                     nullif(v_loser.website, ''),
           'instagram',                   nullif(v_loser.instagram, ''),
           'booking_url',                 nullif(v_loser.booking_url, ''),
           'booking_platform',            nullif(v_loser.booking_platform, ''),
           'booking_advance_info',        nullif(v_loser.booking_advance_info, ''),
           'membership_note',             nullif(v_loser.membership_note, ''),
           'whatsapp_number',             nullif(v_loser.whatsapp_number, ''),
           'rating',                      v_loser.rating,
           'total_reviews',               nullif(v_loser.total_reviews, 0),
           'amenities',                   v_loser.amenities,
           'facilities',                  v_loser.facilities,
           'photos',                      v_loser.photos,
           'opening_hours',               v_loser.opening_hours,
           -- Booleans: only a TRUE is carried. A false on the loser must never
           -- turn a true on the survivor into anything, and coalesce() would
           -- happily write false over true if we passed it through.
           'is_members_only',             nullif(v_loser.is_members_only, false),
           'parking_available',           nullif(v_loser.parking_available, false),
           'changing_rooms',              nullif(v_loser.changing_rooms, false),
           'cafe_bar',                    nullif(v_loser.cafe_bar, false),
           'coaching_available',          nullif(v_loser.coaching_available, false),
           'equipment_rental',            nullif(v_loser.equipment_rental, false)
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
