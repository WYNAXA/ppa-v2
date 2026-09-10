import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { format, parseISO, addDays } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useDateLocale, getDateLocale } from '@/lib/dateLocale'
import { cn } from '@/lib/utils'
import { AskRingersSheet } from '@/components/match/AskRingersSheet'

/**
 * Club — the group's week — built to `Club.dc.html`.
 *
 * Three questions, in the order a club organiser actually asks them:
 *   1. Which fixtures are short?         → Needs players
 *   2. Who can I call?                   → Ask ringers, on the fixture itself
 *   3. Where are we in the table?        → League snapshot
 */

type ShortMatch = {
  id: string
  match_date: string
  match_time: string | null
  venue: string | null
  court: number | null
  players: Array<{ id: string; name: string | null }>
  spots: number
  /** Average rating of the players already in — the sheet ranks by closeness
      to this, so it is still computed here and passed through. */
  targetElo: number | null
}

type Standing = {
  playerId: string
  name: string | null
  position: number
  played: number
  points: number
}

const initials = (name?: string | null) => {
  if (!name) return '?'
  const p = name.trim().split(/\s+/)
  return (p.length === 1 ? p[0][0] : p[0][0] + p[p.length - 1][0]).toUpperCase()
}

/**
 * This week's fixtures for the group, and which of them are short.
 *
 * WHY THERE IS NO RINGER LIST HERE ANY MORE
 *   UAT: *"ringer on call is nice but for me it shows 4 names - i dont think
 *   they are ringers for my groups. and if so, why only 4 and what do i do with
 *   the names."* All three observations were right, and they were one bug.
 *
 *   This hook used to build its own "ringers" list from
 *   `group_members.status = 'approved'` — which is the *ordinary member* status.
 *   A ringer is a specific thing in this app, `status = 'ringer'`, and the query
 *   excluded them by construction. In BS3 Padel Players that meant showing 4 of
 *   the 22 regular members while the group's 3 actual ringers stayed invisible.
 *   "Only 4" was an arbitrary `.slice(0, 4)`. And the names did nothing, because
 *   there was no request to send from here.
 *
 *   The deeper fault: a complete ringer system already existed —
 *   `AskRingersSheet`, the `ringer_requests` table, the `send_ringer_requests`
 *   RPC, per-ringer request status, and a cross-group pool for players in more
 *   than one club. This hook re-implemented a worse version of it beside the
 *   real one. Fix class: root-cause. Swapping `'approved'` for `'ringer'` would
 *   have been the patch — it fixes the names and leaves the duplicate query, the
 *   arbitrary cap and the dead-end list in place.
 *
 *   "Ask ringers" now opens the sheet that already does this properly, which
 *   also answers "what do i do with the names": you pick them and it sends a
 *   request that expires 24 hours before the match.
 */
function useClubWeek(groupId: string | null, userId: string) {
  return useQuery<{ short: ShortMatch[] }>({
    queryKey: ['club-week', groupId, userId],
    enabled: !!groupId,
    staleTime: 30_000,
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0]
      const weekEnd = format(addDays(new Date(), 14), 'yyyy-MM-dd', { locale: getDateLocale() })

      const { data: matches } = await supabase
        .from('matches')
        .select('id, match_date, match_time, booked_venue_name, booked_court_number, player_ids')
        .eq('group_id', groupId)
        .gte('match_date', today).lte('match_date', weekEnd)
        .not('status', 'in', '(cancelled,completed,open)')
        .order('match_date', { ascending: true })
        .limit(12)

      const shortRaw = (matches ?? []).filter((m) => ((m.player_ids as string[]) ?? []).length < 4)

      // Everyone in the group, so we can name the players in each fixture.
      const { data: members } = await supabase
        .from('group_members')
        .select('user_id')
        .eq('group_id', groupId)
        .eq('status', 'approved')
      const memberIds = (members ?? []).map((m) => m.user_id as string)

      const involved = [...new Set(shortRaw.flatMap((m) => (m.player_ids as string[]) ?? []))]
      const allIds = [...new Set([...memberIds, ...involved])]
      const { data: profiles } = allIds.length
        ? await supabase.from('profiles').select('id, name, internal_ranking').in('id', allIds)
        : { data: [] }
      const pmap = new Map((profiles ?? []).map((p) => [p.id as string, p]))

      const short: ShortMatch[] = shortRaw.map((m) => {
        const ids = (m.player_ids as string[]) ?? []
        const ratings = ids.map((id) => pmap.get(id)?.internal_ranking as number | null).filter((v): v is number => v != null)
        return {
          id: m.id as string,
          match_date: m.match_date as string,
          match_time: m.match_time as string | null,
          venue: m.booked_venue_name as string | null,
          court: m.booked_court_number as number | null,
          players: ids.map((id) => ({ id, name: (pmap.get(id)?.name as string) ?? null })),
          spots: 4 - ids.length,
          targetElo: ratings.length ? Math.round(ratings.reduce((s, v) => s + v, 0) / ratings.length) : null,
        }
      })

      return { short }
    },
  })
}

function useClubLeague(groupId: string | null, userId: string) {
  return useQuery<{ leagueId: string; name: string; rows: Standing[] } | null>({
    queryKey: ['club-league', groupId, userId],
    enabled: !!groupId,
    staleTime: 60_000,
    queryFn: async () => {
      // Leagues link to groups through an array column, not a foreign key.
      // A group can carry several active leagues — this club has two, plus a
      // couple of test ones — so picking "newest" showed a table the player
      // wasn't in, which is why the snapshot rendered as two strangers and no
      // "You" row. Prefer a league the player actually competes in.
      const { data: leagues } = await supabase
        .from('leagues')
        .select('id, name, created_at')
        .contains('linked_group_ids', [groupId])
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(6)
      if (!leagues || leagues.length === 0) return null

      const { data: myLeagueRows } = await supabase
        .from('league_standings')
        .select('league_id')
        .eq('user_id', userId)
        .in('league_id', leagues.map((l) => l.id))
      const imIn = new Set((myLeagueRows ?? []).map((r) => r.league_id as string))
      const league = leagues.find((l) => imIn.has(l.id as string)) ?? leagues[0]

      const { data: rows } = await supabase
        .from('league_standings')
        .select('user_id, ranking_points, matches_played')
        .eq('league_id', league.id)
        .order('ranking_points', { ascending: false })
        .limit(50)
      if (!rows || rows.length === 0) return null

      const ids = rows.map((r) => r.user_id as string)
      const { data: profiles } = await supabase.from('profiles').select('id, name').in('id', ids)
      const nameOf = new Map((profiles ?? []).map((p) => [p.id as string, p.name as string]))

      const all: Standing[] = rows.map((r, i) => ({
        playerId: r.user_id as string,
        name: nameOf.get(r.user_id as string) ?? null,
        position: i + 1,
        played: (r.matches_played as number) ?? 0,
        points: Math.round(Number(r.ranking_points ?? 0)),
      }))

      // The board shows the top two and the player — the table's whole story
      // in three rows.
      const mine = all.find((r) => r.playerId === userId)
      const top = all.slice(0, 2)
      const shown = mine && !top.some((r) => r.playerId === mine.playerId) ? [...top, mine] : top
      return { leagueId: league.id as string, name: league.name as string, rows: shown }
    },
  })
}

export interface ClubThisWeekProps {
  groups: Array<{ id: string; name: string }>
  userId: string
}

export function ClubThisWeek({ groups, userId }: ClubThisWeekProps) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const locale = useDateLocale()
  const [groupIndex, setGroupIndex] = useState(0)
  const [asking, setAsking] = useState<ShortMatch | null>(null)

  const group = groups[groupIndex] ?? null
  const { data: week } = useClubWeek(group?.id ?? null, userId)
  const { data: league } = useClubLeague(group?.id ?? null, userId)

  const short = week?.short ?? []
  const first = short[0]

  const fixtureLine = useMemo(() => {
    if (!first) return ''
    const d = (() => {
      try { return format(parseISO(first.match_date), 'EEE d MMM', { locale }) } catch { return first.match_date }
    })()
    return first.match_time ? `${d} · ${first.match_time.slice(0, 5)}` : d
  }, [first, locale])

  return (
    <div className="flex flex-col gap-[18px]">
      {/* ── Header: title, and which group the week below belongs to ── */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[32px] font-extrabold leading-[34px] tracking-[-0.02em] text-ink">
          {t('nav.people')}
        </h1>
        {group && (
          <button
            onClick={() => groups.length > 1 && setGroupIndex((i) => (i + 1) % groups.length)}
            disabled={groups.length <= 1}
            className="min-h-[44px] flex-shrink-0 truncate rounded-pill border border-hairline bg-card px-3.5 py-2.5 text-[13px] font-semibold leading-4 text-ink-2"
          >
            {group.name}
          </button>
        )}
      </div>

      {/* ── Needs players ── */}
      {group && first && (
        <section className="flex flex-col gap-2.5">
          <h2 className="text-[11px] font-bold uppercase leading-[14px] tracking-[0.06em] text-ink-2">
            {t('club.needs_players')}
          </h2>

          <div className="flex flex-col gap-3 rounded-[16px] border border-hairline bg-card p-[15px]">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="num truncate text-[16px] font-bold leading-5 text-ink">{fixtureLine}</p>
                <p className="truncate text-[13px] leading-[17px] text-ink-2">
                  {[first.venue, first.court != null ? t('home.court_n', { n: first.court }) : null]
                    .filter(Boolean).join(' · ')}
                </p>
              </div>
              <span className="num flex-shrink-0 rounded-pill bg-alert-50 px-2.5 py-1.5 text-[11px] font-bold leading-[14px] text-alert">
                {t('club.n_spots', { count: first.spots })}
              </span>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="flex">
                {first.players.map((p, i) => (
                  <span
                    key={p.id}
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded-pill border-2 border-card text-[11px] font-bold',
                      i === 0 ? 'bg-court text-white' : 'bg-hairline text-ink-2',
                      i > 0 && '-ml-2',
                    )}
                  >
                    {initials(p.name)}
                  </span>
                ))}
                {Array.from({ length: first.spots }, (_, i) => (
                  <span
                    key={`empty-${i}`}
                    className="-ml-2 flex h-7 w-7 items-center justify-center rounded-pill border-2 border-dashed border-ink-4 bg-surface text-[13px] font-bold text-ink-3"
                  >
                    +
                  </span>
                ))}
              </div>
              <p className="num flex-grow text-[13px] leading-[17px] text-ink-2">
                {t('club.n_of_four', { count: first.players.length })}
              </p>
              {/* Opens the real ringer flow. See the note on `useClubWeek`
                  for why this no longer renders a list of its own. */}
              <button
                onClick={() => setAsking(first)}
                className="min-h-[44px] flex-shrink-0 rounded-control bg-court px-3.5 py-2.5 text-[13px] font-semibold leading-4 text-white"
              >
                {t('club.ask_ringers')}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ── League snapshot ── */}
      {group && league && (
        <section className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="truncate text-[11px] font-bold uppercase leading-[14px] tracking-[0.06em] text-ink-2">
              {league.name}
            </h2>
            <button
              onClick={() => navigate(`/compete/leagues/${league.leagueId}`)}
              className="flex-shrink-0 text-[13px] font-semibold leading-4 text-court"
            >
              {t('club.full_table')}
            </button>
          </div>

          <div className="rounded-[16px] border border-hairline bg-card px-3.5 py-1.5">
            {league.rows.map((r, i) => {
              const isMe = r.playerId === userId
              return (
                <div key={r.playerId}>
                  {i > 0 && <div className="h-px bg-hairline" />}
                  <div
                    className={cn(
                      '-mx-3.5 flex items-center gap-3 px-3.5 py-2.5',
                      isMe && 'bg-court-50/60',
                    )}
                  >
                    <span className={cn('num w-4 text-[14px] font-extrabold leading-[17px]', isMe ? 'text-court' : 'text-ink-2')}>
                      {r.position}
                    </span>
                    <span className={cn('flex-grow truncate text-[15px] leading-[19px]', isMe ? 'font-bold text-court' : 'font-semibold text-ink')}>
                      {isMe ? t('common.you') : r.name ?? '—'}
                    </span>
                    <span className="num flex-shrink-0 text-[13px] leading-[17px] text-ink-2">
                      {t('club.n_played', { count: r.played })}
                    </span>
                    <span className={cn('num flex-shrink-0 text-[15px] font-extrabold leading-[19px]', isMe ? 'text-court' : 'text-ink')}>
                      {r.points}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* The real ringer flow: the group's actual ringers (and those of any
          other group the player is in), ranked by closeness to this fixture's
          average, with a request that expires 24 hours before the match. */}
      {asking && (
        <AskRingersSheet
          open
          onClose={() => setAsking(null)}
          onSent={() => setAsking(null)}
          matchId={asking.id}
          groupId={group?.id ?? null}
          matchDateTime={`${asking.match_date}T${asking.match_time ?? '19:00'}`}
          currentPlayerIds={asking.players.map((p) => p.id)}
        />
      )}
    </div>
  )
}

export default ClubThisWeek
