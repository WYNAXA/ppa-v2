-- Fix The Padel Team Bristol ppa_bookable flag
UPDATE padel_venues
SET ppa_bookable = true
WHERE venue_name = 'The Padel Team Bristol';
