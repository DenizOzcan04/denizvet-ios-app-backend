export function getAppointmentDateTime(item) {
  if (!item?.date || !item?.time) return null;
  const parsed = new Date(`${item.date}T${item.time}:00+03:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatAppointmentDate(date) {
  if (!date) return "Belirtilmemiş";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function formatAppointmentDateTime(value) {
  if (!value) return "Belirtilmemiş";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Belirtilmemiş";

  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

export function sortAppointmentsByDateTime(items, direction = "asc") {
  const multiplier = direction === "desc" ? -1 : 1;

  return [...items].sort((a, b) => {
    const left = getAppointmentDateTime(a)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const right = getAppointmentDateTime(b)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return (left - right) * multiplier;
  });
}

export function formatDateGroupTitle(dateInput) {
  const date =
    dateInput instanceof Date
      ? new Date(dateInput.getTime())
      : new Date(`${String(dateInput)}T12:00:00+03:00`);

  if (Number.isNaN(date.getTime())) return "Belirtilmemiş";

  const normalized = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((normalized.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));

  if (diffDays === 0) return "Bugün";
  if (diffDays === 1) return "Yarın";
  if (diffDays === -1) return "Dün";

  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    weekday: "long",
  }).format(date);
}

export function groupAppointmentsByDate(items) {
  return items.reduce((groups, item) => {
    const key = item?.date || "unknown";
    const date = getAppointmentDateTime(item);

    if (!groups[key]) {
      groups[key] = {
        key,
        date,
        title: key === "unknown" ? "Belirtilmemiş" : formatDateGroupTitle(key),
        items: [],
      };
    }

    groups[key].items.push(item);
    return groups;
  }, {});
}
