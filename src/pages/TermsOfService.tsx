import { Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-[15px] font-bold text-navy mb-2">{title}</h2>
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
          <span className="text-teal-500 flex-shrink-0">{'\u2022'}</span>
          {item}
        </li>
      ))}
    </ul>
  )
}

export function TermsOfServicePage() {
  return (
    <div className="min-h-full bg-cream">
      <div className="bg-white border-b border-gray-100">
        <div className="mx-auto max-w-2xl flex items-center gap-3 px-5 pt-14 pb-4">
          <Link
            to="/"
            className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 hover:bg-gray-200 transition-colors"
            aria-label="Back to home"
          >
            <ChevronLeft className="h-5 w-5 text-gray-600" />
          </Link>
          <h1 className="text-[18px] font-bold text-navy">Terms of Service</h1>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-5 py-8">
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5 sm:p-8">
          <p className="text-[12px] text-gray-400 mb-4">Last updated: 1 June 2026</p>
          <P>These Terms of Service ({'"'}Terms{'"'}) govern your use of the Padel Players application ({'"'}the App{'"'}) operated by Wynaxa Sports Tech Ltd (part of Wynaxa Limited), a company incorporated in Ireland with registered office at 26 Fitzwilliam Square West, Dublin, D02 HX82. By creating an account or using the App, you agree to these Terms in full.</P>

          <Section title="1. Eligibility">
            <P><strong>You must be at least 13 years of age to use the App.</strong> This is consistent with the App Store age rating. By registering, you confirm that you meet this requirement. If you are under 18, you confirm that you have obtained parental or guardian consent to use the App and that your parent or guardian has reviewed and agreed to these Terms on your behalf.</P>
          </Section>

          <Section title="2. Your Account">
            <P>You are responsible for your account. Specifically:</P>
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
              'Harass, abuse, or threaten other users via group chat, matches, or announcements',
              'Attempt to manipulate rankings through collusion, fake matches, or automated tools',
              'Use the App for any commercial purpose without our written permission',
              'Attempt to gain unauthorised access to any part of the App or its infrastructure',
              'Scrape, copy, or redistribute App data without permission',
              'Upload illegal content or content that infringes third-party intellectual property rights',
              'Impersonate another person or entity',
              'Post content that is sexually explicit, violent, discriminatory, or otherwise offensive',
            ]} />
            <P>Violation of these rules may result in immediate account suspension without notice.</P>
          </Section>

          <Section title="4. User-Generated Content">
            <P>{'"'}User Content{'"'} includes match results, poll responses, chat messages, profile information (including avatar and banner images), and any other content you submit to the App.</P>
            <P>You retain ownership of your User Content. By submitting User Content, you grant us a non-exclusive, royalty-free, worldwide licence to store, display, and process that content as necessary to operate the App.</P>
            <P>You are solely responsible for the accuracy of match results and scores you submit. Deliberately recording false results is a violation of these Terms.</P>
            <P>You must not upload content that is defamatory, obscene, hateful, discriminatory, or that infringes on any third party's rights. We reserve the right to remove any User Content that violates these Terms without prior notice.</P>
            <P>Match results that have been verified by all players are considered final. Disputes must be raised within 48 hours via the in-app dispute mechanism.</P>
          </Section>

          <Section title="5. Reporting, Blocking & Community Safety">
            <P>We are committed to maintaining a safe and respectful community. The App provides tools for users to protect themselves:</P>
            <Ul items={[
              'Report a player: You can report any player from their profile for harassment, abuse, inappropriate content, or other violations. Reports are confidential.',
              'Block a player: You can block any player to prevent them from contacting you or appearing in your matches and groups.',
              'In-app reporting: You can flag specific content (match results, messages) directly from within the App.',
              'Email reporting: You can also report issues by emailing support@padelplayersapp.com.',
            ]} />
            <P>All reports are investigated within 48 hours. Actions we may take include warnings, temporary suspensions, permanent bans, and content removal. We will not disclose the identity of the reporter to the reported user.</P>
          </Section>

          <Section title="6. Match Results and Rankings">
            <P>Rankings are calculated automatically based on recorded and verified match results using an ELO-style points system. We reserve the right to:</P>
            <Ul items={[
              'Void match results found to be fraudulent or in error',
              'Adjust rankings where technical errors have caused incorrect calculations',
              'Allow group administrators to make manual ranking adjustments within their group\u2019s league',
            ]} />
            <P>Rankings are intended for entertainment and community purposes only. They do not constitute official ratings or any form of professional certification.</P>
          </Section>

          <Section title="7. Group Administrators">
            <P>Group administrators have elevated permissions within their group, including the ability to approve or remove members, manage league settings, and send announcements. Administrators agree to:</P>
            <Ul items={[
              'Exercise their powers fairly and in good faith',
              'Not use admin tools to harass, discriminate against, or unfairly penalise members',
              'Take responsibility for communications sent via the group announcement feature',
            ]} />
            <P>We reserve the right to remove administrator privileges from any user who abuses their position.</P>
          </Section>

          <Section title="8. Notifications">
            <P>By using the App, you agree to receive in-app notifications related to your account, matches, polls, and group activity. You may manage notification preferences in your Profile settings. If you grant push notification permission, you agree to receive background notifications from the App on your device.</P>
          </Section>

          <Section title="9. Third-Party Services">
            <P>The App integrates with third-party services including Supabase (database and authentication), Resend (email delivery), and Vercel (hosting). Your use of the App is also subject to the terms of these providers where applicable. We are not responsible for any downtime, data loss, or service interruptions caused by third-party providers.</P>
          </Section>

          <Section title="10. Availability and Service Changes">
            <P>We aim to provide a reliable service but do not guarantee 100% uptime. We reserve the right to:</P>
            <Ul items={[
              'Modify, suspend, or discontinue any feature of the App at any time',
              'Update these Terms with reasonable notice via in-app notification',
              'Perform maintenance that may temporarily interrupt service',
            ]} />
          </Section>

          <Section title="11. Limitation of Liability">
            <P>To the maximum extent permitted by Irish law, Wynaxa Sports Tech Ltd shall not be liable for:</P>
            <Ul items={[
              'Any indirect, incidental, or consequential damages arising from use of the App',
              'Loss of data, rankings, or match history due to technical failures',
              'Disputes between users, including disagreements over match results or group decisions',
              'Physical injury or property damage arising from matches organised via the App',
            ]} />
            <P>You use the App and participate in matches arranged through it entirely at your own risk. The App facilitates match organisation only \u2014 it is not responsible for the conduct of players on or off the court.</P>
            <P>Our total liability to you for any claim arising from these Terms shall not exceed \u20ac100 or the amount you have paid us in the preceding 12 months, whichever is greater.</P>
          </Section>

          <Section title="12. Account Termination">
            <P>You may delete your account at any time from the Profile page (You \u2192 Settings \u2192 Delete Account). We may terminate or suspend your account:</P>
            <Ul items={[
              'For violation of these Terms',
              'If your account has been inactive for more than 24 months',
              'If required by law or court order',
            ]} />
            <P>Upon termination, your personal data will be handled as described in our <Link to="/privacy" className="text-teal-600 underline hover:no-underline">Privacy Policy</Link>. Match records may be retained in anonymised form.</P>
          </Section>

          <Section title="13. Governing Law and Disputes">
            <P>These Terms are governed by the laws of Ireland. Any dispute arising from or in connection with these Terms shall first be attempted to be resolved by contacting us at <a href="mailto:support@padelplayersapp.com" className="text-teal-600 underline hover:no-underline">support@padelplayersapp.com</a>. If unresolved, disputes shall be subject to the exclusive jurisdiction of the courts of Ireland.</P>
            <P>If you are a consumer in the EU, you also have the right to access the EU Online Dispute Resolution platform.</P>
          </Section>

          <section className="mt-8 pt-6 border-t border-gray-100">
            <p className="text-[13px] font-bold text-navy mb-1">Contact</p>
            <p className="text-[13px] text-gray-600">For questions about these Terms, contact us at: <a href="mailto:support@padelplayersapp.com" className="text-teal-600 underline hover:no-underline">support@padelplayersapp.com</a></p>
            <p className="text-[13px] text-gray-600 mt-1">Wynaxa Sports Tech Ltd (part of Wynaxa Limited)</p>
            <p className="text-[13px] text-gray-600">26 Fitzwilliam Square West, Dublin, D02 HX82, Ireland</p>
          </section>
        </div>

        {/* Footer links */}
        <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-[13px] font-medium text-gray-400">
          <Link to="/privacy" className="hover:text-teal-600 transition-colors">Privacy</Link>
          <Link to="/faq" className="hover:text-teal-600 transition-colors">FAQ</Link>
          <Link to="/contact" className="hover:text-teal-600 transition-colors">Contact</Link>
          <Link to="/" className="hover:text-teal-600 transition-colors">Home</Link>
        </div>
      </div>
    </div>
  )
}
