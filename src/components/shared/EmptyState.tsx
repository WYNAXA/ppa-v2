import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon: ReactNode
  title: string
  subtitle?: string
  actionLabel?: string
  onAction?: () => void
}

export function EmptyState({ icon, title, subtitle, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="h-16 w-16 rounded-2xl bg-gray-50 flex items-center justify-center mb-4 text-gray-300">
        {icon}
      </div>
      <p className="text-[15px] font-bold text-gray-700 mb-1">{title}</p>
      {subtitle && (
        <p className="text-[13px] text-gray-400 max-w-xs">{subtitle}</p>
      )}
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-5 rounded-xl bg-[#009688] px-5 py-2.5 text-[13px] font-bold text-white"
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
