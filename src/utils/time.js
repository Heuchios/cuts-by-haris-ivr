function parseClockTime(value) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function getLocalDateParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });

  const parts = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") {
      parts[part.type] = part.value;
    }
  }

  const weekdayIndex = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6
  }[parts.weekday];

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: weekdayIndex
  };
}

function isBusinessOpen(business, at = new Date()) {
  const local = getLocalDateParts(at, business.timezone);
  if (!business.hours.openDays.includes(local.weekday)) {
    return false;
  }

  const current = local.hour * 60 + local.minute;
  const open = parseClockTime(business.hours.open);
  const close = parseClockTime(business.hours.close);

  return current >= open && current < close;
}

function isFutureDateTime(value, from = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() > from.getTime();
}

function isWithinBusinessHours(business, startAt, durationMinutes = 0) {
  const local = getLocalDateParts(new Date(startAt), business.timezone);
  if (!business.hours.openDays.includes(local.weekday)) {
    return false;
  }

  const start = local.hour * 60 + local.minute;
  const end = start + Number(durationMinutes || 0);
  const open = parseClockTime(business.hours.open);
  const close = parseClockTime(business.hours.close);

  return start >= open && end <= close;
}

function isBookableSlot(business, slot, service, from = new Date()) {
  const startAt = slot?.startAt || slot;
  return isFutureDateTime(startAt, from) && isWithinBusinessHours(business, startAt, service?.durationMinutes || 0);
}

function formatSlotForSpeech(slot, timeZone) {
  const date = new Date(slot.startAt);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).format(date);
}

module.exports = {
  formatSlotForSpeech,
  getLocalDateParts,
  isBookableSlot,
  isBusinessOpen,
  isFutureDateTime,
  isWithinBusinessHours,
  parseClockTime
};
