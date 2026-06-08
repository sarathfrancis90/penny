# Release notes

One file per release: `v<version>.txt` (matching the git tag, minus the `v` prefix is the version).

The internal release pipeline (`.github/workflows/mobile-release.yml`) reads the file matching the pushed tag/manual version and uses it for the TestFlight changelog and Play internal changelog. The production promotion workflow reuses the same file for App Store `en-CA` notes and Play Store `en-US` notes.

**The pipeline fails fast if the file is missing.** This is intentional — you cannot ship without versioned release notes.

## Conventions

- Plain text, no markdown
- Keep under ~500 chars (Play Store limit; App Store allows 4000)
- Write for end users, not developers ("You can now edit X" not "Wired up onTap handler")
- One file per `v*.*.*` tag

See `mobile/CICD.md` for the full deployment runbook.
