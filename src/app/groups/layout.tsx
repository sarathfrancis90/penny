import { ErrorBoundary } from '@/components/observability/ErrorBoundary';

export default function GroupsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ErrorBoundary fallbackLabel="Groups">{children}</ErrorBoundary>;
}
