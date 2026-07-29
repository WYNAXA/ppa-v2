# Google Places → padel_venues import

Seeds the shared `padel_venues` table (the listing players browse in PPA and
owners claim in the Hub) with real padel venues from Google Places, including a
hero photo. Built for the business-development push so "Padel Courts Near You"
and the venue pages look populated in the cities you visit.

## What it does

For each city in `cities.json` it runs a Google **Places (New) Text Search** for
`padel` biased to that city, then for each result:

- maps name, address, city, postcode, country + country code, lat/long, phone,
  website, rating, review count, price level and **opening hours** onto
  `padel_venues`;
- downloads the first Google photo and uploads it to the public `venue-photos`
  storage bucket, setting it as the venue's hero image (`photos[0]`);
- inserts it with `external_ref = "google_places:<place_id>"`.

Court counts are **not** guessed (Google doesn't have them) — they're left at 0,
and the PPA UI hides zero counts. If Google has no hours, `opening_hours` is left
null so the venue page shows "waiting on the venue" rather than invented hours.

**Insert-only & idempotent.** Existing venues (matched on `external_ref`) are
skipped, so re-running is safe and never overwrites an owner's edits.

## Prerequisites

1. **Node 20.6+** (uses `--env-file` and global `fetch`).
2. A **Google Cloud** API key with **Places API (New)** enabled and billing on
   the project. Create it at <https://console.cloud.google.com/> → APIs &
   Services → enable "Places API (New)" → Credentials → API key. Restrict the key
   to the Places API.
3. The Supabase **service role** key (Project Settings → API). It bypasses RLS
   and is needed to bulk-insert and upload photos. Keep it secret.

## Setup

```bash
cp scripts/import-google-places/.env.example scripts/import-google-places/.env
# then edit .env and paste your keys
```

`.env` is gitignored — never commit it.

## Run

Always dry-run first (writes nothing, no photos fetched):

```bash
node --env-file=scripts/import-google-places/.env \
     scripts/import-google-places/import.mjs --dry-run --verbose
```

Then a small real run to sanity-check, before the full sweep:

```bash
node --env-file=scripts/import-google-places/.env \
     scripts/import-google-places/import.mjs --limit 20
```

Full run (all cities in `cities.json`):

```bash
node --env-file=scripts/import-google-places/.env \
     scripts/import-google-places/import.mjs
```

## Options

| Flag | Default | Meaning |
|------|---------|---------|
| `--dry-run` | off | Print what would be imported; write nothing. |
| `--limit N` | ∞ | Stop after N new venues inserted (safety cap). |
| `--query "padel"` | `padel` | Search text. |
| `--radius M` | `25000` | Location-bias radius in metres. |
| `--no-photos` | off | Skip fetching/uploading hero photos. |
| `--cities path.json` | `cities.json` | City list to use. |
| `--city "X" --lat .. --lng ..` | — | Import a single ad-hoc city. |
| `--verbose` | off | Log every venue. |

## Adding cities

Edit `cities.json` — each entry is `{ "name", "country", "lat", "lng" }` with the
city-centre coordinates. Or import one on the fly:

```bash
node --env-file=scripts/import-google-places/.env \
     scripts/import-google-places/import.mjs --city "Lisbon" --lat 38.7223 --lng -9.1393
```

## Cost & limits

Each search **page** and each **photo** is a billable Google request; Text Search
returns at most ~60 results (3 pages) per city, and the script logs a warning if a
city has more. The field mask is kept tight to stay on the cheaper SKUs. Start
with `--dry-run` and a small `--limit`, and check your Google Cloud billing.
