import { Timestamp, type Firestore } from 'firebase-admin/firestore';

/** How many months of history the chat can see, including this one. */
const MONTHS = 6;
const RECENT_EXPENSES = 15;
/** Upper bound on expenses read for one summary. */
const MAX_EXPENSES = 2000;

export type SpendingSummaryProvider = (userId: string) => Promise<string | undefined>;

interface ExpenseRow {
  date: Date;
  vendor: string;
  amount: number;
  category: string;
  inGroup: boolean;
}

const money = (value: number) =>
  `$${value.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const monthLabel = (year: number, month: number) =>
  new Date(year, month - 1, 1).toLocaleString('en-CA', { month: 'long', year: 'numeric' });

const isoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;

function byCategory(rows: ExpenseRow[]) {
  const totals = new Map<string, number>();
  for (const row of rows) totals.set(row.category, (totals.get(row.category) ?? 0) + row.amount);
  return [...totals.entries()].sort((a, b) => b[1] - a[1]);
}

/**
 * Builds a plain-text summary of one person's own spending for the AI chat,
 * so answers such as "how much did I spend this month?" use real figures.
 * Only expenses the person added are included (their personal expenses and
 * the group expenses they entered), matching the app's dashboard.
 */
export function createFirestoreSpendingSummary(
  db: Firestore,
  now: () => Date = () => new Date(),
): SpendingSummaryProvider {
  return async (userId) => {
    const today = now();
    const start = new Date(today.getFullYear(), today.getMonth() - (MONTHS - 1), 1);
    const snapshot = await db
      .collection('expenses')
      .where('userId', '==', userId)
      .where('date', '>=', Timestamp.fromDate(start))
      .limit(MAX_EXPENSES)
      .get();

    const rows: ExpenseRow[] = [];
    for (const doc of snapshot.docs) {
      const data = doc.data();
      if (!(data.date instanceof Timestamp) || typeof data.amount !== 'number') continue;
      rows.push({
        date: data.date.toDate(),
        vendor: typeof data.vendor === 'string' && data.vendor.trim() ? data.vendor.trim() : 'Unknown',
        amount: data.amount,
        category: typeof data.category === 'string' ? data.category : 'Uncategorised',
        inGroup: Boolean(data.groupId),
      });
    }

    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    const inMonth = (y: number, m: number) =>
      rows.filter((r) => r.date.getFullYear() === y && r.date.getMonth() + 1 === m);
    const last = new Date(year, month - 2, 1);

    const lines: string[] = [`Today is ${isoDate(today)}. All amounts are CAD.`];

    lines.push(`Spending by month (last ${MONTHS} months):`);
    for (let i = MONTHS - 1; i >= 0; i--) {
      const d = new Date(year, month - 1 - i, 1);
      const monthRows = inMonth(d.getFullYear(), d.getMonth() + 1);
      const total = monthRows.reduce((sum, r) => sum + r.amount, 0);
      lines.push(
        `- ${monthLabel(d.getFullYear(), d.getMonth() + 1)}: ${money(total)} (${monthRows.length} expenses)`,
      );
    }

    for (const [label, y, m] of [
      ['This month', year, month],
      ['Last month', last.getFullYear(), last.getMonth() + 1],
    ] as const) {
      const categories = byCategory(inMonth(y, m));
      lines.push(`${label} (${monthLabel(y, m)}) by category:`);
      if (categories.length === 0) lines.push('- no expenses');
      for (const [category, total] of categories) lines.push(`- ${category}: ${money(total)}`);
    }

    const recent = [...rows].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, RECENT_EXPENSES);
    lines.push(`Most recent expenses (up to ${RECENT_EXPENSES}):`);
    if (recent.length === 0) lines.push('- none');
    for (const r of recent) {
      lines.push(
        `- ${isoDate(r.date)} ${r.vendor}: ${money(r.amount)} (${r.category})${r.inGroup ? ' [group]' : ''}`,
      );
    }

    const budgets = await db
      .collection('budgets_personal')
      .where('userId', '==', userId)
      .where('period.month', '==', month)
      .where('period.year', '==', year)
      .get();
    lines.push(`Budgets for ${monthLabel(year, month)}:`);
    if (budgets.empty) lines.push('- none set');
    const thisMonth = byCategory(inMonth(year, month));
    for (const doc of budgets.docs) {
      const budget = doc.data();
      if (typeof budget.category !== 'string' || typeof budget.monthlyLimit !== 'number') continue;
      const spent = thisMonth.find(([category]) => category === budget.category)?.[1] ?? 0;
      lines.push(`- ${budget.category}: spent ${money(spent)} of ${money(budget.monthlyLimit)}`);
    }

    if (snapshot.size >= MAX_EXPENSES) {
      lines.push(`(Only the first ${MAX_EXPENSES} expenses were read; totals may be incomplete.)`);
    }
    return lines.join('\n');
  };
}
