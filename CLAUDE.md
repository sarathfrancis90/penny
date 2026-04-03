# Penny — AI Expense Tracker

## Project Overview

Penny is an AI-powered expense tracking and personal finance management app for **self-incorporated software professionals in Canada**. It features intelligent expense analysis via Google Gemini, comprehensive budgeting, group expense management, income tracking, and savings goals — all organized around **CRA T2125 tax categories**.

This is a **monorepo** containing:
- **Web app** (`src/`) — Next.js 16 + React 19, deployed as a PWA
- **Mobile app** (`mobile/`) — Flutter (Dart), iOS-first with Android planned

---

## Tech Stack

### Web App
- **Framework**: Next.js 16.1.6, React 19.2.4, TypeScript
- **Styling**: Tailwind CSS 4, Radix UI (Shadcn/UI)
- **State**: React hooks + Firestore real-time listeners + Dexie (IndexedDB offline)
- **Forms**: React Hook Form + Zod v4
- **Charts**: Recharts
- **PWA**: next-pwa + Workbox

### Mobile App
- **Framework**: Flutter (Dart)
- **State Management**: Riverpod (flutter_riverpod + riverpod_annotation)
- **Navigation**: go_router
- **Architecture**: Clean Architecture (data → domain → presentation)
- **Charts**: fl_chart
- **HTTP**: Dio (for Next.js API calls)
- **Offline**: Built-in Firestore persistence + Hive for drafts

### Shared Backend
- **Auth**: Firebase Auth (email/password + passkeys via SimpleWebAuthn)
- **Database**: Cloud Firestore (real-time)
- **Storage**: Firebase Cloud Storage (receipt images)
- **AI**: Google Gemini API (@google/genai) — server-side only
- **Push**: Firebase Cloud Messaging (FCM)
- **Admin**: Firebase Admin SDK (server-side operations)

---

## Monorepo Structure

```
penny/
├── CLAUDE.md                    # This file — root project context
├── src/                         # Next.js web app
│   ├── app/
│   │   ├── api/                 # 36+ API routes
│   │   ├── dashboard/           # Analytics dashboard
│   │   ├── budgets/             # Budget management
│   │   ├── groups/              # Group management
│   │   ├── income/              # Income tracking
│   │   ├── savings/             # Savings goals
│   │   └── page.tsx             # Main AI chat interface
│   ├── components/              # 50+ React components
│   ├── hooks/                   # 25+ custom hooks
│   └── lib/
│       ├── types.ts             # Core TypeScript interfaces (CANONICAL)
│       ├── types/               # Extended types (income, savings, notifications)
│       ├── categories.ts        # CRA T2125 categories (BUSINESS-CRITICAL)
│       ├── firebase.ts          # Client Firebase config
│       ├── firebase-admin.ts    # Server Firebase Admin
│       ├── gemini-functions.ts  # AI function definitions
│       └── services/            # Server-side business logic
├── mobile/                      # Flutter mobile app
│   ├── CLAUDE.md                # Flutter-specific context
│   ├── lib/
│   │   ├── core/                # Constants, theme, router, network
│   │   ├── data/                # Models, repositories, services
│   │   ├── domain/              # Entities, usecases
│   │   └── presentation/        # Providers, screens, widgets
│   └── pubspec.yaml
├── database/
│   ├── firestore.rules          # Firestore security rules (750 lines)
│   ├── firestore.indexes.json
│   └── storage.rules
├── public/                      # PWA assets, manifest, service worker
├── .claude/settings.json        # MCP server configuration
├── package.json                 # Web app dependencies
└── next.config.ts               # Next.js + PWA config
```

---

## Firebase Collections

### Core Data
| Collection | Key Fields | Access Pattern |
|---|---|---|
| `expenses/{id}` | userId, vendor, amount, category, date, groupId, expenseType, groupMetadata, history[] | Stream by userId or groupId |
| `groups/{id}` | name, color, icon, createdBy, settings, stats, status | Stream by membership |
| `groupMembers/{groupId}_{userId}` | role, permissions, status | Stream by userId |
| `groupInvitations/{id}` | groupId, invitedEmail, token, expiresAt, status | Server-only create |
| `groupActivities/{id}` | groupId, userId, action, details | Server-only write |
| `conversations/{id}` | userId, title, status, messageCount | Stream by userId |
| `conversations/{id}/messages/{id}` | role, content, timestamp, attachments, expenseData | Subcollection stream |

### Financial
| Collection | Key Fields | Access Pattern |
|---|---|---|
| `budgets_personal/{id}` | userId, category, monthlyLimit, period {month, year}, settings | Stream by userId |
| `budgets_group/{id}` | groupId, category, monthlyLimit, period, setBy | Stream by groupId |
| `income_sources_personal/{id}` | userId, name, category, amount, frequency, isRecurring, taxable | Direct Firestore CRUD |
| `savings_goals_personal/{id}` | userId, name, category, targetAmount, currentAmount, monthlyContribution, status, priority | Direct Firestore CRUD |
| `notifications/{id}` | userId, type, title, body, read, priority, category | Stream by userId |

### Auth
| Collection | Key Fields | Notes |
|---|---|---|
| `users/{id}` | email, displayName, preferences | Own profile only |
| `passkeys/{id}` | userId, credentialID, credentialPublicKey, counter | WebAuthn credentials |
| `challenges/{id}` | challenge, type, expiresAt | TTL: 5 minutes |

---

## CRA T2125 Tax Categories (Business-Critical)

These categories are stored as exact string values in Firestore and MUST be identical across web and mobile. Source: `src/lib/categories.ts`

### General Business Expenses (19)
- "Advertising (Promotion, gift cards etc.)"
- "Meals and entertainment"
- "Groceries"
- "Insurance (No life insurance)"
- "Interest (and bank charges)"
- "Fees, licences, dues, memberships, and subscriptions"
- "Office expenses"
- "Supplies (for example PPT kit etc.)"
- "Rent (covers only office rent in industrial area)"
- "Legal, accounting, and other professional fees"
- "Management and administration fees"
- "Sub contracts / consultants paid in Canada"
- "Sub contracts / consultants paid outside Canada"
- "Salaries, wages, and benefits paid to the employees"
- "Withdrawal by Directors"
- "Travel (including transportation fees, accommodations, and meals)"
- "Telephone"
- "Motor vehicle expenses"
- "Other expenses (specify)"

### Home Office Expenses (9)
- "Home Office - Heat (gas, propane, wood, etc.)"
- "Home Office - Electricity"
- "Home Office - Water"
- "Home Office - Insurance"
- "Home Office - Maintenance"
- "Home Office - Mortgage interest or rent"
- "Home Office - Property taxes"
- "Home Office - Monitoring and internet"
- "Home Office - Office furnishings"

### Vehicle Expenses (10)
- "Vehicle - Fuel (gasoline, propane, oil)"
- "Vehicle - Repairs and maintenance (including oil changes)"
- "Vehicle - Lease payments"
- "Vehicle - Car washes"
- "Vehicle - Insurance"
- "Vehicle - Licence and registration"
- "Vehicle - Interest expense on vehicle purchase loan"
- "Vehicle - ETR 407"
- "Vehicle - CAA (Canadian Auto Association)"
- "Vehicle - Parking costs (non-prorated)"

---

## Backend Architecture — Hybrid (Mobile)

The mobile app uses a hybrid backend:

### Direct Firestore (FlutterFire SDK) — CRUD operations
Fast, real-time, offline-capable. Used for: expenses (personal read/write), budgets (personal CRUD), income sources, savings goals, conversations, notifications (read/mark-read), user profile.

### Next.js API Routes (HTTP via Dio) — Server-side operations
Required when: Gemini API key needed, multi-doc transactions, Admin SDK operations.

| Route | Method | Purpose | Why Server-Side |
|---|---|---|---|
| `/api/ai-chat` | POST | Conversational AI | Gemini API key |
| `/api/analyze-expense` | POST | Receipt OCR / text analysis | Gemini API key |
| `/api/expenses` | POST | Create group expense | Atomic: expense + stats + activity + notifications + budget check |
| `/api/groups` | POST | Create group | Atomic: group + owner membership + activity log |
| `/api/groups/[id]` | PATCH/DELETE | Update/delete group | Complex validation + cascading |
| `/api/groups/[id]/members` | POST | Invite member | Token generation |
| `/api/groups/invitations/accept` | POST | Accept invite | Multi-doc transaction |
| `/api/budgets/group` | POST | Create group budget | Admin role validation |

### Auth for Mobile API Calls
Mobile sends Firebase ID token as `Authorization: Bearer <token>`. Server validates via `adminAuth.verifyIdToken()`. Web app continues using userId in body (backward compatible).

---

## Key Architectural Decisions

1. **Firestore security rules are enforced for mobile** — Web uses Admin SDK (bypasses rules), mobile uses client SDK (rules enforced). Rules at `database/firestore.rules` are comprehensive (750 lines).
2. **`groupMembers` create is server-only** — `allow create: if false` in rules. Members created via API when group is created or invitation accepted.
3. **Notifications create is server-only** — Only API routes create notifications (budget alerts, group activity).
4. **`list` rules use `isAuthenticated()` broadly** — Mobile queries MUST include `where` clauses filtering by userId/groupId for security.
5. **Group roles**: owner → admin → member → viewer. Permissions defined in `DEFAULT_ROLE_PERMISSIONS` in `src/lib/types.ts`.

---

## Group Role Permissions

| Permission | Owner | Admin | Member | Viewer |
|---|---|---|---|---|
| canAddExpenses | yes | yes | yes | no |
| canEditOwnExpenses | yes | yes | yes | no |
| canEditAllExpenses | yes | yes | no | no |
| canDeleteExpenses | yes | yes | no | no |
| canApproveExpenses | yes | yes | no | no |
| canInviteMembers | yes | yes | no | no |
| canRemoveMembers | yes | yes | no | no |
| canViewReports | yes | yes | yes | yes |
| canExportData | yes | yes | no | no |
| canManageSettings | yes | no | no | no |

---

## MCP Tools Available

- **Google Stitch** (`stitch-mcp`) — AI UI design generation for mobile screens
- **iOS Simulator** (`ios-simulator-mcp`) — Interact with iOS simulator, capture screenshots, UI testing
- **XcodeBuildMCP** (`xcodebuild-mcp`) — Build, test, debug iOS/macOS apps via Xcode

---

## Build & Run Commands

### Web App
```bash
npm run dev          # Start dev server (Turbopack)
npm run build        # Production build
npm run lint         # ESLint
```

### Mobile App
```bash
cd mobile
flutter run                    # Run on connected device/simulator
flutter run -d ios             # Run on iOS simulator
flutter build ios              # Build iOS release
flutter test                   # Run all tests
flutter pub get                # Install dependencies
dart run build_runner build    # Generate Riverpod/JSON code
```

### Firebase
```bash
firebase deploy --only firestore:rules    # Deploy security rules
firebase deploy --only storage            # Deploy storage rules
```

---

## Type System — Canonical Source

All Firestore document shapes are defined in TypeScript and must be mirrored exactly in Dart:

- `src/lib/types.ts` — Expense, Group, GroupMember, GroupInvitation, GroupActivity, Conversation, ConversationMessage, PersonalBudget, GroupBudget, BudgetUsage
- `src/lib/types/income.ts` — PersonalIncomeSource, GroupIncomeSource, MonthlyIncomeRecord, enums (IncomeCategory, IncomeFrequency)
- `src/lib/types/savings.ts` — PersonalSavingsGoal, GroupSavingsGoal, SavingsContribution, enums (SavingsCategory, GoalStatus)
- `src/lib/types/notifications.ts` — Notification, NotificationPreferences, NotificationType enum

When modifying any type, update BOTH TypeScript and Dart models to stay in sync.
