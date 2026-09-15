-- A city you typed is still a place.
--
-- ROOT CAUSE
--   Onboarding.tsx has two ways to set your location:
--     "Use my location"  -> navigator.geolocation -> reverseGeocode() ->
--                           writes city AND latitude AND longitude
--     manual city field  -> writes city ONLY. latitude and longitude stay at
--                           whatever they were, which for a new profile is NULL.
--   (Onboarding.tsx:117-153 — locationLat/locationLng are only ever set by the
--   geolocation branch; the manual input sets locationCity alone.)
--
--   So anyone who declined the browser permission, or just typed their town,
--   ends up with a city and no point. Measured today:
--
--     has coordinates ........................ 47
--     city, but NO coordinates ............... 34   <-- this migration
--     neither city nor coordinates ........... 12
--                                             ---
--                                              93
--
--   That is why the Discover no-location state covers 49% of accounts. It is
--   not that half the users refused to say where they are — most of them DID
--   say, and the answer was thrown away.
--
--   Twenty-four of the 34 are in Bristol.
--
-- FIX CLASS: root-cause on the data. The client half — making the manual city
--   field geocode forward so this stops happening — is a separate change in
--   Onboarding.tsx and is NOT in this migration. Without it this backfill
--   decays exactly like the groups one would have.
--
-- METHOD, same as 20260914132349 for groups
--   The city's point is the centroid of ACTIVE padel_venues in that city: real
--   rows in this database, not a geocoding service, not a guess.
--
--     bristol     24 users   12 venues
--     dublin       2 users   28 venues
--     dubai        1 user    75 venues
--     glasgow      1 user     3 venues
--     london       1 user    77 venues
--     surat        1 user     1 venue
--     trento       1 user     2 venues
--     valladolid   1 user    49 venues
--
--   TWO ARE LEFT NULL on purpose:
--     "hurlands"    — a Farnham suburb; no venue in the directory
--     "القاهرة"      — Cairo in Arabic; the directory holds Cairo under its
--                     Latin name, and transliterating here would be guessing
--                     at a match rather than resolving one
--   Both will see the no-location card, which is the correct outcome for a
--   place this database cannot locate.
--
-- ACCURACY, stated plainly
--   A centroid is the middle of a city's courts, not the user's home. For a
--   25-mile radius that is immaterial — every Bristol venue is within 9 miles
--   of the centroid. It is a floor that makes the tab work, and it is replaced
--   the moment the user sets a real location.
--
-- BLAST RADIUS
--   profiles.latitude/longitude are read by discover_counts, discover_feed,
--   venues_near and the player directory. All of them get MORE for these 32
--   users and nothing changes for anyone else. No row that already had
--   coordinates is touched.

with city_point as (
  select lower(btrim(city)) as city,
         avg(latitude)::numeric  as lat,
         avg(longitude)::numeric as lng
    from public.padel_venues
   where status = 'active' and latitude is not null
   group by 1
)
update public.profiles p
   set latitude  = cp.lat,
       longitude = cp.lng
  from city_point cp
 where p.latitude is null
   and p.city is not null
   and lower(btrim(p.city)) = cp.city;