import { useParams } from 'react-router-dom'

export function MatchDetailPage() {
  const { id } = useParams<{ id: string }>()
  return (
    <div className="flex h-full flex-col items-center justify-center text-gray-400">
      <p className="text-sm">Match {id} — coming soon</p>
    </div>
  )
}
