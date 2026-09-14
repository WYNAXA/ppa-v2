-- Rocket Padel Bristol: the booking platform was wrong, and the court
-- breakdown was a partial record presented as a fact.
--
-- WHAT UAT SAW
--   "Book via Playtomic" opened rocketpadel.com, and the venue read
--   "14 courts · 4 indoor" when all 14 are indoor.
--
-- WHAT IS ACTUALLY TRUE — two independent sources, in agreement:
--   https://thebandeja.com/rocket-drops-playtomic-for-padel-mates/
--     Rocket Padel left Playtomic for Padel Mates; Bristol transitioned
--     10 June 2025, along with Ilford, Battersea, Beckton and the Danish sites.
--   https://thepadelgang.co.uk/rocket-padel-bristol/
--     14 panoramic courts, all indoor. Booking is via the Padel Mates app;
--     the club's own site is the correct public destination because Padel
--     Mates has no per-club web URL.
--
-- So booking_url was never the error — booking_platform was. There is no
-- Playtomic club URL to point at, because they are not on Playtomic.
--
-- The court breakdown is corrected rather than guessed: indoor_courts was 4
-- against number_of_courts 14, which the UI rendered as "4 Indoor" and left
-- the reader to assume the other 10 were something else. They are all indoor,
-- and all panoramic.
UPDATE public.padel_venues
SET booking_platform = 'Padel Mates',
    indoor_courts    = 14,
    outdoor_courts   = 0,
    covered_courts   = 0,
    panoramic_courts = 14
WHERE venue_id = '69e3c467-4f42-40b6-8ecd-22eaf199d123';

-- The Els Club Dubai is the only other row whose stated platform disagrees
-- with its booking URL. Left unchanged: it has not been verified, and an
-- unverified guess is what produced the Rocket row. Flagged for review
-- instead, so it surfaces in the admin queue rather than being forgotten.
UPDATE public.padel_venues
SET needs_review  = true,
    review_reason = btrim(concat_ws('; ', nullif(review_reason, ''),
                     'booking_platform says Playtomic but booking_url is not a Playtomic URL'), '; ')
WHERE venue_id = '945ca2b1-44be-43b6-9c5d-53241b0e4cc5';
