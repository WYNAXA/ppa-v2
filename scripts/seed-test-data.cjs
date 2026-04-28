#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// PPA V2 — Synthetic Test Data Seeder
// Creates 20 users, 1 group, 1 poll, 30 past matches, 1 league, events, etc.
// Run: node scripts/seed-test-data.js
// ─────────────────────────────────────────────────────────────────────────────

const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = 'https://timbjfihsxqfrqrxwdny.supabase.co'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpbWJqZmloc3hxZnJxcnh3ZG55Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjE5MDY3MiwiZXhwIjoyMDg3NzY2NjcyfQ.4j2hXxcmPHgTnHN_fcTW1WcQk3ikzwjwN8hR25zjtpA'

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ── Config ────────────────────────────────────────────────────────────────────

const NAMES = [
  'James Wilson', 'Sarah Chen', 'Miguel Rodriguez', 'Emma Thompson',
  'Luca Ferrari', 'Priya Patel', "Tom O'Brien", 'Zara Ahmed',
  'Carlos Santos', 'Alice Cooper', 'Ben Davies', 'Fatima Hassan',
  'Jack Murphy', 'Nina Kowalski', 'Diego Morales', 'Sophie Martin',
  'Ravi Kumar', 'Chloe Williams', 'Ahmed Al-Rashid', 'Isabella Rossi',
]

const INITIAL_ELO = [42,58,71,35,65,55,48,73,39,62,51,68,45,77,33,60,53,70,38,66]

const POSTCODES = ['BS1','BS2','BS3','BS4','BS5','BS6','BS7','BS8','BS9']

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

function daysFromNow(n) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

function nextMonday() {
  const d = new Date()
  const day = d.getDay()
  const diff = day === 0 ? 1 : 8 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().split('T')[0]
}

function eloWinProb(rA, rB) {
  return 1 / (1 + Math.pow(10, (rB - rA) / 400))
}

function applyElo(rA, rB, scoreA, scoreB) {
  const K = 32
  const expA = eloWinProb(rA, rB)
  const actualA = scoreA > scoreB ? 1 : scoreA < scoreB ? 0 : 0.5
  const newA = Math.round(rA + K * (actualA - expA))
  const newB = Math.round(rB + K * ((1 - actualA) - (1 - expA)))
  return [newA, newB]
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

async function insertOrSkip(table, data, conflictCol) {
  const opts = conflictCol
    ? { onConflict: conflictCol, ignoreDuplicates: true }
    : {}
  const { data: result, error } = await sb.from(table).insert(data, opts).select('id').maybeSingle()
  if (error && !error.message?.includes('duplicate')) {
    console.warn(`  ⚠ ${table} insert warning:`, error.message)
    return null
  }
  return result?.id ?? null
}

// ── Step 1: Create 20 users ───────────────────────────────────────────────────

async function createUsers() {
  console.log('\n── STEP 1: Creating 20 auth users + profiles ──')
  const users = []

  for (let i = 0; i < 20; i++) {
    const email = `testuser${i + 1}@padeltest.com`
    const name = NAMES[i]

    // Try to find existing user first
    const { data: existing } = await sb.auth.admin.listUsers()
    const found = existing?.users?.find(u => u.email === email)

    let userId
    if (found) {
      userId = found.id
      console.log(`  ↩ ${name} already exists (${userId.slice(0,8)}…)`)
    } else {
      const { data, error } = await sb.auth.admin.createUser({
        email,
        password: 'TestPass123!',
        email_confirm: true,
        user_metadata: { name },
      })
      if (error) {
        console.error(`  ✗ Failed to create ${name}:`, error.message)
        continue
      }
      userId = data.user.id
      console.log(`  ✓ Created ${name} (${userId.slice(0,8)}…)`)
    }

    // Upsert profile
    const { error: pErr } = await sb.from('profiles').upsert({
      id: userId,
      name,
      email,
      internal_ranking: INITIAL_ELO[i],
      ranking_points: INITIAL_ELO[i],
      total_matches: 0,
      total_wins: 0,
      total_losses: 0,
      city: 'Bristol',
      postcode: POSTCODES[i % 9],
    }, { onConflict: 'id' })

    if (pErr) console.warn(`  ⚠ Profile upsert for ${name}:`, pErr.message)

    users.push({ id: userId, name, email, elo: INITIAL_ELO[i] })
  }

  console.log(`  → ${users.length} users ready`)
  return users
}

// ── Step 2: Create group ──────────────────────────────────────────────────────

async function createGroup(users) {
  console.log('\n── STEP 2: Creating test group ──')

  const { data: existing } = await sb.from('groups').select('id').eq('name', '[TEST] BS3 Padel Squad').maybeSingle()
  let groupId = existing?.id

  if (!groupId) {
    const { data, error } = await sb.from('groups').insert({
      name: '[TEST] BS3 Padel Squad',
      description: 'Synthetic test group for UAT stress testing',
      city: 'Bristol',
      country: 'GB',
      admin_id: users[0].id,
      visibility: 'open',
      join_mode: 'request',
    }).select('id').single()

    if (error) { console.error('  ✗ Group creation failed:', error.message); return null }
    groupId = data.id
    console.log(`  ✓ Created group: [TEST] BS3 Padel Squad (${groupId.slice(0,8)}…)`)
  } else {
    console.log(`  ↩ Group already exists (${groupId.slice(0,8)}…)`)
  }

  // Add all 20 members
  let added = 0
  for (let i = 0; i < users.length; i++) {
    const { error } = await sb.from('group_members').upsert({
      group_id: groupId,
      user_id: users[i].id,
      role: i === 0 ? 'admin' : 'member',
      status: 'approved',
    }, { onConflict: 'group_id,user_id', ignoreDuplicates: true })
    if (!error) added++
  }
  console.log(`  ✓ ${added} members added to group`)
  return groupId
}

// ── Step 3: Create availability poll ─────────────────────────────────────────

async function createPoll(groupId, users) {
  console.log('\n── STEP 3: Creating availability poll ──')

  const monday = nextMonday()
  const closeDate = new Date(monday)
  closeDate.setDate(closeDate.getDate() + 2)

  const timeSlots = [
    { id: 'slot1', day: 'Monday',    start_time: '19:00', end_time: '22:00' },
    { id: 'slot2', day: 'Tuesday',   start_time: '19:00', end_time: '22:00' },
    { id: 'slot3', day: 'Wednesday', start_time: '18:00', end_time: '21:00' },
    { id: 'slot4', day: 'Thursday',  start_time: '19:00', end_time: '22:00' },
    { id: 'slot5', day: 'Friday',    start_time: '17:00', end_time: '20:00' },
  ]

  const { data: existing } = await sb.from('polls').select('id').eq('group_id', groupId).eq('title', `[TEST] Week of ${monday}`).maybeSingle()
  let pollId = existing?.id

  if (!pollId) {
    const { data, error } = await sb.from('polls').insert({
      group_id: groupId,
      created_by: users[0].id,
      title: `[TEST] Week of ${monday}`,
      poll_type: 'friendly',
      week_start_date: monday,
      closes_at: closeDate.toISOString(),
      status: 'open',
      time_slots: timeSlots,
      additional_options: ['I can drive', 'I am up for a drink after'],
    }).select('id').single()

    if (error) { console.error('  ✗ Poll creation failed:', error.message); return null }
    pollId = data.id
    console.log(`  ✓ Created poll: [TEST] Week of ${monday} (${pollId.slice(0,8)}…)`)
  } else {
    console.log(`  ↩ Poll already exists (${pollId.slice(0,8)}…)`)
  }

  // Submit varied responses
  const responseGroups = [
    { userRange: [0,8],   slots: ['slot1','slot2'] },
    { userRange: [8,14],  slots: ['slot2','slot3'] },
    { userRange: [14,20], slots: ['slot4','slot5'] },
  ]
  const drivers = new Set([2,6,11,15,18])
  let responses = 0

  for (const group of responseGroups) {
    for (let i = group.userRange[0]; i < group.userRange[1]; i++) {
      const additionalResponses = {}
      if (drivers.has(i)) additionalResponses['I can drive'] = true
      if (Math.random() > 0.5) additionalResponses['I am up for a drink after'] = true

      const { error } = await sb.from('poll_responses').upsert({
        poll_id: pollId,
        user_id: users[i].id,
        selected_slots: group.slots,
        additional_responses: additionalResponses,
        submitted_at: new Date().toISOString(),
      }, { onConflict: 'poll_id,user_id', ignoreDuplicates: true })

      if (!error) responses++
    }
  }

  console.log(`  ✓ ${responses} poll responses submitted`)
  return pollId
}

// ── Step 4 & 5: Create 30 past matches with results + update stats ────────────

async function createMatches(users, groupId) {
  console.log('\n── STEP 4: Creating 30 past matches with results ──')

  // Track ELO throughout
  const elo = Object.fromEntries(users.map(u => [u.id, u.elo]))
  // Track stats
  const stats = Object.fromEntries(users.map(u => [u.id, { matches: 0, wins: 0, losses: 0 }]))
  // Track consecutive wins for achievements
  const streaks = Object.fromEntries(users.map(u => [u.id, 0]))

  const matchDefs = []

  // Match 1-5: User 1 (James) wins all → "On Fire"
  for (let m = 0; m < 5; m++) {
    const others = users.slice(1).filter((_, i) => i !== m % 4)
    const picks = shuffle(others).slice(0, 3)
    matchDefs.push({
      players: [users[0], picks[0], picks[1], picks[2]],
      team1Win: true,
      daysBack: 85 - m * 3,
    })
  }

  // Match 6-10: User 2 (Sarah) wins 4 of 5
  for (let m = 0; m < 5; m++) {
    const others = users.filter((u, i) => i !== 0 && i !== 1).slice(0, 3)
    const picks = shuffle(others.slice(m % 3)).slice(0, 3)
    matchDefs.push({
      players: [users[1], picks[0] || users[2], picks[1] || users[3], picks[2] || users[4]],
      team1Win: m < 4, // user2 wins first 4
      daysBack: 70 - m * 3,
    })
  }

  // Match 11-15: Mix across users 2-7
  for (let m = 0; m < 5; m++) {
    const pool = users.slice(2, 8)
    const picks = shuffle(pool).slice(0, 4)
    matchDefs.push({
      players: picks,
      team1Win: Math.random() > 0.4,
      daysBack: 55 - m * 3,
    })
  }

  // Match 16-20: Users 7-13 group
  for (let m = 0; m < 5; m++) {
    const pool = users.slice(7, 14)
    const picks = shuffle(pool).slice(0, 4)
    matchDefs.push({
      players: picks,
      team1Win: Math.random() > 0.4,
      daysBack: 40 - m * 2,
    })
  }

  // Match 21-25: Users 9-15
  for (let m = 0; m < 5; m++) {
    const pool = users.slice(9, 16)
    const picks = shuffle(pool).slice(0, 4)
    matchDefs.push({
      players: picks,
      team1Win: Math.random() > 0.4,
      daysBack: 28 - m * 2,
    })
  }

  // Match 26-30: Users 14-20
  for (let m = 0; m < 5; m++) {
    const pool = users.slice(14, 20)
    const picks = shuffle(pool).slice(0, 4)
    matchDefs.push({
      players: picks,
      team1Win: Math.random() > 0.4,
      daysBack: 16 - m * 2,
    })
  }

  const createdMatches = []
  let matchCount = 0
  let resultCount = 0

  for (let idx = 0; idx < matchDefs.length; idx++) {
    const def = matchDefs[idx]
    const [p1, p2, p3, p4] = def.players
    if (!p1 || !p2 || !p3 || !p4) continue

    const isCompetitive = idx < 10 || idx >= 20
    const matchDate = daysAgo(def.daysBack)

    // Check if match already exists
    const { data: existingMatch } = await sb
      .from('matches')
      .select('id')
      .eq('group_id', groupId)
      .eq('match_date', matchDate)
      .contains('player_ids', [p1.id, p2.id])
      .maybeSingle()

    let matchId = existingMatch?.id

    if (!matchId) {
      const { data: mData, error: mErr } = await sb.from('matches').insert({
        group_id: groupId,
        match_date: matchDate,
        match_time: '19:00:00',
        player_ids: [p1.id, p2.id, p3.id, p4.id],
        status: 'completed',
        match_type: isCompetitive ? 'competitive' : 'friendly',
        context_type: 'open',
        created_by: p1.id,
        created_manually: true,
        booked_venue_name: 'The Padel Team Bristol',
      }).select('id').single()

      if (mErr) { console.warn(`  ⚠ Match ${idx+1} insert:`, mErr.message); continue }
      matchId = mData.id
      matchCount++
    }

    // Generate sets data
    const team1Win = def.team1Win
    const sets = []
    if (team1Win) {
      const set2 = Math.random() > 0.4
      sets.push({ team1: 6, team2: Math.floor(Math.random() * 4) })
      if (set2) {
        sets.push({ team1: Math.floor(Math.random() * 4), team2: 6 })
        sets.push({ team1: 6, team2: Math.floor(Math.random() * 4) })
      } else {
        sets.push({ team1: 6, team2: Math.floor(Math.random() * 4) })
      }
    } else {
      const set2 = Math.random() > 0.4
      sets.push({ team1: Math.floor(Math.random() * 4), team2: 6 })
      if (set2) {
        sets.push({ team1: 6, team2: Math.floor(Math.random() * 4) })
        sets.push({ team1: Math.floor(Math.random() * 4), team2: 6 })
      } else {
        sets.push({ team1: Math.floor(Math.random() * 4), team2: 6 })
      }
    }

    const team1Score = sets.filter(s => s.team1 > s.team2).length
    const team2Score = sets.filter(s => s.team2 > s.team1).length
    const resultType = team1Win ? 'team1_win' : 'team2_win'

    // Insert result
    const { data: rExist } = await sb.from('match_results').select('id').eq('match_id', matchId).maybeSingle()
    if (!rExist) {
      const { error: rErr } = await sb.from('match_results').insert({
        match_id: matchId,
        team1_players: [p1.id, p2.id],
        team2_players: [p3.id, p4.id],
        team1_score: team1Score,
        team2_score: team2Score,
        sets_data: sets,
        result_type: resultType,
        submitted_by: p1.id,
        verification_status: 'verified',
        verified: true,
        auto_verified: true,
        verified_at: new Date(matchDate).toISOString(),
        is_friendly: !isCompetitive,
        match_date: matchDate,
      })
      if (rErr) { console.warn(`  ⚠ Result ${idx+1} insert:`, rErr.message); continue }
      resultCount++
    }

    // Update ELO
    const avgTeam1Elo = (elo[p1.id] + elo[p2.id]) / 2
    const avgTeam2Elo = (elo[p3.id] + elo[p4.id]) / 2
    const [newTeam1, newTeam2] = applyElo(avgTeam1Elo, avgTeam2Elo, team1Score, team2Score)
    const team1Delta = newTeam1 - avgTeam1Elo
    const team2Delta = newTeam2 - avgTeam2Elo
    elo[p1.id] = Math.round(elo[p1.id] + team1Delta)
    elo[p2.id] = Math.round(elo[p2.id] + team1Delta)
    elo[p3.id] = Math.round(elo[p3.id] + team2Delta)
    elo[p4.id] = Math.round(elo[p4.id] + team2Delta)

    // Update stats
    const winners = team1Win ? [p1.id, p2.id] : [p3.id, p4.id]
    const losers  = team1Win ? [p3.id, p4.id] : [p1.id, p2.id]
    ;[p1, p2, p3, p4].forEach(p => { stats[p.id].matches++ })
    winners.forEach(id => {
      stats[id].wins++
      streaks[id]++
    })
    losers.forEach(id => {
      stats[id].losses++
      streaks[id] = 0
    })

    createdMatches.push({ matchId, players: [p1, p2, p3, p4], team1Win, matchDate })
  }

  console.log(`  ✓ ${matchCount} new matches created, ${resultCount} results inserted`)
  console.log('\n── STEP 5: Updating profile stats ──')

  // Update profiles with final stats + ELO
  let updated = 0
  for (const user of users) {
    const s = stats[user.id]
    // internal_ranking is Playtomic scale 0-100, ranking_points is ELO (uncapped)
    const { error } = await sb.from('profiles').update({
      total_matches: s.matches,
      total_wins: s.wins,
      total_losses: s.losses,
      ranking_points: elo[user.id],
    }).eq('id', user.id)
    if (!error) updated++
    else console.warn(`  ⚠ profile update ${user.name}:`, error.message)
    user.finalElo = elo[user.id]
    user.stats = s
    user.streakPeak = streaks[user.id]
  }
  console.log(`  ✓ ${updated} profiles updated with final ELO + stats`)

  return { createdMatches, stats, elo, streaks }
}

// ── Step 6: Create league ─────────────────────────────────────────────────────

async function createLeague(users, groupId, stats, elo) {
  console.log('\n── STEP 6: Creating league ──')

  const { data: existing } = await sb.from('leagues').select('id').eq('name', '[TEST] Bristol Padel League S1').maybeSingle()
  let leagueId = existing?.id

  if (!leagueId) {
    const { data, error } = await sb.from('leagues').insert({
      name: '[TEST] Bristol Padel League S1',
      description: 'Synthetic test league — Season 1',
      created_by: users[0].id,
      linked_group_ids: [groupId],
      match_type: 'pairs',
      visibility: 'open',
      city: 'Bristol',
      country: 'GB',
      status: 'active',
      season_start: daysAgo(30),
      season_end: daysFromNow(60),
      gamification_enabled: true,
      achievements_enabled: true,
    }).select('id').single()

    if (error) { console.error('  ✗ League creation failed:', error.message); return null }
    leagueId = data.id
    console.log(`  ✓ Created league (${leagueId.slice(0,8)}…)`)
  } else {
    console.log(`  ↩ League already exists (${leagueId.slice(0,8)}…)`)
  }

  // Add league members + standings
  let membersAdded = 0
  let standingsAdded = 0

  for (const user of users) {
    const s = stats[user.id]
    const winRate = s.matches > 0 ? s.wins / s.matches : 0

    // league_members
    const { error: lmErr } = await sb.from('league_members').upsert({
      league_id: leagueId,
      user_id: user.id,
      role: user.id === users[0].id ? 'admin' : 'member',
      status: 'active',
      wins: s.wins,
      losses: s.losses,
      draws: 0,
      season_points: s.wins * 3,
    }, { onConflict: 'league_id,user_id', ignoreDuplicates: true })
    if (!lmErr) membersAdded++

    // league_standings — unique constraint is (league_id, user_id, category)
    const { error: lsErr } = await sb.from('league_standings').upsert({
      league_id: leagueId,
      user_id: user.id,
      wins: s.wins,
      losses: s.losses,
      draws: 0,
      matches_played: s.matches,
      ranking_points: elo[user.id],
      category: 'overall',
    }, { onConflict: 'league_id,user_id,category', ignoreDuplicates: true })
    if (!lsErr) standingsAdded++
    else console.warn('  ⚠ standings:', lsErr.message)
  }

  console.log(`  ✓ ${membersAdded} league members, ${standingsAdded} standings rows`)
  return leagueId
}

// ── Step 7: Award achievements ────────────────────────────────────────────────

async function awardAchievements(users, stats, streaks, leagueId) {
  console.log('\n── STEP 7: Awarding achievements ──')

  const awarded = []

  for (const user of users) {
    const s = stats[user.id]
    const winRate = s.matches > 0 ? s.wins / s.matches : 0

    const toAward = []

    if (s.wins >= 1) toAward.push('first_win')
    if (streaks[user.id] >= 3 || s.wins >= 3) toAward.push('on_fire')
    if (s.matches >= 10) toAward.push('consistent')
    if (winRate >= 0.7 && s.matches >= 3) toAward.push('sharp_shooter')
    if (s.matches >= 20) toAward.push('veteran')

    const ACHIEVEMENT_NAMES = {
      first_win:    'First Win',
      on_fire:      'On Fire',
      consistent:   'Consistent',
      sharp_shooter:'Sharp Shooter',
      social:       'Social Butterfly',
      veteran:      'Veteran',
    }

    for (const type of toAward) {
      const { error } = await sb.from('player_achievements').insert({
        user_id: user.id,
        achievement_type: type,
        achievement_name: ACHIEVEMENT_NAMES[type] ?? type,
        awarded_at: new Date().toISOString(),
        ...(leagueId ? { league_id: leagueId } : {}),
      })

      if (!error) {
        awarded.push({ user: user.name, type })
      } else if (!error.message?.includes('duplicate')) {
        console.warn(`  ⚠ achievement ${type} for ${user.name}:`, error.message)
      }
    }
  }

  console.log(`  ✓ ${awarded.length} achievements awarded`)
  return awarded
}

// ── Step 8: Create event ──────────────────────────────────────────────────────

async function createEvent(users, groupId) {
  console.log('\n── STEP 8: Creating group event ──')

  const eventDate = daysFromNow(14)
  const { data: existing } = await sb.from('events').select('id').eq('group_id', groupId).eq('title', '[TEST] End of Season Party').maybeSingle()
  let eventId = existing?.id

  if (!eventId) {
    const { data, error } = await sb.from('events').insert({
      title: '[TEST] End of Season Party',
      description: 'Drinks and awards after the season ends. Come celebrate!',
      group_id: groupId,
      created_by: users[0].id,
      event_type: 'social',
      start_time: `${eventDate}T19:00:00`,
      end_time: `${eventDate}T22:00:00`,
      location: 'The Padel Team Bristol',
      status: 'published',
    }).select('id').single()

    if (error) { console.error('  ✗ Event creation failed:', error.message); return null }
    eventId = data.id
    console.log(`  ✓ Created event (${eventId.slice(0,8)}…)`)
  } else {
    console.log(`  ↩ Event already exists (${eventId.slice(0,8)}…)`)
  }

  // Add RSVPs via event_attendees
  const rsvpMap = [
    ...users.slice(0, 12).map(u => ({ event_id: eventId, user_id: u.id, status: 'going' })),
    ...users.slice(12, 16).map(u => ({ event_id: eventId, user_id: u.id, status: 'interested' })),
    ...users.slice(16, 20).map(u => ({ event_id: eventId, user_id: u.id, status: 'not_going' })),
  ]

  let rsvps = 0
  for (const rsvp of rsvpMap) {
    const { error } = await sb.from('event_attendees').upsert(rsvp, { onConflict: 'event_id,user_id', ignoreDuplicates: true })
    if (!error) rsvps++
  }

  console.log(`  ✓ ${rsvps} RSVPs added`)
  return eventId
}

// ── Step 9: Create upcoming matches ──────────────────────────────────────────

async function createUpcomingMatches(users, groupId) {
  console.log('\n── STEP 9: Creating 5 upcoming matches ──')

  const upcoming = [
    { players: [0,1,2,3],    daysAhead: 3,  status: 'scheduled', time: '19:00:00', venue: 'The Padel Team Bristol' },
    { players: [4,5,6,7],    daysAhead: 5,  status: 'scheduled', time: '20:00:00', venue: 'Bristol Padel Club' },
    { players: [8,9,10],     daysAhead: 7,  status: 'pending',   time: '18:30:00', venue: null }, // only 3, waiting
    { players: [12,13,14,15],daysAhead: 10, status: 'scheduled', time: '19:00:00', venue: 'The Padel Team Bristol' },
    { players: [16,17,18,19],daysAhead: 12, status: 'scheduled', time: '17:00:00', venue: 'Bristol Padel Club' },
  ]

  let created = 0
  for (const def of upcoming) {
    const playerIds = def.players.map(i => users[i].id)
    const matchDate = daysFromNow(def.daysAhead)

    const { data: existing } = await sb.from('matches').select('id').eq('group_id', groupId).eq('match_date', matchDate).eq('status', def.status).maybeSingle()
    if (existing) { console.log(`  ↩ Upcoming match on ${matchDate} already exists`); continue }

    const { error } = await sb.from('matches').insert({
      group_id: groupId,
      match_date: matchDate,
      match_time: def.time,
      player_ids: playerIds,
      status: def.status,
      match_type: 'friendly',
      context_type: 'open',
      created_by: playerIds[0],
      created_manually: true,
      ...(def.venue ? { booked_venue_name: def.venue } : {}),
    })
    if (!error) created++
  }

  console.log(`  ✓ ${created} upcoming matches created`)
}

// ── Step 10: Write cleanup SQL ────────────────────────────────────────────────

function writeCleanupScript(users, groupId, leagueId) {
  const userIdList = users.map(u => `'${u.id}'`).join(',\n  ')
  const sql = `-- ─────────────────────────────────────────────────────────
-- PPA V2 Test Data Cleanup Script
-- Generated: ${new Date().toISOString()}
-- Run in Supabase SQL editor or via psql
-- ─────────────────────────────────────────────────────────

-- 1. Achievements
DELETE FROM player_achievements
WHERE user_id IN (
  SELECT id FROM profiles WHERE email LIKE '%@padeltest.com'
);

-- 2. Match result votes
DELETE FROM match_result_votes
WHERE match_result_id IN (
  SELECT mr.id FROM match_results mr
  JOIN matches m ON mr.match_id = m.id
  WHERE m.group_id = '${groupId}'
);

-- 3. Match results
DELETE FROM match_results
WHERE match_id IN (
  SELECT id FROM matches WHERE group_id = '${groupId}'
);

-- 4. Matches
DELETE FROM matches
WHERE group_id = '${groupId}';

-- 5. League standings
DELETE FROM league_standings
WHERE league_id IN (SELECT id FROM leagues WHERE name LIKE '[TEST]%');

-- 6. League members
DELETE FROM league_members
WHERE league_id IN (SELECT id FROM leagues WHERE name LIKE '[TEST]%');

-- 7. Leagues
DELETE FROM leagues WHERE name LIKE '[TEST]%';

-- 8. Poll responses
DELETE FROM poll_responses
WHERE poll_id IN (SELECT id FROM polls WHERE title LIKE '[TEST]%');

-- 9. Polls
DELETE FROM polls WHERE title LIKE '[TEST]%';

-- 10. Event attendees
DELETE FROM event_attendees
WHERE event_id IN (SELECT id FROM events WHERE group_id = '${groupId}');

-- 11. Events
DELETE FROM events WHERE group_id = '${groupId}';

-- 12. Group members
DELETE FROM group_members WHERE group_id = '${groupId}';

-- 13. Group
DELETE FROM groups WHERE id = '${groupId}';

-- 14. Profiles
DELETE FROM profiles WHERE email LIKE '%@padeltest.com';

-- 15. Auth users (run via Supabase dashboard or admin API)
-- Test user IDs:
${users.map((u,i) => `-- testuser${i+1}@padeltest.com: ${u.id}`).join('\n')}
`

  require('fs').writeFileSync(
    require('path').join(__dirname, 'cleanup-test-data.sql'),
    sql
  )
  console.log('\n  ✓ Cleanup script written to scripts/cleanup-test-data.sql')
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════')
  console.log('  PPA V2 — Synthetic Test Data Seeder')
  console.log('═══════════════════════════════════════════')

  try {
    const users = await createUsers()
    if (users.length === 0) { console.error('No users created. Aborting.'); process.exit(1) }

    const groupId = await createGroup(users)
    if (!groupId) { console.error('No group created. Aborting.'); process.exit(1) }

    await createPoll(groupId, users)

    const { stats, elo, streaks } = await createMatches(users, groupId)

    const leagueId = await createLeague(users, groupId, stats, elo)

    const awarded = await awardAchievements(users, stats, streaks, leagueId)

    await createEvent(users, groupId)

    await createUpcomingMatches(users, groupId)

    writeCleanupScript(users, groupId, leagueId)

    // ── Final Report ──────────────────────────────────────────────────────────
    console.log('\n═══════════════════════════════════════════')
    console.log('  FINAL REPORT')
    console.log('═══════════════════════════════════════════')
    console.log(`  Users created/found:  ${users.length}`)

    const { count: matchCount } = await sb.from('matches').select('id', { count: 'exact', head: true }).eq('group_id', groupId).eq('status', 'completed')
    const { count: resultCount } = await sb.from('match_results').select('id', { count: 'exact', head: true })
      .in('match_id', (await sb.from('matches').select('id').eq('group_id', groupId).eq('status', 'completed')).data?.map(m => m.id) ?? [])

    console.log(`  Past matches:         ${matchCount ?? '?'}`)
    console.log(`  Results created:      ${resultCount ?? '?'}`)
    console.log(`  Achievements awarded: ${awarded.length}`)
    console.log('')
    console.log('  Achievements breakdown:')
    const achByUser = {}
    awarded.forEach(a => {
      if (!achByUser[a.user]) achByUser[a.user] = []
      achByUser[a.user].push(a.type)
    })
    Object.entries(achByUser).forEach(([name, types]) => {
      console.log(`    ${name}: ${types.join(', ')}`)
    })

    console.log('')
    console.log('  League Standings (Top 5 by ELO):')
    const sorted = users
      .map(u => ({ name: u.name, elo: elo[u.id], wins: stats[u.id].wins, matches: stats[u.id].matches }))
      .sort((a, b) => b.elo - a.elo)
      .slice(0, 5)
    sorted.forEach((u, i) => {
      console.log(`    ${i+1}. ${u.name} — ELO ${u.elo} (${u.wins}W / ${u.matches} played)`)
    })

    console.log('')
    console.log('  Test credentials:')
    console.log('    Email:    testuser1@padeltest.com')
    console.log('    Password: TestPass123!')
    console.log('')
    console.log('  Group ID:  ', groupId)
    console.log('  League ID: ', leagueId)
    console.log('')
    console.log('  Cleanup: run scripts/cleanup-test-data.sql in Supabase SQL editor')
    console.log('═══════════════════════════════════════════\n')

  } catch (err) {
    console.error('\nFATAL ERROR:', err)
    process.exit(1)
  }
}

main()
