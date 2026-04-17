## Summary

<!-- 1-3 bullets: what changed and why -->

## Observability checklist

- [ ] No PII added to logs, analytics events, or error reports (amounts, vendor names, emails, AI chat content)
- [ ] New API route handlers are wrapped with `withObservability({ route })`
- [ ] New business events are registered in the `TrackableEvent` union in `src/lib/observability/analytics.ts`
- [ ] Feature flag considered for risky or large changes (see `src/lib/observability/featureFlags.ts`)
- [ ] Privacy implications considered — new processors? Update `PRIVACY.md` + `/privacy/data-processors` + `docs/observability/SETUP.md`.
- [ ] Session replay masking verified for new PII-bearing UI (`data-ph-no-capture`)

## Test plan

- [ ] Unit tests added / updated
- [ ] `npx tsc --noEmit` passes
- [ ] `npm run lint` passes
- [ ] `npm test` passes
- [ ] Manual smoke test in staging before flipping production `OBSERVABILITY_ENABLED=true`

## Related

<!-- Sentry issue URL, GitHub issue, Linear ticket, etc. -->
