import { useNavigate, Link } from 'react-router-dom'
import { ChevronLeft, Mail } from 'lucide-react'

function FaqItem({ question, answer }: { question: string; answer: string }) {
  return (
    <div className="mb-4">
      <p className="text-[13px] font-bold text-gray-800 mb-1">{question}</p>
      <p className="text-[13px] text-gray-600 leading-relaxed">{answer}</p>
    </div>
  )
}

export function SupportPage() {
  const navigate = useNavigate()
  return (
    <div className="min-h-full bg-white">
      <div className="flex items-center gap-3 px-5 pt-14 pb-4 border-b border-gray-100">
        <button onClick={() => navigate(-1)} className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
          <ChevronLeft className="h-5 w-5 text-gray-600" />
        </button>
        <h1 className="text-[18px] font-bold text-gray-900">Support</h1>
      </div>

      <div className="px-5 py-6 max-w-2xl mx-auto">
        <h2 className="text-[20px] font-extrabold text-gray-900 mb-2">We're here to help</h2>
        <p className="text-[13px] text-gray-600 leading-relaxed mb-6">
          Padel Players is built by Wynaxa Sports Tech Ltd in Ireland. If you need help, have feedback, or want to report a bug, we want to hear from you.
        </p>

        {/* Contact card */}
        <div className="rounded-2xl border border-teal-100 bg-teal-50 p-4 mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-full bg-[#009688] flex items-center justify-center flex-shrink-0">
              <Mail className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-[14px] font-bold text-gray-900">Get in touch</p>
              <a href="mailto:support@padelplayersapp.com" className="text-[13px] text-[#009688] font-semibold underline">
                support@padelplayersapp.com
              </a>
            </div>
          </div>
          <p className="text-[12px] text-gray-500">We aim to respond within 1 business day. Please include your account email and a description of the issue.</p>
        </div>

        {/* FAQ */}
        <h3 className="text-[15px] font-bold text-gray-900 mb-4">Common Questions</h3>

        <FaqItem
          question="How do I delete my account?"
          answer="Open the Padel Players app, go to the You tab, scroll to Settings, and tap 'Delete account'. Your personal data will be deleted within 30 days as described in our Privacy Policy."
        />
        <FaqItem
          question="How do I dispute a match result?"
          answer="Open the match in question, tap the verification status, and select 'Dispute'. Disputes must be raised within 48 hours of result entry."
        />
        <FaqItem
          question="Can I change my ranking?"
          answer="Rankings update automatically based on verified match results. Group admins can adjust league standings within their group; career rankings (internal ELO) cannot be manually edited."
        />
        <FaqItem
          question="How do I join a group?"
          answer="Groups can be discovered via invite link or via the discovery page if the group is public. Some groups require admin approval."
        />
        <FaqItem
          question="I forgot my password"
          answer="On the sign-in screen, tap 'Forgot password' and follow the email prompt."
        />

        {/* Abuse reporting */}
        <div className="rounded-2xl border border-red-100 bg-red-50 p-4 mt-6 mb-8">
          <p className="text-[14px] font-bold text-gray-900 mb-1">Reporting Abuse or Harassment</p>
          <p className="text-[13px] text-gray-600 leading-relaxed">
            If you experience harassment, abuse, or inappropriate content from another user, please email{' '}
            <a href="mailto:support@padelplayersapp.com" className="text-[#009688] underline">support@padelplayersapp.com</a>{' '}
            with details. We investigate all reports within 48 hours.
          </p>
        </div>

        {/* Legal links */}
        <h3 className="text-[15px] font-bold text-gray-900 mb-3">Legal</h3>
        <div className="space-y-2 mb-6">
          <Link to="/privacy" className="block text-[13px] text-[#009688] font-semibold underline">Privacy Policy</Link>
          <Link to="/terms" className="block text-[13px] text-[#009688] font-semibold underline">Terms of Service</Link>
        </div>

        <section className="pt-6 border-t border-gray-100">
          <p className="text-[13px] text-gray-600">Wynaxa Sports Tech Ltd (part of Wynaxa Limited)</p>
          <p className="text-[13px] text-gray-600">26 Fitzwilliam Square West, Dublin, D02 HX82, Ireland</p>
        </section>

        <button onClick={() => navigate(-1)} className="mt-6 mb-8 text-[13px] font-semibold text-[#009688]">{'\u2190'} Back to app</button>
      </div>
    </div>
  )
}
