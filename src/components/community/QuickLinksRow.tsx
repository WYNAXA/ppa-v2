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
    <div className="flex gap-2">
      {sections.map((s) => (
        <button
          key={s.key}
          onClick={() => handleTap(s)}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 rounded-xl py-3 text-[12px] font-semibold border transition-colors',
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
