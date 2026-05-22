export function getDefaultSlotTimes() {
  const slots = [];

  for (let hour = 9; hour <= 19; hour += 1) {
    slots.push(`${String(hour).padStart(2, "0")}:00`);

    if (hour !== 19) {
      slots.push(`${String(hour).padStart(2, "0")}:30`);
    }
  }

  return slots;
}

export function getTodayDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function slotDateTime(dateKey, time) {
  if (!dateKey || !time) return null;
  const parsed = new Date(`${dateKey}T${time}:00+03:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isPastDateKey(dateKey, currentDateKey = getTodayDateKey()) {
  return String(dateKey || "") < String(currentDateKey || "");
}

export function isPastSlotForDate(dateKey, time, nowMs = Date.now()) {
  if (dateKey !== getTodayDateKey()) {
    return false;
  }

  const slotDate = slotDateTime(dateKey, time);
  return slotDate ? slotDate.getTime() <= nowMs : false;
}

export function getVisibleSlotTimes() {
  return getDefaultSlotTimes();
}

export function getEditableSlotTimes(dateKey, nowMs = Date.now()) {
  return getDefaultSlotTimes().filter((slot) => !isPastSlotForDate(dateKey, slot, nowMs));
}
