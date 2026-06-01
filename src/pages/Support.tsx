import { Link, useNavigate } from 'react-router-dom'
import {
  ChevronLeft, ChevronRight, Rocket, Calendar, Trophy,
  Users, UserCog, ShieldAlert, Mail,
} from 'lucide-react'

/* ── Topic cards that link to FAQ anchors ── */

const TOPICS = [
  {
    icon: Rocket,
    title: 'Getting Started',
    desc: 'What the app is, pricing, and supported devices.',
    links: [
      { label: 'What is Padel Players App?', href: '/faq#what-is-ppa' },
      { label: 'Is it free?', href: '/faq#is-it-free' },
      { label: 'What devices can I use it on?', href: '/faq#what-devices' },
    ],
  },
  {
    icon: Calendar,
    title: 'Matches & Scheduling',
    desc: 'Find matches, auto-matching, and court bookings.',
    links: [
      { label: 'How do I find a match near me?', href: '/faq#find-match' },
      { label: 'How does Find My Game work?', href: '/faq#find-my-game' },
      { label: 'How do I book a court?', href: '/faq#book-court' },
    ],
  },
  {
    icon: Trophy,
    title: 'Leagues & Ranking',
    desc: 'ELO, league standings, and how rankings work.',
    links: [
      { label: 'ELO vs league standings', href: '/faq#elo-vs-standings' },
      { label: 'How do leagues work?', href: '/faq#how-leagues-work' },
    ],
  },
  {
    icon: Users,
    title: 'Community & Groups',
    desc: 'Groups, household linking, and finding players.',
    links: [
      { label: 'How do I create or join a group?', href: '/faq#join-group' },
      { label: 'How do I link my household?', href: '/faq#household' },
    ],
  },
  {
    icon: UserCog,
    title: 'Account & Privacy',
    desc: 'Data use, age requirements, and account deletion.',
    links: [
      { label: 'How is my data used?', href: '/faq#data-privacy' },
      { label: 'Minimum age (13+)', href: '/faq#minimum-age' },
      { label: 'How do I delete my account?', href: '/faq#delete-account' },
    ],
  },
  {
    icon: ShieldAlert,
    title: 'Safety & Reporting',
    desc: 'Reporting players, blocking, and community safety.',
    links: [
      { label: 'How do I report a player?', href: '/faq#report-player' },
    ],
  },
] as const

function TopicCard({ icon: Icon, title, desc, links }: typeof TOPICS[number]) {
  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5 hover:border-teal-100 hover:shadow-md transition-all">
      <div className="flex items-start gap-3 mb-3">
        <div className="h-10 w-10 rounded-xl bg-teal-50 flex items-center justify-center flex-shrink-0">
          <Icon className="h-5 w-5 text-teal-600" />
        </div>
        <div>
          <h3 className="text-[15px] font-bold text-navy">{title}</h3>
          <p className="text-[12px] text-gray-400 mt-0.5">{desc}</p>
        </div>
      </div>
      <ul className="space-y-1.5 ml-[52px]">
        {links.map((l) => (
          <li key={l.href}>
            <Link
              to={l.href}
              className="group flex items-center gap-1 text-[13px] text-teal-600 font-medium hover:underline"
            >
              <span>{l.label}</span>
              <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function SupportPage() {
  const navigate = useNavigate()
  return (
    <div className="min-h-full bg-cream">
      {/* Header */}
      <div className="bg-white border-b border-gray-100">
        <div className="mx-auto max-w-3xl flex items-center gap-3 px-5 pt-14 pb-4">
          <button
            onClick={() => navigate(-1)}
            className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 hover:bg-gray-200 transition-colors"
            aria-label="Go back"
          >
            <ChevronLeft className="h-5 w-5 text-gray-600" />
          </button>
          <h1 className="text-[18px] font-bold text-navy">Support</h1>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-5 py-8">
        {/* Heading */}
        <div className="text-center mb-10">
          <h2 className="text-[24px] sm:text-[28px] font-extrabold text-navy mb-2">How can we help?</h2>
          <p className="text-[14px] text-gray-500 max-w-md mx-auto">
            Browse topics below or{' '}
            <Link to="/faq" className="text-teal-600 font-semibold hover:underline">search the full FAQ</Link>.
          </p>
        </div>

        {/* Topic cards grid */}
        <div className="grid gap-4 sm:grid-cols-2 mb-10">
          {TOPICS.map((t) => (
            <TopicCard key={t.title} {...t} />
          ))}
        </div>

        {/* Still need help? */}
        <div className="rounded-2xl bg-gradient-to-br from-teal-50 to-white border border-teal-100 p-6 text-center mb-8">
          <div className="mx-auto mb-3 h-12 w-12 rounded-xl bg-teal-500 flex items-center justify-center">
            <Mail className="h-6 w-6 text-white" />
          </div>
          <p className="text-[16px] font-bold text-navy mb-1">Still need help?</p>
          <p className="text-[13px] text-gray-500 mb-4">
            Can&rsquo;t find what you&rsquo;re looking for? Get in touch and we&rsquo;ll respond within 1 business day.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link
              to="/contact"
              className="inline-flex items-center gap-1.5 rounded-xl bg-teal-500 px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-teal-600 transition-colors"
            >
              Contact Us
              <ChevronRight className="h-4 w-4" />
            </Link>
            <a
              href="mailto:support@padelplayersapp.com"
              className="inline-flex items-center gap-1.5 rounded-xl border border-teal-200 bg-white px-5 py-2.5 text-[13px] font-semibold text-teal-600 hover:bg-teal-50 transition-colors"
            >
              Email Support
            </a>
          </div>
        </div>

        {/* Abuse reporting */}
        <div className="rounded-2xl bg-red-50 border border-red-100 p-5 mb-8">
          <p className="text-[14px] font-bold text-navy mb-1">Reporting Abuse or Harassment</p>
          <p className="text-[13px] text-gray-600 leading-relaxed">
            If you experience harassment, abuse, or inappropriate content from another user, please email{' '}
            <a href="mailto:support@padelplayersapp.com" className="text-teal-600 underline hover:no-underline">support@padelplayersapp.com</a>{' '}
            with details. You can also report or block players directly within the app. We investigate all reports within 48 hours.
          </p>
        </div>

        {/* Footer links */}
        <div className="pt-6 border-t border-gray-100">
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] font-medium text-gray-400">
            <Link to="/faq" className="hover:text-teal-600 transition-colors">FAQ</Link>
            <Link to="/contact" className="hover:text-teal-600 transition-colors">Contact</Link>
            <Link to="/privacy" className="hover:text-teal-600 transition-colors">Privacy</Link>
            <Link to="/terms" className="hover:text-teal-600 transition-colors">Terms</Link>
            <Link to="/" className="hover:text-teal-600 transition-colors">Home</Link>
          </div>
          <p className="mt-3 text-[12px] text-gray-300">Wynaxa Sports Tech Ltd (part of Wynaxa Limited) &middot; 26 Fitzwilliam Square West, Dublin, D02 HX82, Ireland</p>
        </div>
      </div>
    </div>
  )
}
