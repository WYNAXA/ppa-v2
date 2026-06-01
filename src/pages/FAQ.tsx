import { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { ChevronLeft, ChevronDown } from 'lucide-react'
import { FAQS } from './faqData'

function FaqAccordion({ id, q, a, defaultOpen }: { id: string; q: string; a: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false)
  return (
    <div id={id} className="border-b border-gray-100 last:border-0 scroll-mt-24">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-4 py-4 text-left"
      >
        <span className="text-[14px] font-semibold text-navy">{q}</span>
        <ChevronDown
          className={`h-4 w-4 flex-shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <p className="pb-4 text-[13px] text-gray-600 leading-relaxed -mt-1">{a}</p>
      )}
    </div>
  )
}

export function FAQPage() {
  const navigate = useNavigate()
  const { hash } = useLocation()

  /* Auto-open the FAQ targeted by the URL hash */
  useEffect(() => {
    if (hash) {
      const el = document.getElementById(hash.replace('#', ''))
      if (el) {
        setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
      }
    }
  }, [hash])

  const targetId = hash.replace('#', '')

  return (
    <div className="min-h-full bg-cream">
      {/* Header */}
      <div className="bg-white border-b border-gray-100">
        <div className="mx-auto max-w-2xl flex items-center gap-3 px-5 pt-14 pb-4">
          <button
            onClick={() => navigate(-1)}
            className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 hover:bg-gray-200 transition-colors"
            aria-label="Go back"
          >
            <ChevronLeft className="h-5 w-5 text-gray-600" />
          </button>
          <h1 className="text-[18px] font-bold text-navy">Frequently Asked Questions</h1>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-5 py-8">
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden px-5">
          {FAQS.map((faq) => (
            <FaqAccordion
              key={faq.id}
              id={faq.id}
              q={faq.q}
              a={faq.a}
              defaultOpen={faq.id === targetId}
            />
          ))}
        </div>

        {/* Cross-links */}
        <div className="mt-8 rounded-2xl bg-teal-50 border border-teal-100 p-5 text-center">
          <p className="text-[14px] font-semibold text-navy mb-1">Still have a question?</p>
          <p className="text-[13px] text-gray-600 mb-3">We&rsquo;re happy to help.</p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link
              to="/contact"
              className="inline-flex items-center gap-1.5 rounded-xl bg-teal-500 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-teal-600 transition-colors"
            >
              Contact Us
            </Link>
            <Link
              to="/support"
              className="inline-flex items-center gap-1.5 rounded-xl border border-teal-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-teal-600 hover:bg-teal-50 transition-colors"
            >
              Help Centre
            </Link>
          </div>
        </div>

        {/* Footer links */}
        <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-[13px] font-medium text-gray-400">
          <Link to="/support" className="hover:text-teal-600 transition-colors">Support</Link>
          <Link to="/contact" className="hover:text-teal-600 transition-colors">Contact</Link>
          <Link to="/privacy" className="hover:text-teal-600 transition-colors">Privacy</Link>
          <Link to="/terms" className="hover:text-teal-600 transition-colors">Terms</Link>
          <Link to="/" className="hover:text-teal-600 transition-colors">Home</Link>
        </div>
      </div>
    </div>
  )
}
