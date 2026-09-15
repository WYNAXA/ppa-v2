-- A booking link goes somewhere.
--
-- FOUND IN UAT
--   Bristol Padel Club shipped booking_url = 'https://example.com' to every
--   player within 25 miles of Bristol -- a literal placeholder, live, with a
--   button on it.
--
--   Two more carry a host with no scheme ('padelastra.it', 'mittepadel.com').
--   openUrl() treats a schemeless string as a relative path, so those buttons
--   navigate inside the app and appear to do nothing.
--
-- WHY EMPTY STRING AND NOT NULL
--   booking_url is NOT NULL. The codebase's established "no link" value is the
--   empty string -- discover_list emits nullif(pv.booking_url,'') and two
--   Bristol venues already carry ''. Matching that convention rather than
--   altering the column.
--
-- FIX CLASS: root-cause on the data for these three rows. The systemic half --
--   validating a booking_url before it is stored -- belongs in
--   discover-venues-google and the Hub's venue editor, and is NOT done here. A
--   CHECK constraint is deliberately not added: 4,371 venues carry a
--   booking_url and none has been validated, so a constraint would fail the
--   next legitimate write for reasons nobody would understand. Validate on the
--   way in, then constrain.
--
-- DELIBERATELY NOT TOUCHED
--   Five rows matched a placeholder search and are real venues: Padeltest.dk
--   (a genuine Danish club), Todopadel, Padel Para Todos Madrid, Clube Alto do
--   Duque, Padel Metodo 3. The search pattern over-matched on 'test' and
--   'todo'. Recorded so nobody "fixes" them later.
--
-- NOT FIXED HERE, AND STILL BROKEN
--   Filton Padel's booking_url (https://www.filtonpadel.co.uk/book) does not
--   resolve. The correct URL is not known and inventing one is worse than a
--   dead link. Needs a human, and a link checker so the next dead one is found
--   by the system rather than by the founder during UAT.
--
-- BLAST RADIUS
--   Three rows. booking_url appears in no WHERE clause, so no count moves. A
--   venue with '' renders no external booking button, which is the correct
--   outcome for a venue we cannot link to.

update public.padel_venues
   set booking_url = '',
       updated_at  = now()
 where booking_url ilike '%example.com%';

update public.padel_venues
   set booking_url = 'https://' || booking_url,
       updated_at  = now()
 where nullif(booking_url,'') is not null
   and booking_url !~* '^https?://';
