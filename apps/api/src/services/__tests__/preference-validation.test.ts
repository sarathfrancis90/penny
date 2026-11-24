import { describe, expect, it } from 'vitest';

import {
  sanitizeNotificationPreferences,
  sanitizeNotificationSettings,
  sanitizeUserPreferences,
} from '../preference-validation';

describe('notification settings', () => {
  it('keeps what the mobile and web apps send', () => {
    expect(
      sanitizeNotificationSettings({
        globalMute: true,
        quietHoursStart: '22:30',
        quietHoursEnd: '07:00',
        // The app sends its own timestamp; the server sets updatedAt.
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    ).toEqual({ globalMute: true, quietHoursStart: '22:30', quietHoursEnd: '07:00' });
  });

  it('accepts a time zone, under either spelling, stored as `timezone`', () => {
    expect(sanitizeNotificationSettings({ timezone: 'America/Vancouver' })).toEqual({
      timezone: 'America/Vancouver',
    });
    expect(sanitizeNotificationSettings({ timeZone: 'America/Halifax' })).toEqual({
      timezone: 'America/Halifax',
    });
  });

  it('strips unknown and server-owned keys', () => {
    expect(
      sanitizeNotificationSettings({
        globalMute: false,
        isAdmin: true,
        createdAt: 'x',
        nested: { anything: 1 },
      }),
    ).toEqual({ globalMute: false });
  });

  it('rejects known keys with the wrong type or format', () => {
    for (const bad of [
      { globalMute: 'yes' },
      { quietHoursStart: '25:00' },
      { quietHoursEnd: 800 },
      { timezone: 'Mars/Olympus' },
    ]) {
      expect(() => sanitizeNotificationSettings(bad)).toThrow(
        expect.objectContaining({ statusCode: 400 }),
      );
    }
  });
});

describe('notification preferences', () => {
  it('keeps per-type preferences for known notification types', () => {
    expect(
      sanitizeNotificationPreferences({
        group_invitation: { inApp: true, push: false, frequency: 'realtime' },
        budget_warning: { push: true },
        weekly_summary: { inApp: false, push: false, frequency: 'weekly', email: false, priority: 'low' },
      }),
    ).toEqual({
      group_invitation: { inApp: true, push: false, frequency: 'realtime' },
      budget_warning: { push: true },
      weekly_summary: { inApp: false, push: false, frequency: 'weekly', email: false, priority: 'low' },
    });
  });

  it('strips unknown types, unknown fields and server-owned keys', () => {
    expect(
      sanitizeNotificationPreferences({
        updatedAt: 'x',
        not_a_type: { push: true },
        group_member_left: { push: true, sneaky: 'value' },
      }),
    ).toEqual({ group_member_left: { push: true } });
  });

  it('rejects malformed values for a known type', () => {
    for (const bad of [
      { group_invitation: 'off' },
      { group_invitation: { push: 'no' } },
      { group_invitation: { frequency: 'sometimes' } },
    ]) {
      expect(() => sanitizeNotificationPreferences(bad)).toThrow(
        expect.objectContaining({ statusCode: 400 }),
      );
    }
  });
});

describe('user preferences', () => {
  it('keeps what the apps send', () => {
    expect(
      sanitizeUserPreferences({
        currency: 'USD',
        fiscalYearEnd: 'March',
        defaultCategories: ['Office expenses'],
        timezone: 'America/Toronto',
      }),
    ).toEqual({
      currency: 'USD',
      fiscalYearEnd: 'March',
      defaultCategories: ['Office expenses'],
      timezone: 'America/Toronto',
    });
  });

  it('strips unknown keys and the default group, which has its own checked endpoint', () => {
    expect(
      sanitizeUserPreferences({ currency: 'CAD', defaultGroupId: 'someone-elses', role: 'admin' }),
    ).toEqual({ currency: 'CAD' });
  });

  it('rejects malformed known values', () => {
    for (const bad of [
      { currency: 'dollars' },
      { fiscalYearEnd: 12 },
      { defaultCategories: 'Office expenses' },
      { defaultCategories: [1] },
      { timezone: 'Nowhere' },
    ]) {
      expect(() => sanitizeUserPreferences(bad)).toThrow(
        expect.objectContaining({ statusCode: 400 }),
      );
    }
  });
});
