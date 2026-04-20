import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'

export function PlaceholderPage({ title }: { title: string }) {
  const navigate = useNavigate()
  return (
    <div className="min-h-full bg-white">
      <div className="flex items-center gap-3 px-5 pt-14 pb-4">
        <button
          onClick={() => navigate(-1)}
          className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center"
        >
          <ChevronLeft className="h-5 w-5 text-gray-600" />
        </button>
        <h1 className="text-xl font-bold text-gray-900">{title}</h1>
      </div>
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <p className="text-sm">Coming soon</p>
      </div>
    </div>
  )
}
