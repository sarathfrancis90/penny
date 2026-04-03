# Penny Mobile — Production Readiness Plan

## Method: GSD (Get Stuff Done) — Prioritized by Impact

### Stream A: Critical Features (Blocks launch)
1. **A1**: Auth middleware on Next.js API routes (Bearer token validation)
2. **A2**: Receipt image upload (camera → compress → Firebase Storage → URL in expense)
3. **A3**: Conversation history (list conversations, load/continue, new chat)
4. **A4**: Expense edit save flow (end-to-end: edit → save → Firestore update → UI refresh)
5. **A5**: Group expense creation via API (with budget check + notifications)
6. **A6**: Offline connectivity indicator + graceful degradation

### Stream B: Error Handling & Reliability
1. **B1**: Network error states on all screens (retry buttons)
2. **B2**: Skeleton/shimmer loading on all list screens
3. **B3**: Pull-to-refresh on all scrollable screens
4. **B4**: Form validation on all create/edit sheets
5. **B5**: Auth token refresh handling
6. **B6**: Graceful Firestore connection failure handling

### Stream C: Polish & UX
1. **C1**: App icon + splash screen
2. **C2**: Haptic feedback audit (consistent across all actions)
3. **C3**: Keyboard avoidance on all bottom sheets
4. **C4**: List item animations (fade-in on load)
5. **C5**: Empty → populated state transitions
6. **C6**: Accessibility (semantic labels, VoiceOver)

### Stream D: Infrastructure
1. **D1**: Firebase Crashlytics integration
2. **D2**: Test coverage for all new features
3. **D3**: Full regression + visual validation

## Execution Order (parallel where possible)
- Wave 1: A1 + A2 + A6 + B1-B3 (parallel agents)
- Wave 2: A3 + A4 + A5 + B4-B6
- Wave 3: C1-C6
- Wave 4: D1-D3 + full regression
