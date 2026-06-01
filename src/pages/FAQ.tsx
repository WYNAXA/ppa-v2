import { useState, useEffect, useRef, useMemo } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ChevronLeft, ChevronDown, Search, X } from 'lucide-react'
import { FAQS, FAQ_CATEGORIES } from './faqData'
import { useReducedMotion } from '@/components/marketing/useReducedMotion'

/* ── Accordion item ── */
function FaqAccordion({ id, q, a, defaultOpen }: { id: string; q: string; a: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false)
  const [height, setHeight] = useState<number | undefined>(undefined)
  const contentRef = useRef<HTMLDivElement>(null)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    if (open && contentRef.current) {
      setHeight(contentRef.current.scrollHeight)
    }
  }, [open])

  return (
    <div id={id} className="border-b border-gray-100 last:border-0 scroll-mt-28">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-4 py-4 text-left group"
      >
        <span className="text-[14px] font-semibold text-navy group-hover:text-teal-600 transition-colors">{q}</span>
        <ChevronDown
          className={`h-4 w-4 flex-shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          style={reducedMotion ? { transition: 'none' } : undefined}
        />
      </button>
      <div
        ref={contentRef}
        className="overflow-hidden"
        style={{
          maxHeight: open ? (height ?? 500) + 'px' : '0px',
          transition: reducedMotion ? 'none' : 'max-height 0.25s ease',
        }}
      >
        <p className="pb-4 text-[13px] text-gray-600 leading-relaxed">{a}</p>
      </div>
    </div>
  )
}

/* ── Page ── */
export function FAQPage() {
  const { hash } = useLocation()
  const [search, setSearch] = useState('')
  const initialCategory = useMemo(() => {
    if (!hash) return null
    const item = FAQS.find((f) => f.id === hash.replace('#', ''))
    return item?.topic ?? null
  }, [hash])
  const [activeCategory, setActiveCategory] = useState<string | null>(initialCategory)

  /* Scroll to targeted FAQ */
  useEffect(() => {
    if (hash) {
      const id = hash.replace('#', '')
      setTimeout(() => {
        const el = document.getElementById(id)
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 150)
    }
  }, [hash])

  const targetId = hash.replace('#', '')

  /* Filtered items */
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return FAQS
    return FAQS.filter(
      (f) => f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q)
    )
  }, [search])

  /* Group by category */
  const grouped = useMemo(() => {
    const visible = activeCategory
      ? filtered.filter((f) => f.topic === activeCategory)
      : filtered
    const map = new Map<string, typeof FAQS>()
    for (const f of visible) {
      if (!map.has(f.topic)) map.set(f.topic, [])
      map.get(f.topic)!.push(f)
    }
    return map
  }, [filtered, activeCategory])

  return (
    <div className="min-h-full bg-cream">
      {/* Header */}
      <div className="bg-white border-b border-gray-100">
        <div className="mx-auto max-w-3xl flex items-center gap-3 px-5 pt-14 pb-4">
          <Link
            to="/"
            className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 hover:bg-gray-200 transition-colors mkt-btn"
            aria-label="Back to home"
          >
            <ChevronLeft className="h-5 w-5 text-gray-600" />
          </Link>
          <h1 className="font-display text-[18px] font-bold text-navy">Frequently Asked Questions</h1>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-5 py-8">
        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search questions..."
            className="w-full rounded-xl border border-gray-200 bg-white pl-10 pr-10 py-3 text-[14px] outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
              aria-label="Clear search"
            >
              <X className="h-3 w-3 text-gray-500" />
            </button>
          )}
        </div>

        {/* Category chips */}
        <div className="flex gap-2 overflow-x-auto scrollbar-none pb-4 -mx-1 px-1 mb-6">
          <button
            onClick={() => setActiveCategory(null)}
            className={`mkt-btn flex-shrink-0 rounded-full px-4 py-1.5 text-[12px] font-semibold transition-colors ${
              !activeCategory
                ? 'bg-teal-500 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-teal-200 hover:text-teal-600'
            }`}
          >
            All
          </button>
          {FAQ_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(activeCategory === cat.id ? null : cat.id)}
              className={`mkt-btn flex-shrink-0 rounded-full px-4 py-1.5 text-[12px] font-semibold transition-colors ${
                activeCategory === cat.id
                  ? 'bg-teal-500 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:border-teal-200 hover:text-teal-600'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Grouped FAQ items */}
        {grouped.size === 0 ? (
          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-8 text-center">
            <p className="text-[14px] text-gray-500">No questions match your search.</p>
            <button
              onClick={() => { setSearch(''); setActiveCategory(null) }}
              className="mt-3 text-[13px] text-teal-600 font-semibold hover:underline"
            >
              Clear filters
            </button>
          </div>
        ) : (
          Array.from(grouped.entries()).map(([topic, items]) => {
            const cat = FAQ_CATEGORIES.find((c) => c.id === topic)
            return (
              <div key={topic} id={`cat-${topic}`} className="mb-6 scroll-mt-24">
                <h2 className="font-display text-[15px] font-bold text-navy mb-2 px-1">{cat?.label ?? topic}</h2>
                <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden px-5">
                  {items.map((faq) => (
                    <FaqAccordion
                      key={faq.id}
                      id={faq.id}
                      q={faq.q}
                      a={faq.a}
                      defaultOpen={faq.id === targetId}
                    />
                  ))}
                </div>
              </div>
            )
          })
        )}

        {/* Still need help? */}
        <div className="mt-10 rounded-2xl bg-teal-50 border border-teal-100 p-5 text-center">
          <p className="text-[14px] font-semibold text-navy mb-1">Still have a question?</p>
          <p className="text-[13px] text-gray-600 mb-3">We're happy to help.</p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link
              to="/contact"
              className="mkt-btn inline-flex items-center gap-1.5 rounded-xl bg-teal-500 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-teal-600 transition-colors"
            >
              Contact Us
            </Link>
            <Link
              to="/support"
              className="mkt-btn inline-flex items-center gap-1.5 rounded-xl border border-teal-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-teal-600 hover:bg-teal-50 transition-colors"
            >
              Help Centre
            </Link>
          </div>
        </div>

        {/* Footer links */}
        <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-[13px] font-medium text-gray-400">
          <Link to="/support" className="mkt-link pb-0.5 hover:text-teal-600 transition-colors">Support</Link>
          <Link to="/contact" className="mkt-link pb-0.5 hover:text-teal-600 transition-colors">Contact</Link>
          <Link to="/privacy" className="mkt-link pb-0.5 hover:text-teal-600 transition-colors">Privacy</Link>
          <Link to="/terms" className="mkt-link pb-0.5 hover:text-teal-600 transition-colors">Terms</Link>
          <Link to="/" className="mkt-link pb-0.5 hover:text-teal-600 transition-colors">Home</Link>
        </div>
      </div>
    </div>
  )
}
