import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'

export function PrivacyPolicyPage() {
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
        <h1 className="text-[18px] font-bold text-gray-900">Privacy Policy</h1>
      </div>

      <div className="px-5 py-6 prose prose-sm max-w-none">
        <p className="text-[12px] text-gray-400 mb-6">Last updated: April 2026</p>

        <section className="mb-6">
          <h2 className="text-[15px] font-bold text-gray-900 mb-2">1. Information We Collect</h2>
          <p className="text-[13px] text-gray-600 leading-relaxed">
            We collect information you provide directly, including your name, email address, and location.
            When you use Padel Players, we also collect data about your matches, rankings, and activity within the app.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-[15px] font-bold text-gray-900 mb-2">2. How We Use Your Information</h2>
          <p className="text-[13px] text-gray-600 leading-relaxed">
            We use your information to provide and improve the Padel Players service, including:
          </p>
          <ul className="mt-2 space-y-1">
            {[
              'Matching you with other players and groups',
              'Calculating and displaying rankings',
              'Sending notifications about matches and results',
              'Improving app features and performance',
            ].map((item) => (
              <li key={item} className="text-[13px] text-gray-600 flex gap-2">
                <span className="text-[#009688] flex-shrink-0">•</span>
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="mb-6">
          <h2 className="text-[15px] font-bold text-gray-900 mb-2">3. Information Sharing</h2>
          <p className="text-[13px] text-gray-600 leading-relaxed">
            Your profile name and match statistics are visible to other users in your groups and leagues.
            We do not sell your personal information to third parties.
            We use Supabase for data storage and authentication, which operates under its own privacy policy.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-[15px] font-bold text-gray-900 mb-2">4. Data Retention</h2>
          <p className="text-[13px] text-gray-600 leading-relaxed">
            We retain your account data for as long as your account is active. You may request deletion
            of your account and associated data at any time through the app settings or by contacting us.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-[15px] font-bold text-gray-900 mb-2">5. Push Notifications</h2>
          <p className="text-[13px] text-gray-600 leading-relaxed">
            With your permission, we send push notifications about match updates, results, and
            group activity. You can disable notifications at any time in your device or app settings.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-[15px] font-bold text-gray-900 mb-2">6. Your Rights</h2>
          <p className="text-[13px] text-gray-600 leading-relaxed">
            You have the right to access, correct, or delete your personal data. To exercise these rights,
            use the account settings within the app or contact us directly.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-[15px] font-bold text-gray-900 mb-2">7. Contact</h2>
          <p className="text-[13px] text-gray-600 leading-relaxed">
            If you have questions about this policy, please contact us through the app.
          </p>
        </section>
      </div>
    </div>
  )
}
