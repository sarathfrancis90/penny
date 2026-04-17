import { ErrorBoundary } from '@/components/observability/ErrorBoundary';

export default function IncomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ErrorBoundary fallbackLabel="Income">{children}</ErrorBoundary>;
}
