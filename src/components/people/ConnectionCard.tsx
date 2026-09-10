import { useNavigate } from 'react-router-dom'
import { PlayerAvatar } from '@/components/shared/PlayerAvatar'
import { MapPin } from 'lucide-react'

interface ConnectionCardProps {
  player: { id?: string; user_id?: string; name: string; avatar_url?: string | null; city?: string | null; internal_ranking?: number | null }
  children?: React.ReactNode
}

export function ConnectionCard({ player, children }: ConnectionCardProps) {
  const navigate = useNavigate()
  const playerId = player.user_id ?? player.id

  return (
    <div className="flex items-center gap-3 rounded-xl bg-card border border-hairline px-3 py-3">
      <button
        onClick={() => playerId && navigate(`/players/${playerId}`)}
        className="flex items-center gap-3 flex-1 min-w-0 text-left active:opacity-70 transition-opacity"
      >
        <PlayerAvatar name={player.name} avatarUrl={player.avatar_url} size="sm" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-ink truncate">{player.name}</p>
          {player.city && (
            <div className="flex items-center gap-1 mt-0.5">
              <MapPin className="h-2.5 w-2.5 text-ink-2" />
              <p className="text-[11px] text-ink-2">{player.city}</p>
            </div>
          )}
        </div>
      </button>
      {player.internal_ranking != null && (
        <span className="text-[11px] font-bold text-court-700 bg-court-50 border border-court-100 rounded-full px-2 py-0.5 flex-shrink-0">
          {player.internal_ranking}
        </span>
      )}
      {children && <div className="flex gap-1.5 flex-shrink-0">{children}</div>}
    </div>
  )
}
