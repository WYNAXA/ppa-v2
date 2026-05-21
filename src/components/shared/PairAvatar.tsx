import { PlayerAvatar } from './PlayerAvatar'

interface PairAvatarProps {
  player1: { name?: string | null; avatarUrl?: string | null }
  player2: { name?: string | null; avatarUrl?: string | null }
  size?: 'sm' | 'md'
}

export function PairAvatar({ player1, player2, size = 'sm' }: PairAvatarProps) {
  return (
    <div className="inline-flex -space-x-2">
      <PlayerAvatar name={player1.name} avatarUrl={player1.avatarUrl} size={size} />
      <PlayerAvatar name={player2.name} avatarUrl={player2.avatarUrl} size={size} />
    </div>
  )
}
