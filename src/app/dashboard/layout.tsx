import { ErrorBoundary } from '@/components/observability/ErrorBoundary';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ErrorBoundary fallbackLabel="Dashboard">{children}</ErrorBoundary>;
}
