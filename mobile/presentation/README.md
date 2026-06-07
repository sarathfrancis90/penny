# Penny Mobile — 10-minute Presentation

A single-page Reveal.js deck pitched at **engineering peers**. Walks through the Flutter mobile app: architecture, AI integration, Firestore design, TS↔Dart type parity, and CI/CD.

---

## View it

Pick one:

```bash
# 1. Just open the file — works in Chrome/Safari
open mobile/presentation/index.html

# 2. Or serve over HTTP (avoids some file:// quirks around video autoplay)
npx --yes serve mobile/presentation
# then open http://localhost:3000
```

## Drive it

| Key | Action |
|---|---|
| `↓` / `Space` / `→` | Next slide |
| `↑` / `←` | Previous slide |
| `Esc` / `o` | Slide overview |
| `s` | Speaker view (notes + clock) |
| `f` | Fullscreen |
| `?` | All shortcuts |

The URL hash updates per slide, so you can deep-link / refresh without losing your place.

---

## Slide map

| # | Slide | ~time |
|---|---|---|
| 1 | Title | 15s |
| 2 | Problem (T2125, 38 categories) | 40s |
| 3 | Hybrid backend architecture (SVG diagram) | 75s |
| 4 | AI chat UX + Riverpod snippet | 45s |
| 5 | **Demo video** (text + receipt flows) | 75s |
| 6 | Dashboard + fl_chart + StreamProvider | 45s |
| 7 | CRA categories — TS↔Dart parity | 55s |
| 8 | Budgets + server-authoritative alerts | 45s |
| 9 | Groups + Firestore security rules | 60s |
| 10 | Income + Savings | 35s |
| 11 | Engineering highlights + CI/CD | 60s |
| 12 | Closing | 15s |

Walked-through total ≈ 9:25 + transitions ≈ 10 min.

---

## Assets

```
assets/
├── screenshots/
│   ├── 01-chat.png         Home tab, AI chat
│   ├── 02-dashboard.png    Dashboard with charts
│   ├── 03-categories.png   Finances list with T2125 categories visible
│   ├── 04-budgets.png      Budgets with progress bars
│   ├── 05-groups.png       Group detail (members + expenses)
│   ├── 06-income.png       Income sources list
│   ├── 07-savings.png      Savings goals
│   └── 08-settings.png     Settings (optional)
└── demo.mp4                60–75s screen recording of the core loop
```

---

## Refresh the screenshots

1. Boot a known-good simulator (recommended: iPhone 16 on iOS 18.5 — see `feedback_ios26_keychain.md` in personal memory)
2. Start the Next.js dev backend so AI flows work: `npm run dev` from repo root
3. From `mobile/`: `flutter run -d <udid>`
4. Sign in as `test@penny.app` / `test1234`
5. Make sure the account has demo-worthy data (≥1 budget, ≥1 group, several recent expenses across multiple T2125 categories, ≥1 income source, ≥1 savings goal). If sparse, log a few entries via the chat before capturing.
6. Navigate to each screen and capture with `mcp__ios-simulator__screenshot`, saving as `assets/screenshots/0N-name.png`.

## Refresh the demo video

1. Pre-stage a receipt PNG in the simulator photo library (drag the file onto the simulator window)
2. Open Home tab, start recording: `mcp__ios-simulator__record_video` → `assets/demo.mp4`
3. **Flow A — text:** type `$45 lunch at Tim Hortons today`, send, confirm. Navigate to Dashboard, show it appeared, back to Home.
4. **Flow B — receipt:** attach → pick the staged receipt → confirm. Land back on Home.
5. `mcp__ios-simulator__stop_recording`. Aim for 60–75s.
6. If the file is `.mov`, transcode for broader browser compatibility:
   ```bash
   ffmpeg -i demo.mov -vcodec h264 -acodec aac -movflags +faststart demo.mp4
   ```

---

## Editing the deck

- Open `index.html` directly. Each slide is a `<section>` inside `<div class="slides">`.
- Speaker notes live in `<aside class="notes">` per slide — visible only in speaker view (`s`).
- Code highlighting uses Reveal's `highlight` plugin (Prism). Languages: `language-dart`, `language-typescript`, `language-javascript`, `language-bash`.
- Theme overrides are inline in `<style>` at the top — Penny brand blue accents on the stock `black` theme.
- The architecture diagram on slide 3 is hand-authored inline SVG — edit directly.
