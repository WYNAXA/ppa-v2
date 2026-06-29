import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { classifyEloStage, type EloStage } from '@/lib/eloStage'

// COPY — edit freely
const STAGE_COPY: Record<EloStage, {
  headline: string
  body: string
  cta: string
  route: string
}> = {
  new: {
    headline: 'Welcome to the rankings!',
    body: 'You\'ve played {matches} match{matches_s} so far — keep going to unlock your trajectory. Your current ELO is {career_elo}.',
    cta: 'Find a match',
    route: '/open-matches',
  },
  building: {
    headline: 'Building your rating',
    body: 'With {matches} matches played, your ELO of {career_elo} is still settling. A few more games and we can show your trend.',
    cta: 'Find a match',
    route: '/open-matches',
  },
  climbing: {
    headline: 'You\'re climbing!',
    body: 'Up {delta} ELO over your last {window} rated matches — great momentum. Consider coaching to keep the streak going.',
    cta: 'Find coaching',
    route: '/community',
  },
  steady: {
    headline: 'Holding steady',
    body: 'Your ELO has stayed within a tight band over the last {window} rated matches ({delta_signed}). A competition could be the push you need.',
    cta: 'Browse competitions',
    route: '/compete',
  },
  dipping: {
    headline: 'Time to regroup',
    body: 'You\'ve dipped {delta_abs} ELO over the last {window} rated matches. A session with a coach can help turn it around.',
    cta: 'Find coaching',
    route: '/community',
  },
}

interface EloStageCardProps {
  userId: string
  matchesPlayed: number
  careerElo: number
}

export function EloStageCard({ userId, matchesPlayed, careerElo }: EloStageCardProps) {
  const navigate = useNavigate()

  const { data: eloHistory = [] } = useQuery<number[]>({
    queryKey: ['elo-stage-history', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from('rating_history')
        .select('rating_after')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(100)
      return (data ?? []).map((r) => r.rating_after as number)
    },
    staleTime: 60_000,
  })

  const { stage, delta, window } = classifyEloStage(matchesPlayed, eloHistory)
  const copy = STAGE_COPY[stage]

  const interpolated = copy.body
    .replace(/{career_elo}/g, careerElo.toLocaleString())
    .replace(/{delta}/g, String(Math.abs(delta)))
    .replace(/{delta_abs}/g, String(Math.abs(delta)))
    .replace(/{delta_signed}/g, (delta >= 0 ? '+' : '') + String(delta))
    .replace(/{window}/g, String(window))
    .replace(/{matches}/g, String(matchesPlayed))
    .replace(/{matches_s}/g, matchesPlayed === 1 ? '' : 'es')

  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 mb-3">
      <p className="text-[13px] font-bold text-gray-900">{copy.headline}</p>
      <p className="text-[12px] text-gray-500 mt-1 leading-relaxed">{interpolated}</p>
      <button
        onClick={() => navigate(copy.route)}
        className="mt-3 rounded-xl bg-[#009688] px-4 py-2 text-[12px] font-bold text-white active:scale-95 transition-transform"
      >
        {copy.cta}
      </button>
    </div>
  )
}
