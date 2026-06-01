export interface FaqItem {
  id: string
  topic: string
  q: string
  a: string
}

export interface FaqCategory {
  id: string
  label: string
}

export const FAQ_CATEGORIES: FaqCategory[] = [
  { id: 'getting-started', label: 'Getting started' },
  { id: 'matches', label: 'Matches & scoring' },
  { id: 'ranking', label: 'Ranking' },
  { id: 'leagues', label: 'Leagues & competition' },
  { id: 'community', label: 'Community & groups' },
  { id: 'badges', label: 'Badges & rewards' },
  { id: 'account', label: 'Your account' },
  { id: 'privacy', label: 'Privacy & data' },
]

export const FAQS: FaqItem[] = [
  /* Getting started */
  {
    id: 'what-is-ppa',
    topic: 'getting-started',
    q: 'What is Padel Players App?',
    a: 'A free social platform for padel players. Find and join matches near you, run leagues, track your ELO ranking, and connect with a community of players, coaches, and venues — all in one place.',
  },
  {
    id: 'is-it-free',
    topic: 'getting-started',
    q: 'Is it free?',
    a: 'Yes, completely. There are no subscriptions, paywalls, or hidden fees. Match discovery, leagues, rankings, community — all free.',
  },
  {
    id: 'what-devices',
    topic: 'getting-started',
    q: 'What devices does it work on?',
    a: 'Padel Players works as a full-featured web app at app.padelplayersapp.com on any device with a browser. A native iOS app is coming soon to the App Store. Your data syncs across devices automatically.',
  },
  /* Matches & scoring */
  {
    id: 'find-match',
    topic: 'matches',
    q: 'How do I find a match near me?',
    a: 'Open the Play tab and browse open matches in your area. They\'re sorted by location so nearby games appear first. Tap any match to see the details and join.',
  },
  {
    id: 'find-my-game',
    topic: 'matches',
    q: 'How does Find My Game work?',
    a: 'Share your availability for the week and the app auto-matches you with compatible players at similar times and skill levels. No more back-and-forth in group chats.',
  },
  {
    id: 'book-court',
    topic: 'matches',
    q: 'Can I book a court through the app?',
    a: 'Yes — use the Book a Court feature in the Play tab to search for available courts at venues near you and book directly.',
  },
  {
    id: 'record-result',
    topic: 'matches',
    q: 'How do I record a match result?',
    a: 'Any participant can record the result from the match detail page. Enter the set scores, and the opposing team gets a chance to verify or dispute within 24 hours. If unchallenged, it auto-confirms.',
  },
  /* Ranking */
  {
    id: 'how-ranking-works',
    topic: 'ranking',
    q: 'How does the ranking system work?',
    a: 'We use an ELO-based rating system (0–3000 scale, starting at 1300). When a verified match result comes in, your rating adjusts based on the result, the opponent\'s strength, your experience level, and the score margin. You can try the interactive calculator on our home page to see exactly how it works.',
  },
  {
    id: 'elo-vs-standings',
    topic: 'ranking',
    q: 'What\'s the difference between my ELO and league standings?',
    a: 'Your ELO is a global career rating that updates across all verified matches. League standings are specific to a competition — they track wins, losses, and draws within that league only.',
  },
  {
    id: 'k-factor',
    topic: 'ranking',
    q: 'Why do new players\' ratings change faster?',
    a: 'New players have a higher K-factor (40 for your first 20 matches vs. 5 for veterans with 200+). This lets your rating settle to the right level quickly, then stabilise as you play more.',
  },
  {
    id: 'ranking-preview',
    topic: 'ranking',
    q: 'Can I see my rating change before it\'s confirmed?',
    a: 'Yes. As soon as a result is submitted you\'ll see an estimated change. It finalises once the other team verifies — or automatically after 24 hours if unchallenged.',
  },
  /* Leagues */
  {
    id: 'how-leagues-work',
    topic: 'leagues',
    q: 'How do leagues work?',
    a: 'Anyone can create a league and invite players. Choose Round Robin or Mexicano format. Leagues track live standings, support multiple seasons, and handle scheduling and result recording.',
  },
  {
    id: 'league-formats',
    topic: 'leagues',
    q: 'What league formats are available?',
    a: 'Round Robin (every team plays every other team) and Mexicano (rotating partners based on standings). Both are fully automated once set up.',
  },
  /* Community & groups */
  {
    id: 'join-group',
    topic: 'community',
    q: 'How do I create or join a group?',
    a: 'Go to the Community tab to browse public groups or create your own. You can also join via an invite link from an admin. Some groups require approval before you can join.',
  },
  {
    id: 'household',
    topic: 'community',
    q: 'What is household linking?',
    a: 'Link a partner or family member so the app can spot scheduling conflicts between your matches. Head to You → Settings → Household to set it up.',
  },
  /* Badges & rewards */
  {
    id: 'what-badges',
    topic: 'badges',
    q: 'What badges can I earn?',
    a: 'Badges are earned automatically as you play. Current earnable badges include First Victory (your first win), On Fire (3-win streak), Consistent (10 matches), Sharp Shooter (70%+ win rate over 10+ matches), Social Butterfly (member of 3+ groups), Veteran (50+ matches), Perfectionist (winning 6-0, 6-0), and Giant Slayer (beating a team rated 200+ points above you).',
  },
  {
    id: 'peer-voting',
    topic: 'badges',
    q: 'How does post-match voting work?',
    a: 'After recording a result, the submitter can rate the other players across five categories: Shot of the Match, Tactical Genius, Best Teammate, Comedy Gold, and Hustle Award. It\'s a fun way to recognise standout moments.',
  },
  {
    id: 'what-jerseys',
    topic: 'badges',
    q: 'What are league jerseys?',
    a: 'League admins can award special jerseys to standout players within their league — colours like League Leader (yellow), Giant Killer (green), Most Improved (red), Entertainer (blue), and Wooden Spoon (black). They\'re a fun recognition tool for group organisers.',
  },
  /* Account */
  {
    id: 'minimum-age',
    topic: 'account',
    q: 'What\'s the minimum age?',
    a: 'You must be at least 13 years old to create an account. Under-18s need parental or guardian consent. This matches our App Store age rating.',
  },
  {
    id: 'delete-account',
    topic: 'account',
    q: 'How do I delete my account?',
    a: 'Go to You → Settings → Delete Account. Your personal data (name, email, photos) is removed within 30 days. Match history is anonymised to preserve league integrity. You can also email privacy@padelplayersapp.com.',
  },
  {
    id: 'report-player',
    topic: 'account',
    q: 'How do I report someone?',
    a: 'Tap the report button on any player\'s profile to flag harassment, abuse, or inappropriate content. You can also block players directly. Reports are investigated within 48 hours.',
  },
  /* Privacy & data */
  {
    id: 'data-privacy',
    topic: 'privacy',
    q: 'How is my data used?',
    a: 'We collect only what\'s needed to run the app — your name, email, profile photos, and approximate location for match discovery. We don\'t advertise, track you, or sell data to anyone. Full details are in our Privacy Policy.',
  },
  {
    id: 'location-data',
    topic: 'privacy',
    q: 'Why does the app need my location?',
    a: 'Location is used to show you matches and venues nearby. Approximate location works at a city level; precise GPS (only if you allow it) powers the "Find My Game" auto-matching. It\'s never used for ads or tracking.',
  },
]
