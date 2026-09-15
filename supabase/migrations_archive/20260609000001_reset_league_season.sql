-- reset_league_season: zero a league's season stats (creator/admin only). Already applied via SQL Editor.
create or replace function reset_league_season(p_league_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
        select 1 from leagues
        where id = p_league_id and created_by = auth.uid()
      )
     and not exists (
        select 1 from league_members
        where league_id = p_league_id and user_id = auth.uid() and role = 'admin'
      )
  then
    raise exception 'not authorized to reset this league season';
  end if;

  update league_standings
  set season_elo = 1230, matches_played = 0, wins = 0, losses = 0,
      draws = 0, ranking_points = 0, updated_at = now()
  where league_id = p_league_id;

  update league_members
  set season_points = 0, wins = 0, losses = 0, draws = 0
  where league_id = p_league_id;
end;
$$;

grant execute on function reset_league_season(uuid) to authenticated;
