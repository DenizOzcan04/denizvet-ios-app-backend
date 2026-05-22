export function defaultAppointmentSlots() {
  const slots = [];

  for (let hour = 9; hour <= 19; hour += 1) {
    slots.push(`${String(hour).padStart(2, "0")}:00`);
    if (hour !== 19) {
      slots.push(`${String(hour).padStart(2, "0")}:30`);
    }
  }

  return slots;
}

export function normalizeSlotDate(dateString) {
  if (!dateString || typeof dateString !== "string") {
    return null;
  }

  const normalized = new Date(`${dateString}T12:00:00.000Z`);
  if (Number.isNaN(normalized.getTime())) {
    return null;
  }

  return normalized;
}

export function uniqueSortedTimes(times = []) {
  return [...new Set(times.filter(Boolean))].sort();
}
