import { PlayerAvatar } from '@/components/shared/PlayerAvatar'
import { MapPin } from 'lucide-react'

interface ConnectionCardProps {
  player: { id?: string; user_id?: string; name: string; avatar_url?: string | null; city?: string | null; internal_ranking?: number | null }
  children?: React.ReactNode
}

export function ConnectionCard({ player, children }: ConnectionCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-white border border-gray-100 px-3 py-3">
      <PlayerAvatar name={player.name} avatarUrl={player.avatar_url} size="sm" />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-gray-800 truncate">{player.name}</p>
        {player.city && (
          <div className="flex items-center gap-1 mt-0.5">
            <MapPin className="h-2.5 w-2.5 text-gray-400" />
            <p className="text-[11px] text-gray-400">{player.city}</p>
          </div>
        )}
      </div>
      {player.internal_ranking != null && (
        <span className="text-[10px] font-bold text-teal-700 bg-teal-50 border border-teal-100 rounded-full px-2 py-0.5 flex-shrink-0">
          {player.internal_ranking}
        </span>
      )}
      {children && <div className="flex gap-1.5 flex-shrink-0">{children}</div>}
    </div>
  )
}
