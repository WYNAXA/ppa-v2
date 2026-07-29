// Import padel venues from Google Places (New) into padel_venues.
//
// Usage (Node 20.6+):
//   node --env-file=scripts/import-google-places/.env \
//        scripts/import-google-places/import.mjs [options]
//
// Options:
//   --dry-run           Print what would be imported; write nothing.
//   --limit N           Stop after N new venues inserted (safety cap).
//   --query "padel"     Search text (default "padel").
//   --radius 25000      Location-bias radius in metres (default 25000).
//   --no-photos         Skip fetching/uploading hero photos.
//   --cities path.json  City list (default scripts/import-google-places/cities.json).
//   --city "Barcelona" --lat 41.39 --lng 2.16   Import a single ad-hoc city.
//   --verbose           Log every venue.
//
// Required env (put in scripts/import-google-places/.env — DO NOT COMMIT):
//   GOOGLE_PLACES_API_KEY=...        (Places API New enabled on the key)
//   SUPABASE_URL=https://<ref>.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY=...    (service role — bypasses RLS + storage)
//
// The import is insert-only and idempotent: existing venues (matched on
// external_ref = "google_places:<place_id>") are skipped, so owner edits and
// re-runs are safe.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

// ── CLI args ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
function flag(name) { return argv.includes(`--${name}`); }
function opt(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}

const DRY_RUN = flag('dry-run');
const VERBOSE = flag('verbose');
const WITH_PHOTOS = !flag('no-photos');
const QUERY = opt('query', 'padel');
const RADIUS = Number(opt('radius', '25000'));
const LIMIT = opt('limit', null) ? Number(opt('limit', null)) : Infinity;

// ── Env ─────────────────────────────────────────────────────────────────────
const GOOGLE_KEY = process.env.GOOGLE_PLACES_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!GOOGLE_KEY) fail('Missing GOOGLE_PLACES_API_KEY');
if (!DRY_RUN && (!SUPABASE_URL || !SERVICE_KEY)) {
  fail('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (needed unless --dry-run)');
}

const supabase = DRY_RUN
  ? null
  : createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// ── Reference data ──────────────────────────────────────────────────────────
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const CURRENCY_BY_COUNTRY = {
  GB: 'GBP',
  IE: 'EUR', ES: 'EUR', IT: 'EUR', FR: 'EUR', DE: 'EUR', PT: 'EUR', NL: 'EUR',
  BE: 'EUR', AT: 'EUR', GR: 'EUR', FI: 'EUR', HR: 'EUR', SI: 'EUR', SK: 'EUR',
  US: 'USD', CA: 'CAD', AU: 'AUD', NZ: 'NZD', SE: 'SEK', NO: 'NOK', DK: 'DKK',
  CH: 'CHF', PL: 'PLN', CZ: 'CZK', HU: 'HUF', RO: 'RON', BR: 'BRL', MX: 'MXN',
  AR: 'ARS', CL: 'CLP', CO: 'COP', PE: 'PEN', AE: 'AED', SA: 'SAR', QA: 'QAR',
  IN: 'INR', JP: 'JPY', CN: 'CNY', TH: 'THB', MY: 'MYR', SG: 'SGD', ZA: 'ZAR',
  KE: 'KES', NG: 'NGN', IL: 'ILS', MA: 'MAD', TR: 'TRY',
};

const PRICE_LEVEL = {
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

// ── Google Places (New) Text Search ─────────────────────────────────────────
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.rating',
  'places.userRatingCount',
  'places.internationalPhoneNumber',
  'places.websiteUri',
  'places.regularOpeningHours',
  'places.addressComponents',
  'places.photos',
  'places.priceLevel',
  'nextPageToken',
].join(',');

async function searchCity(city) {
  const results = [];
  let pageToken = null;
  let page = 0;
  do {
    const body = {
      textQuery: `${QUERY} ${city.name}`,
      languageCode: 'en',
      pageSize: 20,
      locationBias: {
        circle: {
          center: { latitude: city.lat, longitude: city.lng },
          radius: RADIUS,
        },
      },
    };
    if (pageToken) body.pageToken = pageToken;

    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_KEY,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Places searchText ${res.status}: ${text.slice(0, 300)}`);
    }
    const json = await res.json();
    results.push(...(json.places ?? []));
    pageToken = json.nextPageToken ?? null;
    page += 1;
    if (pageToken) await sleep(2000); // page tokens need a moment to become valid
  } while (pageToken && page < 3); // Text Search caps at ~60 results (3 pages)

  if (pageToken) {
    console.warn(`   ⚠ ${city.name}: more than 60 results — only the first 60 were imported.`);
  }
  return results;
}

// ── Mapping ─────────────────────────────────────────────────────────────────
function comp(components, type) {
  const c = (components ?? []).find((x) => (x.types ?? []).includes(type));
  return c ? { long: c.longText, short: c.shortText } : null;
}

function pad2(n) { return String(n).padStart(2, '0'); }

function mapOpeningHours(oh) {
  if (!oh || !Array.isArray(oh.periods) || oh.periods.length === 0) return null;
  // Google: period.open/close = { day (0=Sun), hour, minute }. A 24h venue may
  // have a single open period with no close.
  const map = {};
  for (const p of oh.periods) {
    if (!p.open) continue;
    const key = DAYS[p.open.day];
    if (!key) continue;
    const open = `${pad2(p.open.hour ?? 0)}:${pad2(p.open.minute ?? 0)}`;
    const close = p.close
      ? `${pad2(p.close.hour ?? 23)}:${pad2(p.close.minute ?? 59)}`
      : '23:59';
    // Widen if the day already has an entry (multiple periods per day).
    if (!map[key]) map[key] = { open, close };
    else {
      if (open < map[key].open) map[key].open = open;
      if (close > map[key].close) map[key].close = close;
    }
  }
  return Object.keys(map).length ? map : null;
}

function mapPlace(place) {
  const ac = place.addressComponents;
  const country = comp(ac, 'country');
  const cityComp =
    comp(ac, 'locality') || comp(ac, 'postal_town') || comp(ac, 'administrative_area_level_2');
  const postcode = comp(ac, 'postal_code');
  const cc = country?.short ?? null;

  return {
    external_ref: `google_places:${place.id}`,
    venue_name: place.displayName?.text ?? 'Unnamed venue',
    country: country?.long ?? 'Unknown',
    country_code: cc ?? 'XX',
    city: cityComp?.long ?? '',
    postcode: postcode?.long ?? null,
    full_address: place.formattedAddress ?? '',
    latitude: place.location?.latitude ?? null,
    longitude: place.location?.longitude ?? null,
    website: place.websiteUri ?? null,
    booking_url: place.websiteUri ?? '', // NOT NULL in schema
    phone: place.internationalPhoneNumber ?? null,
    rating: place.rating ?? null,
    review_count: place.userRatingCount ?? 0,
    total_reviews: place.userRatingCount ?? 0,
    opening_hours: mapOpeningHours(place.regularOpeningHours), // null => "waiting on venue"
    pricing_tier: PRICE_LEVEL[place.priceLevel] ?? null,
    currency: CURRENCY_BY_COUNTRY[cc] ?? 'EUR',
    // Court counts are unknown from Google — leave 0 (UI hides zero counts).
    number_of_courts: 0,
    indoor_courts: 0,
    outdoor_courts: 0,
    covered_courts: 0,
    surface_type: null,
    booking_advance_nonmember_days: 7,
    booking_advance_member_days: 14,
    status: 'active',
    verified: false,
    is_verified: false,
    ppa_bookable: false,
    photos: [],
    _photoName: place.photos?.[0]?.name ?? null, // internal, stripped before insert
  };
}

// ── Photo upload ────────────────────────────────────────────────────────────
async function uploadHeroPhoto(row) {
  if (!WITH_PHOTOS || !row._photoName || DRY_RUN) return;
  try {
    const url = `https://places.googleapis.com/v1/${row._photoName}/media?maxWidthPx=1200&key=${GOOGLE_KEY}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`photo ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const ext = contentType.includes('png') ? 'png' : 'jpg';
    const placeId = row.external_ref.split(':')[1];
    const path = `google/${placeId}.${ext}`;
    const { error } = await supabase.storage
      .from('venue-photos')
      .upload(path, buf, { contentType, upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from('venue-photos').getPublicUrl(path);
    row.photos = [data.publicUrl];
  } catch (e) {
    console.warn(`   ⚠ photo failed for ${row.venue_name}: ${e.message}`);
  }
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const cities = loadCities();
  console.log(
    `${DRY_RUN ? '[DRY RUN] ' : ''}Importing "${QUERY}" across ${cities.length} cit${cities.length === 1 ? 'y' : 'ies'} ` +
    `(radius ${RADIUS}m, photos ${WITH_PHOTOS ? 'on' : 'off'}, limit ${LIMIT === Infinity ? '∞' : LIMIT})\n`,
  );

  const totals = { found: 0, inserted: 0, skipped: 0, failed: 0 };

  for (const city of cities) {
    if (totals.inserted >= LIMIT) { console.log('Reached --limit; stopping.'); break; }
    process.stdout.write(`• ${city.name}, ${city.country ?? ''} … `);

    let places;
    try {
      places = await searchCity(city);
    } catch (e) {
      console.log(`search failed: ${e.message}`);
      totals.failed += 1;
      continue;
    }
    totals.found += places.length;

    const rows = places.map(mapPlace).filter((r) => r.latitude != null && r.longitude != null);
    const refs = rows.map((r) => r.external_ref);

    // Which already exist? (insert-only, so we skip them)
    let existing = new Set();
    if (!DRY_RUN && refs.length) {
      const { data, error } = await supabase
        .from('padel_venues')
        .select('external_ref')
        .in('external_ref', refs);
      if (error) { console.log(`db read failed: ${error.message}`); totals.failed += 1; continue; }
      existing = new Set((data ?? []).map((d) => d.external_ref));
    }

    let fresh = rows.filter((r) => !existing.has(r.external_ref));
    if (totals.inserted + fresh.length > LIMIT) fresh = fresh.slice(0, LIMIT - totals.inserted);

    for (const row of fresh) await uploadHeroPhoto(row);

    const clean = fresh.map(({ _photoName, ...rest }) => rest);

    if (DRY_RUN) {
      console.log(`${places.length} found, ${clean.length} new (dry run)`);
      if (VERBOSE) clean.forEach((r) => console.log(`    - ${r.venue_name} (${r.city}, ${r.country_code})${r.photos.length ? ' 📷' : ''}${r.opening_hours ? ' 🕑' : ''}`));
      totals.inserted += clean.length;
      totals.skipped += rows.length - fresh.length;
    } else if (clean.length) {
      const { error } = await supabase.from('padel_venues').insert(clean);
      if (error) { console.log(`insert failed: ${error.message}`); totals.failed += 1; continue; }
      console.log(`${places.length} found, ${clean.length} inserted, ${rows.length - fresh.length} already listed`);
      if (VERBOSE) clean.forEach((r) => console.log(`    + ${r.venue_name} (${r.city})`));
      totals.inserted += clean.length;
      totals.skipped += rows.length - fresh.length;
    } else {
      console.log(`${places.length} found, 0 new (${rows.length - fresh.length} already listed)`);
      totals.skipped += rows.length - fresh.length;
    }
  }

  console.log(
    `\nDone. Found ${totals.found}, ${DRY_RUN ? 'would insert' : 'inserted'} ${totals.inserted}, ` +
    `skipped ${totals.skipped} already-listed, ${totals.failed} cit${totals.failed === 1 ? 'y' : 'ies'} failed.`,
  );
  if (DRY_RUN) console.log('No data was written (--dry-run).');
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function loadCities() {
  const single = opt('city', null);
  if (single) {
    const lat = Number(opt('lat', 'NaN'));
    const lng = Number(opt('lng', 'NaN'));
    if (Number.isNaN(lat) || Number.isNaN(lng)) fail('--city requires --lat and --lng');
    return [{ name: single, country: opt('country', ''), lat, lng }];
  }
  const path = opt('cities', new URL('./cities.json', import.meta.url).pathname);
  try {
    const list = JSON.parse(readFileSync(path, 'utf8'));
    if (!Array.isArray(list) || !list.length) throw new Error('empty list');
    return list;
  } catch (e) {
    fail(`Could not read cities file "${path}": ${e.message}`);
  }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function fail(msg) { console.error(`\n✖ ${msg}\n`); process.exit(1); }

main().catch((e) => fail(e.stack || e.message));
