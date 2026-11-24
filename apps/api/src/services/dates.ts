/** Penny's users are Canadian; this is the zone used when the client sends none. */
export const DEFAULT_TIME_ZONE = 'America/Toronto';

/** True when `timeZone` is an IANA zone this runtime knows. */
export function isValidTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== 'string' || timeZone.trim().length === 0) return false;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone });
    return true;
  } catch {
    return false;
  }
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MIN_EXPENSE_YEAR = 2000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

/**
 * Parses a strict YYYY-MM-DD string. Impossible dates (2025-02-31, month 00
 * or 13) are rejected instead of being rolled over into the next month.
 */
export function parseCalendarDate(value: unknown): CalendarDate | undefined {
  if (typeof value !== 'string') return undefined;
  const match = DATE_PATTERN.exec(value);
  if (!match) return undefined;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const roundTrip = new Date(Date.UTC(year, month - 1, day));
  roundTrip.setUTCFullYear(year);
  if (
    roundTrip.getUTCFullYear() !== year ||
    roundTrip.getUTCMonth() !== month - 1 ||
    roundTrip.getUTCDate() !== day
  ) {
    return undefined;
  }
  return { year, month, day };
}

/** A real calendar date whose year is between 2000 and next year. */
export function parseExpenseDateString(
  value: unknown,
  now: Date = new Date(),
): CalendarDate | undefined {
  const parsed = parseCalendarDate(value);
  if (!parsed) return undefined;
  if (parsed.year < MIN_EXPENSE_YEAR || parsed.year > now.getUTCFullYear() + 1) {
    return undefined;
  }
  return parsed;
}

export function isExpenseDateString(value: unknown, now: Date = new Date()): value is string {
  return parseExpenseDateString(value, now) !== undefined;
}

export function formatCalendarDate({ year, month, day }: CalendarDate): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** The calendar date (YYYY-MM-DD) it currently is in an IANA time zone. */
export function calendarDateInZone(
  now: Date = new Date(),
  timeZone: string = DEFAULT_TIME_ZONE,
): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) =>
    Number(parts.find((entry) => entry.type === type)?.value);
  return formatCalendarDate({
    year: part('year'),
    month: part('month'),
    day: part('day'),
  });
}

/** Adds whole days to a YYYY-MM-DD string. */
export function addDays(date: string, days: number): string {
  const parsed = parseCalendarDate(date);
  if (!parsed) return date;
  const shifted = new Date(
    Date.UTC(parsed.year, parsed.month - 1, parsed.day) + days * DAY_MS,
  );
  return shifted.toISOString().slice(0, 10);
}

/**
 * The user's current calendar date. A client-supplied `localDate` is trusted
 * only when it is a real date within one day of the server's UTC date (every
 * time zone on Earth is); anything else falls back to the default zone.
 */
export function resolveLocalDate(localDate: unknown, now: Date = new Date()): string {
  const parsed = parseCalendarDate(localDate);
  if (parsed) {
    const utcToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const candidate = Date.UTC(parsed.year, parsed.month - 1, parsed.day);
    if (Math.abs(candidate - utcToday) <= DAY_MS) return formatCalendarDate(parsed);
  }
  return calendarDateInZone(now);
}
