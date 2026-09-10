-- One gate for push, and the dead second dispatcher removed.
--
-- A CORRECTION TO THE MIGRATION BEFORE THIS ONE
--   20260910000007 taught `dispatch_push_notification` to read
--   `notification_preferences`. That function has never sent a push. It reads
--   `app.settings.service_role_key`, which is not set on this database, so it
--   returns before it reaches `http_post` — for everybody, on every
--   notification, muted or not.
--
--   The live path is `dispatch_notification_to_onesignal` -> the
--   `notify-onesignal` edge function -> OneSignal, and that path checks only
--   `profiles.push_opted_out`. It has never read `notification_preferences`.
--
--   So the switches still lied. The verification that said otherwise was
--   worthless: it observed the dead dispatcher return early and called that
--   "push suppressed". It returns early either way. Mechanism checked, outcome
--   not.
--
-- WHY THE DEAD DISPATCHER IS DROPPED AND NOT REPAIRED
--   Two AFTER INSERT triggers on `notifications` both trying to send the same
--   push is a duplicate delivery path that only stays quiet because one of them
--   is misconfigured. Set that GUC — a reasonable thing for a future migration
--   or a restored backup to do — and every player gets two of every push. That
--   is a latent double-send, not a spare tyre. There is one live path, so there
--   is one trigger.
--
--   Blast radius, checked rather than assumed:
--     · `dispatch_push_notification` is referenced by no other function body
--       (`pg_proc.prosrc`), by nothing in `src/`, and by nothing in
--       `supabase/functions/`. Its only caller is the trigger dropped here.
--     · It is the only thing anywhere in the database that calls the `send-push`
--       endpoint. Every other notification path — the three cron functions
--       included — inserts into `notifications` and lets
--       `dispatch_notification_to_onesignal` deliver. `send-push` is still
--       deployed and is left alone; nothing reaches it after this.
--
-- WHERE THE GATE LIVES NOW
--   `wants_push(user_id, type)` — one function, both switches. The master
--   (`profiles.push_opted_out`) and the category
--   (`notification_preferences.*`) are the same question asked once, so they
--   cannot drift apart or be checked in one path and skipped in another. The
--   edge function calls it in place of its own `push_opted_out` lookup, which
--   is one round trip where there were about to be two.
--
--   Absent rows mean yes. A player with no preferences row is a player who has
--   never expressed one, and the whole table defaults to true.
--
--   Types are matched by prefix so a new notification type inherits sensible
--   behaviour. Anything unmapped still pushes: an unknown type is more likely
--   to matter than to be noise, and over-delivery is recoverable where a
--   silently dropped push is invisible.

create or replace function public.wants_push(p_user_id uuid, p_type text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- Master switch. Absent profile row = no opinion = yes.
    coalesce(not (select p.push_opted_out from profiles p where p.id = p_user_id), true)
    and
    -- Category switch. Absent preferences row = defaults = yes.
    coalesce(
      (
        select case
          when p_type like 'open_match%'                                   then np.open_matches
          when p_type like 'poll_%'                                        then np.poll_reminders
          when p_type like 'connection_%'                                  then np.connection_requests
          when p_type like 'chat_%' or p_type like '%message%'             then np.chat_notifications
          when p_type like 'result_%' or p_type like 'match_result%'       then np.match_results
          when p_type like 'match_reminder%' or p_type like 'match_deadline%' then np.match_reminders
          else true
        end
        from notification_preferences np
        where np.user_id = p_user_id
      ),
      true
    );
$$;

comment on function public.wants_push(uuid, text) is
  'The only question the push pipeline asks: does this player want this kind of '
  'push? Combines profiles.push_opted_out (master) with the matching '
  'notification_preferences column (category). Absent rows mean yes. Called by '
  'the notify-onesignal edge function.';

grant execute on function public.wants_push(uuid, text) to service_role, authenticated;

-- The dead second dispatcher. See the note above.
drop trigger if exists trg_dispatch_push on public.notifications;
drop function if exists public.dispatch_push_notification();
