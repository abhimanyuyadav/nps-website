export function formatPublicDate(value?: string) {
  if (!value) return "Date to be confirmed";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date to be confirmed";
  return new Intl.DateTimeFormat("en-NP", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kathmandu",
  }).format(date);
}

export function formatEventDateTimeRange(startsAt?: string, endsAt?: string, requestedTimeZone?: string) {
  if (!startsAt) return "Schedule to be confirmed";
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return "Schedule to be confirmed";
  const end = endsAt ? new Date(endsAt) : null;
  const validEnd = end && !Number.isNaN(end.getTime()) ? end : null;
  const timeZone = validTimeZone(requestedTimeZone);
  const timeZoneLabel = timeZone === "Asia/Kathmandu" ? "Nepal time" : timeZone;
  const dateFormatter = new Intl.DateTimeFormat("en-NP", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone,
  });
  const timeFormatter = new Intl.DateTimeFormat("en-NP", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
  });
  const dayKey = (date: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone,
    }).format(date);

  if (!validEnd) return `${dateFormatter.format(start)}, ${timeFormatter.format(start)} (${timeZoneLabel})`;
  if (dayKey(start) === dayKey(validEnd)) {
    return `${dateFormatter.format(start)}, ${timeFormatter.format(start)} to ${timeFormatter.format(validEnd)} (${timeZoneLabel})`;
  }
  return `${dateFormatter.format(start)}, ${timeFormatter.format(start)} to ${dateFormatter.format(validEnd)}, ${timeFormatter.format(validEnd)} (${timeZoneLabel})`;
}

export function validTimeZone(value?: string, fallback = "Asia/Kathmandu") {
  if (!value) return fallback;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return value;
  } catch {
    return fallback;
  }
}
