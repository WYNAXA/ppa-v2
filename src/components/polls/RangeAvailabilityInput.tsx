/**
 * Range availability input for poll voters.
 * For each poll date, the player adds one or more time ranges.
 */

import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'

interface TimeRange {
  start: string  // "HH:MM"
  end: string    // "HH:MM"
}

interface Props {
  dates: string[]  // ["yyyy-MM-dd", ...]
  value: Record<string, TimeRange[]>  // { "yyyy-MM-dd": [...] }
  onChange: (ranges: Record<string, TimeRange[]>) => void
}

const PRESETS = [
  { label: 'Morning', start: '06:00', end: '12:00' },
  { label: 'Afternoon', start: '12:00', end: '17:00' },
  { label: 'Evening', start: '17:00', end: '23:00' },
  { label: 'All day', start: '06:00', end: '23:00' },
]

const TIME_OPTIONS: string[] = []
for (let h = 0; h < 24; h++) {
  for (const m of ['00', '30']) {
    TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:${m}`)
  }
}
TIME_OPTIONS.push('23:59')

function formatDateLabel(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T12:00:00')
    return format(d, 'EEEE d MMM')
  } catch {
    return dateStr
  }
}

export function RangeAvailabilityInput({ dates, value, onChange }: Props) {
  const [expandedDate, setExpandedDate] = useState<string | null>(dates[0] ?? null)

  function addRange(date: string, range: TimeRange) {
    const current = value[date] ?? []
    onChange({ ...value, [date]: [...current, range] })
  }

  function removeRange(date: string, index: number) {
    const current = value[date] ?? []
    onChange({ ...value, [date]: current.filter((_, i) => i !== index) })
  }

  function updateRange(date: string, index: number, field: 'start' | 'end', val: string) {
    const current = [...(value[date] ?? [])]
    current[index] = { ...current[index], [field]: val }
    onChange({ ...value, [date]: current })
  }

  return (
    <div className="space-y-3">
      {dates.map(date => {
        const ranges = value[date] ?? []
        const isExpanded = expandedDate === date
        const hasRanges = ranges.length > 0

        return (
          <div key={date} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            {/* Date header */}
            <button
              onClick={() => setExpandedDate(isExpanded ? null : date)}
              className="w-full flex items-center justify-between px-4 py-3"
            >
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-gray-900">
                  {formatDateLabel(date)}
                </span>
                {hasRanges && (
                  <span className="text-[10px] font-bold text-teal-700 bg-teal-50 rounded-full px-2 py-0.5">
                    {ranges.length} range{ranges.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <span className="text-[11px] text-gray-400">
                {isExpanded ? 'collapse' : hasRanges ? 'edit' : 'add times'}
              </span>
            </button>

            {/* Expanded content */}
            {isExpanded && (
              <div className="px-4 pb-4 space-y-3 border-t border-gray-100">
                {/* Preset shortcuts */}
                <div className="flex flex-wrap gap-1.5 pt-3">
                  {PRESETS.map(preset => (
                    <button
                      key={preset.label}
                      onClick={() => addRange(date, { start: preset.start, end: preset.end })}
                      className="text-[11px] font-semibold text-[#009688] bg-teal-50 border border-teal-100 rounded-lg px-2.5 py-1.5 hover:bg-teal-100 transition-colors"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                {/* Added ranges */}
                {ranges.map((range, idx) => {
                  const startMin = parseInt(range.start.split(':')[0]) * 60 + parseInt(range.start.split(':')[1])
                  const endMin = parseInt(range.end.split(':')[0]) * 60 + parseInt(range.end.split(':')[1])
                  const isValid = endMin > startMin && range.end <= '23:59'

                  return (
                    <div key={idx} className={cn(
                      "flex items-center gap-2 rounded-lg border px-3 py-2",
                      isValid ? "border-gray-200 bg-gray-50" : "border-red-200 bg-red-50"
                    )}>
                      <select
                        value={range.start}
                        onChange={e => updateRange(date, idx, 'start', e.target.value)}
                        className="text-[13px] bg-transparent text-gray-800 font-medium outline-none"
                        style={{ fontSize: '16px' }}
                      >
                        {TIME_OPTIONS.filter(t => t !== '23:59').map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                      <span className="text-[12px] text-gray-400">to</span>
                      <select
                        value={range.end}
                        onChange={e => updateRange(date, idx, 'end', e.target.value)}
                        className="text-[13px] bg-transparent text-gray-800 font-medium outline-none"
                        style={{ fontSize: '16px' }}
                      >
                        {TIME_OPTIONS.filter(t => t > range.start).map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => removeRange(date, idx)}
                        className="ml-auto text-gray-400 hover:text-red-500"
                      >
                        <X className="h-4 w-4" />
                      </button>
                      {!isValid && (
                        <span className="text-[10px] text-red-500">Invalid</span>
                      )}
                    </div>
                  )
                })}

                {/* Add another range */}
                <button
                  onClick={() => addRange(date, { start: '19:00', end: '21:00' })}
                  className="flex items-center gap-1.5 text-[12px] text-[#009688] font-semibold hover:text-[#00796B]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add another time range
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
