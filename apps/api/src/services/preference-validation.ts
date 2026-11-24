import { isValidTimeZone } from './dates';
import { parseClock } from './notifications';

/**
 * Validation for the settings documents clients write through the API. Known
 * keys must have the right type (else 400); unknown keys are dropped rather
 * than rejected so older app versions that send extra fields keep working.
 */

type Data = Record<string, unknown>;

function badRequest(message: string) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

function isRecord(value: unknown): value is Data {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireBoolean(key: string, value: unknown): boolean {
  if (typeof value !== 'boolean') throw badRequest(`${key} must be a boolean`);
  return value;
}

function requireClock(key: string, value: unknown): string {
  if (typeof value !== 'string' || parseClock(value) === undefined) {
    throw badRequest(`${key} must be a 24-hour HH:MM time`);
  }
  return value.trim();
}

function requireTimeZone(key: string, value: unknown): string {
  if (!isValidTimeZone(value)) throw badRequest(`${key} must be an IANA time zone`);
  return value.trim();
}

function requireOneOf<T extends string>(key: string, value: unknown, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw badRequest(`${key} must be one of: ${allowed.join(', ')}`);
  }
  return value as T;
}

/** Notification types, as in src/lib/types/notifications.ts and the app. */
export const NOTIFICATION_TYPES = [
  'group_expense_added',
  'group_expense_updated',
  'group_expense_deleted',
  'group_invitation',
  'group_member_joined',
  'group_member_left',
  'group_role_changed',
  'group_settings_changed',
  'budget_warning',
  'budget_critical',
  'budget_exceeded',
  'budget_reset',
  'milestone',
  'weekly_summary',
  'monthly_summary',
  'receipts_uncategorized',
  'comment_added',
  'expense_split_request',
] as const;

const FREQUENCIES = ['realtime', 'hourly', 'daily', 'weekly', 'monthly', 'never'] as const;
const PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;

/** `userNotificationSettings/{uid}`: mute, quiet hours and their zone. */
export function sanitizeNotificationSettings(data: Data): Data {
  const result: Data = {};
  if (data.globalMute !== undefined) {
    result.globalMute = requireBoolean('globalMute', data.globalMute);
  }
  if (data.quietHoursStart !== undefined) {
    result.quietHoursStart = requireClock('quietHoursStart', data.quietHoursStart);
  }
  if (data.quietHoursEnd !== undefined) {
    result.quietHoursEnd = requireClock('quietHoursEnd', data.quietHoursEnd);
  }
  const timeZone = data.timezone ?? data.timeZone;
  if (timeZone !== undefined) {
    result.timezone = requireTimeZone('timezone', timeZone);
  }
  return result;
}

/** `users/{uid}/notificationPreferences/default`: one entry per type. */
export function sanitizeNotificationPreferences(data: Data): Data {
  const result: Data = {};
  for (const type of NOTIFICATION_TYPES) {
    const value = data[type];
    if (value === undefined) continue;
    if (!isRecord(value)) throw badRequest(`${type} must be an object`);
    const preference: Data = {};
    for (const key of ['inApp', 'push', 'email'] as const) {
      if (value[key] !== undefined) {
        preference[key] = requireBoolean(`${type}.${key}`, value[key]);
      }
    }
    if (value.frequency !== undefined) {
      preference.frequency = requireOneOf(`${type}.frequency`, value.frequency, FREQUENCIES);
    }
    if (value.priority !== undefined) {
      preference.priority = requireOneOf(`${type}.priority`, value.priority, PRIORITIES);
    }
    result[type] = preference;
  }
  return result;
}

const MAX_DEFAULT_CATEGORIES = 100;

/**
 * `users/{uid}.preferences`. The default group is not settable here: it goes
 * through `/api/user/default-group`, which checks the caller is a member.
 */
export function sanitizeUserPreferences(data: Data): Data {
  const result: Data = {};
  if (data.currency !== undefined) {
    if (typeof data.currency !== 'string' || !/^[A-Z]{3}$/.test(data.currency)) {
      throw badRequest('currency must be a three-letter ISO 4217 code');
    }
    result.currency = data.currency;
  }
  if (data.fiscalYearEnd !== undefined) {
    if (
      typeof data.fiscalYearEnd !== 'string' ||
      data.fiscalYearEnd.trim().length === 0 ||
      data.fiscalYearEnd.length > 32
    ) {
      throw badRequest('fiscalYearEnd must be a short non-empty string');
    }
    result.fiscalYearEnd = data.fiscalYearEnd.trim();
  }
  if (data.defaultCategories !== undefined) {
    const categories = data.defaultCategories;
    if (
      !Array.isArray(categories) ||
      categories.length > MAX_DEFAULT_CATEGORIES ||
      !categories.every((entry) => typeof entry === 'string' && entry.length <= 200)
    ) {
      throw badRequest('defaultCategories must be a list of category names');
    }
    result.defaultCategories = categories;
  }
  const timeZone = data.timezone ?? data.timeZone;
  if (timeZone !== undefined) {
    result.timezone = requireTimeZone('timezone', timeZone);
  }
  return result;
}
