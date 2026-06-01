/* ── FAQ data with IDs and topic tags for deep-linking ── */

export const FAQS: { id: string; topic: string; q: string; a: string }[] = [
  /* Getting started */
  {
    id: 'what-is-ppa',
    topic: 'getting-started',
    q: 'What is Padel Players App?',
    a: 'Padel Players App is a free social platform for padel players. It helps you find and join matches near you, run leagues, track your ELO ranking, and connect with a community of players, coaches, and venues.',
  },
  {
    id: 'is-it-free',
    topic: 'getting-started',
    q: 'Is it free?',
    a: 'Yes \u2014 Padel Players App is completely free to use. There are no subscriptions, paywalls, or hidden fees for core features like match discovery, leagues, rankings, and community.',
  },
  {
    id: 'what-devices',
    topic: 'getting-started',
    q: 'What devices can I use it on?',
    a: 'Padel Players App is available as an iOS app (coming soon to the App Store) and as a full-featured web app at app.padelplayersapp.com. Your data syncs seamlessly across devices.',
  },
  /* Matches & scheduling */
  {
    id: 'find-match',
    topic: 'matches',
    q: 'How do I find a match near me?',
    a: 'Head to the Play tab and browse open matches in your area. Matches are shown based on your location, so you\u2019ll see games near you first. Tap any match to see details and join.',
  },
  {
    id: 'find-my-game',
    topic: 'matches',
    q: 'How does Find My Game work?',
    a: 'Find My Game lets you share your availability for the week. The app then auto-matches you with other available players at compatible times and skill levels \u2014 no more back-and-forth in group chats.',
  },
  {
    id: 'book-court',
    topic: 'matches',
    q: 'How do I book a court?',
    a: 'Use the Book a Court feature in the Play tab to search for available courts at venues near you and book directly through the app.',
  },
  /* Leagues & ranking */
  {
    id: 'elo-vs-standings',
    topic: 'leagues',
    q: 'What\u2019s the difference between league standings and my ELO ranking?',
    a: 'League standings are specific to a league you\u2019ve joined \u2014 they reflect your performance within that competition. Your ELO ranking is a global career rating that updates across all verified matches, regardless of which league or group they belong to.',
  },
  {
    id: 'how-leagues-work',
    topic: 'leagues',
    q: 'How do leagues work?',
    a: 'Anyone can create a league and invite players. Supported formats include Round Robin and Mexicano. Leagues track live standings, support multiple seasons, and handle scheduling and result recording.',
  },
  /* Community & groups */
  {
    id: 'join-group',
    topic: 'community',
    q: 'How do I create or join a group?',
    a: 'Go to the Community tab to discover public groups or create your own. You can also join groups via an invite link shared by an admin. Some groups require admin approval before you can join.',
  },
  {
    id: 'household',
    topic: 'community',
    q: 'How do I link my household or partner?',
    a: 'Go to the You tab, open Settings, and look for the Household section. Link a partner or family member so the app can detect scheduling conflicts and help you coordinate.',
  },
  /* Account & privacy */
  {
    id: 'data-privacy',
    topic: 'account',
    q: 'How is my data used and is it private?',
    a: 'We collect only what\u2019s needed to run the app \u2014 your name, email, profile photos, and approximate location for match discovery. We do not advertise, track you, or sell your data to third parties. See our Privacy Policy for full details.',
  },
  {
    id: 'minimum-age',
    topic: 'account',
    q: 'What\u2019s the minimum age to use the app?',
    a: 'You must be at least 13 years old to create an account. If you are under 18, you need parental or guardian consent. This is consistent with our App Store age rating.',
  },
  {
    id: 'delete-account',
    topic: 'account',
    q: 'How do I delete my account and data?',
    a: 'Go to the You tab \u2192 Settings \u2192 Delete Account. Your personal data (name, email, photos) will be deleted within 30 days. Match history is anonymised to preserve league integrity. You can also request deletion by emailing privacy@padelplayersapp.com.',
  },
  /* Safety & reporting */
  {
    id: 'report-player',
    topic: 'safety',
    q: 'How do I report a player or content?',
    a: 'You can report any player from their profile or block them directly. Reports are investigated within 48 hours. You can also email support@padelplayersapp.com with details of the issue.',
  },
]
