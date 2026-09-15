-- Auto-sync court_bookings.player_ids when matches.player_ids changes
CREATE OR REPLACE FUNCTION public.sync_booking_players_from_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only fire if player_ids actually changed
  IF NEW.player_ids IS DISTINCT FROM OLD.player_ids THEN
    UPDATE court_bookings
    SET player_ids = NEW.player_ids,
        updated_at = now()
    WHERE match_id = NEW.id
      AND status NOT IN ('cancelled', 'completed');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_booking_players ON matches;

CREATE TRIGGER trg_sync_booking_players
AFTER UPDATE OF player_ids ON matches
FOR EACH ROW
EXECUTE FUNCTION public.sync_booking_players_from_match();

NOTIFY pgrst, 'reload schema';
