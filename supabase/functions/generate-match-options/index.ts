import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TimeSlot {
  id: string;
  day: string;
  start_time: string;
  end_time: string;
}

interface PlayerVote {
  userId: string;
  userName: string;
  selectedSlots: string[];
  flexibleTimes: Record<string, { available: boolean; slots: string[] }>;
  preferredSkillLevel: string;
  canPlayTwice: boolean;
  preferredDate?: string | null;
}

interface MatchOption {
  optionNumber: number;
  dayOfWeek: string;
  date: string;
  timeSlot: string;
  actualStartTime?: string;
  actualEndTime?: string;
  originalTimeSlot?: string;
  timeAdjusted?: boolean;
  limitingPlayer?: string;
  playerIds: string[];
  playerNames: string[];
  playersOnPreferredDay?: string[];
  skillLevel: string;
  playersNeeded: number;
  status: 'ready' | 'need_ringer' | 'conflict_warning';
  conflicts: any[];
  priority: number;
  quality: 'excellent' | 'good' | 'fair';
}

interface WeeklySchedule {
  scheduleNumber: number;
  strategyName: string;
  strategyDescription: string;
  isRecommended: boolean;
  quality: 'excellent' | 'good' | 'fair';
  matches: MatchOption[];
  alternativeMatches: MatchOption[];
  totalPlayers: number;
  totalMatches: number;
  playersScheduled: string[];
  averageMatchQuality: number;
  conflictCount: number;
  ringersNeeded: number;
  daysUsed: number;
}

interface DayAnalysis {
  day: string;
  slotId: string;
  timeSlot: string;
  playerCount: number;
  playerIds: string[];
  maxFullMatches: number;
  canHaveRingerMatch: boolean;
}

interface PlayerExclusivity {
  userId: string;
  exclusiveToDay?: string;
  availableDays: string[];
  dayCount: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { poll_id } = await req.json();
    console.log('🎯 Generating smart match options for poll:', poll_id);

    // 1. Get poll details with time slots
    const { data: poll, error: pollError } = await supabase
      .from('polls')
      .select('*, groups(name)')
      .eq('id', poll_id)
      .single();

    if (pollError) {
      console.error('Error fetching poll:', pollError);
      throw pollError;
    }

    const rawTs = poll.time_slots;
    const timeSlots: TimeSlot[] = Array.isArray(rawTs) ? rawTs : typeof rawTs === 'string' ? (() => { try { return JSON.parse(rawTs); } catch { return []; } })() : [];
    console.log(`📅 Poll has ${timeSlots.length} time slots (raw type: ${typeof rawTs})`);
    
    if (!timeSlots || timeSlots.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          weeklySchedules: [],
          message: 'No time slots available in poll'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Get all responses with user details
    const { data: responses, error: responsesError } = await supabase
      .from('poll_responses')
      .select(`
        user_id,
        selected_slots,
        flexible_times,
        can_play_twice,
        preferred_date,
        preferred_skill_level,
        profiles!poll_responses_user_id_fkey (
          id,
          name
        )
      `)
      .eq('poll_id', poll_id);

    if (responsesError) {
      console.error('Error fetching responses:', responsesError);
      throw responsesError;
    }

    console.log(`📊 Found ${responses?.length || 0} responses`);

    if (!responses || responses.length < 2) {
      console.log('Not enough players to generate schedules');
      return new Response(
        JSON.stringify({ 
          success: true, 
          weeklySchedules: [],
          message: 'Need at least 2 players to generate weekly schedules'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Parse player votes
    const playerVotes: PlayerVote[] = responses.map(r => {
      const profile = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
      return {
        userId: r.user_id,
        userName: profile?.name || 'Unknown',
        selectedSlots: r.selected_slots || [],
        flexibleTimes: r.flexible_times || {},
        preferredSkillLevel: r.preferred_skill_level || 'intermediate',
        canPlayTwice: r.can_play_twice || false,
        preferredDate: r.preferred_date,
      };
    });

    // 4. Build availability matrix (who can play when)
    const availabilityMap = new Map<string, string[]>();
    const dayAvailabilityMap = new Map<string, Set<string>>();
    
    console.log('🔍 Building availability matrix...');
    timeSlots.forEach((slot) => {
      const availablePlayers = playerVotes.filter(vote => {
        // Check direct slot selection
        if (vote.selectedSlots.includes(slot.id)) return true;
        
        // Check flexible times with overlap detection
        const dayData = vote.flexibleTimes[slot.day];
        if (dayData && dayData.available && Array.isArray(dayData.slots)) {
          const slotStartMinutes = parseTime(slot.start_time);
          const slotEndMinutes = parseTime(slot.end_time);
          
          return dayData.slots.some((flexTime: string) => {
            const flexStartMinutes = parseTime(flexTime);
            const flexEndMinutes = flexStartMinutes + 90;
            return flexStartMinutes < slotEndMinutes && flexEndMinutes > slotStartMinutes;
          });
        }
        return false;
      }).map(v => v.userId);
      
      console.log(`   ${slot.day} ${slot.start_time}-${slot.end_time}: ${availablePlayers.length} players available`);
      
      if (availablePlayers.length >= 2) {
        availabilityMap.set(slot.id, availablePlayers);
      }

      // Track day-level availability
      if (!dayAvailabilityMap.has(slot.day)) {
        dayAvailabilityMap.set(slot.day, new Set());
      }
      availablePlayers.forEach(id => dayAvailabilityMap.get(slot.day)!.add(id));
    });

    console.log(`⏰ Found ${availabilityMap.size} viable time slots (2+ players)`);

    if (availabilityMap.size === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          weeklySchedules: [],
          message: 'No time slots have 2 or more available players'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5. PRE-PROCESSING: Analyze player exclusivity and day capacity
    console.log('\n🔬 PRE-PROCESSING PHASE');
    
    const playerExclusivity = analyzePlayerExclusivity(playerVotes, timeSlots, availabilityMap);
    console.log('📊 Player Exclusivity Analysis:');
    playerExclusivity.forEach(pe => {
      if (pe.exclusiveToDay) {
        console.log(`   👤 ${playerVotes.find(p => p.userId === pe.userId)?.userName}: ONLY available ${pe.exclusiveToDay}`);
      } else if (pe.dayCount === 1) {
        console.log(`   👤 ${playerVotes.find(p => p.userId === pe.userId)?.userName}: Only 1 day (${pe.availableDays[0]})`);
      }
    });

    const dayAnalysis = analyzeDayCapacity(dayAvailabilityMap, timeSlots, availabilityMap);
    console.log('\n📅 Day Capacity Analysis:');
    dayAnalysis.forEach(da => {
      console.log(`   ${da.day}: ${da.playerCount} players → ${da.maxFullMatches} full matches possible${da.canHaveRingerMatch ? ', + ringer matches' : ''}`);
    });

    // 6. GENERATE 3 TRULY DISTINCT STRATEGIES
    const weeklySchedules: WeeklySchedule[] = [];

    // STRATEGY 1: Maximize Full Matches (No Ringers)
    console.log('\n\n🎯 STRATEGY 1: MAXIMIZE FULL MATCHES (NO RINGERS)');
    const strategy1 = await generateMaximizeFullMatchesStrategy(
      playerVotes,
      timeSlots,
      availabilityMap,
      dayAvailabilityMap,
      dayAnalysis,
      playerExclusivity,
      poll.week_start_date,
      poll_id,
      supabase
    );
    weeklySchedules.push(strategy1);

    // STRATEGY 2: Concentrated Day + Ringers
    console.log('\n\n🎯 STRATEGY 2: CONCENTRATED DAY + RINGERS');
    const strategy2 = await generateConcentratedDayStrategy(
      playerVotes,
      timeSlots,
      availabilityMap,
      dayAvailabilityMap,
      dayAnalysis,
      playerExclusivity,
      poll.week_start_date,
      poll_id,
      supabase
    );
    weeklySchedules.push(strategy2);

    // STRATEGY 3: Maximum Day Spread
    console.log('\n\n🎯 STRATEGY 3: MAXIMUM DAY SPREAD');
    const strategy3 = await generateMaximumDaySpreadStrategy(
      playerVotes,
      timeSlots,
      availabilityMap,
      dayAvailabilityMap,
      dayAnalysis,
      playerExclusivity,
      poll.week_start_date,
      poll_id,
      supabase
    );
    weeklySchedules.push(strategy3);

    // Rank schedules and assign quality
    weeklySchedules.sort((a, b) => {
      // Prioritize more players
      if (a.totalPlayers !== b.totalPlayers) return b.totalPlayers - a.totalPlayers;
      // Then more matches
      if (a.totalMatches !== b.totalMatches) return b.totalMatches - a.totalMatches;
      // Then fewer ringers needed
      if (a.ringersNeeded !== b.ringersNeeded) return a.ringersNeeded - b.ringersNeeded;
      // Finally fewer conflicts
      return a.conflictCount - b.conflictCount;
    });

    if (weeklySchedules.length > 0) {
      weeklySchedules[0].isRecommended = true;
      weeklySchedules[0].quality = 'excellent';
    }
    if (weeklySchedules.length > 1) {
      weeklySchedules[1].quality = 'good';
    }
    if (weeklySchedules.length > 2) {
      weeklySchedules[2].quality = 'fair';
    }

    console.log('\n✅ FINAL SCHEDULES GENERATED:');
    weeklySchedules.forEach(schedule => {
      console.log(`\n📅 ${schedule.strategyName}:`);
      console.log(`   ${schedule.totalMatches} matches, ${schedule.totalPlayers} players, ${schedule.daysUsed} days, ${schedule.ringersNeeded} ringers needed`);
      schedule.matches.forEach(m => {
        const ringerText = m.playersNeeded > 0 ? ` (need ${m.playersNeeded} ringers)` : '';
        console.log(`   - ${m.dayOfWeek} ${m.timeSlot}: ${m.playerNames.join(', ')}${ringerText}`);
      });
    });

    // Build profiles object for UI
    const profilesMap: Record<string, any> = {};
    const allPlayerIds = new Set<string>();
    weeklySchedules.forEach(schedule => {
      schedule.matches.forEach(match => {
        match.playerIds.forEach(id => allPlayerIds.add(id));
      });
      schedule.alternativeMatches.forEach(match => {
        match.playerIds.forEach(id => allPlayerIds.add(id));
      });
    });

    for (const playerId of Array.from(allPlayerIds)) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, name, playtomic_level, internal_ranking')
        .eq('id', playerId)
        .single();
      
      if (profile) {
        profilesMap[playerId] = profile;
      }
    }

    // Find available ringers
    const allScheduledPlayerIds = new Set<string>();
    weeklySchedules.forEach(schedule => {
      schedule.matches.forEach(match => {
        match.playerIds.forEach(id => allScheduledPlayerIds.add(id));
      });
    });

    return new Response(
      JSON.stringify({
        success: true,
        weeklySchedules,
        profiles: profilesMap,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error generating match options:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ============= STRATEGY 1: MAXIMIZE FULL MATCHES =============
async function generateMaximizeFullMatchesStrategy(
  playerVotes: PlayerVote[],
  timeSlots: TimeSlot[],
  availabilityMap: Map<string, string[]>,
  dayAvailabilityMap: Map<string, Set<string>>,
  dayAnalysis: DayAnalysis[],
  playerExclusivity: PlayerExclusivity[],
  weekStartDate: string,
  pollId: string,
  supabase: any
): Promise<WeeklySchedule> {
  
  console.log('Strategy: Pack as many 4-player matches as possible, avoiding ringers');
  
  const scheduleMatches: MatchOption[] = [];
  const scheduledPlayers = new Set<string>();
  let matchNumber = 1;

  // PHASE 1: Schedule exclusive players FIRST
  console.log('📍 PHASE 1: Scheduling exclusive players first');
  
  // Group exclusive players by their day
  const exclusivesPerDay = new Map<string, PlayerVote[]>();
  playerExclusivity
    .filter(pe => pe.exclusiveToDay)
    .forEach(pe => {
      const player = playerVotes.find(v => v.userId === pe.userId);
      if (player) {
        if (!exclusivesPerDay.has(pe.exclusiveToDay!)) {
          exclusivesPerDay.set(pe.exclusiveToDay!, []);
        }
        exclusivesPerDay.get(pe.exclusiveToDay!)!.push(player);
      }
    });

  console.log(`   Found ${exclusivesPerDay.size} days with exclusive players`);

  // For each day with exclusives, create a match FIRST
  for (const [day, exclusives] of exclusivesPerDay) {
    console.log(`   ${day}: ${exclusives.length} exclusive players (${exclusives.map(p => p.userName).join(', ')})`);
    
    // Find best slot for this day
    const daySlotsWithPlayers = Array.from(availabilityMap.entries())
      .map(([slotId, playerIds]) => {
        const slot = timeSlots.find(s => s.id === slotId);
        return slot && slot.day === day ? { slot, slotId, playerIds } : null;
      })
      .filter((item): item is { slot: TimeSlot; slotId: string; playerIds: string[] } => item !== null)
      .sort((a, b) => b.playerIds.length - a.playerIds.length);

    if (daySlotsWithPlayers.length === 0) {
      console.log(`   ⚠️ No slots found for ${day}`);
      continue;
    }

    const bestSlot = daySlotsWithPlayers[0];
    
    // Find overlap players available on this day (not scheduled yet, not exclusive)
    const overlapPlayers = playerVotes.filter(p => {
      if (scheduledPlayers.has(p.userId)) return false;
      const pe = playerExclusivity.find(e => e.userId === p.userId);
      // Available on this day but NOT exclusive to it
      return pe && pe.availableDays.includes(day) && !pe.exclusiveToDay;
    });

    console.log(`   Found ${overlapPlayers.length} overlap players available on ${day}`);

    // Create match: exclusives + fill with overlap
    const neededFromOverlap = 4 - exclusives.length;
    const matchPlayers = [
      ...exclusives,
      ...overlapPlayers.slice(0, neededFromOverlap)
    ];

    if (matchPlayers.length === 4) {
      const match = await createBestMatch(
        matchPlayers,
        bestSlot.slot,
        weekStartDate,
        pollId,
        supabase
      );

      if (match) {
        scheduleMatches.push({
          ...match,
          optionNumber: matchNumber++,
          priority: 100,
        });

        // Mark all 4 players as scheduled
        matchPlayers.forEach(p => scheduledPlayers.add(p.userId));
        console.log(`   ✅ Created ${day} match with exclusives: ${matchPlayers.map(p => p.userName).join(', ')}`);
      }
    } else {
      console.log(`   ⚠️ Could not create full match on ${day} (only ${matchPlayers.length} players)`);
    }
  }

  // PHASE 2: Schedule remaining players by day capacity
  console.log('📊 PHASE 2: Scheduling remaining players');
  
  // Sort days by UNSCHEDULED player count
  const sortedDays = dayAnalysis
    .filter(da => da.playerCount >= 2)
    .map(da => {
      const unscheduledCount = da.playerIds.filter(id => !scheduledPlayers.has(id)).length;
      return { ...da, unscheduledCount };
    })
    .filter(da => da.unscheduledCount >= 2)
    .sort((a, b) => a.unscheduledCount - b.unscheduledCount);

  console.log(`   Days with unscheduled players: ${sortedDays.map(d => `${d.day}(${d.unscheduledCount})`).join(', ')}`);

  // For each day, create as many full matches as possible with remaining players
  for (const dayInfo of sortedDays) {
    // Get all slots for this day, sorted by player count
    const daySlotsWithPlayers = Array.from(availabilityMap.entries())
      .map(([slotId, playerIds]) => {
        const slot = timeSlots.find(s => s.id === slotId);
        return slot && slot.day === dayInfo.day ? { slot, slotId, playerIds } : null;
      })
      .filter((item): item is { slot: TimeSlot; slotId: string; playerIds: string[] } => item !== null)
      .sort((a, b) => b.playerIds.length - a.playerIds.length);

    if (daySlotsWithPlayers.length === 0) continue;

    // Pick the best slot for this day
    const bestSlot = daySlotsWithPlayers[0];
    
    // Get available players (not yet scheduled)
    let availablePlayers = bestSlot.playerIds
      .filter(id => !scheduledPlayers.has(id))
      .map(id => playerVotes.find(v => v.userId === id))
      .filter((p): p is PlayerVote => p !== undefined);

    console.log(`   ${dayInfo.day}: ${availablePlayers.length} unscheduled players available`);

    // Create matches for this day (full or partial)
    let dayMatchesCreated = 0;
    while (availablePlayers.length >= 2 && dayMatchesCreated === 0) {
      const matchPlayers = availablePlayers.slice(0, 4);

      const match = await createBestMatch(
        matchPlayers,
        bestSlot.slot,
        weekStartDate,
        pollId,
        supabase
      );

      if (match) {
        scheduleMatches.push({
          ...match,
          optionNumber: matchNumber++,
          priority: 100,
        });

        // Mark players as scheduled
        matchPlayers.forEach(p => scheduledPlayers.add(p.userId));
        
        // Remove from available pool
        availablePlayers = availablePlayers.filter(p => !matchPlayers.includes(p));
        
        dayMatchesCreated++;
        console.log(`   ✅ Created ${dayInfo.day} match ${dayMatchesCreated}: ${matchPlayers.map(p => p.userName).join(', ')}`);
      } else {
        break;
      }
    }
  }

  const uniquePlayers = new Set<string>();
  scheduleMatches.forEach(m => m.playerIds.forEach(id => uniquePlayers.add(id)));

  const daysUsed = new Set(scheduleMatches.map(m => m.dayOfWeek)).size;

  console.log(`✅ Strategy 1 complete: ${scheduleMatches.length} matches, ${uniquePlayers.size} players, ${daysUsed} days`);

  return {
    scheduleNumber: 1,
    strategyName: 'Maximize Full Matches',
    strategyDescription: 'Pack as many 4-player matches as possible without needing ringers',
    isRecommended: false,
    quality: 'good',
    matches: scheduleMatches,
    alternativeMatches: [],
    totalPlayers: uniquePlayers.size,
    totalMatches: scheduleMatches.length,
    playersScheduled: Array.from(uniquePlayers),
    averageMatchQuality: 100,
    conflictCount: 0,
    ringersNeeded: 0,
    daysUsed,
  };
}

// ============= STRATEGY 2: CONCENTRATED DAY + RINGERS =============
async function generateConcentratedDayStrategy(
  playerVotes: PlayerVote[],
  timeSlots: TimeSlot[],
  availabilityMap: Map<string, string[]>,
  dayAvailabilityMap: Map<string, Set<string>>,
  dayAnalysis: DayAnalysis[],
  playerExclusivity: PlayerExclusivity[],
  weekStartDate: string,
  pollId: string,
  supabase: any
): Promise<WeeklySchedule> {
  
  console.log('Strategy: Focus on most popular day, intentionally use ringers to maximize participation');
  
  const scheduleMatches: MatchOption[] = [];
  const scheduledPlayers = new Set<string>();
  let matchNumber = 1;
  let ringersNeeded = 0;

  // Find the most popular day
  const mostPopularDay = dayAnalysis.sort((a, b) => b.playerCount - a.playerCount)[0];
  console.log(`🎯 Most popular day: ${mostPopularDay.day} with ${mostPopularDay.playerCount} players`);

  // Get all slots for this day
  const popularDaySlots = Array.from(availabilityMap.entries())
    .map(([slotId, playerIds]) => {
      const slot = timeSlots.find(s => s.id === slotId);
      return slot && slot.day === mostPopularDay.day ? { slot, slotId, playerIds } : null;
    })
    .filter((item): item is { slot: TimeSlot; slotId: string; playerIds: string[] } => item !== null)
    .sort((a, b) => b.playerIds.length - a.playerIds.length);

  if (popularDaySlots.length === 0) {
    return createEmptySchedule(2, 'Concentrated Day + Ringers');
  }

  const mainSlot = popularDaySlots[0];
  let availablePlayers = mainSlot.playerIds
    .map(id => playerVotes.find(v => v.userId === id))
    .filter((p): p is PlayerVote => p !== undefined);

  // Create matches on this day until we run out of players
  while (availablePlayers.length >= 4) {
    const matchSize = Math.min(4, availablePlayers.length);
    const matchPlayers = availablePlayers.slice(0, matchSize);
    
    const match = await createBestMatch(
      matchPlayers,
      mainSlot.slot,
      weekStartDate,
      pollId,
      supabase
    );

    if (match) {
      const needsRingers = 4 - matchPlayers.length;
      scheduleMatches.push({
        ...match,
        optionNumber: matchNumber++,
        priority: needsRingers === 0 ? 100 : 80,
      });

      matchPlayers.forEach(p => scheduledPlayers.add(p.userId));
      availablePlayers = availablePlayers.filter(p => !matchPlayers.includes(p));
      
      if (needsRingers > 0) {
        ringersNeeded += needsRingers;
        console.log(`   ✅ ${mostPopularDay.day} match ${matchNumber - 1}: ${matchPlayers.map(p => p.userName).join(', ')} + ${needsRingers} ringers`);
      } else {
        console.log(`   ✅ ${mostPopularDay.day} match ${matchNumber - 1}: ${matchPlayers.map(p => p.userName).join(', ')}`);
      }
    } else {
      break;
    }
  }

  // Add alternative matches for day-exclusive players on OTHER days
  const alternativeMatches: MatchOption[] = [];
  const otherDayExclusives = playerExclusivity.filter(pe => 
    pe.exclusiveToDay && 
    pe.exclusiveToDay !== mostPopularDay.day &&
    !scheduledPlayers.has(pe.userId)
  );

  console.log(`🔄 Found ${otherDayExclusives.length} players exclusive to other days`);

  for (const exclusive of otherDayExclusives) {
    const player = playerVotes.find(v => v.userId === exclusive.userId);
    if (!player) continue;

    // Find their day's slots
    const theirDaySlots = Array.from(availabilityMap.entries())
      .map(([slotId, playerIds]) => {
        const slot = timeSlots.find(s => s.id === slotId);
        return slot && slot.day === exclusive.exclusiveToDay && playerIds.includes(player.userId) 
          ? { slot, slotId, playerIds } 
          : null;
      })
      .filter((item): item is { slot: TimeSlot; slotId: string; playerIds: string[] } => item !== null);

    if (theirDaySlots.length > 0) {
      const slot = theirDaySlots[0];
      const otherPlayersOnDay = slot.playerIds
        .filter(id => id !== player.userId && !scheduledPlayers.has(id))
        .map(id => playerVotes.find(v => v.userId === id))
        .filter((p): p is PlayerVote => p !== undefined)
        .slice(0, 3);

      const allPlayers = [player, ...otherPlayersOnDay];
      const match = await createBestMatch(allPlayers, slot.slot, weekStartDate, pollId, supabase);
      
      if (match) {
        const needsRingers = 4 - allPlayers.length;
        alternativeMatches.push({
          ...match,
          optionNumber: scheduleMatches.length + alternativeMatches.length + 1,
          priority: 60,
        });
        ringersNeeded += needsRingers;
        console.log(`   ⚡ Alternative for ${player.userName}: ${exclusive.exclusiveToDay} + ${needsRingers} ringers`);
      }
    }
  }

  const uniquePlayers = new Set<string>();
  scheduleMatches.forEach(m => m.playerIds.forEach(id => uniquePlayers.add(id)));

  const daysUsed = new Set(scheduleMatches.map(m => m.dayOfWeek)).size;

  return {
    scheduleNumber: 2,
    strategyName: 'Concentrated Day + Ringers',
    strategyDescription: 'Focus matches on most popular day, use ringers to maximize participation',
    isRecommended: false,
    quality: 'good',
    matches: scheduleMatches,
    alternativeMatches,
    totalPlayers: uniquePlayers.size,
    totalMatches: scheduleMatches.length,
    playersScheduled: Array.from(uniquePlayers),
    averageMatchQuality: 85,
    conflictCount: 0,
    ringersNeeded,
    daysUsed,
  };
}

// ============= STRATEGY 3: MAXIMUM DAY SPREAD =============
async function generateMaximumDaySpreadStrategy(
  playerVotes: PlayerVote[],
  timeSlots: TimeSlot[],
  availabilityMap: Map<string, string[]>,
  dayAvailabilityMap: Map<string, Set<string>>,
  dayAnalysis: DayAnalysis[],
  playerExclusivity: PlayerExclusivity[],
  weekStartDate: string,
  pollId: string,
  supabase: any
): Promise<WeeklySchedule> {
  
  console.log('Strategy: Spread matches across as many days as possible');
  
  const scheduleMatches: MatchOption[] = [];
  const scheduledPlayers = new Set<string>();
  let matchNumber = 1;
  let ringersNeeded = 0;

  // Process days with exclusive players FIRST
  const daysWithExclusives = new Set(
    playerExclusivity
      .filter(pe => pe.exclusiveToDay)
      .map(pe => pe.exclusiveToDay!)
  );

  console.log(`🎯 Days with exclusive players: ${Array.from(daysWithExclusives).join(', ')}`);

  // Sort days: exclusives first, then by player count
  const sortedDays = dayAnalysis.sort((a, b) => {
    const aHasExclusive = daysWithExclusives.has(a.day) ? 1 : 0;
    const bHasExclusive = daysWithExclusives.has(b.day) ? 1 : 0;
    if (aHasExclusive !== bHasExclusive) return bHasExclusive - aHasExclusive;
    return b.playerCount - a.playerCount;
  });

  // Create one match per day (or ringer match if needed)
  for (const dayInfo of sortedDays) {
    // Get best slot for this day
    const daySlots = Array.from(availabilityMap.entries())
      .map(([slotId, playerIds]) => {
        const slot = timeSlots.find(s => s.id === slotId);
        return slot && slot.day === dayInfo.day ? { slot, slotId, playerIds } : null;
      })
      .filter((item): item is { slot: TimeSlot; slotId: string; playerIds: string[] } => item !== null)
      .sort((a, b) => b.playerIds.length - a.playerIds.length);

    if (daySlots.length === 0) continue;

    const bestSlot = daySlots[0];
    
    // Get available players for this day
    let availablePlayers = bestSlot.playerIds
      .filter(id => !scheduledPlayers.has(id))
      .map(id => playerVotes.find(v => v.userId === id))
      .filter((p): p is PlayerVote => p !== undefined);
      availablePlayers = availablePlayers.filter(p => !scheduledPlayers.has(p.userId));

    // Prioritize exclusive players
    const exclusivePlayers = availablePlayers.filter(p => {
      const exclusivity = playerExclusivity.find(pe => pe.userId === p.userId);
      return exclusivity?.exclusiveToDay === dayInfo.day;
    });

    console.log(`   ${dayInfo.day}: ${availablePlayers.length} available (${exclusivePlayers.length} exclusive)`);

    if (availablePlayers.length >= 2) {
      // Build match: exclusives first, then others
      const matchPlayers = [
        ...exclusivePlayers,
        ...availablePlayers.filter(p => !exclusivePlayers.includes(p))
      ].slice(0, 4);

      const match = await createBestMatch(
        matchPlayers,
        bestSlot.slot,
        weekStartDate,
        pollId,
        supabase
      );

      if (match) {
        const needsRingers = 4 - matchPlayers.length;
        scheduleMatches.push({
          ...match,
          optionNumber: matchNumber++,
          priority: needsRingers === 0 ? 100 : 75,
        });

        matchPlayers.forEach(p => scheduledPlayers.add(p.userId));
        
        if (needsRingers > 0) {
          ringersNeeded += needsRingers;
          console.log(`   ✅ ${dayInfo.day} match: ${matchPlayers.map(p => p.userName).join(', ')} + ${needsRingers} ringers`);
        } else {
          console.log(`   ✅ ${dayInfo.day} match: ${matchPlayers.map(p => p.userName).join(', ')}`);
        }
      }
    }
  }

  // Check if we can add a second match on popular days
  const popularDay = dayAnalysis.sort((a, b) => b.playerCount - a.playerCount)[0];
  if (popularDay.maxFullMatches >= 2) {
    const daySlots = Array.from(availabilityMap.entries())
      .map(([slotId, playerIds]) => {
        const slot = timeSlots.find(s => s.id === slotId);
        return slot && slot.day === popularDay.day ? { slot, slotId, playerIds } : null;
      })
      .filter((item): item is { slot: TimeSlot; slotId: string; playerIds: string[] } => item !== null)
      .sort((a, b) => b.playerIds.length - a.playerIds.length);

    if (daySlots.length > 0) {
      const slot = daySlots[0];
      let availablePlayers = slot.playerIds
        .filter(id => !scheduledPlayers.has(id))
        .map(id => playerVotes.find(v => v.userId === id))
        .filter((p): p is PlayerVote => p !== undefined);

      if (availablePlayers.length >= 4) {
        const matchPlayers = availablePlayers.slice(0, 4);
        const match = await createBestMatch(matchPlayers, slot.slot, weekStartDate, pollId, supabase);
        
        if (match) {
          scheduleMatches.push({
            ...match,
            optionNumber: matchNumber++,
            priority: 95,
          });
          matchPlayers.forEach(p => scheduledPlayers.add(p.userId));
          console.log(`   ✅ ${popularDay.day} 2nd match: ${matchPlayers.map(p => p.userName).join(', ')}`);
        }
      }
    }
  }

  const uniquePlayers = new Set<string>();
  scheduleMatches.forEach(m => m.playerIds.forEach(id => uniquePlayers.add(id)));

  const daysUsed = new Set(scheduleMatches.map(m => m.dayOfWeek)).size;

  return {
    scheduleNumber: 3,
    strategyName: 'Maximum Day Spread',
    strategyDescription: 'Distribute matches across as many days as possible for flexible scheduling',
    isRecommended: false,
    quality: 'good',
    matches: scheduleMatches,
    alternativeMatches: [],
    totalPlayers: uniquePlayers.size,
    totalMatches: scheduleMatches.length,
    playersScheduled: Array.from(uniquePlayers),
    averageMatchQuality: 80,
    conflictCount: 0,
    ringersNeeded,
    daysUsed,
  };
}

// ============= HELPER FUNCTIONS =============

function analyzePlayerExclusivity(
  playerVotes: PlayerVote[],
  timeSlots: TimeSlot[],
  availabilityMap: Map<string, string[]>
): PlayerExclusivity[] {
  return playerVotes.map(player => {
    // Find all days this player is available
    const availableDays = new Set<string>();
    
    for (const [slotId, playerIds] of availabilityMap.entries()) {
      if (playerIds.includes(player.userId)) {
        const slot = timeSlots.find(s => s.id === slotId);
        if (slot) availableDays.add(slot.day);
      }
    }

    const dayArray = Array.from(availableDays);
    
    return {
      userId: player.userId,
      exclusiveToDay: dayArray.length === 1 ? dayArray[0] : undefined,
      availableDays: dayArray,
      dayCount: dayArray.length,
    };
  });
}

function analyzeDayCapacity(
  dayAvailabilityMap: Map<string, Set<string>>,
  timeSlots: TimeSlot[],
  availabilityMap: Map<string, string[]>
): DayAnalysis[] {
  const dayAnalyses: DayAnalysis[] = [];
  
  for (const [day, playerSet] of dayAvailabilityMap.entries()) {
    const playerCount = playerSet.size;
    const maxFullMatches = Math.floor(playerCount / 4);
    const canHaveRingerMatch = (playerCount % 4) >= 2;
    
    // Find most popular slot for this day
    const daySlots = Array.from(availabilityMap.entries())
      .map(([slotId, playerIds]) => {
        const slot = timeSlots.find(s => s.id === slotId);
        return slot && slot.day === day ? { slot, slotId, playerIds } : null;
      })
      .filter((item): item is { slot: TimeSlot; slotId: string; playerIds: string[] } => item !== null)
      .sort((a, b) => b.playerIds.length - a.playerIds.length);

    if (daySlots.length > 0) {
      const bestSlot = daySlots[0];
      dayAnalyses.push({
        day,
        slotId: bestSlot.slotId,
        timeSlot: `${bestSlot.slot.start_time}-${bestSlot.slot.end_time}`,
        playerCount,
        playerIds: Array.from(playerSet),
        maxFullMatches,
        canHaveRingerMatch,
      });
    }
  }
  
  return dayAnalyses;
}

function createEmptySchedule(number: number, name: string): WeeklySchedule {
  return {
    scheduleNumber: number,
    strategyName: name,
    strategyDescription: 'No viable matches for this strategy',
    isRecommended: false,
    quality: 'fair',
    matches: [],
    alternativeMatches: [],
    totalPlayers: 0,
    totalMatches: 0,
    playersScheduled: [],
    averageMatchQuality: 0,
    conflictCount: 0,
    ringersNeeded: 0,
    daysUsed: 0,
  };
}

async function createBestMatch(
  players: PlayerVote[],
  slot: TimeSlot,
  weekStartDate: string,
  pollId: string,
  supabase: any
): Promise<MatchOption | null> {
  if (players.length === 0) return null;

  const playerIds = players.map(p => p.userId);
  const playerNames = players.map(p => p.userName);
  
  // Calculate match date
  const weekStart = new Date(weekStartDate);
  const dayIndex = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].indexOf(slot.day);
  const matchDate = new Date(weekStart);
  matchDate.setDate(weekStart.getDate() + dayIndex);

  // Calculate skill level
  const skillLevels = players.map(p => p.preferredSkillLevel);
  const avgSkillLevel = skillLevels[0] || 'intermediate';

  // Check for household conflicts
  const conflicts: any[] = [];
  if (playerIds.length > 1) {
    const { data: householdConflicts } = await supabase.rpc(
      'get_household_conflicts',
      {
        _user_ids: playerIds,
        _match_date: matchDate.toISOString().split('T')[0],
        _match_time: slot.start_time,
      }
    );

    if (householdConflicts && householdConflicts.length > 0) {
      conflicts.push(...householdConflicts);
    }
  }

  const playersNeeded = Math.max(0, 4 - players.length);
  const status = playersNeeded > 0 ? 'need_ringer' : (conflicts.length > 0 ? 'conflict_warning' : 'ready');

  return {
    optionNumber: 0,
    dayOfWeek: slot.day,
    date: matchDate.toISOString().split('T')[0],
    timeSlot: `${slot.start_time}-${slot.end_time}`,
    playerIds,
    playerNames,
    skillLevel: avgSkillLevel,
    playersNeeded,
    status,
    conflicts,
    priority: 100,
    quality: 'good',
  };
}

function parseTime(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}
