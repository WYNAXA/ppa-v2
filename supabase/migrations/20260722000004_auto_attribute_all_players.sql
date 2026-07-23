-- ══════════════════════════════════════════════════════════════════════════════
-- auto_attribute_match_to_league()
--
-- Trigger on match_results. Attributes a match to the group's active league
-- when the result is recorded.
--
-- CHANGE: previously required >= 2 enrolled players. Now requires ALL players
-- to be league members. Rationale: if one player is not enrolled they cannot
-- earn season points, so the set is not a true league fixture — their rating
-- movement lands on career ELO only.
--
-- Forward-looking only. Past attributions are unchanged.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.auto_attribute_match_to_league()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

  IF v_enrolled_count = array_length(v_all_players, 1) THEN
    UPDATE matches SET league_id = v_league_id
    WHERE id = NEW.match_id;
  END IF;

  RETURN NEW;
END;
$$;
