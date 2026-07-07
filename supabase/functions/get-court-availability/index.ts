import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { timeToMinutes } from '../_shared/timeUtils.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface AvailabilityRequest {
  venue_id: string;
  date: string;           // YYYY-MM-DD
  duration_minutes?: number;
}

interface Court {
  id: string;
  court_name: string | null;
  surface_type: string | null;
  is_indoor: boolean | null;
  slot_duration_default: number | null;
}

interface TimeRange {
  court_id: string | null;
  start_at: string;
  end_at: string;
}

interface SlotCourt {
  id: string;
  name: string | null;
  surface: string | null;
  indoor: boolean | null;
}

interface Slot {
  start_time: string;   // HH:MM
  end_time: string;     // HH:MM
  available_courts: SlotCourt[];
}

// ── Time helpers ──────────────────────────────────────────────────────────────

/** Convert absolute minutes-since-midnight to HH:MM. */
function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Extract HH:MM from a timestamptz string.
 * NOTE: Times are extracted as UTC. This is consistent as long as all
 * timestamptz values are stored in UTC (Supabase default). Venues in
 * non-UTC timezones will need a timezone column added to padel_venues
 * and offset handling here before going to production across time zones.
 */
function tsToMinutes(ts: string): number {
  const d = new Date(ts);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** True if [aStart, aEnd) overlaps [bStart, bEnd) — values in minutes. */
function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && aEnd > bStart;
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: AvailabilityRequest = await req.json();
    const { venue_id, date, duration_minutes } = body;

    // ── Input validation ───────────────────────────────────────────────────────
    if (!venue_id || !date) {
      return new Response(
        JSON.stringify({ success: false, error: 'venue_id and date are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return new Response(
        JSON.stringify({ success: false, error: 'date must be YYYY-MM-DD' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Service-role client — bypasses RLS for this read-only function.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ── 1. Venue availability settings ────────────────────────────────────────
    const { data: settings, error: settingsError } = await supabase
      .from('court_availability_settings')
      .select('slot_duration_min, slot_interval_min, turnaround_min, open_time, close_time')
      .eq('venue_id', venue_id)
      .single();

    if (settingsError || !settings) {
      return new Response(
        JSON.stringify({ success: false, error: 'No availability settings found for this venue' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── 2. Active courts at this venue ────────────────────────────────────────
    // courts.venue_id references venues.id — the caller must pass a venue_id
    // that is consistent across padel_venues and courts for this facility.
    const { data: courts, error: courtsError } = await supabase
      .from('courts')
      .select('id, court_name, surface_type, is_indoor, slot_duration_default')
      .eq('venue_id', venue_id)
      .eq('status', 'active');

    if (courtsError) throw courtsError;

    if (!courts || courts.length === 0) {
      console.log(`No active courts found for venue ${venue_id}`);
      return new Response(
        JSON.stringify({ success: true, venue_id, date, duration_minutes: null, slots: [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── 3. Resolve slot duration ──────────────────────────────────────────────
    // Priority: explicit request → minimum court-level default → venue setting.
    const courtDefaults = (courts as Court[])
      .map((c) => c.slot_duration_default)
      .filter((d): d is number => d !== null && d > 0);

    const resolvedDuration: number =
      duration_minutes ??
      (courtDefaults.length > 0 ? Math.min(...courtDefaults) : undefined) ??
      settings.slot_duration_min;

    // ── 4. Fetch block-outs overlapping the requested date ────────────────────
    // Overlap condition: block starts before end-of-day AND ends after start-of-day.
    const dayStart = `${date}T00:00:00.000Z`;
    const dayEnd   = `${date}T23:59:59.999Z`;

    const { data: blockOuts, error: blockOutsError } = await supabase
      .from('court_block_outs')
      .select('court_id, start_at, end_at')
      .eq('venue_id', venue_id)
      .lt('start_at', dayEnd)
      .gt('end_at', dayStart);

    if (blockOutsError) throw blockOutsError;

    // ── 5. Fetch existing bookings overlapping the requested date ─────────────
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('court_id, start_at, end_at')
      .eq('venue_id', venue_id)
      .eq('reservation_state', 'active')
      .lt('start_at', dayEnd)
      .gt('end_at', dayStart);

    if (bookingsError) throw bookingsError;

    // ── 6. Index conflicts by court_id for O(1) lookups in the slot loop ─────
    // Venue-wide block-outs (court_id = null) block every court.
    const venueWideBlocks: TimeRange[] = (blockOuts ?? []).filter(
      (b: TimeRange) => b.court_id === null,
    );

    const blockOutsByCourt = new Map<string, TimeRange[]>();
    for (const b of (blockOuts ?? []) as TimeRange[]) {
      if (b.court_id) {
        const existing = blockOutsByCourt.get(b.court_id) ?? [];
        existing.push(b);
        blockOutsByCourt.set(b.court_id, existing);
      }
    }

    const bookingsByCourt = new Map<string, TimeRange[]>();
    for (const b of (bookings ?? []) as TimeRange[]) {
      if (b.court_id) {
        const existing = bookingsByCourt.get(b.court_id) ?? [];
        existing.push(b);
        bookingsByCourt.set(b.court_id, existing);
      }
    }

    // ── 7. Generate slots and check court availability ─────────────────────────
    const openMinutes   = timeToMinutes(settings.open_time);
    const closeMinutes  = timeToMinutes(settings.close_time);
    const intervalMin   = settings.slot_interval_min;
    const turnaroundMin = settings.turnaround_min;

    const slots: Slot[] = [];

    for (
      let slotStart = openMinutes;
      slotStart + resolvedDuration <= closeMinutes;
      slotStart += intervalMin
    ) {
      const slotEnd = slotStart + resolvedDuration;

      // Turnaround buffer: a booking ending at slotStart still blocks this slot
      // if the turnaround hasn't elapsed. We widen the conflict window by
      // turnaroundMin on both sides when checking existing bookings.
      const conflictStart = slotStart - turnaroundMin;
      const conflictEnd   = slotEnd   + turnaroundMin;

      const availableCourts = (courts as Court[]).filter((court) => {
        // Check venue-wide block-outs (no turnaround applied — hard blocks)
        const venueBlocked = venueWideBlocks.some((b) =>
          overlaps(slotStart, slotEnd, tsToMinutes(b.start_at), tsToMinutes(b.end_at)),
        );
        if (venueBlocked) return false;

        // Check court-specific block-outs
        const courtBlocked = (blockOutsByCourt.get(court.id) ?? []).some((b) =>
          overlaps(slotStart, slotEnd, tsToMinutes(b.start_at), tsToMinutes(b.end_at)),
        );
        if (courtBlocked) return false;

        // Check existing bookings (with turnaround buffer)
        const isBooked = (bookingsByCourt.get(court.id) ?? []).some((b) =>
          overlaps(conflictStart, conflictEnd, tsToMinutes(b.start_at), tsToMinutes(b.end_at)),
        );
        return !isBooked;
      });

      // Skip slots where no court is free
      if (availableCourts.length === 0) continue;

      slots.push({
        start_time: minutesToHHMM(slotStart),
        end_time:   minutesToHHMM(slotEnd),
        available_courts: availableCourts.map((c) => ({
          id:      c.id,
          name:    c.court_name,
          surface: c.surface_type,
          indoor:  c.is_indoor,
        })),
      });
    }

    console.log(
      `✅ get-court-availability: ${slots.length} slots | venue=${venue_id} date=${date} duration=${resolvedDuration}min`,
    );

    return new Response(
      JSON.stringify({
        success:          true,
        venue_id,
        date,
        duration_minutes: resolvedDuration,
        slots,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (error) {
    console.error('❌ get-court-availability error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
