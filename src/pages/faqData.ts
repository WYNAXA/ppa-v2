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
  { id: 'voting', label: 'Peer voting' },
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
    a: 'Badges are earned automatically as you play. Current earnable badges include First Victory (your first win), On Fire (3-win streak), Consistent (10 matches), Sharp Shooter (70%+ win rate over 10+ matches), Social Butterfly (member of 3+ groups), Veteran (50+ matches), Perfectionist (winning 6-0, 6-0), and Giant Slayer (beating a team rated 200+ points above you). Peer-vote badges (bronze, silver, gold per award category) are earned from the votes you receive across all your matches.',
  },
  /* Peer voting */
  {
    id: 'what-is-peer-voting',
    topic: 'voting',
    q: 'What is peer voting?',
    a: 'After every match you give a few quick votes to the people you played with \u2014 small awards for things that stood out, like the best shot or the funniest moment. It takes seconds, and it\u2019s the social heart of the app: it turns a finished game into recognition for the people in it.',
  },
  {
    id: 'vote-categories',
    topic: 'voting',
    q: 'What can I vote for?',
    a: 'Five awards, one vote each: Shot of the Match (the single best shot anyone played), Tactical Genius (the smartest bit of thinking or positioning), Best Recovery Shot (kept the ball alive when the point looked lost), Comedy Gold (the funniest moment on court), and Hustle Award (whoever worked hardest and never gave up). You give one vote in each award, to any player who was in that match \u2014 including the opposing team.',
  },
  {
    id: 'who-can-vote',
    topic: 'voting',
    q: 'Who can vote, and is it anonymous?',
    a: 'Everyone who played can vote, not just whoever entered the score. And it\u2019s completely anonymous: you\u2019ll see who won each award, but never who voted for whom. That keeps it honest and light-hearted.',
  },
  {
    id: 'when-votes-count',
    topic: 'voting',
    q: 'When do my votes actually count?',
    a: 'As soon as a result is entered, the other players are asked to confirm it\u2019s correct. Until that result is confirmed \u2014 or 24 hours pass and it\u2019s confirmed automatically \u2014 your votes are \u201cprovisional\u201d: they show on the match, but they don\u2019t yet count toward badges or jerseys. This makes sure nothing is awarded off a result that turns out wrong or disputed.',
  },
  {
    id: 'where-see-votes',
    topic: 'voting',
    q: 'Where do I see the votes?',
    a: 'Two places. On the match itself, you\u2019ll see the awards for that game \u2014 each category and who received the votes. On your own profile, you\u2019ll see your running totals: how many votes you\u2019ve received in each award across all your matches, plus any badges earned.',
  },
  {
    id: 'vote-badges',
    topic: 'voting',
    q: 'What are badges, and how do I earn them?',
    a: 'Badges are your long-term collection. For each of the five awards, the votes you receive add up across every match you play \u2014 friendly, group, or league. Reach the milestones and you earn a tier: bronze at 5 votes in that award, silver at 15, gold at 40. They live on your profile and never expire. (Only confirmed votes count.)',
  },
  {
    id: 'entertainer-jersey',
    topic: 'voting',
    q: 'What\u2019s the Entertainer jersey?',
    a: 'The jersey is a league-only, weekly prize. Within a league, whoever received the most peer votes that week wins the Entertainer jersey. It works like the leader\u2019s jersey in cycling: one person holds it at a time, and each week it can pass to whoever overtakes them. If two people tie at the top, the current holder keeps it. You can watch the race live through the week, and past winners are kept on record.',
  },
  {
    id: 'how-it-fits-together',
    topic: 'voting',
    q: 'So how does it all fit together?',
    a: 'You vote once, right after a match. Those same votes do two jobs: they build your personal badges (in any match, adding up over your whole time on the app), and in a league they also decide that week\u2019s Entertainer jersey. Think of badges as your lifetime trophy cabinet and the jersey as the league\u2019s weekly title \u2014 and both only count votes from matches whose result has been confirmed.',
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
