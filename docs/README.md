# 📚 Penny Documentation

Welcome to the Penny documentation! This folder contains comprehensive guides for all aspects of the application.

---

## 📖 Documentation Index

### 🤖 [Agentic Engineering](agents/)
Repository operating manual for agents. Start here for deep codebase analysis, file ownership, contracts, workflows, validation, and known drift.

| Document | Description |
|----------|-------------|
| [Agent Docs Index](agents/README.md) | Reading order and maintenance rules |
| [Repository Guide](agents/REPOSITORY_GUIDE.md) | Product, architecture, domains, and high-risk flows |
| [Web App Guide](agents/WEB_APP_GUIDE.md) | Next.js routes, APIs, auth, UI, and observability |
| [Mobile App Guide](agents/MOBILE_APP_GUIDE.md) | Flutter architecture, repositories, routing, and release context |
| [Firebase and Data Contracts](agents/FIREBASE_AND_DATA_CONTRACTS.md) | Firestore, storage, indexes, categories, and model contracts |
| [Agent Workflows](agents/AGENT_WORKFLOWS.md) | Agent execution playbooks and validation matrix |
| [Testing and Release](agents/TESTING_AND_RELEASE.md) | Local checks, CI, Firebase deploy, and mobile release |
| [Known Gaps](agents/KNOWN_GAPS.md) | Documented code/doc drift and risk hotspots |
| [Complete File Map](agents/FILE_MAP.md) | Generated inventory covering tracked and nonignored working-tree files |

---

### 🗄️ [Database](database/)
Complete database documentation, schema, and DevOps guides.

| Document | Description |
|----------|-------------|
| [Database Schema](database/DATABASE_SCHEMA.md) | Complete Firestore schema with all collections |
| [DevOps Guide](database/DATABASE_DEVOPS_GUIDE.md) | CI/CD setup, best practices, and workflows |
| [Setup Complete](database/DATABASE_SETUP_COMPLETE.md) | Infrastructure overview and checklist |
| [Firestore Rules Deploy](database/FIRESTORE_RULES_DEPLOY.md) | Security rules deployment guide |
| [Permission Fixes](database/FIX_FIREBASE_PERMISSIONS.md) | Troubleshooting permission issues |

---

### 🎨 [Features](features/)
Detailed documentation for all major features.

| Document | Description |
|----------|-------------|
| [AI Conversational Interface](features/AI_CONVERSATIONAL_INTERFACE_DESIGN.md) | AI chat design and implementation |
| [Budgeting System](features/BUDGETING_FEATURE_DESIGN.md) | Budget tracking and alerts |
| [Conversation History](features/CONVERSATION_HISTORY_DESIGN.md) | Chat history implementation |
| [Conversation Implementation](features/CONVERSATION_HISTORY_IMPLEMENTATION.md) | Technical implementation details |
| [Groups Feature](features/GROUPS_FEATURE_SUMMARY.md) | Group expense tracking |
| [Groups Management](features/GROUPS_MANAGEMENT_DESIGN.md) | Group admin and member management |
| [Mobile-First Design](features/MOBILE_FIRST_DESIGN_SYSTEM.md) | Responsive design system |
| [Notification System](features/NOTIFICATION_SYSTEM_DESIGN.md) | Complete notification system |
| [Notification Summary](features/NOTIFICATION_SYSTEM_SUMMARY.md) | Quick notification reference |
| [Notification Complete](features/NOTIFICATION_SYSTEM_COMPLETE.md) | Implementation completion status |
| [Notification Final Status](features/NOTIFICATION_SYSTEM_FINAL_STATUS.md) | Production readiness |
| [Notification Implementation](features/NOTIFICATION_SYSTEM_IMPLEMENTATION_STATUS.md) | Implementation tracking |
| [Passkey Authentication](features/IMPLEMENTATION_SUMMARY_PASSKEYS.md) | Passwordless auth with passkeys |
| [Receipt Storage](features/RECEIPT_STORAGE_IMPLEMENTATION.md) | Receipt upload and OCR |
| [View Expense Modal](features/VIEW_EXPENSE_MODAL_IMPLEMENTATION.md) | Expense viewing UI |
| [Income & Budgeting System](features/INCOME_BUDGETING_SYSTEM_DESIGN.md) | Income tracking & smart allocation |
| [Income Budgeting Summary](features/INCOME_BUDGETING_SUMMARY.md) | Quick reference for income feature |
| [Savings Goals Integration](features/SAVINGS_GOALS_INTEGRATION.md) | Savings goals as first-class budget items |
| [Income + Savings Redesign Complete](features/INCOME_SAVINGS_REDESIGN_COMPLETE.md) | v2.0 redesign completion summary |
| [Income Allocation Validation](features/INCOME_ALLOCATION_VALIDATION.md) | Validation system design document |
| [Income Allocation Complete](features/INCOME_ALLOCATION_IMPLEMENTATION_COMPLETE.md) | ✅ Implementation complete & deployed |

---

### 🚢 [Deployment](deployment/)
Guides for deploying and configuring Penny.

| Document | Description |
|----------|-------------|
| [Deployment Guide](deployment/DEPLOYMENT.md) | Complete deployment instructions |
| [Quick Start](deployment/DEPLOY_QUICK_START.md) | 5-minute deployment guide |
| [Firebase Setup](deployment/FIREBASE_SETUP.md) | Firebase project configuration |
| [Gemini Setup](deployment/GEMINI_SETUP.md) | AI integration setup |
| [PWA Setup](deployment/PWA_SETUP.md) | Progressive Web App configuration |
| [Vercel Fix](deployment/VERCEL_DEPLOYMENT_FIX.md) | Vercel deployment fixes |
| [Passkey Deployment](deployment/PASSKEY_DEPLOYMENT_CHECKLIST.md) | Passkey setup checklist |
| [Password Reset](deployment/PASSWORD_RESET_GUIDE.md) | Password reset flow |

---

### 🧪 [Testing](testing/)
Testing guides and verification procedures.

| Document | Description |
|----------|-------------|
| [Testing Guide](testing/TESTING_GUIDE.md) | Comprehensive testing strategy |
| [Groups Testing](testing/GROUPS_TESTING_GUIDE.md) | Group feature test cases |
| [Notifications Testing](testing/NOTIFICATION_TESTING_GUIDE.md) | Notification system tests |
| [Default Group Verification](testing/DEFAULT_GROUP_VERIFICATION.md) | Verify default group feature |

---

### 👨‍💼 [Admin](admin/)
Admin console and monitoring documentation.

| Document | Description |
|----------|-------------|
| [Admin Console](admin/ADMIN_CONSOLE_README.md) | Admin dashboard overview |
| [Costs & Monitoring](admin/ADMIN_COSTS_AND_MONITORING.md) | Cost tracking and alerts |
| [Admin Updates](admin/ADMIN_UPDATES_v2.md) | Latest admin features |

---

### 🐛 [Debug](debug/)
Debug logs and fix summaries (historical reference).

| Document | Description |
|----------|-------------|
| [Budget Fixes Final](debug/BUDGET_FIXES_FINAL.md) | Budget bug fixes |
| [Budget Fixes Summary](debug/BUDGET_FIXES_SUMMARY.md) | Budget fix overview |
| [Budget Navigation](debug/BUDGET_NAVIGATION_DEBUG.md) | Navigation debugging |
| [Budget UX](debug/BUDGET_UX_IMPROVEMENTS.md) | UX improvements |
| [Dashboard Filter](debug/DASHBOARD_FILTER_FIX.md) | Filter bug fixes |
| [Passkey 401](debug/DEBUG_PASSKEY_401.md) | Passkey authentication fix |
| [Session Summary](debug/DEBUG_SESSION_SUMMARY.md) | Debugging session notes |

---

## 🚀 Quick Links

### Getting Started
1. [Deployment Quick Start](deployment/DEPLOY_QUICK_START.md)
2. [Firebase Setup](deployment/FIREBASE_SETUP.md)
3. [Gemini Setup](deployment/GEMINI_SETUP.md)

### For Developers
1. [Database Schema](database/DATABASE_SCHEMA.md)
2. [DevOps Guide](database/DATABASE_DEVOPS_GUIDE.md)
3. [Testing Guide](testing/TESTING_GUIDE.md)

### For Admins
1. [Admin Console](admin/ADMIN_CONSOLE_README.md)
2. [Costs & Monitoring](admin/ADMIN_COSTS_AND_MONITORING.md)

---

## 📖 Documentation Standards

All documentation follows these standards:
- ✅ Written in Markdown
- ✅ Includes table of contents
- ✅ Uses clear headings and structure
- ✅ Includes code examples where relevant
- ✅ Updated with each feature change

---

## 🔄 Keeping Documentation Updated

When adding new features:
1. Create/update feature documentation in `features/`
2. Update this README.md with new links
3. Update main project README.md
4. Add testing documentation in `testing/`

---

## 💡 Need Help?

- **Can't find documentation?** Check the [main README](../README.md)
- **Found an error?** Open a GitHub issue
- **Want to contribute?** Submit a PR with documentation updates

---

**Last Updated**: November 17, 2025  
**Status**: ✅ Complete and up-to-date
