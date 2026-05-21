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

export function PrivacyPolicyPage() {
  const navigate = useNavigate()
  return (
    <div className="bg-white">
      <div className="flex items-center gap-3 px-5 pt-14 pb-4 border-b border-gray-100">
        <button onClick={() => navigate(-1)} className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
          <ChevronLeft className="h-5 w-5 text-gray-600" />
        </button>
        <h1 className="text-[18px] font-bold text-gray-900">Privacy Policy</h1>
      </div>

      <div className="px-5 py-6 max-w-2xl mx-auto">
        <p className="text-[12px] text-gray-400 mb-2">Last updated: 13 May 2026</p>
        <P>This Privacy Policy explains how Wynaxa Sports Tech Ltd (part of Wynaxa Limited), acting as the operator of Padel Players, collects, uses, and protects your personal data when you use the Padel Players application ({'"'}the App{'"'}). We are committed to protecting your privacy in accordance with the General Data Protection Regulation (GDPR) and applicable Irish data protection law.</P>

        <Section title="1. Who We Are">
          <P>Padel Players is operated by Wynaxa Sports Tech Ltd, a company incorporated in Ireland (part of Wynaxa Limited), with registered office at 26 Fitzwilliam Square West, Dublin, D02 HX82, Ireland.</P>
          <P>For data protection enquiries, contact us at: <a href="mailto:privacy@padelplayersapp.com" className="text-[#009688] underline">privacy@padelplayersapp.com</a></P>
        </Section>

        <Section title="2. What Data We Collect">
          <p className="text-[13px] font-semibold text-gray-700 mt-2 mb-1">Account Information:</p>
          <Ul items={['Full name and email address', 'Password (stored as a salted hash \u2014 we never see your password)', 'Phone number (optional)', 'Preferred language']} />
          <p className="text-[13px] font-semibold text-gray-700 mt-2 mb-1">Profile Information:</p>
          <Ul items={['Playtomic skill level (a numeric self-assessment)', 'City and country of residence', 'Profile photo (optional)', 'Household members (if you use the household scheduling feature)']} />
          <p className="text-[13px] font-semibold text-gray-700 mt-2 mb-1">Activity Data:</p>
          <Ul items={['Match records: date, time, players, scores, venue', 'Poll responses: time slot availability you submit each week', 'Ranking history: points changes over time', 'Votes cast in post-match awards', 'Group memberships and join dates', 'Chat messages within group chats']} />
          <p className="text-[13px] font-semibold text-gray-700 mt-2 mb-1">Technical Data:</p>
          <Ul items={['Device type and browser information', 'Push notification subscription token (if you grant permission)', 'IP address (processed by our hosting provider)', 'Usage logs (page views, feature interactions)']} />
        </Section>

        <Section title="3. How We Use Your Data">
          <P>We process your personal data for the following purposes:</P>
          <Ul items={[
            'Creating and managing your account (contract performance)',
            'Matching you with other players based on availability and skill level (contract performance)',
            'Calculating and displaying rankings and league standings (contract performance)',
            'Sending match notifications, poll reminders, and result alerts (legitimate interests)',
            'Group admin features \u2014 member management, announcements (legitimate interests)',
            'Improving the App\u2019s features and performance (legitimate interests)',
            'Complying with legal obligations (legal obligation)',
          ]} />
        </Section>

        <Section title="4. Who We Share Your Data With">
          <P>We do not sell your personal data. We share data only with trusted service providers necessary to operate the App:</P>
          <P><strong>Supabase (Database & Auth)</strong> \u2014 All user data is stored on Supabase (hosted on AWS EU-West-1, Ireland). Supabase acts as a data processor under a Data Processing Agreement.</P>
          <P><strong>Resend (Transactional Email)</strong> \u2014 We use Resend to send verification emails, password reset emails, and match notifications. Only your email address is shared.</P>
          <P><strong>Vercel (Hosting)</strong> \u2014 The App is hosted on Vercel. Server logs may contain your IP address.</P>
          <P>Your profile information (name, skill level, match history, ranking) is visible to other members of groups you belong to, and to any user who views your player profile. Your email and phone number are only visible if you enable this in Privacy Settings.</P>
        </Section>

        <Section title="5. Data Retention">
          <P><strong>Active accounts:</strong> We retain your data for as long as your account is active.</P>
          <P><strong>Deleted accounts:</strong> When you delete your account, your personal profile data (name, email, phone) is deleted within 30 days. Match records and ranking history are anonymised ({'"'}your name replaced with {'"'}Deleted User{'"'}) to preserve the integrity of historical standings for other players.</P>
          <P><strong>Chat messages:</strong> Group chat messages are retained for 12 months, then automatically deleted.</P>
          <P><strong>Notification logs:</strong> Notification records are retained for 90 days.</P>
        </Section>

        <Section title="6. Your Rights Under GDPR">
          <P>As a data subject, you have the following rights:</P>
          <Ul items={[
            'Right of access: Request a copy of all personal data we hold about you.',
            'Right to rectification: Correct inaccurate data via your Profile page.',
            'Right to erasure: Request deletion of your account and personal data.',
            'Right to restriction: Ask us to limit how we process your data.',
            'Right to portability: Receive your data in a machine-readable format (JSON).',
            'Right to object: Object to processing based on legitimate interests.',
            'Right to withdraw consent: Where processing is consent-based, withdraw at any time.',
          ]} />
          <P>To exercise any of these rights, email <a href="mailto:privacy@padelplayersapp.com" className="text-[#009688] underline">privacy@padelplayersapp.com</a>. We will respond within 30 days. You also have the right to lodge a complaint with the Data Protection Commission of Ireland.</P>
        </Section>

        <Section title="7. Cookies & Local Storage">
          <P>The App does not use tracking cookies. We use browser localStorage to store session tokens and user preferences (e.g., onboarding completion, pending group invites). This data never leaves your device and is cleared when you sign out or clear your browser data.</P>
        </Section>

        <Section title="8. Security">
          <P>We implement industry-standard security measures including TLS encryption in transit, bcrypt password hashing, and row-level security (RLS) policies on our database ensuring you can only access data you are authorised to see. We conduct regular security reviews.</P>
        </Section>

        <Section title="9. Children\u2019s Privacy">
          <P>The App is not directed at children under the age of 13. We do not knowingly collect personal data from children. If you believe a child has provided us with personal data, contact us immediately at <a href="mailto:privacy@padelplayersapp.com" className="text-[#009688] underline">privacy@padelplayersapp.com</a>.</P>
        </Section>

        <Section title="10. Changes to This Policy">
          <P>We may update this Privacy Policy from time to time. We will notify you of significant changes via an in-app notification and by updating the {'"'}Last updated{'"'} date above. Your continued use of the App after changes constitutes acceptance of the updated policy.</P>
        </Section>

        <section className="mt-8 pt-6 border-t border-gray-100">
          <p className="text-[13px] font-bold text-gray-900 mb-1">Contact Us</p>
          <p className="text-[13px] text-gray-600">Wynaxa Sports Tech Ltd (part of Wynaxa Limited)</p>
          <p className="text-[13px] text-gray-600">26 Fitzwilliam Square West, Dublin, D02 HX82, Ireland</p>
          <p className="text-[13px] text-gray-600">Email: <a href="mailto:privacy@padelplayersapp.com" className="text-[#009688] underline">privacy@padelplayersapp.com</a></p>
        </section>

        <button onClick={() => navigate(-1)} className="mt-6 mb-8 text-[13px] font-semibold text-[#009688]">{'\u2190'} Back to app</button>
      </div>
    </div>
  )
}
