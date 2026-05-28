import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Area, AreaChart } from 'recharts'
import { format, parseISO, subMonths } from 'date-fns'
import { useDateLocale } from '@/lib/dateLocale'
import { useTranslation } from 'react-i18next'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

// ── Types ────────────────────────────────────────────────────────────────────

interface EloHistoryChartProps {
  userId: string
  compact?: boolean
}

type TimeRange = '1m' | '3m' | '6m' | 'all'

interface HistoryPoint {
  date: string
  elo: number
  change: number
  label: string
}

// ── Custom Tooltip ───────────────────────────────────────────────────────────

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.[0]) return null
  const d = payload[0].payload as HistoryPoint
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-lg px-3 py-2">
      <p className="text-[11px] text-gray-400">{d.label}</p>
      <p className="text-[14px] font-bold text-gray-900">{d.elo.toLocaleString()} ELO</p>
      <p className={cn('text-[12px] font-semibold', d.change > 0 ? 'text-green-600' : d.change < 0 ? 'text-red-500' : 'text-gray-400')}>
        {d.change > 0 ? '+' : ''}{d.change}
      </p>
    </div>
  )
}

// ── Component ────────────────────────────────────────────────────────────────

export function EloHistoryChart({ userId, compact }: EloHistoryChartProps) {
  const locale = useDateLocale()
  const { t } = useTranslation()
  const [range, setRange] = useState<TimeRange>('3m')
  const [selectedPoint, setSelectedPoint] = useState<HistoryPoint | null>(null)

  // Fetch current ELO from profile
  const { data: currentElo } = useQuery<number | null>({
    queryKey: ['current-elo', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('internal_ranking').eq('id', userId).single()
      return (data?.internal_ranking as number) ?? null
    },
    staleTime: 60_000,
  })

  // Fetch rating history
  const { data: rawHistory = [] } = useQuery<HistoryPoint[]>({
    queryKey: ['elo-history', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from('rating_history')
        .select('rating_after, rating_change, created_at')
        .eq('user_id', userId)
        .gte('created_at', '2026-04-29T00:00:00Z')
        .order('created_at', { ascending: true })
        .limit(100)
      return (data ?? []).map(r => ({
        date: r.created_at as string,
        elo: r.rating_after as number,
        change: r.rating_change as number,
        label: format(parseISO(r.created_at as string), 'd MMM', { locale }),
      }))
    },
    staleTime: 5 * 60 * 1000,
  })

  // Always append current ELO as final point
  const history = useMemo(() => {
    if (currentElo == null) return rawHistory
    const lastHistoryElo = rawHistory.length > 0 ? rawHistory[rawHistory.length - 1].elo : null
    if (lastHistoryElo === currentElo) return rawHistory
    return [...rawHistory, { date: new Date().toISOString(), elo: currentElo, change: 0, label: t('compete.now') }]
  }, [rawHistory, currentElo])

  // Time-filtered data
  const filteredHistory = useMemo(() => {
    if (range === 'all' || history.length === 0) return history
    const cutoff = subMonths(new Date(), range === '1m' ? 1 : range === '3m' ? 3 : 6)
    return history.filter(h => new Date(h.date) >= cutoff)
  }, [history, range])

  // Computed stats
  const peakElo = Math.max(...history.map(h => h.elo), 0)

  const thirtyDayTrend = useMemo(() => {
    const cutoff = subMonths(new Date(), 1)
    const recent = history.filter(h => new Date(h.date) >= cutoff)
    if (recent.length < 2) return null
    return recent[recent.length - 1].elo - recent[0].elo
  }, [history])

  // Empty state (no history AND no current ELO, or only single current point)
  if (rawHistory.length === 0) {
    return (
      <div className={cn('rounded-2xl bg-gray-50 border border-gray-100 p-6 text-center', compact && 'p-4')}>
        {currentElo != null && (
          <p className="text-[22px] font-black text-[#009688] mb-1">{currentElo.toLocaleString()} ELO</p>
        )}
        <p className="text-[13px] font-semibold text-gray-500">{currentElo != null ? t('compete.current_rating') : t('compete.no_rating_history')}</p>
        <p className="text-[11px] text-gray-400 mt-1">{t('compete.play_to_build_history')}</p>
      </div>
    )
  }

  return (
    <div>
      {/* Time filter pills */}
      <div className="flex gap-1.5 mb-3">
        {(['1m', '3m', '6m', 'all'] as TimeRange[]).map(r => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={cn(
              'rounded-full px-3 py-1 text-[11px] font-semibold transition-colors',
              range === r ? 'bg-[#009688] text-white' : 'bg-gray-100 text-gray-500'
            )}
          >
            {r === 'all' ? t('compete.time_all') : r.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Selected point display */}
      {selectedPoint && (
        <div className="flex items-center justify-between rounded-xl bg-gray-50 border border-gray-100 px-3 py-2 mb-2">
          <div>
            <p className="text-[11px] text-gray-400">{selectedPoint.label}</p>
            <p className="text-[16px] font-bold text-gray-900">{selectedPoint.elo.toLocaleString()} ELO</p>
          </div>
          <p className={cn('text-[13px] font-semibold', selectedPoint.change > 0 ? 'text-green-600' : selectedPoint.change < 0 ? 'text-red-500' : 'text-gray-400')}>
            {selectedPoint.change > 0 ? '+' : ''}{selectedPoint.change}
          </p>
        </div>
      )}

      {/* Chart */}
      <div className={compact ? 'h-32' : 'h-48'}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={filteredHistory} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="eloGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#009688" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#009688" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} domain={['dataMin - 20', 'dataMax + 20']} />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={1500} stroke="#E5E7EB" strokeDasharray="3 3" />
            {peakElo > 0 && (
              <ReferenceLine
                y={peakElo}
                stroke="#D97706"
                strokeDasharray="3 3"
                label={{ value: `Peak: ${peakElo}`, position: 'insideTopLeft', offset: 5, fontSize: 10, fill: '#D97706', fontWeight: 600 }}
              />
            )}
            <Area
              type="monotone"
              dataKey="elo"
              stroke="#009688"
              strokeWidth={2}
              fill="url(#eloGradient)"
              dot={{ r: 3, fill: '#009688', stroke: '#fff', strokeWidth: 1.5, cursor: 'pointer' }}
              activeDot={{
                r: 6, fill: '#009688', stroke: '#fff', strokeWidth: 2, cursor: 'pointer',
                onClick: (_e: any, payload: any) => {
                  if (payload?.payload) setSelectedPoint(payload.payload as HistoryPoint)
                },
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Trend indicator */}
      {thirtyDayTrend !== null && (
        <div className="flex items-center gap-1.5 mt-2">
          {thirtyDayTrend > 0
            ? <TrendingUp className="h-3.5 w-3.5 text-green-600" />
            : <TrendingDown className="h-3.5 w-3.5 text-red-500" />
          }
          <span className={cn(
            'text-[12px] font-semibold',
            thirtyDayTrend > 0 ? 'text-green-600' : 'text-red-500'
          )}>
            {thirtyDayTrend > 0 ? '+' : ''}{thirtyDayTrend} {t('compete.elo_last_30d')}
          </span>
        </div>
      )}
    </div>
  )
}
