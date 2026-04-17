# Penny Privacy Policy

**Last updated:** 2026-04-17

Penny is an AI-assisted expense tracker for self-incorporated Canadian
professionals. This policy describes what personal data Penny collects, how it
is used, who processes it, and your rights under **PIPEDA** (Canada) and
**GDPR** (EU residents).

## Contact

Privacy questions: **privacy@penny.app** (update with your actual contact).

## What we collect

| Category | Examples | Purpose |
|---|---|---|
| Account | email, password (hashed by Firebase Auth), passkey credentials | Sign-in |
| Financial | expense amounts, vendor names, CRA T2125 categories, dates, receipt images | Core product — expense tracking |
| Budget | monthly limits by category, budget usage | Budget alerts, analytics |
| Income / savings | income source amounts, frequency, savings goals | Personal finance tracking |
| Group | group membership, role, shared expenses | Collaborative tracking |
| Device | app version, OS, locale, crash metadata | Crash diagnosis |
| Usage (with consent) | events like `expense_added`, page views | Product improvement |
| Logs | API request paths, durations, error types | Debugging, reliability |

**We do NOT collect or transmit** expense amounts or vendor names into our
product analytics processor (PostHog). Masking is enforced at SDK level plus
aggressive property-key strip in `src/lib/observability/analytics.ts`.

## Processors

Authoritative list at **[/privacy/data-processors](/privacy/data-processors)**.

| Processor | Purpose | Region | DPA |
|---|---|---|---|
| Google Firebase | Auth, database, storage, push, analytics | US (us-central1) | [firebase.google.com/support/privacy](https://firebase.google.com/support/privacy) |
| Sentry | Crash + error reporting | EU (Frankfurt) | [sentry.io/legal/dpa](https://sentry.io/legal/dpa/) |
| PostHog | Product analytics, session replay | EU (Frankfurt) | [posthog.com/dpa](https://posthog.com/dpa) |
| Axiom | Server log aggregation | EU | [axiom.co/legal/dpa](https://www.axiom.co/legal/dpa) |
| Vercel | Web hosting, serverless runtime | Global edge, US primary | [vercel.com/legal/dpa](https://vercel.com/legal/dpa) |
| BetterStack | Uptime monitoring | EU | [betterstack.com/legal/dpa](https://betterstack.com/legal/dpa) |
| Cronitor | Cron heartbeat monitoring | US | [cronitor.io/legal/dpa](https://cronitor.io/legal/dpa) |
| Google Play | Android app distribution | US | Google Play Developer DPA |
| App Store Connect | iOS app distribution | US | Apple DPA |

## Legal bases (GDPR)

- **Contract** (Art. 6(1)(b)): Core product — storing the expenses you enter,
  computing budgets.
- **Legitimate interest** (Art. 6(1)(f)): Crash reports, server logs, uptime
  probes — required for reliability.
- **Consent** (Art. 6(1)(a)): Product analytics and session replay via
  PostHog. Gated by the consent banner at first visit. Revocable at any time.

## Your rights

You can, at any time:

- **Access** all data we hold on you — contact us.
- **Export** your expense history via the in-app export (XLSX / PDF).
- **Correct** any data via the app.
- **Delete** your account and all associated data via
  **Settings → Privacy → Delete my data**. This purges Firestore records,
  cancels your Firebase Auth account, and best-effort deletes your PostHog
  person, Sentry user record, and Axiom logs.
- **Withdraw consent** to analytics at any time via the cookie banner
  (re-shown via Settings → Privacy).
- **Lodge a complaint** with the Office of the Privacy Commissioner of
  Canada or your EU supervisory authority.

## Data retention

- Active user data: retained while your account is open.
- Deleted-account data: purged from Firestore immediately; downstream processors
  within 30 days (subject to their retention).
- Server logs (Axiom): 30 days.
- Sentry errors: 30 days on the free tier.
- PostHog events: up to 1 year on the free tier.
- Firebase Analytics: up to 14 months.

## Cross-border transfers

Firebase, Vercel, Cronitor, App Store Connect, and Google Play store data in
the United States. We use Google/Amazon/Apple's Standard Contractual Clauses
as the transfer safeguard. Sentry, PostHog, Axiom, and BetterStack data stays
in the EU.

## Children

Penny is not directed at children under 16. If you learn we have data on a
minor, contact us to delete it.

## Changes to this policy

Changes are announced in-app. Your continued use after the change date
constitutes acceptance.
