ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS exclude_from_league boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.auto_attribute_match_to_league()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_league_id      uuid;
  v_group_id       uuid;
  v_exclude        boolean;
  v_all_players    uuid[];
  v_enrolled_count integer;
BEGIN
  IF NEW.is_friendly IS TRUE THEN
    RETURN NEW;
  END IF;

  SELECT group_id, COALESCE(exclude_from_league, false)
    INTO v_group_id, v_exclude
  FROM matches WHERE id = NEW.match_id;

  IF v_group_id IS NULL OR v_exclude THEN
    RETURN NEW;
  END IF;

  v_all_players := NEW.team1_players || NEW.team2_players;

  SELECT l.id INTO v_league_id
  FROM leagues l
  WHERE l.linked_group_ids @> ARRAY[v_group_id]
    AND l.status = 'active'
  ORDER BY l.created_at DESC
  LIMIT 1;

  IF v_league_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_enrolled_count
  FROM league_members lm
  WHERE lm.league_id = v_league_id
    AND lm.user_id = ANY(v_all_players);

  IF v_enrolled_count >= 2 THEN
    UPDATE matches SET league_id = v_league_id
    WHERE id = NEW.match_id;
  END IF;

  RETURN NEW;
END;
$function$;
