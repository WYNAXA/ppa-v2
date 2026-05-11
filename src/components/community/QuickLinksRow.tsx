import { useEffect, useRef, useState, useCallback } from 'react'
import { cn } from '@/lib/utils'

interface SectionDef {
  key: string
  emoji: string
  label: string
  ref: React.RefObject<HTMLElement | null>
}

interface QuickLinksRowProps {
  sections: SectionDef[]
}

export function QuickLinksRow({ sections }: QuickLinksRowProps) {
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const scrollingRef = useRef(false)

  // IntersectionObserver to track which section is visible
  useEffect(() => {
    const observers: IntersectionObserver[] = []

    for (const section of sections) {
      if (!section.ref.current) continue
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (scrollingRef.current) return
          if (entry.isIntersecting) setActiveKey(section.key)
        },
        { threshold: 0.3 },
      )
      observer.observe(section.ref.current)
      observers.push(observer)
    }

    return () => observers.forEach((o) => o.disconnect())
  }, [sections])

  const handleTap = useCallback((section: SectionDef) => {
    // Suppress observer updates during programmatic scroll
    scrollingRef.current = true
    setActiveKey(section.key)
    section.ref.current?.scrollIntoView({ behavior: 'smooth' })
    setTimeout(() => { scrollingRef.current = false }, 500)
  }, [])

  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
      {sections.map((s) => (
        <button
          key={s.key}
          onClick={() => handleTap(s)}
          className={cn(
            'flex-shrink-0 flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2.5 text-[12px] font-semibold border transition-colors min-h-[44px]',
            activeKey === s.key
              ? 'bg-teal-50 text-teal-700 border-teal-200'
              : 'bg-gray-50 text-gray-600 border-gray-100'
          )}
        >
          <span>{s.emoji}</span>
          {s.label}
        </button>
      ))}
    </div>
  )
}
