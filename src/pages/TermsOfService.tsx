import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="text-[15px] font-bold text-gray-900 mb-2">{title}</h2>
      {children}
    </section>
  )
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] text-gray-600 leading-relaxed mb-2">{children}</p>
}

function Ul({ items }: { items: string[] }) {
  return (
    <ul className="mt-1 mb-2 space-y-1">
      {items.map((item) => (
        <li key={item} className="text-[13px] text-gray-600 flex gap-2">
          <span className="text-[#009688] flex-shrink-0">{'\u2022'}</span>
          {item}
        </li>
      ))}
    </ul>
  )
}

export function TermsOfServicePage() {
  const navigate = useNavigate()
  return (
    <div className="min-h-full bg-white">
      <div className="flex items-center gap-3 px-5 pt-14 pb-4 border-b border-gray-100">
        <button onClick={() => navigate(-1)} className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
          <ChevronLeft className="h-5 w-5 text-gray-600" />
        </button>
        <h1 className="text-[18px] font-bold text-gray-900">Terms of Service</h1>
      </div>

      <div className="px-5 py-6 max-w-2xl mx-auto">
        <p className="text-[12px] text-gray-400 mb-2">Last updated: 13 May 2026</p>
        <P>These Terms of Service ({'"'}Terms{'"'}) govern your use of the Padel Players application ({'"'}the App{'"'}) operated by Wynaxa Sports Tech Ltd (part of Wynaxa Limited), a company incorporated in Ireland with registered office at 26 Fitzwilliam Square West, Dublin, D02 HX82. By creating an account or using the App, you agree to these Terms in full.</P>

        <Section title="1. Eligibility">
          <P>You must be at least 13 years of age to use the App. By registering, you confirm that you meet this requirement. If you are under 18, you confirm that you have obtained parental or guardian consent.</P>
        </Section>

        <Section title="2. Your Account">
          <Ul items={[
            'You are responsible for maintaining the security of your account credentials.',
            'You must provide accurate, current, and complete information during registration.',
            'You may not share your account with others or create multiple accounts.',
            'You must notify us immediately at support@padelplayersapp.com if you become aware of any unauthorised use of your account.',
            'We reserve the right to suspend or terminate accounts that violate these Terms, including accounts used for spam, harassment, or fraudulent activity.',
          ]} />
        </Section>

        <Section title="3. Acceptable Use">
          <P>When using the App, you agree not to:</P>
          <Ul items={[
            'Post false, misleading, or fraudulent match results',
            'Harass, abuse, or threaten other users via group chat or announcements',
            'Attempt to manipulate rankings through collusion, fake matches, or automated tools',
            'Use the App for any commercial purpose without our written permission',
            'Attempt to gain unauthorised access to any part of the App or its infrastructure',
            'Scrape, copy, or redistribute App data without permission',
            'Upload illegal content or content that infringes third-party intellectual property rights',
            'Impersonate another person or entity',
          ]} />
          <P>Violation of these rules may result in immediate account suspension without notice.</P>
        </Section>

        <Section title="4. User Content">
          <P>{'"'}User Content{'"'} includes match results, poll responses, chat messages, profile information, and any other content you submit to the App.</P>
          <P>You retain ownership of your User Content. By submitting User Content, you grant us a non-exclusive, royalty-free, worldwide licence to store, display, and process that content as necessary to operate the App.</P>
          <P>You are solely responsible for the accuracy of match results and scores you submit. Deliberately recording false results is a violation of these Terms.</P>
          <P>Match results that have been verified by all players are considered final. Disputes must be raised within 48 hours via the in-app dispute mechanism.</P>
        </Section>

        <Section title="5. Match Results and Rankings">
          <P>Rankings are calculated automatically based on recorded and verified match results using an Elo-style points system. We reserve the right to:</P>
          <Ul items={[
            'Void match results found to be fraudulent or in error',
            'Adjust rankings where technical errors have caused incorrect calculations',
            'Allow group administrators to make manual ranking adjustments within their group\u2019s league',
          ]} />
          <P>Rankings are intended for entertainment and community purposes only. They do not constitute official Playtomic ratings or any form of professional certification.</P>
        </Section>

        <Section title="6. Group Administrators">
          <P>Group administrators have elevated permissions within their group, including the ability to approve or remove members, manage league settings, and send announcements. Administrators agree to:</P>
          <Ul items={[
            'Exercise their powers fairly and in good faith',
            'Not use admin tools to harass, discriminate against, or unfairly penalise members',
            'Take responsibility for communications sent via the group announcement feature',
          ]} />
          <P>We reserve the right to remove administrator privileges from any user who abuses their position.</P>
        </Section>

        <Section title="7. Notifications">
          <P>By using the App, you agree to receive in-app notifications related to your account, matches, polls, and group activity. You may manage notification preferences in your Profile settings. If you grant push notification permission, you agree to receive background notifications from the App on your device.</P>
        </Section>

        <Section title="8. Third-Party Services">
          <P>The App integrates with third-party services including Supabase (database), Resend (email), and Vercel (hosting). Your use of the App is also subject to the terms of these providers where applicable. We are not responsible for any downtime, data loss, or service interruptions caused by third-party providers.</P>
          <P>The App is not affiliated with, endorsed by, or connected to Playtomic. {'"'}Playtomic level{'"'} references in the App are a self-reported skill metric only.</P>
        </Section>

        <Section title="9. Availability and Service Changes">
          <P>We aim to provide a reliable service but do not guarantee 100% uptime. We reserve the right to:</P>
          <Ul items={[
            'Modify, suspend, or discontinue any feature of the App at any time',
            'Update these Terms with reasonable notice via in-app notification',
            'Perform maintenance that may temporarily interrupt service',
          ]} />
        </Section>

        <Section title="10. Limitation of Liability">
          <P>To the maximum extent permitted by Irish law, Wynaxa Sports Tech Ltd shall not be liable for:</P>
          <Ul items={[
            'Any indirect, incidental, or consequential damages arising from use of the App',
            'Loss of data, rankings, or match history due to technical failures',
            'Disputes between users, including disagreements over match results or group decisions',
            'Physical injury or property damage arising from matches organised via the App',
          ]} />
          <P>You use the App and participate in matches arranged through it entirely at your own risk. The App facilitates match organisation only \u2014 it is not responsible for the conduct of players on or off the court.</P>
          <P>Our total liability to you for any claim arising from these Terms shall not exceed \u20AC100 or the amount you have paid us in the preceding 12 months, whichever is greater.</P>
        </Section>

        <Section title="11. Account Termination">
          <P>You may delete your account at any time from the Profile page. We may terminate or suspend your account:</P>
          <Ul items={[
            'For violation of these Terms',
            'If your account has been inactive for more than 24 months',
            'If required by law or court order',
          ]} />
          <P>Upon termination, your personal data will be handled as described in our Privacy Policy. Match records may be retained in anonymised form.</P>
        </Section>

        <Section title="12. Governing Law and Disputes">
          <P>These Terms are governed by the laws of Ireland. Any dispute arising from or in connection with these Terms shall first be attempted to be resolved by contacting us at <a href="mailto:support@padelplayersapp.com" className="text-[#009688] underline">support@padelplayersapp.com</a>. If unresolved, disputes shall be subject to the exclusive jurisdiction of the courts of Ireland.</P>
          <P>If you are a consumer in the EU, you also have the right to access the EU Online Dispute Resolution platform.</P>
        </Section>

        <section className="mt-8 pt-6 border-t border-gray-100">
          <p className="text-[13px] font-bold text-gray-900 mb-1">Contact</p>
          <p className="text-[13px] text-gray-600">For questions about these Terms, contact us at: <a href="mailto:support@padelplayersapp.com" className="text-[#009688] underline">support@padelplayersapp.com</a></p>
          <p className="text-[13px] text-gray-600 mt-1">Wynaxa Sports Tech Ltd (part of Wynaxa Limited)</p>
          <p className="text-[13px] text-gray-600">26 Fitzwilliam Square West, Dublin, D02 HX82, Ireland</p>
        </section>

        <button onClick={() => navigate(-1)} className="mt-6 mb-8 text-[13px] font-semibold text-[#009688]">{'\u2190'} Back to app</button>
      </div>
    </div>
  )
}
