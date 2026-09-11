-- The split-payment flow never told anyone to pay.
--
-- Tracing every notification in it before writing this: the ONLY automatic messages
-- were 'deadline passed, top up' (to the booker alone) and 'court released' (to
-- everyone, after it had already failed). A player who owed their share was never
-- contacted. The booker had to copy a link and send it by hand, per player, and if
-- they forgot, the first thing the group heard was that the court was gone.
--
-- bookings.payment_links_sent already existed and NOTHING in the database or the
-- application ever set it - the column is where someone intended this to go.
--
-- Server-side trigger rather than a client-side fan-out: it fires in the same
-- transaction as the booking, so it cannot be skipped by a closed tab, a failed
-- request or a code path that forgot to call it. Note court_bookings is a view over
-- bookings; triggers belong on the table.

-- 1. The pay link is per PLAYER, not per booking, and nav_url is computed from the
--    notification row - which carries user_id, the player. Without this branch the
--    type falls through to the catch-all and lands on /notifications, which is a
--    dead end for someone being asked for money.
create or replace function public.compute_notification_nav_url()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
BEGIN
  NEW.nav_url := CASE
    -- Your own share of a court booking: straight to the payment page.
    WHEN NEW.type = 'booking_payment_due'
      THEN '/pay/booking/' || COALESCE(NEW.related_id::text, '') || '/player/' || NEW.user_id::text

    WHEN NEW.type IN (
      'group_invite', 'group_join', 'group_join_request',
      'group_update', 'announcement',
      'ringer_offer', 'ringer_approved', 'ringer_declined'
    ) THEN '/community/groups/' || COALESCE(NEW.related_id::text, '')

    WHEN NEW.type IN (
      'match_created', 'match_result', 'match_suggested', 'match_scheduled',
      'result_verify', 'result_pending_verification', 'result_verified', 'result_disputed',
      'match_result_prompt', 'match_deadline_approaching', 'match_auto_cancelled',
      'match_invitation', 'match_reminder',
      'lift_requested', 'lift_accepted', 'lift_declined'
    ) THEN '/matches/' || COALESCE(NEW.related_id::text, '')

    WHEN NEW.type LIKE 'ringer_for_%' THEN '/matches/' || COALESCE(NEW.related_id::text, '')
    WHEN NEW.type LIKE 'open_match_%' THEN '/matches/' || COALESCE(NEW.related_id::text, '')
    WHEN NEW.type LIKE 'invitation_%' THEN '/matches/' || COALESCE(NEW.related_id::text, '')
    WHEN NEW.type LIKE 'invitee_%'    THEN '/matches/' || COALESCE(NEW.related_id::text, '')

    WHEN NEW.type IN ('league_invite', 'league_update')
      THEN '/compete/leagues/' || COALESCE(NEW.related_id::text, '')
    WHEN NEW.type LIKE 'league_%'
      THEN '/compete/leagues/' || COALESCE(NEW.related_id::text, '')

    WHEN NEW.type IN ('poll_created')
      THEN '/play/availability/' || COALESCE(NEW.related_id::text, '')
    WHEN NEW.type LIKE 'poll_%'
      THEN '/play/availability/' || COALESCE(NEW.related_id::text, '')

    WHEN NEW.type IN ('connection_request', 'connection_accepted')
      THEN '/community#connections'

    WHEN NEW.type = 'achievement' THEN '/you'
    WHEN NEW.type LIKE 'household_%' THEN '/you'

    WHEN NEW.type = 'court_booked'
      THEN '/matches/' || COALESCE(NEW.related_id::text, '')

    WHEN NEW.type LIKE '%match%'  THEN '/matches/' || COALESCE(NEW.related_id::text, '')
    WHEN NEW.type LIKE '%league%' THEN '/compete/leagues/' || COALESCE(NEW.related_id::text, '')
    WHEN NEW.type LIKE '%group%'  THEN '/community/groups/' || COALESCE(NEW.related_id::text, '')
    WHEN NEW.type LIKE '%poll%'   THEN '/play/availability/' || COALESCE(NEW.related_id::text, '')

    ELSE '/notifications'
  END;

  RETURN NEW;
END;
$function$;

-- 2. Tell each player who owes a share, once.
create or replace function public.notify_booking_payment_due()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_share    integer := NEW.price_per_player_pence;
  v_currency text    := NEW.price_currency;
  v_venue    text;
  v_when     text;
  v_paid     jsonb   := coalesce(NEW.paid_player_ids, '[]'::jsonb);
  v_sent     integer := 0;
  v_player   uuid;
begin
  if v_share is null or v_share <= 0 then return NEW; end if;
  if NEW.player_ids is null or array_length(NEW.player_ids, 1) is null then return NEW; end if;
  if NEW.status in ('cancelled', 'released') then return NEW; end if;
  -- No currency means we cannot state the amount, and an amount with no currency is
  -- exactly the defect this codebase has been clearing out. Say nothing rather than
  -- guess a currency at someone.
  if v_currency is null then return NEW; end if;

  select pv.venue_name into v_venue
    from public.padel_venues pv where pv.venues_id = NEW.venue_id limit 1;

  -- start_at holds venue-local time carried with a +00 suffix (a 6am UK slot is
  -- stored 06:00:00+00), and venues have no timezone column. Rendering it directly
  -- reproduces what the booker saw; an `at time zone` conversion here would tell
  -- players 07:00 for a 06:00 court.
  v_when := to_char(NEW.start_at, 'Dy DD Mon, HH24:MI');

  for v_player in select unnest(NEW.player_ids)
  loop
    continue when v_player = NEW.booked_by;
    continue when v_paid ? v_player::text;
    continue when exists (
      select 1 from public.notifications n
       where n.type = 'booking_payment_due'
         and n.related_id = NEW.id
         and n.user_id = v_player
    );

    insert into public.notifications (user_id, type, title, message, related_id, read)
    values (
      v_player,
      'booking_payment_due',
      'Your share is due',
      format('%s for %s on %s. Tap to pay your share.',
             public.format_money(v_share, v_currency),
             coalesce(v_venue, 'your court booking'),
             v_when),
      NEW.id,
      false
    );
    v_sent := v_sent + 1;
  end loop;

  if v_sent > 0 and coalesce(NEW.payment_links_sent, false) = false then
    update public.bookings set payment_links_sent = true where id = NEW.id;
  end if;

  return NEW;
end;
$function$;

-- AFTER INSERT covers a booking made with its players already on it.
-- UPDATE OF player_ids covers someone joining later - the idempotency check above
-- means existing players are never asked twice. Scoping the update trigger to that
-- one column keeps the payment_links_sent write above from re-entering this function.
drop trigger if exists trg_notify_booking_payment_due on public.bookings;
create trigger trg_notify_booking_payment_due
after insert or update of player_ids on public.bookings
for each row execute function public.notify_booking_payment_due();
