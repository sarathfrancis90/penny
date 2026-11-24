import { describe, expect, it } from 'vitest';

import {
  addDays,
  calendarDateInZone,
  isExpenseDateString,
  parseCalendarDate,
  resolveLocalDate,
} from '../dates';
import { currentPeriod } from '../firestore-budgets';

describe('strict date parsing', () => {
  it('accepts real calendar dates only', () => {
    expect(parseCalendarDate('2024-02-29')).toEqual({ year: 2024, month: 2, day: 29 });
    for (const value of [
      '2025-02-29',
      '2025-02-31',
      '2025-04-31',
      '2025-00-10',
      '2025-13-01',
      '2025-06-00',
      '2025-6-1',
      '2025-06-01T00:00:00Z',
      ' 2025-06-01',
      '',
      20250601,
      null,
      undefined,
    ]) {
      expect(parseCalendarDate(value), String(value)).toBeUndefined();
    }
  });

  it('limits expense dates to 2000 through next year', () => {
    const now = new Date('2026-11-22T12:00:00Z');
    expect(isExpenseDateString('2000-01-01', now)).toBe(true);
    expect(isExpenseDateString('2027-12-31', now)).toBe(true);
    expect(isExpenseDateString('1999-12-31', now)).toBe(false);
    expect(isExpenseDateString('2028-01-01', now)).toBe(false);
    expect(isExpenseDateString('0025-03-02', now)).toBe(false);
  });

  it('adds days across month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('the current date for Canadian users', () => {
  // 02:30 UTC on July 1st is still the evening of June 30th in Canada.
  const canadianEvening = new Date('2026-07-01T02:30:00Z');

  it('reads the calendar date in Toronto by default, not in UTC', () => {
    expect(calendarDateInZone(canadianEvening)).toBe('2026-06-30');
    expect(calendarDateInZone(canadianEvening, 'America/Vancouver')).toBe('2026-06-30');
    expect(calendarDateInZone(canadianEvening, 'UTC')).toBe('2026-07-01');
    expect(calendarDateInZone(new Date('2026-01-15T17:00:00Z'))).toBe('2026-01-15');
  });

  it('uses a plausible client date and ignores anything else', () => {
    expect(resolveLocalDate('2026-06-30', canadianEvening)).toBe('2026-06-30');
    expect(resolveLocalDate('2026-07-02', canadianEvening)).toBe('2026-07-02');
    // More than a day from the server's UTC date, impossible, or not a date.
    expect(resolveLocalDate('2026-06-29', canadianEvening)).toBe('2026-06-30');
    expect(resolveLocalDate('2026-07-03', canadianEvening)).toBe('2026-06-30');
    expect(resolveLocalDate('2026-06-31', canadianEvening)).toBe('2026-06-30');
    expect(resolveLocalDate('tomorrow', canadianEvening)).toBe('2026-06-30');
    expect(resolveLocalDate(undefined, canadianEvening)).toBe('2026-06-30');
  });

  it('keeps budgets in the Canadian month on the evening a month ends', () => {
    expect(currentPeriod(canadianEvening)).toEqual({ month: 6, year: 2026 });
    expect(currentPeriod(new Date('2027-01-01T03:00:00Z'))).toEqual({ month: 12, year: 2026 });
    expect(currentPeriod(new Date('2026-07-01T12:00:00Z'))).toEqual({ month: 7, year: 2026 });
  });
});
