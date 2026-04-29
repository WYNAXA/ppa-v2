import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { isUserAvailableForSlot } from "../_shared/timeUtils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const requestSchema = z.object({
  poll_id: z.string().uuid({ message: "Invalid poll ID format" }),
  selected_configuration: z.object({
    id: z.number(),
    matches: z.array(z.object({
      players: z.array(z.string()),
      date: z.string(),
      time: z.string(),
      day: z.string(),
      score: z.number().optional(),
    })),
    suggestedRingers: z.record(z.array(z.any())).optional(),
  }).optional(),
});

interface PollResponse {
  user_id: string;
  selected_slots: string[];
  profiles: {
    id: string;
    name: string;
    playtomic_level: number;
  }[];
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Check if request is from service role (for automated processes)
    const authHeader = req.headers.get('Authorization');
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const isServiceRole = authHeader?.includes(serviceRoleKey);
    
    // If not service role, try to verify user authentication (but don't require it)
    let userId = null;
    if (!isServiceRole && authHeader) {
      try {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_ANON_KEY") ?? "",
          { global: { headers: { Authorization: authHeader } } }
        );

        // Get authenticated user
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (!userError && user) {
          userId = user.id;
        }
      } catch (error) {
        console.log("Auth verification failed, continuing without user ID:", error);
      }
    }

    // Use service role client for database operations
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      isServiceRole ? serviceRoleKey : Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      isServiceRole ? {} : { global: { headers: { Authorization: authHeader! } } }
    );

    // Validate input
    const body = await req.json();
    const validation = requestSchema.safeParse(body);

    if (!validation.success) {
      return new Response(
        JSON.stringify({ 
          error: "Invalid input", 
          details: validation.error.errors 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { poll_id, selected_configuration } = validation.data;

    console.log("Checking auto-match for poll:", poll_id, "Service role:", isServiceRole);

    // Fetch poll data first
    const { data: poll, error: pollError } = await supabase
      .from("polls")
      .select("*, groups(id, name)")
      .eq("id", poll_id)
      .single();

    if (pollError || !poll) {
      return new Response(
        JSON.stringify({ error: "Poll not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // If a configuration is provided, use it directly
    if (selected_configuration) {
      console.log("Using pre-selected configuration:", selected_configuration.id);
      
      // Create matches from the selected configuration
      const matchesToCreate = [];
      
      for (const match of selected_configuration.matches) {
        const matchDate = match.date;
        const matchTime = match.time;
        const playerIds = match.players;
        
        // Check if match already exists for this poll/date/time to prevent duplicates
        const { data: existingMatch } = await supabase
          .from("matches")
          .select("id")
          .eq("poll_id", poll_id)
          .eq("match_date", matchDate)
          .eq("match_time", matchTime)
          .maybeSingle();
        
        if (existingMatch) {
          console.log(`Match already exists for ${matchDate} ${matchTime}, skipping`);
          continue;
        }
        
        // Check for household conflicts
        const { data: conflicts } = await supabase.rpc("get_household_conflicts", {
          _user_ids: playerIds,
          _match_date: matchDate,
          _match_time: matchTime,
        });

        const conflictStatus = conflicts && conflicts.length > 0 ? "detected" : "none";
        
        const matchData = {
          poll_id: poll_id,
          group_id: poll.group_id,
          match_date: matchDate,
          match_time: matchTime,
          player_ids: playerIds,
          status: "pending", // All matches start as pending until confirmed
          conflict_status: conflictStatus,
          additional_options: {},
        };
        
        matchesToCreate.push(matchData);
      }
      
      // Insert all matches
      const { data: createdMatches, error: insertError } = await supabase
        .from("matches")
        .insert(matchesToCreate)
        .select();

      if (insertError) {
        console.error("Error creating matches:", insertError);
        return new Response(
          JSON.stringify({ error: "Failed to create matches", details: insertError }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Close the poll
      await supabase
        .from("polls")
        .update({ status: "processed" })
        .eq("id", poll_id);

      console.log(`Created ${createdMatches?.length || 0} matches from selected configuration`);

      return new Response(
        JSON.stringify({
          success: true,
          matches_created: createdMatches?.length || 0,
          matches: createdMatches,
          configuration_id: selected_configuration.id,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Continue with automatic match creation logic below...

    // Verify user is a member of the poll's group (skip for service role)
    if (!isServiceRole && userId) {
      const { data: isMember } = await supabase
        .rpc("is_group_member", { 
          _user_id: userId, 
          _group_id: poll.group_id 
        });

      if (!isMember) {
        return new Response(
          JSON.stringify({ error: "Forbidden: Not a member of this group" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Fetch all responses for this poll
    const { data: responses, error: responsesError } = await supabase
      .from("poll_responses")
      .select(`
        user_id,
        selected_slots,
        flexible_times,
        additional_responses,
        profiles(id, name, playtomic_level)
      `)
      .eq("poll_id", poll_id);

    if (responsesError) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch poll responses" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const timeSlots = poll.time_slots || [];
    const additionalOptions = poll.additional_options || [];
    const matchesCreated = [];
    const playerMatchCount = new Map<string, number>(); // Track matches per player this week

    // Fetch recent match history to avoid repetitive pairings
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    
    const { data: recentMatches } = await supabase
      .from("matches")
      .select("player_ids, match_date")
      .eq("group_id", poll.group_id)
      .eq("status", "scheduled")
      .gte("match_date", threeMonthsAgo.toISOString().split('T')[0])
      .order("match_date", { ascending: false });

    // Build pairing frequency map
    const pairingFrequency = new Map<string, Map<string, number>>();
    const pairingRecency = new Map<string, Map<string, Date>>();
    
    if (recentMatches) {
      for (const match of recentMatches) {
        const players = match.player_ids || [];
        const matchDate = new Date(match.match_date);
        
        // Record all pairings in this match
        for (let i = 0; i < players.length; i++) {
          for (let j = i + 1; j < players.length; j++) {
            const p1 = players[i];
            const p2 = players[j];
            
            // Update frequency
            if (!pairingFrequency.has(p1)) pairingFrequency.set(p1, new Map());
            if (!pairingFrequency.has(p2)) pairingFrequency.set(p2, new Map());
            
            const p1Map = pairingFrequency.get(p1)!;
            const p2Map = pairingFrequency.get(p2)!;
            
            p1Map.set(p2, (p1Map.get(p2) || 0) + 1);
            p2Map.set(p1, (p2Map.get(p1) || 0) + 1);
            
            // Update recency (keep most recent)
            if (!pairingRecency.has(p1)) pairingRecency.set(p1, new Map());
            if (!pairingRecency.has(p2)) pairingRecency.set(p2, new Map());
            
            const p1Recency = pairingRecency.get(p1)!;
            const p2Recency = pairingRecency.get(p2)!;
            
            if (!p1Recency.has(p2) || matchDate > p1Recency.get(p2)!) {
              p1Recency.set(p2, matchDate);
            }
            if (!p2Recency.has(p1) || matchDate > p2Recency.get(p1)!) {
              p2Recency.set(p1, matchDate);
            }
          }
        }
      }
    }

    // Function to score a group of 4 players based on pairing diversity
    const scorePlayerGroup = (playerIds: string[], slotId: string, slotDay: string): number => {
      let score = 0;
      const now = new Date();
      
      // Check all pairings in the group
      for (let i = 0; i < playerIds.length; i++) {
        for (let j = i + 1; j < playerIds.length; j++) {
          const p1 = playerIds[i];
          const p2 = playerIds[j];
          
          // Bonus points for never having played together (or rarely)
          const frequency = pairingFrequency.get(p1)?.get(p2) || 0;
          if (frequency === 0) {
            score += 100; // Never played together - great!
          } else if (frequency === 1) {
            score += 50; // Only played once
          } else if (frequency === 2) {
            score += 25;
          } else {
            score -= frequency * 10; // Penalty for frequent pairings
          }
          
          // Penalty for recent pairings
          const lastPlayed = pairingRecency.get(p1)?.get(p2);
          if (lastPlayed) {
            const daysSince = (now.getTime() - lastPlayed.getTime()) / (1000 * 60 * 60 * 24);
            if (daysSince < 7) {
              score -= 100; // Played together very recently
            } else if (daysSince < 14) {
              score -= 50;
            } else if (daysSince < 30) {
              score -= 25;
            }
          }
        }
      }
      
      // Bonus for players who directly selected this slot (vs flexible time)
      playerIds.forEach(playerId => {
        const response = responses?.find((r: any) => r.user_id === playerId);
        if (response?.selected_slots && Array.isArray(response.selected_slots)) {
          if (response.selected_slots.includes(slotId)) {
            score += 30; // Direct slot selection bonus
          }
        }
      });
      
      return score;
    };

    // Check each time slot for 4+ votes
    for (const slot of timeSlots) {
      const allVoters = responses.filter((r: any) => {
        return isUserAvailableForSlot(r, slot);
      });
      
      // Separate voters by whether they can do 2 matches
      let votersWithMatchInfo = allVoters.map((r: any) => {
        const additionalResponses = r.additional_responses || {};
        const canDoTwoMatches = Object.keys(additionalResponses).some(key => 
          key.toLowerCase().includes('2 matches') || 
          key.toLowerCase().includes('two matches') ||
          key.toLowerCase().includes('multiple matches')
        ) && additionalResponses[Object.keys(additionalResponses).find(key => 
          key.toLowerCase().includes('2 matches') || 
          key.toLowerCase().includes('two matches') ||
          key.toLowerCase().includes('multiple matches')
        ) as string] === true;
        
        return { ...r, canDoTwoMatches };
      });

      console.log(`Slot ${slot.day} ${slot.start_time}: ${allVoters.length} total votes`);

      // Create multiple matches for this slot if enough players
      let matchesCreatedForSlot = 0;
      
      while (true) {
        // Filter voters: include those with 0 matches, or 1 match if they can do 2
        const voters = votersWithMatchInfo.filter((r: any) => {
          const matchCount = playerMatchCount.get(r.user_id) || 0;
          return matchCount === 0 || (matchCount === 1 && r.canDoTwoMatches);
        });

        console.log(`  Attempt ${matchesCreatedForSlot + 1}: ${voters.length} eligible voters remaining`);

        // Try to create a match with 4 players
        if (voters.length >= 4) {
          // Generate combinations and score them for optimal pairing
          let bestCombination: any[] = [];
          let bestScore = -Infinity;
          
          // If we have many voters, use a greedy approach to avoid too many combinations
          if (voters.length > 8) {
            // For large groups, just score a few smart selections
            const combinations = [
              voters.slice(0, 4), // First 4
              voters.slice(voters.length - 4), // Last 4
              [voters[0], voters[2], voters[4], voters[6]], // Spread selection
            ];
            
            for (const combo of combinations) {
              const playerIds = combo.map((v: any) => v.user_id);
              const score = scorePlayerGroup(playerIds, slot.id, slot.day);
              console.log(`    Combo score: ${score} for players: ${combo.map((v: any) => {
                const profile = Array.isArray(v.profiles) ? v.profiles[0] : v.profiles;
                return profile?.name || 'Unknown';
              }).join(', ')}`);
              
              if (score > bestScore) {
                bestScore = score;
                bestCombination = combo;
              }
            }
          } else {
            // For smaller groups, check all combinations of 4
            const maxCombinations = 50; // Limit to avoid performance issues
            let combinationsChecked = 0;
            
            for (let i = 0; i < voters.length && combinationsChecked < maxCombinations; i++) {
              for (let j = i + 1; j < voters.length && combinationsChecked < maxCombinations; j++) {
                for (let k = j + 1; k < voters.length && combinationsChecked < maxCombinations; k++) {
                  for (let l = k + 1; l < voters.length && combinationsChecked < maxCombinations; l++) {
                    const combo = [voters[i], voters[j], voters[k], voters[l]];
                    const playerIds = combo.map((v: any) => v.user_id);
                    const score = scorePlayerGroup(playerIds, slot.id, slot.day);
                    
                    if (score > bestScore) {
                      bestScore = score;
                      bestCombination = combo;
                    }
                    
                    combinationsChecked++;
                  }
                }
              }
            }
            
            console.log(`    Evaluated ${combinationsChecked} combinations, best score: ${bestScore}`);
          }

          const selectedPlayers = bestCombination;
          const playerIds = selectedPlayers.map((v: any) => v.user_id);

          // Calculate match date from week_start_date + day of week
          const dayMapping: Record<string, number> = {
            "Monday": 1,
            "Tuesday": 2,
            "Wednesday": 3,
            "Thursday": 4,
            "Friday": 5,
            "Saturday": 6,
            "Sunday": 0
          };

          const weekStart = new Date(poll.week_start_date);
          const targetDay = dayMapping[slot.day];
          const currentDay = weekStart.getDay();
          const daysToAdd = (targetDay - currentDay + 7) % 7;
          const matchDate = new Date(weekStart);
          matchDate.setDate(matchDate.getDate() + daysToAdd);

          // Check for household conflicts
          const { data: conflicts } = await supabase
            .rpc("get_household_conflicts", {
              _user_ids: playerIds,
              _match_date: matchDate.toISOString().split('T')[0],
              _match_time: slot.start_time
            });

          if (conflicts && conflicts.length > 0) {
            console.log("  Household conflicts detected, skipping these players");
            // Remove conflicted players and try again
            const conflictedUserIds = new Set([
              ...conflicts.map((c: any) => c.user_id),
              ...conflicts.map((c: any) => c.conflicting_household_member)
            ]);
            votersWithMatchInfo = votersWithMatchInfo.filter((v: any) => 
              !conflictedUserIds.has(v.user_id)
            );
            continue;
          }

          // Collect additional options selected by players in this match
          const matchAdditionalOptions: Record<string, string[]> = {};
          if (Array.isArray(additionalOptions)) {
            additionalOptions.forEach((option: string) => {
              const playersWhoSelected: string[] = [];
              playerIds.forEach((playerId: string) => {
                const response = responses?.find((r: any) => r.user_id === playerId);
                if (response?.additional_responses?.[option] === true) {
                  playersWhoSelected.push(playerId);
                }
              });
              if (playersWhoSelected.length > 0) {
                matchAdditionalOptions[option] = playersWhoSelected;
              }
            });
          }

          // Check if match already exists for this poll/date/time
          const matchDateStr = matchDate.toISOString().split('T')[0];
          const { data: existingMatch } = await supabase
            .from("matches")
            .select("id")
            .eq("poll_id", poll_id)
            .eq("match_date", matchDateStr)
            .eq("match_time", slot.start_time)
            .maybeSingle();
          
          if (existingMatch) {
            console.log(`Match already exists for ${matchDateStr} ${slot.start_time}, skipping`);
            break;
          }

          // Create match
          const { data: newMatch, error: matchError } = await supabase
            .from("matches")
            .insert({
              group_id: poll.group_id,
              poll_id: poll_id,
              match_date: matchDateStr,
              match_time: slot.start_time,
              player_ids: playerIds,
              status: "scheduled",
              additional_options: matchAdditionalOptions,
            })
            .select()
            .single();

          if (matchError) {
            console.error("Failed to create match:", matchError);
            break;
          }

          console.log(`  Auto-match ${matchesCreatedForSlot + 1} created:`, newMatch.id);
          
          // Update match count for all players
          playerIds.forEach(playerId => {
            playerMatchCount.set(playerId, (playerMatchCount.get(playerId) || 0) + 1);
          });
          
          matchesCreated.push({
            match_id: newMatch.id,
            slot: `${slot.day} ${slot.start_time}`,
            players: selectedPlayers.map((p: any) => {
              const profile = Array.isArray(p.profiles) ? p.profiles[0] : p.profiles;
              return profile?.name || "Unknown";
            })
          });

          matchesCreatedForSlot++;
          
          // Remove selected players from the pool
          votersWithMatchInfo = votersWithMatchInfo.filter((v: any) => 
            !playerIds.includes(v.user_id)
          );

        } else if (voters.length === 3) {
          // Create pending match (needs ringer) for remaining 3 players
          const selectedPlayers = voters.slice(0, 3);
          const playerIds = selectedPlayers.map((v: any) => v.user_id);

          // Calculate match date
          const dayMapping: Record<string, number> = {
            "Monday": 1,
            "Tuesday": 2,
            "Wednesday": 3,
            "Thursday": 4,
            "Friday": 5,
            "Saturday": 6,
            "Sunday": 0
          };

          const weekStart = new Date(poll.week_start_date);
          const targetDay = dayMapping[slot.day];
          const currentDay = weekStart.getDay();
          const daysToAdd = (targetDay - currentDay + 7) % 7;
          const matchDate = new Date(weekStart);
          matchDate.setDate(matchDate.getDate() + daysToAdd);

          // Check for household conflicts
          const { data: conflicts } = await supabase
            .rpc("get_household_conflicts", {
              _user_ids: playerIds,
              _match_date: matchDate.toISOString().split('T')[0],
              _match_time: slot.start_time
            });

          if (conflicts && conflicts.length > 0) {
            console.log("  Household conflicts detected in pending match, skipping");
            break;
          }

          // Collect additional options selected by players in this match
          const matchAdditionalOptions: Record<string, string[]> = {};
          if (Array.isArray(additionalOptions)) {
            additionalOptions.forEach((option: string) => {
              const playersWhoSelected: string[] = [];
              playerIds.forEach((playerId: string) => {
                const response = responses?.find((r: any) => r.user_id === playerId);
                if (response?.additional_responses?.[option] === true) {
                  playersWhoSelected.push(playerId);
                }
              });
              if (playersWhoSelected.length > 0) {
                matchAdditionalOptions[option] = playersWhoSelected;
              }
            });
          }

          // Create pending match
          const { data: newMatch, error: matchError } = await supabase
            .from("matches")
            .insert({
              group_id: poll.group_id,
              poll_id: poll_id,
              match_date: matchDate.toISOString().split('T')[0],
              match_time: slot.start_time,
              player_ids: playerIds,
              status: "pending",
              additional_options: matchAdditionalOptions,
            })
            .select()
            .single();

          if (matchError) {
            console.error("Failed to create pending match:", matchError);
            break;
          }

          console.log("  Pending match created:", newMatch.id);

          // Update match count for all players
          playerIds.forEach(playerId => {
            playerMatchCount.set(playerId, (playerMatchCount.get(playerId) || 0) + 1);
          });

          matchesCreated.push({
            match_id: newMatch.id,
            slot: `${slot.day} ${slot.start_time}`,
            players: selectedPlayers.map((p: any) => {
              const profile = Array.isArray(p.profiles) ? p.profiles[0] : p.profiles;
              return profile?.name || "Unknown";
            }),
            status: "pending"
          });

          break; // Stop after creating pending match
        } else {
          // Less than 3 players remaining, stop
          console.log(`  Only ${voters.length} players remaining, stopping`);
          break;
        }
      }

      console.log(`  Created ${matchesCreatedForSlot} matches for ${slot.day} ${slot.start_time}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        matches_created: matchesCreated.length,
        matches: matchesCreated
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("Error in check-poll-auto-match:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
