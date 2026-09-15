// Deploy with: supabase functions deploy discover-venues-google --project-ref timbjfihsxqfrqrxwdny --no-verify-jwt
//
// Searches Google Places (Text Search) for padel venues around discovery
// targets, inserts new ones as pending_review into padel_venues.
//
// Auto-classifies on insert:
//   Bucket 1 (padel):     name matches /padel/i OR primaryType is padel-ish
//                          → pending_review, venue_type 'club', needs_review true
//   Bucket 2 (hard reject): primaryType is junk AND name !~ /padel/i
//                          → rejected, venue_type 'not_padel', no review
//   Bucket 3 (ambiguous):  everything else (tennis clubs, sports centres — some DO have padel)
//                          → pending_review, needs_review true, reason names the ambiguity
//
// The existing pipeline takes over: review queue classifies, enrichment fills details.
//
// COST: Places Text Search ≈ $32/1000 requests. One target = 1–3 pages.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const admin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
)

const GOOGLE_API_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY') ?? ''

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
}

const MAX_PAGES = 3

// ── Auth ────────────────────────────────────────────────────────────────────

async function isAuthorised(req: Request): Promise<boolean> {
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.replace('Bearer ', '')
  if (!token) return false

  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    if (payload.role === 'service_role') return true
  } catch { /* not a JWT */ }

  const { data: { user }, error } = await admin.auth.getUser(token)
  if (error || !user) return false
  const { data: adminRow } = await admin
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()
  return !!adminRow
}

// ── Auto-classification ─────────────────────────────────────────────────────

const PADEL_TYPES = new Set([
  'padel_court', 'padel_club',
])

const HARD_REJECT_TYPES = new Set([
  'parking_lot', 'parking', 'hotel', 'lodging', 'motel', 'hostel',
  'restaurant', 'cafe', 'bar', 'night_club', 'meal_takeaway',
  'store', 'shopping_mall', 'clothing_store', 'shoe_store',
  'real_estate_agency', 'car_dealer', 'car_repair', 'gas_station',
  'bank', 'atm', 'insurance_agency', 'lawyer', 'accounting',
  'dentist', 'doctor', 'hospital', 'pharmacy', 'veterinary_care',
  'church', 'mosque', 'synagogue', 'cemetery',
  'school', 'university', 'library', 'museum',
  'post_office', 'local_government_office', 'police', 'fire_station',
  'transit_station', 'bus_station', 'train_station', 'airport',
])

interface Classification {
  bucket: 1 | 2 | 3
  status: 'pending_review' | 'rejected'
  venue_type: 'club' | 'not_padel'
  needs_review: boolean
  review_reason: string
}

// ── Proximity helpers ───────────────────────────────────────────────────────

const GENERIC_TOKENS = new Set([
  'padel', 'paddle', 'tennis', 'club', 'sport', 'sports', 'centre', 'center',
  'arena', 'academy', 'indoor', 'outdoor', 'court', 'courts', 'complex',
  'city', 'town', 'park', 'the', 'and', 'group', 'zone', 'ltd', 'limited',
])

function significantTokens(name: string): string[] {
  return name.toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(w => w.length >= 3 && !GENERIC_TOKENS.has(w))
}

function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Paddle sport / canoe / kayak / SUP / rowing — not padel.
// Belt and braces: only reject if the name does NOT also contain "padel",
// because "Padel & Paddleboard" is a legitimate club name.
const NOT_PADEL_NAME = /paddle\s*(sport|board)|canoe|kayak|\bSUP\b|rowing/i

function classify(name: string, primaryType: string | null, targetName: string): Classification {
  const nameLower = name.toLowerCase()
  const isPadelName = /padel/i.test(name)
  const type = primaryType ?? ''

  // Bucket 1: clearly padel
  if (isPadelName || PADEL_TYPES.has(type)) {
    return {
      bucket: 1,
      status: 'pending_review',
      venue_type: 'club',
      needs_review: true,
      review_reason: `discovered from target: ${targetName}`,
    }
  }

  // Bucket 2a: paddle sport / canoe / kayak / rowing — not padel
  if (NOT_PADEL_NAME.test(name)) {
    return {
      bucket: 2,
      status: 'rejected',
      venue_type: 'not_padel',
      needs_review: false,
      review_reason: `auto-rejected: paddle/canoe/kayak/rowing, no padel in name`,
    }
  }

  // Bucket 2b: hard reject — junk type and name doesn't say padel
  if (HARD_REJECT_TYPES.has(type)) {
    return {
      bucket: 2,
      status: 'rejected',
      venue_type: 'not_padel',
      needs_review: false,
      review_reason: `auto-rejected: primaryType=${type}, no padel in name`,
    }
  }

  // Bucket 3: ambiguous — tennis clubs, sports centres, etc.
  return {
    bucket: 3,
    status: 'pending_review',
    venue_type: 'club',
    needs_review: true,
    review_reason: `ambiguous: primaryType=${type || 'unknown'}, name="${nameLower}"; from target: ${targetName}`,
  }
}

// ── Google Places Text Search ───────────────────────────────────────────────

interface PlaceResult {
  id: string
  displayName?: { text: string }
  location?: { latitude: number; longitude: number }
  formattedAddress?: string
  shortFormattedAddress?: string
  primaryType?: string
  businessStatus?: string
}

interface SearchResult {
  places: PlaceResult[]
  pagesFetched: number
  hitResultCap: boolean
}

async function searchPlaces(
  lat: number,
  lng: number,
  radiusM: number,
): Promise<SearchResult> {
  const url = 'https://places.googleapis.com/v1/places:searchText'
  const fieldMask = [
    'places.id',
    'places.displayName',
    'places.location',
    'places.formattedAddress',
    'places.shortFormattedAddress',
    'places.primaryType',
    'places.businessStatus',
    'nextPageToken',
  ].join(',')

  const allPlaces: PlaceResult[] = []
  let pagesFetched = 0
  let pageToken: string | undefined

  const latDelta = radiusM / 111_000
  const lngDelta = radiusM / (111_000 * Math.cos(lat * Math.PI / 180))

  for (let page = 0; page < MAX_PAGES; page++) {
    const body: Record<string, unknown> = {
      textQuery: 'padel',
      locationRestriction: {
        rectangle: {
          low: { latitude: lat - latDelta, longitude: lng - lngDelta },
          high: { latitude: lat + latDelta, longitude: lng + lngDelta },
        },
      },
    }
    if (pageToken) {
      body.pageToken = pageToken
    }

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_API_KEY,
        'X-Goog-FieldMask': fieldMask,
      },
      body: JSON.stringify(body),
    })

    if (!resp.ok) {
      const text = await resp.text()
      throw new Error(`Places API ${resp.status}: ${text}`)
    }

    const data = await resp.json()
    const places = (data.places ?? []) as PlaceResult[]
    allPlaces.push(...places)
    pagesFetched++

    pageToken = data.nextPageToken
    if (!pageToken) break
  }

  return {
    places: allPlaces,
    pagesFetched,
    hitResultCap: !!pageToken,
  }
}

// ── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })

  try {
    if (!await isAuthorised(req)) {
      return Response.json({ error: 'Not authorised' }, { status: 403, headers: cors })
    }

    if (!GOOGLE_API_KEY) {
      return Response.json({ error: 'GOOGLE_PLACES_API_KEY not set' }, { status: 500, headers: cors })
    }

    const body = await req.json()
    const dryRun: boolean = body.dry_run !== false
    const targetName: string | undefined = body.target
    const limit: number = body.limit ?? 5
    const landOnly: boolean = body.land_only !== false // default: skip sea cells

    // ── Fetch targets ────────────────────────────────────────────────────
    let query = admin
      .from('venue_discovery_targets')
      .select('*')
      .order('last_searched_at', { ascending: true, nullsFirst: true })
      .limit(limit)

    if (targetName) {
      query = query.ilike('name', `%${targetName}%`)
    }
    if (landOnly) {
      query = query.eq('is_land', true)
    }

    const { data: targets, error: tErr } = await query
    if (tErr) throw tErr
    if (!targets || targets.length === 0) {
      return Response.json({ error: 'No matching targets found' }, { status: 404, headers: cors })
    }

    // ── Process each target ──────────────────────────────────────────────
    const results: Array<{
      target: string
      places_found: number
      pages_fetched: number
      hit_result_cap: boolean
      bucket_1_padel: number
      bucket_2_rejected: number
      bucket_3_ambiguous: number
      already_known: number
      newly_inserted: number
      auto_rejected: number
      dry_run: boolean
      places?: Array<PlaceResult & { classification: Classification; known: boolean }>
    }> = []

    for (const target of targets) {
      const { places, pagesFetched, hitResultCap } = await searchPlaces(
        target.latitude, target.longitude, target.radius_m,
      )

      // Classify each place
      const classified = places.map(p => ({
        ...p,
        classification: classify(
          p.displayName?.text ?? '',
          p.primaryType ?? null,
          target.name,
        ),
        known: false,
      }))

      // ── Stage 1: external_ref match ─────────────────────────────────
      const externalRefs = classified
        .filter(p => p.id)
        .map(p => `google_places:${p.id}`)
      if (externalRefs.length > 0) {
        const { data: existing } = await admin
          .from('padel_venues')
          .select('external_ref')
          .in('external_ref', externalRefs)
        const knownRefs = new Set((existing ?? []).map(r => r.external_ref))
        for (const p of classified) {
          if (p.id && knownRefs.has(`google_places:${p.id}`)) {
            p.known = true
          }
        }
      }

      // ── Stage 2: proximity dedupe for unmatched places ────────────────
      // Fetch all non-merged venues in the target's bounding box (+0.01°
      // margin ≈ 1km) so we can check proximity without per-place queries.
      const margin = 0.01
      const { data: nearby } = await admin
        .from('padel_venues')
        .select('venue_id, venue_name, latitude, longitude')
        .eq('country_code', target.country_code)
        .is('merged_into', null)
        .gte('latitude', target.latitude - (target.radius_m / 111_000) - margin)
        .lte('latitude', target.latitude + (target.radius_m / 111_000) + margin)
        .gte('longitude', target.longitude - (target.radius_m / 55_000) - margin)
        .lte('longitude', target.longitude + (target.radius_m / 55_000) + margin)

      const nearbyVenues = (nearby ?? []).map(v => ({
        ...v,
        lat: Number(v.latitude),
        lng: Number(v.longitude),
        tokens: significantTokens(v.venue_name),
      }))

      for (const p of classified) {
        if (p.known || !p.location) continue
        const pLat = p.location.latitude
        const pLng = p.location.longitude
        const pTokens = significantTokens(p.displayName?.text ?? '')

        for (const v of nearbyVenues) {
          const metres = haversineMetres(pLat, pLng, v.lat, v.lng)
          if (metres > 75) continue

          // Within 75m — check for shared name token
          const shared = pTokens.find(t => v.tokens.includes(t))
          if (shared) {
            // Same place, different external_ref (or null). Mark known.
            p.known = true
            p.classification.review_reason =
              `proximity-matched to existing "${v.venue_name}" (${metres.toFixed(0)}m, token="${shared}")`
          } else {
            // Within 75m but names differ — flag for human review
            p.classification.review_reason =
              `within ${metres.toFixed(0)}m of existing "${v.venue_name}" — names differ, needs human check`
          }
          break // first match is enough
        }
      }

      const bucket1 = classified.filter(c => c.classification.bucket === 1).length
      const bucket2 = classified.filter(c => c.classification.bucket === 2).length
      const bucket3 = classified.filter(c => c.classification.bucket === 3).length
      const alreadyKnown = classified.filter(c => c.known).length
      const autoRejected = classified.filter(c => c.classification.bucket === 2 && !c.known).length

      // Stamp the target
      await admin
        .from('venue_discovery_targets')
        .update({
          last_searched_at: new Date().toISOString(),
          last_found_count: places.length,
          last_pages_fetched: pagesFetched,
          last_hit_result_cap: hitResultCap,
        })
        .eq('id', target.id)

      if (dryRun) {
        results.push({
          target: target.name,
          places_found: places.length,
          pages_fetched: pagesFetched,
          hit_result_cap: hitResultCap,
          bucket_1_padel: bucket1,
          bucket_2_rejected: bucket2,
          bucket_3_ambiguous: bucket3,
          already_known: alreadyKnown,
          newly_inserted: 0,
          auto_rejected: autoRejected,
          dry_run: true,
          places: classified,
        })
        continue
      }

      // ── Real run: insert with classification ───────────────────────────
      let inserted = 0

      for (const place of classified) {
        if (!place.id || place.known) continue

        const c = place.classification
        const externalRef = `google_places:${place.id}`
        const venueName = place.displayName?.text ?? 'Unknown venue'
        const placeLat = place.location?.latitude ?? null
        const placeLng = place.location?.longitude ?? null

        const { error: insErr } = await admin
          .from('padel_venues')
          .insert({
            venue_name: venueName,
            external_ref: externalRef,
            status: c.status,
            needs_review: c.needs_review,
            venue_type: c.venue_type,
            review_reason: c.review_reason,
            google_primary_type: place.primaryType ?? null,
            full_address: place.formattedAddress ?? '',
            latitude: placeLat,
            longitude: placeLng,
            country_code: target.country_code,
            country: target.country_code === 'GB' ? 'United Kingdom' : target.country_code,
            city: place.shortFormattedAddress?.split(',').pop()?.trim() ?? '',
            number_of_courts: 0,
            booking_advance_nonmember_days: 0,
            booking_advance_member_days: 0,
            verified: false,
          })

        if (insErr) {
          if ((insErr as { code?: string }).code === '23505') {
            // Race: became known between check and insert — fine
          } else {
            console.error(`Insert error for ${externalRef}:`, insErr)
          }
        } else {
          inserted++
        }
      }

      results.push({
        target: target.name,
        places_found: places.length,
        pages_fetched: pagesFetched,
        hit_result_cap: hitResultCap,
        bucket_1_padel: bucket1,
        bucket_2_rejected: bucket2,
        bucket_3_ambiguous: bucket3,
        already_known: alreadyKnown,
        newly_inserted: inserted,
        auto_rejected: autoRejected,
        dry_run: false,
      })
    }

    const totalInserted = results.reduce((s, r) => s + r.newly_inserted, 0)
    const totalFound = results.reduce((s, r) => s + r.places_found, 0)

    return Response.json(
      {
        targets_processed: results.length,
        total_places_found: totalFound,
        total_inserted: totalInserted,
        dry_run: dryRun,
        results,
      },
      { headers: cors },
    )
  } catch (err) {
    console.error('discover-venues-google error:', err)
    return Response.json(
      { error: err instanceof Error ? err.message : 'Discovery failed' },
      { status: 500, headers: cors },
    )
  }
})
