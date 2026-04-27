import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'

export function TermsOfServicePage() {
  const navigate = useNavigate()
  return (
    <div className="min-h-full bg-white">
      <div className="flex items-center gap-3 px-5 pt-14 pb-4 border-b border-gray-100">
        <button
          onClick={() => navigate(-1)}
          className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0"
        >
          <ChevronLeft className="h-5 w-5 text-gray-600" />
        </button>
        <h1 className="text-[18px] font-bold text-gray-900">Terms of Service</h1>
      </div>

      <div className="px-5 py-6 max-w-none">
        <p className="text-[12px] text-gray-400 mb-6">Last updated: April 2026</p>

        {[
          {
            title: '1. Acceptance of Terms',
            body: 'By using Padel Players, you agree to these Terms of Service. If you do not agree, please do not use the app.',
          },
          {
            title: '2. Use of the App',
            body: 'Padel Players is designed to help you organise padel matches, track rankings, and connect with your community. You agree to use the app only for lawful purposes and in accordance with these terms.',
          },
          {
            title: '3. User Accounts',
            body: 'You are responsible for maintaining the confidentiality of your account. You agree to provide accurate information and to notify us of any unauthorised use of your account.',
          },
          {
            title: '4. Match Results',
            body: 'Match results are submitted by users and verified through a peer voting system. Padel Players does not guarantee the accuracy of submitted results. Disputes should be raised within the app.',
          },
          {
            title: '5. Rankings',
            body: 'Rankings are calculated automatically based on match results and the ELO rating system. Rankings are for informational purposes and do not represent official standings.',
          },
          {
            title: '6. Court Bookings',
            body: 'Court booking features connect you to third-party venues. Padel Players is not responsible for bookings, cancellations, or disputes with venues. Payment processing is handled by Stripe.',
          },
          {
            title: '7. Content',
            body: 'You retain ownership of content you submit. By submitting content, you grant Padel Players a licence to display it within the app. You agree not to submit false, misleading, or harmful content.',
          },
          {
            title: '8. Termination',
            body: 'We reserve the right to suspend or terminate accounts that violate these terms. You may delete your account at any time through app settings.',
          },
          {
            title: '9. Limitation of Liability',
            body: 'Padel Players is provided "as is" without warranties. We are not liable for any indirect, incidental, or consequential damages arising from your use of the app.',
          },
          {
            title: '10. Changes to Terms',
            body: 'We may update these terms from time to time. Continued use of the app after changes constitutes acceptance of the updated terms.',
          },
        ].map(({ title, body }) => (
          <section key={title} className="mb-6">
            <h2 className="text-[15px] font-bold text-gray-900 mb-2">{title}</h2>
            <p className="text-[13px] text-gray-600 leading-relaxed">{body}</p>
          </section>
        ))}
      </div>
    </div>
  )
}
