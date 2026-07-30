-- venues_near now excludes non-active venues so self-created venues held for review
-- (padel_venues.status='pending_review') never appear in players' "near you".
-- Player-facing list/search queries in the app add the same status='active' filter.

create or replace function public.venues_near(
  p_lat double precision, p_lng double precision,
  p_radius_miles double precision default 50, p_limit integer default 12
)
returns table (
  venue_id uuid, venue_name text, city text, country_code text,
  indoor_courts integer, outdoor_courts integer, covered_courts integer,
  ppa_bookable boolean, rating numeric, photos jsonb, distance_miles double precision
)
language sql stable as $$
  select v.venue_id, v.venue_name, v.city, v.country_code,
         v.indoor_courts, v.outdoor_courts, v.covered_courts,
         v.ppa_bookable, v.rating, v.photos,
         public.haversine_miles(p_lat, p_lng, v.latitude::double precision, v.longitude::double precision) as distance_miles
  from public.padel_venues v
  where v.latitude is not null and v.longitude is not null
    and v.status = 'active'
    and public.haversine_miles(p_lat, p_lng, v.latitude::double precision, v.longitude::double precision) <= greatest(p_radius_miles, 0)
  order by distance_miles asc
  limit greatest(1, least(coalesce(p_limit, 12), 50));
$$;
grant execute on function public.venues_near(double precision, double precision, double precision, integer) to anon, authenticated;
