// Run with: npx tsx scripts/enrich-venues.ts
// or:       deno run --allow-env --allow-net scripts/enrich-venues.ts
//
// Bulk-enriches padel_venues rows with curated metadata (facilities, court
// counts, surface types, membership info, etc.) for known venue chains.

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
)

interface VenueUpdate {
  is_members_only: boolean
  membership_required: string | null
  pricing_tier: number
  facilities: string[]
  surface_type: string
  indoor_courts: number
  outdoor_courts: number
  covered_courts: number
}

// ── Enrichment data keyed by venue-name pattern (used with ilike) ────────────

const VENUE_DATA: Record<string, Partial<VenueUpdate>> = {
  '%David Lloyd%': {
    is_members_only: true,
    pricing_tier: 3,
    membership_required: 'David Lloyd membership required',
    facilities: ['parking', 'changing_rooms', 'bar', 'coaching', 'equipment_hire', 'cafe', 'showers', 'lockers', 'viewing_area'],
    surface_type: 'artificial_grass',
    indoor_courts: 3,
    outdoor_courts: 2,
  },
  '%Rocket Padel%': {
    pricing_tier: 2,
    indoor_courts: 4,
    facilities: ['parking', 'changing_rooms', 'bar', 'coaching', 'equipment_hire', 'showers'],
    surface_type: 'artificial_grass',
  },
  '%Game4Padel%': {
    pricing_tier: 2,
    indoor_courts: 6,
    facilities: ['parking', 'changing_rooms', 'pro_shop', 'coaching', 'equipment_hire', 'showers', 'lockers', 'viewing_area', 'cafe'],
    surface_type: 'artificial_grass',
  },
  '%We Are Padel%': {
    pricing_tier: 2,
    indoor_courts: 7,
    facilities: ['parking', 'changing_rooms', 'bar', 'coaching', 'equipment_hire', 'showers', 'lockers'],
    surface_type: 'artificial_grass',
  },
  '%LTA%': {
    pricing_tier: 2,
    facilities: ['parking', 'changing_rooms', 'coaching', 'showers'],
    surface_type: 'artificial_grass',
  },
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Starting venue enrichment...\n')

  let updated = 0
  let skipped = 0

  for (const [pattern, enrichment] of Object.entries(VENUE_DATA)) {
    const { data: venues, error } = await supabase
      .from('padel_venues')
      .select('venue_id, venue_name')
      .ilike('venue_name', pattern)

    if (error) {
      console.error(`  Error fetching "${pattern}":`, error.message)
      continue
    }

    if (!venues || venues.length === 0) {
      console.log(`  "${pattern}" — no matches, skipping`)
      skipped++
      continue
    }

    for (const venue of venues) {
      const { error: updateError } = await supabase
        .from('padel_venues')
        .update(enrichment)
        .eq('venue_id', venue.venue_id)

      if (updateError) {
        console.error(`  Failed to update "${venue.venue_name}":`, updateError.message)
      } else {
        console.log(`  Updated: ${venue.venue_name}`)
        updated++
      }
    }
  }

  console.log(`\nDone. Updated ${updated} venues, ${skipped} patterns had no matches.`)
}

main().catch(console.error)
