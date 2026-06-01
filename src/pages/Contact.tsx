import { lazy, Suspense } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronLeft, Mail, MapPin, Building, ChevronRight } from 'lucide-react'

const ContactMap = lazy(() => import('@/components/marketing/ContactMap'))

export function ContactPage() {
  const navigate = useNavigate()
  return (
    <div className="min-h-full bg-cream">
      {/* Header */}
      <div className="bg-white border-b border-gray-100">
        <div className="mx-auto max-w-3xl flex items-center gap-3 px-5 pt-14 pb-4">
          <button
            onClick={() => navigate(-1)}
            className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 hover:bg-gray-200 transition-colors mkt-btn"
            aria-label="Go back"
          >
            <ChevronLeft className="h-5 w-5 text-gray-600" />
          </button>
          <h1 className="font-display text-[18px] font-bold text-navy">Contact Us</h1>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-5 py-8">
        <p className="text-[15px] text-gray-600 leading-relaxed mb-8">
          Have a question, feedback, or need help? We&rsquo;d love to hear from you.
        </p>

        {/* Quick-help banner */}
        <div className="rounded-2xl bg-teal-50 border border-teal-100 p-4 mb-6 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <p className="text-[13px] text-gray-600 flex-1">
            Many questions are answered in our{' '}
            <Link to="/faq" className="text-teal-600 font-semibold mkt-link pb-0.5">FAQ</Link>{' '}
            and{' '}
            <Link to="/support" className="text-teal-600 font-semibold mkt-link pb-0.5">Help Centre</Link>.
          </p>
          <Link
            to="/faq"
            className="mkt-btn inline-flex items-center gap-1 rounded-lg bg-white border border-teal-200 px-3 py-1.5 text-[12px] font-semibold text-teal-600 hover:bg-teal-50 transition-colors flex-shrink-0"
          >
            Browse FAQ
            <ChevronRight className="h-3 w-3" />
          </Link>
        </div>

        {/* Map + business details — side by side on desktop */}
        <div className="grid sm:grid-cols-2 gap-5 mb-8">
          {/* Map */}
          <div className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white" style={{ minHeight: 280 }}>
            <Suspense fallback={
              <div className="h-[280px] bg-gray-100 flex items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
              </div>
            }>
              <ContactMap />
            </Suspense>
            <div className="p-4">
              <p className="font-display text-[14px] font-bold text-navy">Based in Dublin</p>
            </div>
          </div>

          {/* Business details */}
          <div className="space-y-4">
            <div className="mkt-card-hover rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
              <div className="flex items-start gap-4">
                <div className="h-10 w-10 rounded-xl bg-teal-50 flex items-center justify-center flex-shrink-0">
                  <Building className="h-5 w-5 text-teal-600" />
                </div>
                <div>
                  <h2 className="text-[14px] font-bold text-navy mb-1">Registered Office</h2>
                  <p className="text-[13px] text-gray-600">Wynaxa Sports Tech Ltd</p>
                  <p className="text-[12px] text-gray-400">(part of Wynaxa Limited)</p>
                  <div className="flex items-start gap-1.5 mt-2">
                    <MapPin className="h-3.5 w-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
                    <p className="text-[13px] text-gray-500">26 Fitzwilliam Square West, Dublin, D02 HX82, Ireland</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Email cards */}
        <div className="grid sm:grid-cols-2 gap-5 mb-8">
          <div className="mkt-card-hover rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-xl bg-teal-50 flex items-center justify-center flex-shrink-0">
                <Mail className="h-5 w-5 text-teal-600" />
              </div>
              <div>
                <h2 className="text-[14px] font-bold text-navy mb-1">Support &amp; Enquiries</h2>
                <a href="mailto:support@padelplayersapp.com" className="text-[13px] text-teal-600 font-semibold mkt-link pb-0.5">
                  support@padelplayersapp.com
                </a>
                <p className="text-[12px] text-gray-400 mt-1">We respond within 1 business day.</p>
              </div>
            </div>
          </div>
          <div className="mkt-card-hover rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-xl bg-teal-50 flex items-center justify-center flex-shrink-0">
                <Mail className="h-5 w-5 text-teal-600" />
              </div>
              <div>
                <h2 className="text-[14px] font-bold text-navy mb-1">Privacy &amp; Data</h2>
                <a href="mailto:privacy@padelplayersapp.com" className="text-[13px] text-teal-600 font-semibold mkt-link pb-0.5">
                  privacy@padelplayersapp.com
                </a>
                <p className="text-[12px] text-gray-400 mt-1">GDPR requests, data deletion, privacy questions.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Report abuse */}
        <div className="rounded-2xl bg-red-50 border border-red-100 p-5 mb-8">
          <p className="text-[14px] font-bold text-navy mb-1">Report abuse or harassment</p>
          <p className="text-[13px] text-gray-600 leading-relaxed">
            Email{' '}
            <a href="mailto:support@padelplayersapp.com" className="text-teal-600 mkt-link pb-0.5">
              support@padelplayersapp.com
            </a>{' '}
            with details, or{' '}
            <Link to="/faq#report-player" className="text-teal-600 mkt-link pb-0.5">
              report players directly
            </Link>{' '}
            in the app. All reports are investigated within 48 hours.
          </p>
        </div>

        {/* Footer links */}
        <div className="pt-6 border-t border-gray-100">
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] font-medium text-gray-400">
            <Link to="/support" className="mkt-link pb-0.5 hover:text-teal-600 transition-colors">Help Centre</Link>
            <Link to="/faq" className="mkt-link pb-0.5 hover:text-teal-600 transition-colors">FAQ</Link>
            <Link to="/privacy" className="mkt-link pb-0.5 hover:text-teal-600 transition-colors">Privacy</Link>
            <Link to="/terms" className="mkt-link pb-0.5 hover:text-teal-600 transition-colors">Terms</Link>
            <Link to="/" className="mkt-link pb-0.5 hover:text-teal-600 transition-colors">Home</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
