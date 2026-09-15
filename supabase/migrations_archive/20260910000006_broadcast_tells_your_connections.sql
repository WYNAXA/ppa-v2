-- A broadcast tells the people it is for.
--
-- WHAT WAS MISSING
--   "Put it out there" shipped visible but unannounced: a connection saw it only
--   if they happened to open Open Matches or the Play sheet. A feature whose
--   whole point is "is anyone about?" cannot wait for people to come looking.
--
-- WHY A TRIGGER RATHER THAN A CLIENT LOOP
--   The client would have to read the connection list and fan out N inserts,
--   which is slow, can half-fail, and is skippable. This fires with the insert,
--   in the same transaction, and cannot be bypassed — the same shape as the
--   notifications `claim_open_match` already sends. Inserting into
--   `notifications` is all that is needed: `trg_compute_nav_url` sets the
--   destination and `trg_dispatch_push` / `dispatch_notification_to_onesignal`
--   deliver the push.
--
--   The type is `open_match_broadcast`. `compute_notification_nav_url` already
--   routes anything matching `open_match_%` to `/matches/:related_id`, so the
--   tap lands on the broadcast itself with no change to that function.
--
-- THE RATE LIMIT IS THE DESIGN, NOT A DETAIL
--   Nothing stops someone posting five broadcasts in an evening, and five pushes
--   from one person is how a feature gets muted for good. Only the first
--   broadcast in a six-hour window notifies. Later ones are still created, still
--   visible in Open Matches, still joinable — they simply do not buzz anyone.
--   Reach is worth less than not being switched off.
--
-- WHO GETS IT
--   Accepted `player_connections` in both directions, which is how the app reads
--   them everywhere else, and never the author.

create or replace function public.notify_connections_of_broadcast()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name  text;
  v_when  text;
  v_day   text;
begin
  -- A broadcast, specifically: open, aimed at connections, and nobody has
  -- joined it yet. Push-to-open matches already have three players and their
  -- own notification path.
  if new.is_open is not true
     or new.open_audience <> 'connections'
     or coalesce(array_length(new.player_ids, 1), 0) <> 1 then
    return new;
  end if;

  -- One buzz per author per six hours. See the note above.
  if exists (
    select 1 from matches m
    where m.created_by = new.created_by
      and m.id <> new.id
      and m.is_open
      and m.open_audience = 'connections'
      and m.opened_at > now() - interval '6 hours'
  ) then
    return new;
  end if;

  select coalesce(name, 'A player') into v_name from profiles where id = new.created_by;

  v_day := case
    when new.match_date = current_date then 'today'
    when new.match_date = current_date + 1 then 'tomorrow'
    else trim(to_char(new.match_date, 'Day'))
  end;

  v_when := case
    when new.window_start = '08:00' and new.window_end = '22:00' then v_day
    when new.window_start >= '17:00' then v_day || ' evening'
    when new.window_start >= '12:00' then v_day || ' afternoon'
    when new.window_start is not null then v_day || ' morning'
    else v_day
  end;

  insert into notifications (user_id, type, title, message, related_id)
  select
    case when pc.user_id = new.created_by then pc.connected_user_id else pc.user_id end,
    'open_match_broadcast',
    v_name || ' is free ' || v_when,
    coalesce(nullif(trim(new.notes), '') || ' — tap to join.', 'Tap to join if you fancy a game.'),
    new.id
  from player_connections pc
  where pc.status = 'accepted'
    and (pc.user_id = new.created_by or pc.connected_user_id = new.created_by)
    and case when pc.user_id = new.created_by then pc.connected_user_id else pc.user_id end
        <> new.created_by;

  return new;
end;
$$;

drop trigger if exists trg_notify_connections_of_broadcast on public.matches;

create trigger trg_notify_connections_of_broadcast
  after insert on public.matches
  for each row
  execute function public.notify_connections_of_broadcast();
