import { Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';

import { FakeFirestore } from '../../test-support/fake-firestore';
import { createFirestoreSpendingSummary } from '../spending-summary';

const at = (y: number, m: number, d: number) => Timestamp.fromDate(new Date(y, m - 1, d, 12));

function seed() {
  const db = new FakeFirestore();
  const expense = (id: string, userId: string, date: Timestamp, amount: number, category: string, vendor: string, groupId: string | null = null) =>
    db.seed(`expenses/${id}`, { userId, date, amount, category, vendor, groupId });
  expense('e1', 'me', at(2026, 6, 3), 40, 'Groceries', 'Sobeys');
  expense('e2', 'me', at(2026, 6, 9), 12.5, 'Meals and entertainment', 'Tim Hortons');
  expense('e3', 'me', at(2026, 6, 10), 60, 'Groceries', 'Costco', 'g1');
  expense('e4', 'me', at(2026, 5, 20), 100, 'Office expenses', 'Staples');
  expense('e5', 'me', at(2025, 11, 1), 999, 'Groceries', 'Too old');
  expense('e6', 'someone-else', at(2026, 6, 5), 500, 'Groceries', 'Not mine');
  db.seed('budgets_personal/b1', {
    userId: 'me',
    category: 'Groceries',
    monthlyLimit: 150,
    period: { month: 6, year: 2026 },
  });
  return db;
}

describe('spending summary for the AI chat', () => {
  const now = () => new Date(2026, 5, 15, 9);

  it('summarises only this person’s own recent spending', async () => {
    const summary = (await createFirestoreSpendingSummary(seed() as never, now)('me'))!;

    expect(summary).toContain('Today is 2026-06-15');
    expect(summary).toContain('- June 2026: $112.50 (3 expenses)');
    expect(summary).toContain('- May 2026: $100.00 (1 expenses)');
    expect(summary).toMatch(/This month \(June 2026\) by category:\n- Groceries: \$100\.00\n- Meals and entertainment: \$12\.50/);
    expect(summary).toContain('Last month (May 2026) by category:\n- Office expenses: $100.00');
    expect(summary).toContain('- 2026-06-10 Costco: $60.00 (Groceries) [group]');
    expect(summary).toContain('- Groceries: spent $100.00 of $150.00');
    expect(summary).not.toContain('Not mine');
    expect(summary).not.toContain('Too old');
  });

  it('leaves out rejected group expenses, as the app does', async () => {
    const db = seed();
    db.seed('expenses/rejected', {
      userId: 'me',
      date: at(2026, 6, 12),
      amount: 300,
      category: 'Groceries',
      vendor: 'Rejected Shop',
      groupId: 'g1',
      groupMetadata: { approvalStatus: 'rejected' },
    });
    const summary = (await createFirestoreSpendingSummary(db as never, now)('me'))!;
    expect(summary).toContain('- June 2026: $112.50 (3 expenses)');
    expect(summary).not.toContain('Rejected Shop');
  });

  it('says so when there is nothing yet', async () => {
    const summary = (await createFirestoreSpendingSummary(new FakeFirestore() as never, now)('nobody'))!;
    expect(summary).toContain('This month (June 2026) by category:\n- no expenses');
    expect(summary).toContain('Most recent expenses (up to 15):\n- none');
    expect(summary).toContain('Budgets for June 2026:\n- none set');
  });
});
