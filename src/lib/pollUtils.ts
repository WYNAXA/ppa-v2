/**
 * Utility functions for poll availability matching.
 * Ported from V1: supabase/functions/_shared/timeUtils.ts
 */

/** Convert "HH:MM" to minutes since midnight */
export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

/**
 * Check if a poll response matches a specific time slot.
 * Handles both direct slot selection and flexible times with overlap detection.
 */
export function isUserAvailableForSlot(
  response: {
    selected_slots?: string[] | null
    flexible_times?: Record<string, { available: boolean; slots: string[] }> | null
  },
  slot: { id: string; day: string; start_time: string; end_time: string }
): boolean {
  // Direct slot selection
  const selectedSlots = Array.isArray(response.selected_slots) ? response.selected_slots : []
  if (selectedSlots.includes(slot.id)) return true

  // Flexible times with overlap detection
  const flexibleTimes = (response.flexible_times as Record<string, { available: boolean; slots: string[] }>) || {}
  const dayData = flexibleTimes[slot.day]

  if (dayData?.available && Array.isArray(dayData.slots)) {
    const slotStart = timeToMinutes(slot.start_time)
    const slotEnd = timeToMinutes(slot.end_time)

    return dayData.slots.some((flexTime: string) => {
      const flexStart = timeToMinutes(flexTime)
      const flexEnd = flexStart + 90 // each flexible slot is 90 minutes
      return flexStart < slotEnd && flexEnd > slotStart
    })
  }

  return false
}

/** Generate 30-minute interval times between startTime and endTime inclusive */
export function generateHalfHourSlots(startTime: string, endTime: string): string[] {
  const slots: string[] = []
  const [sh, sm] = startTime.split(':').map(Number)
  const [eh, em] = endTime.split(':').map(Number)
  let h = sh, m = sm
  while (h < eh || (h === eh && m <= em)) {
    slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
    m += 30
    if (m >= 60) { m = 0; h++ }
  }
  return slots
}

/** Return Morning / Afternoon / Evening label for a start time */
export function getTimePeriod(startTime: string): string {
  const hour = parseInt(startTime.split(':')[0], 10)
  if (hour < 12) return 'Morning'
  if (hour < 17) return 'Afternoon'
  return 'Evening'
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/** Return the 0-based offset of a day name from Monday */
export function dayOffset(dayName: string): number {
  return Math.max(0, DAY_NAMES.indexOf(dayName))
}

/**
 * Given a poll's week_start_date (Monday) and a slot day name,
 * return the actual calendar date as a Date object.
 */
export function getSlotDate(weekStartDate: string, dayName: string): Date {
  const base = new Date(weekStartDate + 'T12:00:00')
  base.setDate(base.getDate() + dayOffset(dayName))
  return base
}
