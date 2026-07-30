import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Search, MapPin, ChevronRight, Building2, CalendarCheck, CreditCard, Users, ArrowRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface Venue {
  venue_id: string
  venue_name: string
  city: string | null
  full_address: string | null
  number_of_courts: number | null
}

const VM_URL = 'https://hub.wynaxa.com'

export function ForVenuesPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Venue[]>([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)

  useEffect(() => {
    if (query.length < 2) { setResults([]); setSearched(false); return }
    const timer = setTimeout(async () => {
      setSearching(true)
      const { data } = await supabase
        .from('padel_venues')
        .select('venue_id, venue_name, city, full_address, number_of_courts')
        .eq('status', 'active')
        .or(`venue_name.ilike.%${query}%,city.ilike.%${query}%`)
        .order('venue_name')
        .limit(10)
      setResults(data ?? [])
      setSearching(false)
      setSearched(true)
    }, 400)
    return () => clearTimeout(timer)
  }, [query])

  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-100">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-5 py-4">
          <Link to="/" className="text-[18px] font-bold text-gray-900">
            PPA <span className="text-[#009688]">Venues</span>
          </Link>
          <div className="flex items-center gap-6 text-[14px]">
            <Link to="/" className="text-gray-500 hover:text-gray-900 hidden sm:block">For Players</Link>
            <Link to="/faq" className="text-gray-500 hover:text-gray-900 hidden sm:block">FAQ</Link>
            <a
              href={VM_URL}
              className="rounded-xl bg-[#009688] px-4 py-2 text-[13px] font-bold text-white hover:bg-[#00796B] transition-colors"
            >
              Sign in
            </a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-5 pt-16 pb-12 text-center">
        <h1 className="text-[32px] sm:text-[42px] font-bold text-gray-900 leading-tight">
          Manage your padel venue.<br />
          <span className="text-[#009688]">Take bookings online.</span>
        </h1>
        <p className="mt-4 text-[16px] sm:text-[18px] text-gray-500 max-w-2xl mx-auto leading-relaxed">
          Free to start — no monthly fee, no lock-in. List your courts, set your availability
          and pricing, and let players discover and book you directly. You only pay a small
          fee on bookings taken and paid in-app.
        </p>
        <p className="mt-3 text-[13px] font-semibold text-[#009688]">
          Founding offer: the first 100 venues get Hub Core free for life at a flat 2.25% booking fee.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <a
            href={VM_URL + '/onboarding'}
            className="rounded-2xl bg-[#009688] px-8 py-3.5 text-[15px] font-bold text-white hover:bg-[#00796B] transition-all active:scale-[0.98] flex items-center gap-2"
          >
            Get started free <ArrowRight className="h-4 w-4" />
          </a>
          <a
            href="#search"
            className="rounded-2xl border-2 border-gray-200 px-8 py-3.5 text-[15px] font-bold text-gray-700 hover:border-[#009688] transition-all"
          >
            Find your venue
          </a>
        </div>
      </section>

      {/* What it does */}
      <section className="bg-gray-50 py-16">
        <div className="max-w-5xl mx-auto px-5">
          <h2 className="text-[24px] font-bold text-gray-900 text-center mb-10">Everything you need to run your courts</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: Building2, title: 'Court management', desc: 'Set up your courts, surfaces, and capacity. Indoor, outdoor, covered — all supported.' },
              { icon: CalendarCheck, title: 'Availability & scheduling', desc: 'Define opening hours and block times. Players see real-time availability.' },
              { icon: CreditCard, title: 'Online bookings & payments', desc: 'Accept bookings and payments directly via Stripe. A small fee only on what you take in-app.' },
              { icon: Users, title: 'Player discovery', desc: 'Padel venues listed worldwide. Players in your area find and book your courts through the PPA app.' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-2xl bg-white border border-gray-100 p-5">
                <div className="h-10 w-10 rounded-xl bg-teal-50 flex items-center justify-center mb-4">
                  <Icon className="h-5 w-5 text-[#009688]" />
                </div>
                <h3 className="text-[15px] font-bold text-gray-900 mb-2">{title}</h3>
                <p className="text-[13px] text-gray-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Search your venue */}
      <section id="search" className="py-16">
        <div className="max-w-2xl mx-auto px-5">
          <h2 className="text-[24px] font-bold text-gray-900 text-center mb-3">Your venue is probably already listed</h2>
          <p className="text-[14px] text-gray-500 text-center mb-8">
            We list padel venues worldwide. Search below — if yours is here, claim it to control your listing.
          </p>

          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by venue name or city..."
              className="w-full rounded-2xl border-2 border-gray-200 pl-12 pr-4 py-4 text-[15px] text-gray-900 outline-none focus:border-[#009688] transition-colors"
              style={{ fontSize: '16px' }}
            />
          </div>

          {searching && (
            <div className="mt-4 text-center">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#009688] border-t-transparent mx-auto" />
            </div>
          )}

          {!searching && results.length > 0 && (
            <div className="mt-4 space-y-2">
              {results.map((v) => (
                <a
                  key={v.venue_id}
                  href={`${VM_URL}/claim?venue=${v.venue_id}`}
                  className="flex items-center justify-between rounded-xl border border-gray-100 bg-white px-4 py-3 hover:border-[#009688] hover:bg-teal-50/30 transition-all group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-10 w-10 rounded-xl bg-teal-50 flex items-center justify-center flex-shrink-0">
                      <MapPin className="h-5 w-5 text-[#009688]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-gray-900 truncate">{v.venue_name}</p>
                      <p className="text-[12px] text-gray-400 truncate">
                        {[v.city, v.number_of_courts ? `${v.number_of_courts} courts` : null].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-[12px] font-bold text-[#009688] flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    Claim <ChevronRight className="h-3.5 w-3.5" />
                  </div>
                </a>
              ))}
            </div>
          )}

          {!searching && searched && results.length === 0 && query.length >= 2 && (
            <div className="mt-6 rounded-2xl border border-gray-100 bg-gray-50 px-5 py-6 text-center">
              <p className="text-[14px] text-gray-600 mb-3">Can't find your venue?</p>
              <a
                href={`${VM_URL}/onboarding`}
                className="inline-flex items-center gap-2 rounded-xl bg-[#E65100] px-6 py-2.5 text-[13px] font-bold text-white hover:bg-[#BF360C] transition-colors"
              >
                Add your venue <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          )}
        </div>
      </section>

      {/* Why claim */}
      <section className="bg-gray-50 py-16">
        <div className="max-w-3xl mx-auto px-5 text-center">
          <h2 className="text-[24px] font-bold text-gray-900 mb-8">Why claim your venue?</h2>
          <div className="grid sm:grid-cols-3 gap-6 text-left">
            <div className="rounded-2xl bg-white border border-gray-100 p-5">
              <p className="text-[28px] mb-2">🎯</p>
              <h3 className="text-[14px] font-bold text-gray-900 mb-1">Control your listing</h3>
              <p className="text-[12px] text-gray-500">Update your hours, pricing, photos, and court details. Your venue, your way.</p>
            </div>
            <div className="rounded-2xl bg-white border border-gray-100 p-5">
              <p className="text-[28px] mb-2">📱</p>
              <h3 className="text-[14px] font-bold text-gray-900 mb-1">Reach new players</h3>
              <p className="text-[12px] text-gray-500">PPA players in your area discover your courts when looking for games. Free exposure.</p>
            </div>
            <div className="rounded-2xl bg-white border border-gray-100 p-5">
              <p className="text-[28px] mb-2">💳</p>
              <h3 className="text-[14px] font-bold text-gray-900 mb-1">Take bookings directly</h3>
              <p className="text-[12px] text-gray-500">Players book and pay through the app — a small fee only on in-app bookings. Send them to your own link and we take nothing.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16">
        <div className="max-w-2xl mx-auto px-5 text-center">
          <h2 className="text-[24px] font-bold text-gray-900 mb-4">Ready to get started?</h2>
          <p className="text-[14px] text-gray-500 mb-8">
            Set up in under 5 minutes. Free to start, no lock-in — cancel anytime.
          </p>
          <a
            href={VM_URL + '/onboarding'}
            className="inline-flex items-center gap-2 rounded-2xl bg-[#009688] px-10 py-4 text-[16px] font-bold text-white hover:bg-[#00796B] transition-all active:scale-[0.98]"
          >
            Claim your venue <ArrowRight className="h-5 w-5" />
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-8">
        <div className="max-w-5xl mx-auto px-5 flex flex-col sm:flex-row items-center justify-between gap-4 text-[12px] text-gray-400">
          <span>© {new Date().getFullYear()} Padel Players App</span>
          <div className="flex items-center gap-4">
            <Link to="/" className="hover:text-gray-600">For Players</Link>
            <Link to="/faq" className="hover:text-gray-600">FAQ</Link>
            <Link to="/contact" className="hover:text-gray-600">Contact</Link>
            <Link to="/privacy" className="hover:text-gray-600">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
