import { ErrorBoundary } from '@/components/observability/ErrorBoundary';

export default function BudgetsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ErrorBoundary fallbackLabel="Budgets">{children}</ErrorBoundary>;
}
