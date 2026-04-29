/**
 * Shared utility functions for handling time slots and flexible times
 */

/**
 * Convert time string (HH:MM) to minutes since midnight
 */
export const timeToMinutes = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

/**
 * Check if a poll response matches a specific time slot
 * Handles both direct slot selection and flexible times with overlap detection
 */
export const isUserAvailableForSlot = (
  response: {
    selected_slots?: string[];
    flexible_times?: Record<string, { available: boolean; slots: string[] }>;
  },
  slot: {
    id: string;
    day: string;
    start_time: string;
    end_time: string;
  }
): boolean => {
  // Check direct slot selection
  const selectedSlots = Array.isArray(response.selected_slots) ? response.selected_slots : [];
  if (selectedSlots.includes(slot.id)) {
    return true;
  }

  // Check flexible times with overlap detection
  const flexibleTimes = response.flexible_times || {};
  const dayData = flexibleTimes[slot.day];
  
  if (dayData && dayData.available && Array.isArray(dayData.slots)) {
    const slotStartMinutes = timeToMinutes(slot.start_time);
    const slotEndMinutes = timeToMinutes(slot.end_time);
    
    // Check if any flexible time slot overlaps with this poll slot
    return dayData.slots.some((flexTime: string) => {
      const flexStartMinutes = timeToMinutes(flexTime);
      const flexEndMinutes = flexStartMinutes + 90; // Each flexible slot is 90 minutes
      
      // Slots overlap if one starts before the other ends
      return flexStartMinutes < slotEndMinutes && flexEndMinutes > slotStartMinutes;
    });
  }

  return false;
};
