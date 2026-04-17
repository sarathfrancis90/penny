import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Data processors — Penny',
  description:
    'Third-party subprocessors Penny uses and the data they handle.',
};

interface Processor {
  name: string;
  purpose: string;
  region: string;
  dpaUrl: string;
  dataClasses: string;
}

const processors: Processor[] = [
  {
    name: 'Google Firebase',
    purpose: 'Auth, database, storage, push notifications, analytics',
    region: 'US (us-central1)',
    dpaUrl: 'https://firebase.google.com/support/privacy',
    dataClasses: 'Account, financial, device',
  },
  {
    name: 'Sentry',
    purpose: 'Crash and error reporting',
    region: 'EU (Frankfurt)',
    dpaUrl: 'https://sentry.io/legal/dpa/',
    dataClasses: 'Device, session metadata (no PII)',
  },
  {
    name: 'PostHog',
    purpose: 'Product analytics, session replay, feature flags',
    region: 'EU (Frankfurt)',
    dpaUrl: 'https://posthog.com/dpa',
    dataClasses: 'Usage events (no financial data)',
  },
  {
    name: 'Axiom',
    purpose: 'Server log aggregation',
    region: 'EU',
    dpaUrl: 'https://www.axiom.co/legal/dpa',
    dataClasses: 'API request logs (PII-redacted)',
  },
  {
    name: 'Vercel',
    purpose: 'Web hosting, serverless functions',
    region: 'Global edge, US primary',
    dpaUrl: 'https://vercel.com/legal/dpa',
    dataClasses: 'Request metadata',
  },
  {
    name: 'BetterStack',
    purpose: 'Uptime and SLA monitoring',
    region: 'EU',
    dpaUrl: 'https://betterstack.com/legal/dpa',
    dataClasses: 'Monitor state only (no user data)',
  },
  {
    name: 'Cronitor',
    purpose: 'Cron heartbeat monitoring',
    region: 'US',
    dpaUrl: 'https://cronitor.io/legal/dpa',
    dataClasses: 'Heartbeat metadata only',
  },
];

export default function DataProcessorsPage() {
  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-2">Data processors</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Penny uses the following third-party processors. Each has a signed Data
        Processing Agreement on file. See the{' '}
        <a href="/PRIVACY.md" className="underline">
          Privacy Policy
        </a>{' '}
        for the full description of how your data is handled.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2 pr-4">Processor</th>
              <th className="text-left py-2 pr-4">Purpose</th>
              <th className="text-left py-2 pr-4">Data</th>
              <th className="text-left py-2 pr-4">Region</th>
              <th className="text-left py-2">DPA</th>
            </tr>
          </thead>
          <tbody>
            {processors.map((p) => (
              <tr key={p.name} className="border-b">
                <td className="py-2 pr-4 font-medium">{p.name}</td>
                <td className="py-2 pr-4">{p.purpose}</td>
                <td className="py-2 pr-4">{p.dataClasses}</td>
                <td className="py-2 pr-4">{p.region}</td>
                <td className="py-2">
                  <a
                    href={p.dpaUrl}
                    className="underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    link
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
