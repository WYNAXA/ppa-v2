// Import padel venues from OpenStreetMap (Overpass API) into padel_venues.
// No API key or billing required — OSM data is open. Same table + dedup contract
// as the Google importer (external_ref), so the two can be used together.
//
// Usage (Node 20.6+):
//   node --env-file=scripts/import-google-places/.env \
//        scripts/import-google-places/import-osm.mjs [options]
//
// Options: --dry-run  --limit N  --radius 25000  --verbose
//          --cities path.json  |  --city "Barcelona" --lat 41.39 --lng 2.16 --cc ES --country Spain
//
// Env (only for a real run — dry-run needs nothing):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Notes: OSM has no photos or ratings. Court counts are left 0 and opening_hours
// null when unknown (UI hides zeros / shows "waiting on the venue"). Insert-only
// and idempotent via external_ref = "osm:<type>/<id>".

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

const DRY_RUN = flag('dry-run');
const VERBOSE = flag('verbose');
const RADIUS = Number(opt('radius', '25000'));
const LIMIT = opt('limit', null) ? Number(opt('limit', null)) : Infinity;
const OVERPASS = opt('endpoint', null);
// --sql <file> writes idempotent INSERT statements instead of hitting the DB —
// no Supabase key needed (rows can be loaded through any DB connection).
const SQL_OUT = opt('sql', null);
const NEEDS_DB = !DRY_RUN && !SQL_OUT;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (NEEDS_DB && (!SUPABASE_URL || !SERVICE_KEY)) {
  fail('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (needed unless --dry-run / --sql)');
}
const supabase = NEEDS_DB ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } }) : null;

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const OSM_DAY = { Mo: 'monday', Tu: 'tuesday', We: 'wednesday', Th: 'thursday', Fr: 'friday', Sa: 'saturday', Su: 'sunday' };
const CURRENCY_BY_COUNTRY = {
  GB: 'GBP', IE: 'EUR', ES: 'EUR', IT: 'EUR', FR: 'EUR', DE: 'EUR', PT: 'EUR', NL: 'EUR',
  BE: 'EUR', AT: 'EUR', GR: 'EUR', FI: 'EUR', HR: 'EUR', SI: 'EUR', SK: 'EUR', SE: 'SEK',
  NO: 'NOK', DK: 'DKK', CH: 'CHF', PL: 'PLN', CZ: 'CZK', US: 'USD',
};

// ── Overpass query (with mirror fallback + retries) ─────────────────────────
const ENDPOINTS = OVERPASS
  ? [OVERPASS]
  : [
      'https://overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter',
      'https://overpass.private.coffee/api/interpreter',
    ];

async function searchCity(city) {
  const q = `[out:json][timeout:50];
(
  nwr["sport"="padel"](around:${RADIUS},${city.lat},${city.lng});
);
out center tags;`;
  const body = 'data=' + encodeURIComponent(q);
  let lastErr;
  // Try each mirror; on a busy/timeout response (429/504/502) back off and retry.
  for (let round = 0; round < 2; round++) {
    for (const endpoint of ENDPOINTS) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Accept': 'application/json',
              'User-Agent': 'wynaxa-padel-import/1.0 (venue seeding; contact admin@wynaxa.com)',
            },
            body,
          });
          if (res.status === 429 || res.status === 502 || res.status === 504) {
            lastErr = new Error(`${endpoint} busy (${res.status})`);
            await sleep(4000 * (attempt + 1));
            continue;
          }
          if (!res.ok) throw new Error(`Overpass ${res.status}: ${(await res.text()).slice(0, 160)}`);
          const json = await res.json();
          return json.elements ?? [];
        } catch (e) {
          lastErr = e;
          await sleep(2000);
        }
      }
    }
  }
  throw lastErr ?? new Error('Overpass request failed');
}

// ── OSM opening_hours → { day: {open, close} } (best-effort) ─────────────────
function parseHours(oh) {
  if (!oh) return null;
  if (/24\/7/.test(oh)) {
    const all = {};
    for (const d of DAYS) all[d] = { open: '00:00', close: '23:59' };
    return all;
  }
  const map = {};
  for (const rule of oh.split(';')) {
    const m = rule.trim().match(/^([A-Za-z,\-]+)\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
    if (!m) continue;
    const [, daySpec, open, close] = m;
    for (const day of expandDays(daySpec)) map[day] = { open: pad(open), close: pad(close) };
  }
  return Object.keys(map).length ? map : null;
}
function expandDays(spec) {
  const out = [];
  for (const part of spec.split(',')) {
    const range = part.split('-');
    if (range.length === 2 && OSM_DAY[range[0]] && OSM_DAY[range[1]]) {
      const a = DAYS.indexOf(OSM_DAY[range[0]]);
      const b = DAYS.indexOf(OSM_DAY[range[1]]);
      for (let i = a; i !== (b + 1) % 7; i = (i + 1) % 7) { out.push(DAYS[i]); if (out.length > 7) break; }
    } else if (OSM_DAY[part]) {
      out.push(OSM_DAY[part]);
    }
  }
  return out;
}
function pad(hm) { const [h, m] = hm.split(':'); return `${String(+h).padStart(2, '0')}:${m}`; }

// ── Venue-name normalisation & noise filtering ──────────────────────────────
// OSM tags individual courts ("Pista 3", "Court 2") and often repeats the same
// venue per court. Collapse duplicates by normalised name and drop generic
// court names that carry no brand.
function normName(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
const GENERIC_TOKENS = new Set([
  'pista', 'pistes', 'pistas', 'cancha', 'canchas', 'court', 'courts', 'terrain',
  'terrains', 'campo', 'campi', 'campos', 'paddle', 'padel', 'de', 'del', 'la', 'el',
  'les', 'los', 'municipal', 'municipals', 'municipales', 'indoor', 'outdoor', 'n',
]);
// A name is "generic" (a bare court, not a venue) if nothing brand-like remains
// after removing generic tokens and numbers.
function isGenericCourtName(name) {
  const n = normName(name);
  // Individual courts often carry a brand/sponsor word but are still just a court,
  // e.g. "Court 2 (Nicolas Cage)", "CUPRA Center Court 1", "Show Court 1",
  // "Outdoor Spree 2", "Court P1". Treat "(center) court <n>" patterns as courts.
  if (/\b(center |centre )?court\s*[a-z]?\d+\b/.test(n)) return true;
  if (/\b(outdoor|indoor|show|centre|center)\s+(court|spree)\s*\d+\b/.test(n)) return true;
  const toks = n.split(' ').filter((t) => t && !/^\d+$/.test(t) && !GENERIC_TOKENS.has(t));
  return toks.length === 0;
}

// ── Map an OSM element to a padel_venues row ────────────────────────────────
function mapElement(el, city) {
  const t = el.tags || {};
  const lat = el.lat ?? el.center?.lat ?? null;
  const lng = el.lon ?? el.center?.lon ?? null;
  const addr = [t['addr:housenumber'], t['addr:street'], t['addr:city'] || city.name, t['addr:postcode']]
    .filter(Boolean).join(', ');
  const website = t.website || t['contact:website'] || null;
  const phone = t.phone || t['contact:phone'] || null;

  return {
    external_ref: `osm:${el.type}/${el.id}`,
    venue_name: t.name,
    country: city.country,
    country_code: city.cc,
    city: t['addr:city'] || city.name,
    postcode: t['addr:postcode'] || null,
    full_address: addr || `${city.name}, ${city.country}`,
    latitude: lat,
    longitude: lng,
    website,
    booking_url: website || '',
    phone,
    email: t.email || t['contact:email'] || null,
    opening_hours: parseHours(t.opening_hours),
    surface_type: t.surface || null,
    number_of_courts: 0,
    indoor_courts: 0,
    outdoor_courts: 0,
    covered_courts: 0,
    currency: CURRENCY_BY_COUNTRY[city.cc] || 'EUR',
    booking_advance_nonmember_days: 7,
    booking_advance_member_days: 14,
    status: 'active',
    verified: false,
    is_verified: false,
    ppa_bookable: false,
    photos: [],
  };
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const cities = loadCities();
  console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}Importing padel venues from OpenStreetMap across ${cities.length} cit${cities.length === 1 ? 'y' : 'ies'} (radius ${RADIUS}m, limit ${LIMIT === Infinity ? '∞' : LIMIT})\n`);
  const totals = { found: 0, inserted: 0, skipped: 0, failed: 0 };
  const sqlRows = [];

  for (const city of cities) {
    if (totals.inserted >= LIMIT) { console.log('Reached --limit; stopping.'); break; }
    process.stdout.write(`• ${city.name}, ${city.country} … `);

    let elements;
    try { elements = await searchCity(city); }
    catch (e) { console.log(`overpass failed: ${e.message}`); totals.failed += 1; await sleep(1500); continue; }

    const mapped = elements
      .map((el) => mapElement(el, city))
      .filter((r) => r.venue_name && r.latitude != null && r.longitude != null);
    // Drop bare court names, then de-dup by external_ref AND by normalised venue
    // name (so "Uno Pádel" tagged on 5 courts becomes one venue).
    const seenRef = new Set();
    const seenName = new Set();
    let noise = 0;
    const unique = mapped.filter((r) => {
      if (seenRef.has(r.external_ref)) return false;
      seenRef.add(r.external_ref);
      if (isGenericCourtName(r.venue_name)) { noise += 1; return false; }
      const nn = normName(r.venue_name);
      if (seenName.has(nn)) return false;
      seenName.add(nn);
      return true;
    });
    totals.found += unique.length;
    totals.noise = (totals.noise || 0) + noise;

    if (SQL_OUT) {
      sqlRows.push(...unique);
      console.log(`${unique.length} venues collected`);
      if (VERBOSE) unique.forEach((r) => console.log(`    - ${r.venue_name} (${r.city})`));
      await sleep(1200);
      continue;
    }

    const refs = unique.map((r) => r.external_ref);
    let existing = new Set();
    if (!DRY_RUN && refs.length) {
      const { data, error } = await supabase.from('padel_venues').select('external_ref').in('external_ref', refs);
      if (error) { console.log(`db read failed: ${error.message}`); totals.failed += 1; continue; }
      existing = new Set((data ?? []).map((d) => d.external_ref));
    }
    let fresh = unique.filter((r) => !existing.has(r.external_ref));
    if (totals.inserted + fresh.length > LIMIT) fresh = fresh.slice(0, LIMIT - totals.inserted);

    if (DRY_RUN) {
      console.log(`${unique.length} found, ${fresh.length} new (dry run)`);
      if (VERBOSE) fresh.forEach((r) => console.log(`    - ${r.venue_name} (${r.city})${r.opening_hours ? ' 🕑' : ''}${r.website ? ' 🌐' : ''}`));
      totals.inserted += fresh.length;
      totals.skipped += unique.length - fresh.length;
    } else if (fresh.length) {
      const { error } = await supabase.from('padel_venues').insert(fresh);
      if (error) { console.log(`insert failed: ${error.message}`); totals.failed += 1; continue; }
      console.log(`${unique.length} found, ${fresh.length} inserted, ${unique.length - fresh.length} already listed`);
      if (VERBOSE) fresh.forEach((r) => console.log(`    + ${r.venue_name} (${r.city})`));
      totals.inserted += fresh.length;
      totals.skipped += unique.length - fresh.length;
    } else {
      console.log(`${unique.length} found, 0 new`);
      totals.skipped += unique.length;
    }
    await sleep(1200); // be polite to the public Overpass endpoint
  }

  if (SQL_OUT) {
    // Final de-dup across cities (a venue can appear in two nearby city radii).
    const seen = new Set();
    const rows = sqlRows.filter((r) => (seen.has(r.external_ref) ? false : seen.add(r.external_ref)));
    writeFileSync(SQL_OUT, buildSql(rows));
    console.log(`\nWrote ${rows.length} venue rows (dropped ${totals.noise || 0} bare courts) to ${SQL_OUT}`);
    return;
  }

  console.log(`\nDone. ${totals.found} venues (after collapsing duplicates + dropping ${totals.noise || 0} bare-court entries), ${DRY_RUN ? 'would insert' : 'inserted'} ${totals.inserted}, skipped ${totals.skipped} already-listed, ${totals.failed} failed.`);
  if (DRY_RUN) console.log('No data was written (--dry-run).');
}

// ── SQL emit (idempotent, no DB key needed) ─────────────────────────────────
const SQL_COLS = [
  'external_ref', 'venue_name', 'country', 'country_code', 'city', 'postcode',
  'full_address', 'latitude', 'longitude', 'website', 'booking_url', 'phone',
  'email', 'opening_hours', 'surface_type', 'number_of_courts', 'indoor_courts',
  'outdoor_courts', 'covered_courts', 'currency', 'booking_advance_nonmember_days',
  'booking_advance_member_days', 'status', 'verified', 'is_verified',
  'ppa_bookable', 'photos',
];
const JSONB_COLS = new Set(['opening_hours', 'photos']);

function sqlVal(col, v) {
  if (v === null || v === undefined) return 'NULL';
  if (JSONB_COLS.has(col)) return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return `'${String(v).replace(/'/g, "''")}'`;
}

function buildSql(rows) {
  const header = `-- OpenStreetMap padel venues -> padel_venues. Idempotent (ON CONFLICT DO NOTHING).\n`;
  if (!rows.length) return header + '-- (no rows)\n';
  const values = rows.map((r) => `  (${SQL_COLS.map((c) => sqlVal(c, r[c])).join(', ')})`).join(',\n');
  return `${header}insert into public.padel_venues (${SQL_COLS.join(', ')})\nvalues\n${values}\non conflict (external_ref) do nothing;\n`;
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function loadCities() {
  const single = opt('city', null);
  if (single) {
    const lat = Number(opt('lat', 'NaN')); const lng = Number(opt('lng', 'NaN'));
    if (Number.isNaN(lat) || Number.isNaN(lng)) fail('--city requires --lat and --lng');
    return [{ name: single, country: opt('country', ''), cc: opt('cc', 'XX'), lat, lng }];
  }
  const path = opt('cities', new URL('./cities.json', import.meta.url).pathname);
  try {
    const list = JSON.parse(readFileSync(path, 'utf8'));
    if (!Array.isArray(list) || !list.length) throw new Error('empty list');
    return list;
  } catch (e) { fail(`Could not read cities file "${path}": ${e.message}`); }
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function fail(msg) { console.error(`\n✖ ${msg}\n`); process.exit(1); }

main().catch((e) => fail(e.stack || e.message));
