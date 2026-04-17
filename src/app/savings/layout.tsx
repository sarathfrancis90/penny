import { ErrorBoundary } from '@/components/observability/ErrorBoundary';

export default function SavingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ErrorBoundary fallbackLabel="Savings">{children}</ErrorBoundary>;
}
