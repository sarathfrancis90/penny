# Penny Mobile — Flutter App

## Overview

Flutter mobile app for Penny — AI-powered expense tracker for Canadian self-incorporated professionals. iOS-first, Android later. Clean light theme with blue (#0A84FF) accent — inspired by Venmo/PayPal/Apple Wallet.

---

## Architecture: Clean Architecture + Riverpod

```
lib/
├── core/           # Shared constants, theme, router, network utilities
├── data/           # Models (Firestore doc shapes), repositories, services
├── domain/         # Entities, usecases (business logic)
└── presentation/   # Riverpod providers, screens, widgets
```

### Data Flow
```
Screen (Widget) → Provider (Riverpod) → Repository → Firestore / API
                                                      ↓
                                              Stream<List<T>> for reads
                                              Future<T> for writes
```

### State Management — Riverpod
- **StreamProvider** for Firestore real-time listeners (expenses, budgets, groups, notifications)
- **StateNotifierProvider** for complex UI state (chat, forms)
- **FutureProvider** for one-shot API calls (AI analysis)
- Use `riverpod_annotation` + `riverpod_generator` for codegen when appropriate
- Run `dart run build_runner build` after adding/changing `@riverpod` annotations

### Navigation — go_router
- ShellRoute for bottom navigation (5 tabs: Home, Dashboard, Budgets, Groups, Profile)
- Nested routes within each tab preserve tab state
- Auth redirect: unauthenticated users → `/auth/login`

---

## Conventions

### File Naming
- All Dart files: `snake_case.dart`
- Models: `expense_model.dart`, `group_model.dart`
- Repositories: `expense_repository.dart`
- Providers: `expense_providers.dart`
- Screens: `expense_list_screen.dart`, `expense_detail_screen.dart`
- Widgets: `expense_card.dart`, `budget_progress.dart`

### Code Style
- Prefer `const` constructors everywhere possible
- Use `final` for all local variables
- Prefer named parameters for widgets with 3+ parameters
- Use freezed/json_serializable for models with `fromJson`/`toJson`
- All Firestore Timestamp fields map to Dart `Timestamp` from `cloud_firestore`

### Imports
- Use relative imports within the same feature
- Use package imports (`package:penny_mobile/...`) across features
- Group: dart → package → relative

---

## Backend Integration

### Direct Firestore (FlutterFire) — for CRUD
```dart
// Example: Stream personal expenses
FirebaseFirestore.instance
  .collection('expenses')
  .where('userId', isEqualTo: userId)
  .where('expenseType', isEqualTo: 'personal')
  .orderBy('date', descending: true)
  .snapshots()
  .map((snap) => snap.docs.map(ExpenseModel.fromFirestore).toList());
```

**IMPORTANT**: Always include `where` clauses filtering by userId or groupId. Firestore `list` rules allow any authenticated user — security depends on query filters.

### Next.js API (via Dio) — for AI & complex operations
```dart
// All API calls include Firebase ID token
final token = await FirebaseAuth.instance.currentUser?.getIdToken();
dio.options.headers['Authorization'] = 'Bearer $token';
```

API base URL: Set via environment config (dev vs prod).

Routes called from mobile:
- `POST /api/ai-chat` — body: `{message, userId, conversationHistory}`
- `POST /api/analyze-expense` — body: `{text?, imageBase64?, userId}`
- `POST /api/expenses` — for group expenses only (personal go direct to Firestore)
- `POST /api/groups` — create group
- `PATCH/DELETE /api/groups/:id` — update/delete group
- `POST /api/groups/:id/members` — invite member
- `POST /api/groups/invitations/accept` — accept invitation
- `POST /api/budgets/group` — create group budget

---

## Design System — Clean Blue (Light Theme)

Inspired by Venmo, PayPal, Apple Wallet. White space is the design. Color is used sparingly.

### Colors
```dart
static const primary = Color(0xFF0A84FF);        // Blue — ONE brand color
static const primaryLight = Color(0xFF5AC8FA);   // Light blue accent
static const background = Color(0xFFFFFFFF);     // White
static const surface = Color(0xFFF5F5F7);        // Light gray cards
static const textPrimary = Color(0xFF1C1C1E);    // Near black
static const textSecondary = Color(0xFF8E8E93);  // Gray
static const textTertiary = Color(0xFFC7C7CC);   // Placeholder gray
static const success = Color(0xFF34C759);         // Green — income, saved
static const warning = Color(0xFFFF9F0A);         // Amber — budget warning
static const error = Color(0xFFFF3B30);           // Red — over budget
static const divider = Color(0xFFE5E5EA);         // Subtle separator
```

### Typography
- System font (SF Pro on iOS, Roboto on Android)
- No custom fonts — native feel

### UI Principles
- **White space is the design** — color is accent only
- Bottom sheets > dialogs for mobile actions
- Haptic feedback on key actions (expense confirmed, budget alert)
- Pull-to-refresh on all lists
- Shimmer skeleton loading (not spinners)
- No gradients, no shadows, no glass effects
- Cards: light gray (#F5F5F7) on white, no borders
- Blue used ONLY for: CTAs, active tab, links, toggles

---

## Models — Mirror TypeScript Types

Every Dart model MUST match the TypeScript interface in `src/lib/types.ts` exactly. Key models:

| Dart Model | TypeScript Source | Firestore Collection |
|---|---|---|
| `ExpenseModel` | `Expense` in types.ts | `expenses` |
| `GroupModel` | `Group` in types.ts | `groups` |
| `GroupMemberModel` | `GroupMember` in types.ts | `groupMembers` |
| `BudgetModel` | `PersonalBudget` / `GroupBudget` in types.ts | `budgets_personal` / `budgets_group` |
| `ConversationModel` | `Conversation` in types.ts | `conversations` |
| `MessageModel` | `ConversationMessage` in types.ts | `conversations/{id}/messages` |
| `IncomeSourceModel` | `PersonalIncomeSource` in types/income.ts | `income_sources_personal` |
| `SavingsGoalModel` | `PersonalSavingsGoal` in types/savings.ts | `savings_goals_personal` |
| `NotificationModel` | `Notification` in types/notifications.ts | `notifications` |

### Timestamp Handling
```dart
// Reading from Firestore
final date = (doc['date'] as Timestamp).toDate();

// Writing to Firestore
'date': Timestamp.fromDate(dateTime),
```

---

## CRA T2125 Categories

Categories are defined in `lib/core/constants/categories.dart` and MUST be identical strings to `src/lib/categories.ts` in the web app. These are stored as string values in Firestore and used by the AI analysis pipeline. Never modify category strings without updating both web and mobile.

---

## Key Dependencies

| Package | Purpose |
|---|---|
| `firebase_core` | Firebase initialization |
| `firebase_auth` | Authentication |
| `cloud_firestore` | Database (real-time streams) |
| `firebase_storage` | Receipt image uploads |
| `firebase_messaging` | Push notifications (FCM) |
| `flutter_riverpod` | State management |
| `go_router` | Navigation |
| `dio` | HTTP client (Next.js API calls) |
| `fl_chart` | Charts & visualizations |
| `flutter_animate` | Premium animations |
| `shimmer` | Skeleton loading |
| `image_picker` | Camera/gallery for receipts |
| `hive_flutter` | Local storage (drafts, preferences) |
| `connectivity_plus` | Network state detection |
| `json_annotation` + `json_serializable` | Model serialization |
| `reactive_forms` | Form management |

---

## Testing

### Unit Tests (`test/unit/`)
- Model serialization (JSON ↔ Dart objects)
- Business logic in usecases
- Provider state transitions

### Widget Tests (`test/widget/`)
- Screen rendering
- Form validation
- User interactions

### Integration Tests (`test/integration/`)
- Full user flows on iOS Simulator (via iOS Simulator MCP)
- Visual regression via screenshots

### Commands
```bash
flutter test                           # All tests
flutter test test/unit/                # Unit tests only
flutter test --coverage                # With coverage report
flutter drive --target=test/integration/app_test.dart  # Integration tests
```

---

## Common Commands

```bash
flutter pub get                        # Install dependencies
flutter run -d ios                     # Run on iOS simulator
flutter run -d android                 # Run on Android emulator
flutter build ios --release            # Build iOS release
dart run build_runner build            # Generate code (Riverpod, JSON)
dart run build_runner watch            # Watch mode for codegen
dart format lib/                       # Format all Dart files
dart analyze                           # Static analysis
```
