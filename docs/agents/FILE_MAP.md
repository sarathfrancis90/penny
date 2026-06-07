# Complete Repository File Map

Generated from `git ls-files` plus nonignored working-tree files on 2026-05-10. This map accounts for every tracked file and every nonignored untracked file visible to Git at generation time. It intentionally summarizes generated Firebase/environment files without reproducing secret-like values.

Tracked file count: 716.
Nonignored untracked file count: 11.
Mapped file count: 727.

Ignored/generated local artifact count from `git ls-files --others --ignored --exclude-standard`: 112423. These artifacts include dependency/build output such as `node_modules/`, `.next/`, Flutter build output, and local environment files. They are not source-of-truth documentation inputs unless a task explicitly requires inspecting them.

## How To Use This Map

- Use this file to confirm adjacent implementation, tests, docs, config, and platform files before editing.
- The `Git` column distinguishes committed tracked files from nonignored untracked files in the current working tree.
- For binary assets, inspect the actual image when visual behavior matters.
- For generated Firebase config, reference file paths only and avoid copying values into logs or docs.
- Regenerate this map after adding, removing, or moving tracked or source-relevant untracked files.

## root and other config

Files: 92.

| Path | Git | Kind | Lines | Notes |
| --- | --- | --- | ---: | --- |
| `.firebaserc` | tracked | configuration | 6 | configuration; 54 bytes. |
| `.githooks/pre-push` | tracked | repository file | 18 | repository file; 699 bytes. |
| `.gitignore` | tracked | repository file | 45 | repository file; 557 bytes. |
| `.xcodebuildmcp/config.yaml` | tracked | configuration | 8 | configuration; 295 bytes. |
| `AGENTS.md` | untracked | documentation | 33 | Documentation: Penny Agent Guide |
| `CLAUDE.md` | tracked | documentation | 265 | Documentation: Penny  AI Expense Tracker |
| `DIALOGS_AUDIT_REPORT.md` | tracked | documentation | 459 | Documentation: Dialogs & Modals Audit Report |
| `FORMS_AUDIT_REPORT.md` | tracked | documentation | 290 | Documentation: Forms Audit Report |
| `PRIVACY.md` | tracked | documentation | 97 | Documentation: Penny Privacy Policy |
| `README.md` | tracked | documentation | 321 | Documentation: Penny - AI-Powered Expense Tracker |
| `SHARED_COMPONENTS_AUDIT_COMPLETE.md` | tracked | documentation | 396 | Documentation: Shared Components Audit - COMPLETE |
| `UI_CONTROLS_CONSISTENCY_AUDIT.md` | tracked | documentation | 465 | Documentation: UI Controls Consistency Audit |
| `UI_UX_AUDIT_REPORT.md` | tracked | documentation | 118 | Documentation: UI/UX Consistency Audit Report |
| `UI_UX_CONSISTENCY_COMPLETE.md` | tracked | documentation | 258 | Documentation: UI/UX Consistency Implementation - COMPLETE |
| `UI_UX_STANDARDIZATION_COMPLETE.md` | tracked | documentation | 508 | Documentation: UI/UX Standardization - COMPLETE |
| `UI_UX_STANDARDIZATION_PHASE2_COMPLETE.md` | tracked | documentation | 342 | Documentation: UI/UX Standardization - Phase 2 Complete |
| `components.json` | tracked | configuration | 22 | shadcn/ui component generator configuration |
| `env.example` | tracked | repository file | 45 | repository file; 2180 bytes. |
| `eslint.config.mjs` | tracked | configuration | 93 | configuration; 3516 bytes. |
| `firebase.json` | tracked | configuration | 10 | Firebase deployment targets for Firestore rules/indexes and storage rules |
| `next.config.ts` | tracked | TypeScript module | 144 | TypeScript module. |
| `package-lock.json` | tracked | configuration | 21181 | configuration; 784655 bytes. |
| `package.json` | tracked | configuration | 93 | Package manifest penny; scripts: dev, build, start, lint, test, test:watch, test:ui, typecheck |
| `postcss.config.mjs` | tracked | configuration | 5 | configuration; 81 bytes. |
| `public/apple-touch-icon.png` | tracked | binary asset | - | Binary PNG file; 36674 bytes; inspect visually when task touches assets. |
| `public/favicon-32x32.png` | tracked | binary asset | - | Binary PNG file; 2663 bytes; inspect visually when task touches assets. |
| `public/file.svg` | tracked | vector asset | 1 | Vector asset; inspect visually when changing branding or icons. |
| `public/globe.svg` | tracked | vector asset | 1 | Vector asset; inspect visually when changing branding or icons. |
| `public/icon-192.png` | tracked | binary asset | - | Binary PNG file; 41387 bytes; inspect visually when task touches assets. |
| `public/icon-512.png` | tracked | binary asset | - | Binary PNG file; 282950 bytes; inspect visually when task touches assets. |
| `public/manifest.json` | tracked | configuration | 51 | configuration; 1140 bytes. |
| `public/next.svg` | tracked | vector asset | 1 | Vector asset; inspect visually when changing branding or icons. |
| `public/penny.png` | tracked | binary asset | - | Binary PNG file; 1074425 bytes; inspect visually when task touches assets. |
| `public/sw.js` | tracked | repository file | 1 | repository file; 14640 bytes. |
| `public/vercel.svg` | tracked | vector asset | 1 | Vector asset; inspect visually when changing branding or icons. |
| `public/window.svg` | tracked | vector asset | 1 | Vector asset; inspect visually when changing branding or icons. |
| `public/workbox-00a24876.js` | tracked | repository file | 1 | repository file; 22239 bytes. |
| `screenshots/phone/phone_dashboard.png` | tracked | binary asset | - | Binary PNG file; 164795 bytes; inspect visually when task touches assets. |
| `screenshots/phone/phone_finances.png` | tracked | binary asset | - | Binary PNG file; 183218 bytes; inspect visually when task touches assets. |
| `screenshots/phone/phone_groups.png` | tracked | binary asset | - | Binary PNG file; 123732 bytes; inspect visually when task touches assets. |
| `screenshots/phone/phone_home.png` | tracked | binary asset | - | Binary PNG file; 159408 bytes; inspect visually when task touches assets. |
| `screenshots/phone/phone_profile.png` | tracked | binary asset | - | Binary PNG file; 144946 bytes; inspect visually when task touches assets. |
| `screenshots/tablet_10inch/01_home.png` | tracked | binary asset | - | Binary PNG file; 92293 bytes; inspect visually when task touches assets. |
| `screenshots/tablet_10inch/02_dashboard.png` | tracked | binary asset | - | Binary PNG file; 39343 bytes; inspect visually when task touches assets. |
| `screenshots/tablet_10inch/03_finances.png` | tracked | binary asset | - | Binary PNG file; 55438 bytes; inspect visually when task touches assets. |
| `screenshots/tablet_10inch/04_groups.png` | tracked | binary asset | - | Binary PNG file; 44407 bytes; inspect visually when task touches assets. |
| `screenshots/tablet_10inch/05_profile.png` | tracked | binary asset | - | Binary PNG file; 79247 bytes; inspect visually when task touches assets. |
| `screenshots/tablet_10inch/after_allow.png` | tracked | binary asset | - | Binary PNG file; 67307 bytes; inspect visually when task touches assets. |
| `screenshots/tablet_10inch/after_back.png` | tracked | binary asset | - | Binary PNG file; 92556 bytes; inspect visually when task touches assets. |
| `screenshots/tablet_10inch/current.png` | tracked | binary asset | - | Binary PNG file; 66980 bytes; inspect visually when task touches assets. |
| `screenshots/tablet_10inch/final_check.png` | tracked | binary asset | - | Binary PNG file; 96102 bytes; inspect visually when task touches assets. |
| `screenshots/tablet_10inch/fresh_start.png` | tracked | binary asset | - | Binary PNG file; 85327 bytes; inspect visually when task touches assets. |
| `screenshots/tablet_10inch/initial.png` | tracked | binary asset | - | Binary PNG file; 134777 bytes; inspect visually when task touches assets. |
| `screenshots/tablet_10inch/login_check.png` | tracked | binary asset | - | Binary PNG file; 1852944 bytes; inspect visually when task touches assets. |
| `screenshots/tablet_10inch/login_result.png` | tracked | binary asset | - | Binary PNG file; 94694 bytes; inspect visually when task touches assets. |
| `screenshots/tablet_10inch/login_result2.png` | tracked | binary asset | - | Binary PNG file; 1850538 bytes; inspect visually when task touches assets. |
| `screenshots/tablet_10inch/login_screen.png` | tracked | binary asset | - | Binary PNG file; 85679 bytes; inspect visually when task touches assets. |
| `screenshots/tablet_10inch/onboarding.png` | tracked | binary asset | - | Binary PNG file; 84370 bytes; inspect visually when task touches assets. |
| `screenshots/tablet_10inch/relaunch.png` | tracked | binary asset | - | Binary PNG file; 85912 bytes; inspect visually when task touches assets. |
| `screenshots/tablet_10inch/skip_check.png` | tracked | binary asset | - | Binary PNG file; 85165 bytes; inspect visually when task touches assets. |
| `screenshots/tablet_10inch/step1_login.png` | tracked | binary asset | - | Binary PNG file; 86225 bytes; inspect visually when task touches assets. |
| `screenshots/tablet_10inch/step2_email.png` | tracked | binary asset | - | Binary PNG file; 149928 bytes; inspect visually when task touches assets. |
| `screenshots/tablet_10inch/step3_result.png` | tracked | binary asset | - | Binary PNG file; 95810 bytes; inspect visually when task touches assets. |
| `screenshots/tablet_10inch/tab_login.png` | tracked | binary asset | - | Binary PNG file; 66459 bytes; inspect visually when task touches assets. |
| `screenshots/tablet_7inch/01_home.png` | tracked | binary asset | - | Binary PNG file; 62317 bytes; inspect visually when task touches assets. |
| `screenshots/tablet_7inch/02_dashboard.png` | tracked | binary asset | - | Binary PNG file; 50453 bytes; inspect visually when task touches assets. |
| `screenshots/tablet_7inch/03_finances.png` | tracked | binary asset | - | Binary PNG file; 73323 bytes; inspect visually when task touches assets. |
| `screenshots/tablet_7inch/04_groups.png` | tracked | binary asset | - | Binary PNG file; 40389 bytes; inspect visually when task touches assets. |
| `screenshots/tablet_7inch/05_profile.png` | tracked | binary asset | - | Binary PNG file; 50867 bytes; inspect visually when task touches assets. |
| `screenshots/tablet_7inch/after_signin.png` | tracked | binary asset | - | Binary PNG file; 61109 bytes; inspect visually when task touches assets. |
| `screenshots/tablet_7inch/check.png` | tracked | binary asset | - | Binary PNG file; 49237 bytes; inspect visually when task touches assets. |
| `screenshots/tablet_7inch/creds_check.png` | tracked | binary asset | - | Binary PNG file; 60991 bytes; inspect visually when task touches assets. |
| `screenshots/tablet_7inch/final_check.png` | tracked | binary asset | - | Binary PNG file; 83794 bytes; inspect visually when task touches assets. |
| `screenshots/tablet_7inch/home.png` | tracked | binary asset | - | Binary PNG file; 62237 bytes; inspect visually when task touches assets. |
| `screenshots/tablet_7inch/initial.png` | tracked | binary asset | - | Binary PNG file; 89092 bytes; inspect visually when task touches assets. |
| `screenshots/tablet_7inch/login_check.png` | tracked | binary asset | - | Binary PNG file; 57350 bytes; inspect visually when task touches assets. |
| `screenshots/tablet_7inch/login_result.png` | tracked | binary asset | - | Binary PNG file; 44454 bytes; inspect visually when task touches assets. |
| `screenshots/tablet_7inch/onboarding.png` | tracked | binary asset | - | Binary PNG file; 88880 bytes; inspect visually when task touches assets. |
| `screenshots/tablet_7inch/signin_result.png` | tracked | binary asset | - | Binary PNG file; 66659 bytes; inspect visually when task touches assets. |
| `scripts/bootstrap-accounts.ts` | tracked | TypeScript module | 502 | TypeScript module; symbols: readEnvFile, generateSecret, banner, ok, warn, fail. |
| `scripts/bootstrap-uptime.ts` | tracked | TypeScript module | 89 | TypeScript module; symbols: upsertMonitor, main. |
| `scripts/check-indexes.js` | tracked | repository file | 169 | repository file; 4634 bytes. |
| `scripts/generate-jwt-secret.js` | tracked | repository file | 58 | repository file; 1808 bytes. |
| `scripts/grant-admin.ts` | tracked | TypeScript module | 39 | TypeScript module; symbols: main. |
| `sentry.client.config.ts` | tracked | TypeScript module | 27 | TypeScript module. |
| `sentry.edge.config.ts` | tracked | TypeScript module | 18 | TypeScript module. |
| `sentry.server.config.ts` | tracked | TypeScript module | 27 | TypeScript module. |
| `src/proxy.ts` | tracked | TypeScript module | 31 | TypeScript module; symbols: proxy, config. |
| `src/test/setup.ts` | tracked | TypeScript module | 1 | TypeScript module. |
| `tsconfig.json` | tracked | configuration | 41 | configuration; 702 bytes. |
| `vercel.json` | tracked | configuration | 8 | configuration; 104 bytes. |
| `vitest.config.ts` | tracked | TypeScript module | 17 | TypeScript module. |

## .claude

Files: 2.

| Path | Git | Kind | Lines | Notes |
| --- | --- | --- | ---: | --- |
| `.claude/scheduled_tasks.lock` | untracked | lockfile | 1 | Generated, lock, or environment-specific configuration; values intentionally not reproduced in docs. |
| `.claude/settings.json` | tracked | configuration | 5 | configuration; 78 bytes. |

## .cursor

Files: 4.

| Path | Git | Kind | Lines | Notes |
| --- | --- | --- | ---: | --- |
| `.cursor/rules/build-and-lint.mdc` | tracked | repository file | 37 | repository file; 1053 bytes. |
| `.cursor/rules/dialogs-and-modals.mdc` | tracked | repository file | 27 | repository file; 1024 bytes. |
| `.cursor/rules/notifications-and-toasts.mdc` | tracked | repository file | 23 | repository file; 929 bytes. |
| `.cursor/rules/theming.mdc` | tracked | repository file | 36 | repository file; 1216 bytes. |

## .github

Files: 9.

| Path | Git | Kind | Lines | Notes |
| --- | --- | --- | ---: | --- |
| `.github/CODEOWNERS` | tracked | repository file | 33 | GitHub repository automation/configuration. |
| `.github/ISSUE_TEMPLATE/bug_report.md` | tracked | documentation | 32 | Documentation: --- |
| `.github/ISSUE_TEMPLATE/observability_alert.md` | tracked | documentation | 31 | Documentation: --- |
| `.github/pull_request_template.md` | tracked | documentation | 24 | Documentation: ## Summary |
| `.github/workflows/backend-tests.yml` | tracked | configuration | 41 | GitHub repository automation/configuration. |
| `.github/workflows/firebase-deploy.yml` | tracked | configuration | 73 | GitHub repository automation/configuration. |
| `.github/workflows/mobile-release.yml` | tracked | configuration | 235 | GitHub repository automation/configuration. |
| `.github/workflows/mobile-tests.yml` | tracked | configuration | 59 | GitHub repository automation/configuration. |
| `.github/workflows/store-metrics-fallback.yml` | tracked | configuration | 43 | GitHub repository automation/configuration. |

## database

Files: 3.

| Path | Git | Kind | Lines | Notes |
| --- | --- | --- | ---: | --- |
| `database/firestore.indexes.json` | tracked | configuration | 860 | Firestore index definitions (37 composite indexes) |
| `database/firestore.rules` | tracked | Firebase rules | 761 | Firebase security rules; treat as authorization contract. |
| `database/storage.rules` | tracked | Firebase rules | 56 | Firebase security rules; treat as authorization contract. |

## docs/agents

Files: 9.

| Path | Git | Kind | Lines | Notes |
| --- | --- | --- | ---: | --- |
| `docs/agents/AGENT_WORKFLOWS.md` | untracked | documentation | 181 | Documentation: Agent Workflows |
| `docs/agents/FILE_MAP.md` | untracked | documentation | 871 | Documentation: Complete Repository File Map |
| `docs/agents/FIREBASE_AND_DATA_CONTRACTS.md` | untracked | documentation | 182 | Documentation: Firebase and Data Contracts |
| `docs/agents/KNOWN_GAPS.md` | untracked | documentation | 166 | Documentation: Known Gaps and Drift |
| `docs/agents/MOBILE_APP_GUIDE.md` | untracked | documentation | 185 | Documentation: Mobile App Guide |
| `docs/agents/README.md` | untracked | documentation | 51 | Documentation: Agent Documentation Index |
| `docs/agents/REPOSITORY_GUIDE.md` | untracked | documentation | 287 | Documentation: Repository Guide |
| `docs/agents/TESTING_AND_RELEASE.md` | untracked | documentation | 125 | Documentation: Testing and Release |
| `docs/agents/WEB_APP_GUIDE.md` | untracked | documentation | 165 | Documentation: Web App Guide |

## docs

Files: 56.

| Path | Git | Kind | Lines | Notes |
| --- | --- | --- | ---: | --- |
| `docs/CODEBASE_ORGANIZATION.md` | tracked | documentation | 300 | Documentation: Codebase Organization |
| `docs/README.md` | tracked | documentation | 170 | Documentation: Penny Documentation |
| `docs/admin/ADMIN_CONSOLE_README.md` | tracked | documentation | 444 | Documentation: Penny AI - Admin Console Documentation |
| `docs/admin/ADMIN_COSTS_AND_MONITORING.md` | tracked | documentation | 517 | Documentation: Admin Console v3.0 - Comprehensive Cost Tracking & System Monitoring |
| `docs/admin/ADMIN_UPDATES_v2.md` | tracked | documentation | 275 | Documentation: Admin Console v2.0 - Update Summary |
| `docs/database/DATABASE_DEVOPS_GUIDE.md` | tracked | documentation | 641 | Documentation: Database DevOps Best Practices |
| `docs/database/DATABASE_SCHEMA.md` | tracked | documentation | 570 | Documentation: Database Schema - Penny Expense Tracker |
| `docs/database/DATABASE_SETUP_COMPLETE.md` | tracked | documentation | 328 | Documentation: Database DevOps Setup - Complete! |
| `docs/database/FIRESTORE_RULES_DEPLOY.md` | tracked | documentation | 47 | Documentation: Deploy Firestore Security Rules |
| `docs/database/FIX_FIREBASE_PERMISSIONS.md` | tracked | documentation | 249 | Documentation: Fix Firebase Permission Denied Error |
| `docs/debug/BUDGET_FIXES_FINAL.md` | tracked | documentation | 231 | Documentation: Budget Fixes - Final Summary |
| `docs/debug/BUDGET_FIXES_SUMMARY.md` | tracked | documentation | 249 | Documentation: Budget Feature Fixes Summary |
| `docs/debug/BUDGET_NAVIGATION_DEBUG.md` | tracked | documentation | 188 | Documentation: Budget Navigation Debugging Guide |
| `docs/debug/BUDGET_UX_IMPROVEMENTS.md` | tracked | documentation | 201 | Documentation: Budget UX Improvements - Summary |
| `docs/debug/DASHBOARD_FILTER_FIX.md` | tracked | documentation | 171 | Documentation: Dashboard Filter Fix |
| `docs/debug/DEBUG_PASSKEY_401.md` | tracked | documentation | 268 | Documentation: Debugging 401 Unauthorized on Passkey API |
| `docs/debug/DEBUG_SESSION_SUMMARY.md` | tracked | documentation | 331 | Documentation: Budget Navigation Debug Session Summary |
| `docs/deployment/DEPLOYMENT.md` | tracked | documentation | 368 | Documentation: Penny Deployment Guide |
| `docs/deployment/DEPLOY_QUICK_START.md` | tracked | documentation | 93 | Documentation: Quick Deploy to Vercel |
| `docs/deployment/FIREBASE_SETUP.md` | tracked | documentation | 149 | Documentation: Firebase Setup Instructions for Penny |
| `docs/deployment/GEMINI_SETUP.md` | tracked | documentation | 153 | Documentation: Google Gemini API Setup for Penny |
| `docs/deployment/PASSKEY_DEPLOYMENT_CHECKLIST.md` | tracked | documentation | 262 | Documentation: Passkey Authentication - Vercel Deployment Checklist |
| `docs/deployment/PASSWORD_RESET_GUIDE.md` | tracked | documentation | 372 | Documentation: Password Reset Flow - Complete Guide |
| `docs/deployment/PWA_SETUP.md` | tracked | documentation | 184 | Documentation: PWA Setup Instructions for Penny |
| `docs/deployment/VERCEL_DEPLOYMENT_FIX.md` | tracked | documentation | 124 | Documentation: Vercel Deployment Fix for Passkey Error |
| `docs/features/AI_CONVERSATIONAL_INTERFACE_DESIGN.md` | tracked | documentation | 673 | Documentation: AI Conversational Interface - Comprehensive Design Document |
| `docs/features/BUDGETING_FEATURE_DESIGN.md` | tracked | documentation | 710 | Documentation: Budgeting Feature - Complete Design Document |
| `docs/features/CONVERSATION_HISTORY_DESIGN.md` | tracked | documentation | 646 | Documentation: Conversation History - Complete Feature Design |
| `docs/features/CONVERSATION_HISTORY_IMPLEMENTATION.md` | tracked | documentation | 768 | Documentation: Conversation History - Implementation Summary |
| `docs/features/GROUPS_FEATURE_SUMMARY.md` | tracked | documentation | 485 | Documentation: Groups Feature - Complete Implementation Summary |
| `docs/features/GROUPS_MANAGEMENT_DESIGN.md` | tracked | documentation | 412 | Documentation: Group Management - Complete Feature Design |
| `docs/features/IMPLEMENTATION_SUMMARY_PASSKEYS.md` | tracked | documentation | 379 | Documentation: Passkey Implementation Summary - October 2025 |
| `docs/features/INCOME_ALLOCATION_IMPLEMENTATION_COMPLETE.md` | tracked | documentation | 437 | Documentation: Income Allocation Validation System - Implementation Complete |
| `docs/features/INCOME_ALLOCATION_VALIDATION.md` | tracked | documentation | 588 | Documentation: Income Allocation Validation System - Implementation Plan |
| `docs/features/INCOME_BUDGETING_SUMMARY.md` | tracked | documentation | 369 | Documentation: Income & Budget Allocation - Quick Reference |
| `docs/features/INCOME_BUDGETING_SYSTEM_DESIGN.md` | tracked | documentation | 1373 | Documentation: Income & Budget Allocation System - Design Document |
| `docs/features/INCOME_SAVINGS_IMPLEMENTATION_STATUS.md` | tracked | documentation | 768 | Documentation: Income & Savings System - Implementation Status |
| `docs/features/INCOME_SAVINGS_REDESIGN_COMPLETE.md` | tracked | documentation | 543 | Documentation: Income & Savings Integration - Redesign Complete |
| `docs/features/MOBILE_FIRST_DESIGN_SYSTEM.md` | tracked | documentation | 578 | Documentation: Penny - Mobile-First Design System |
| `docs/features/NOTIFICATION_SYSTEM_COMPLETE.md` | tracked | documentation | 421 | Documentation: Notification System - 100% COMPLETE! |
| `docs/features/NOTIFICATION_SYSTEM_DESIGN.md` | tracked | documentation | 2431 | Documentation: Notification System - Complete Design Document |
| `docs/features/NOTIFICATION_SYSTEM_FINAL_STATUS.md` | tracked | documentation | 533 | Documentation: Notification System - Final Implementation Status |
| `docs/features/NOTIFICATION_SYSTEM_IMPLEMENTATION_STATUS.md` | tracked | documentation | 516 | Documentation: Notification System - Implementation Status |
| `docs/features/NOTIFICATION_SYSTEM_SUMMARY.md` | tracked | documentation | 355 | Documentation: Notification System - Quick Reference |
| `docs/features/RECEIPT_STORAGE_IMPLEMENTATION.md` | tracked | documentation | 411 | Documentation: Receipt Image Storage - Complete Implementation |
| `docs/features/SAVINGS_GOALS_INTEGRATION.md` | tracked | documentation | 516 | Documentation: Savings Goals Integration - Design Summary |
| `docs/features/UNIFIED_FINANCES_IMPLEMENTATION.md` | tracked | documentation | 346 | Documentation: Unified Finances Page - Complete Implementation Summary |
| `docs/features/VIEW_EXPENSE_MODAL_IMPLEMENTATION.md` | tracked | documentation | 291 | Documentation: View Expense Modal - Implementation Summary |
| `docs/observability/ALERTS.md` | tracked | documentation | 92 | Documentation: Alert rules |
| `docs/observability/AXIOM.md` | tracked | documentation | 108 | Documentation: Axiom log shipping |
| `docs/observability/SETUP.md` | tracked | documentation | 148 | Documentation: Observability Setup Runbook (Phase 0) |
| `docs/superpowers/plans/2026-04-17-observability-foundation.md` | tracked | documentation | 3819 | Documentation: Observability Foundation Implementation Plan |
| `docs/testing/DEFAULT_GROUP_VERIFICATION.md` | tracked | documentation | 221 | Documentation: Default Group Feature - Verification Guide |
| `docs/testing/GROUPS_TESTING_GUIDE.md` | tracked | documentation | 506 | Documentation: Groups Feature - Complete Testing Guide |
| `docs/testing/NOTIFICATION_TESTING_GUIDE.md` | tracked | documentation | 637 | Documentation: Notification System - Testing Guide |
| `docs/testing/TESTING_GUIDE.md` | tracked | documentation | 322 | Documentation: Penny Testing Guide |

## src/app/api

Files: 48.

| Path | Git | Kind | Lines | Notes |
| --- | --- | --- | ---: | --- |
| `src/app/api/account/delete/route.ts` | tracked | Next API route | 111 | Next API route exporting DELETE; inspect auth, validation, Firestore, and observability behavior before edits. |
| `src/app/api/admin/analytics/route.ts` | tracked | Next API route | 167 | Next API route exporting GET; inspect auth, validation, Firestore, and observability behavior before edits. |
| `src/app/api/admin/auth/route.ts` | tracked | Next API route | 97 | Next API route exporting POST, GET, DELETE; inspect auth, validation, Firestore, and observability behavior before edits. |
| `src/app/api/admin/config/route.ts` | tracked | Next API route | 179 | Next API route exporting GET, POST; inspect auth, validation, Firestore, and observability behavior before edits. |
| `src/app/api/admin/costs/route.ts` | tracked | Next API route | 261 | Next API route exporting GET; inspect auth, validation, Firestore, and observability behavior before edits. |
| `src/app/api/admin/error-trends/route.ts` | tracked | Next API route | 30 | Next API route exporting GET; inspect auth, validation, Firestore, and observability behavior before edits. |
| `src/app/api/admin/store-metrics/route.ts` | tracked | Next API route | 26 | Next API route exporting GET; inspect auth, validation, Firestore, and observability behavior before edits. |
| `src/app/api/admin/system/route.ts` | tracked | Next API route | 261 | Next API route exporting GET; inspect auth, validation, Firestore, and observability behavior before edits. |
| `src/app/api/admin/uptime/route.ts` | tracked | Next API route | 28 | Next API route exporting GET; inspect auth, validation, Firestore, and observability behavior before edits. |
| `src/app/api/admin/user-analytics/route.ts` | tracked | Next API route | 40 | Next API route exporting GET; inspect auth, validation, Firestore, and observability behavior before edits. |
| `src/app/api/admin/users/[userId]/export/route.ts` | tracked | Next API route | 164 | Next API route exporting GET; inspect auth, validation, Firestore, and observability behavior before edits. |
| `src/app/api/admin/users/[userId]/route.ts` | tracked | Next API route | 180 | Next API route exporting DELETE, GET; inspect auth, validation, Firestore, and observability behavior before edits. |
| `src/app/api/admin/users/route.ts` | tracked | Next API route | 178 | Next API route exporting GET; inspect auth, validation, Firestore, and observability behavior before edits. |
| `src/app/api/ai-chat/route.ts` | tracked | Next API route | 164 | Next API route exporting POST; inspect auth, validation, Firestore, and observability behavior before edits. |
| `src/app/api/alerts/create-issue/route.ts` | tracked | Next API route | 99 | Next API route exporting POST; inspect auth, validation, Firestore, and observability behavior before edits. |
| `src/app/api/alerts/discord-forward/route.ts` | tracked | Next API route | 133 | Next API route exporting POST; inspect auth, validation, Firestore, and observability behavior before edits. |
| `src/app/api/analyze-expense/route.ts` | tracked | Next API route | 382 | Next API route exporting POST, GET; inspect auth, validation, Firestore, and observability behavior before edits. |
| `src/app/api/auth/passkey/authenticate/start/route.ts` | tracked | Next API route | 55 | Next API route exporting POST; inspect auth, validation, Firestore, and observability behavior before edits. |
| `src/app/api/auth/passkey/authenticate/verify/route.ts` | tracked | Next API route | 175 | Next API route exporting POST; inspect auth, validation, Firestore, and observability behavior before edits. |
| `src/app/api/auth/passkey/delete/route.ts` | tracked | Next API route | 87 | Next API route exporting DELETE; inspect auth, validation, Firestore, and observability behavior before edits. |
| `src/app/api/auth/passkey/list/route.ts` | tracked | Next API route | 75 | Next API route exporting GET; inspect auth, validation, Firestore, and observability behavior before edits. |
| `src/app/api/auth/passkey/register/start/route.ts` | tracked | Next API route | 53 | Next API route exporting POST; inspect auth, validation, Firestore, and observability behavior before edits. |
| `src/app/api/auth/passkey/register/verify/route.ts` | tracked | Next API route | 104 | Next API route exporting POST; inspect auth, validation, Firestore, and observability behavior before edits. |
| `src/app/api/auth/session/create/route.ts` | tracked | Next API route | 89 | Next API route exporting POST, DELETE; inspect auth, validation, Firestore, and observability behavior before edits. |
| `src/app/api/budgets/group/[id]/route.ts` | tracked | Next API route | 236 | Next API route exporting GET, PUT, DELETE; inspect auth, validation, Firestore, and observability behavior before edits. |
| `src/app/api/budgets/group/route.ts` | tracked | Next API route | 210 | Next API route exporting GET, POST; inspect auth, validation, Firestore, and observability behavior before edits. |
| `src/app/api/budgets/personal/[id]/route.ts` | tracked | Next API route | 201 | Next API route exporting GET, PUT, DELETE; inspect auth, validation, Firestore, and observability behavior before edits. |
| `src/app/api/budgets/personal/route.ts` | tracked | Next API route | 145 | Next API route exporting GET, POST; inspect auth, validation, Firestore, and observability behavior before edits. |
| `src/app/api/budgets/usage/group/[groupId]/route.ts` | tracked | Next API route | 165 | Next API route exporting GET; inspect auth, validation, Firestore, and observability behavior before edits. |
| `src/app/api/budgets/usage/personal/route.ts` | tracked | Next API route | 148 | Next API route exporting GET; inspect auth, validation, Firestore, and observability behavior before edits. |
| `src/app/api/conversations/[conversationId]/generate-title/route.ts` | tracked | Next API route | 153 | Next API route exporting POST; inspect auth, validation, Firestore, and observability behavior before edits. |
| `src/app/api/conversations/[conversationId]/messages/route.ts` | tracked | Next API route | 191 | Next API route exporting GET, POST; inspect auth, validation, Firestore, and observability behavior before edits. |
| `src/app/api/conversations/[conversationId]/route.ts` | tracked | Next API route | 223 | Next API route exporting GET, PATCH, DELETE; inspect auth, validation, Firestore, and observability behavior before edits. |
| `src/app/api/conversations/route.ts` | tracked | Next API route | 145 | Next API route exporting GET, POST; inspect auth, validation, Firestore, and observability behavior before edits. |
| `src/app/api/cron/store-metrics/route.ts` | tracked | Next API route | 81 | Next API route exporting GET; inspect auth, validation, Firestore, and observability behavior before edits. |
| `src/app/api/expenses/[id]/route.ts` | tracked | Next API route | 299 | Next API route exporting DELETE, PUT, PATCH; inspect auth, validation, Firestore, and observability behavior before edits. |
| `src/app/api/expenses/route.ts` | tracked | Next API route | 431 | Next API route exporting POST, GET; inspect auth, validation, Firestore, and observability behavior before edits. |
| `src/app/api/groups/[groupId]/archive/route.ts` | tracked | Next API route | 84 | Next API route exporting POST; inspect auth, validation, Firestore, and observability behavior before edits. |
| `src/app/api/groups/[groupId]/leave/route.ts` | tracked | Next API route | 161 | Next API route exporting POST; inspect auth, validation, Firestore, and observability behavior before edits. |
| `src/app/api/groups/[groupId]/members/[memberId]/route.ts` | tracked | Next API route | 525 | Next API route exporting PATCH, PUT, DELETE; inspect auth, validation, Firestore, and observability behavior before edits. |
| `src/app/api/groups/[groupId]/members/route.ts` | tracked | Next API route | 301 | Next API route exporting GET, POST; inspect auth, validation, Firestore, and observability behavior before edits. |
| `src/app/api/groups/[groupId]/route.ts` | tracked | Next API route | 407 | Next API route exporting GET, PATCH, PUT, DELETE; inspect auth, validation, Firestore, and observability behavior before edits. |
| `src/app/api/groups/invitations/accept/route.ts` | tracked | Next API route | 221 | Next API route exporting POST; inspect auth, validation, Firestore, and observability behavior before edits. |
| `src/app/api/groups/route.ts` | tracked | Next API route | 197 | Next API route exporting GET, POST; inspect auth, validation, Firestore, and observability behavior before edits. |
| `src/app/api/healthz/__tests__/route.test.ts` | tracked | TypeScript module | 30 | TypeScript module. |
| `src/app/api/healthz/route.ts` | tracked | Next API route | 22 | Next API route exporting GET; inspect auth, validation, Firestore, and observability behavior before edits. |
| `src/app/api/privacy/delete-my-data/route.ts` | tracked | Next API route | 139 | Next API route exporting POST; inspect auth, validation, Firestore, and observability behavior before edits. |
| `src/app/api/user/default-group/route.ts` | tracked | Next API route | 140 | Next API route exporting GET, POST, DELETE; inspect auth, validation, Firestore, and observability behavior before edits. |

## src/app

Files: 34.

| Path | Git | Kind | Lines | Notes |
| --- | --- | --- | ---: | --- |
| `src/app/account/delete/page.tsx` | tracked | Next page | 105 | Next App Router page component; symbols: DeleteAccountPage, metadata. |
| `src/app/admin-console/login/page.tsx` | tracked | Next page | 122 | Next App Router page component; symbols: AdminLoginPage. |
| `src/app/admin-console/page.tsx` | tracked | Next page | 1279 | Next App Router page component; symbols: AdminConsolePage, calls, invocations. |
| `src/app/analytics/page.tsx` | tracked | Next page | 302 | Next App Router page component; symbols: AnalyticsPage. |
| `src/app/budgets/layout.tsx` | tracked | Next layout | 9 | Next App Router layout component; symbols: BudgetsLayout. |
| `src/app/budgets/page.tsx` | tracked | Next page | 948 | Next App Router page component; symbols: BudgetsPage, BudgetsPageContent. |
| `src/app/dashboard/layout.tsx` | tracked | Next layout | 9 | Next App Router layout component; symbols: DashboardLayout. |
| `src/app/dashboard/page.tsx` | tracked | Next page | 772 | Next App Router page component; symbols: DashboardPage. |
| `src/app/favicon.ico` | tracked | binary asset | - | Binary ICO file; 25931 bytes; inspect visually when task touches assets. |
| `src/app/finances/page.tsx` | tracked | Next page | 385 | Next App Router page component; symbols: FinancesPage. |
| `src/app/forgot-password/page.tsx` | tracked | Next page | 183 | Next App Router page component; symbols: ForgotPasswordPage. |
| `src/app/globals.css` | tracked | stylesheet | 247 | Stylesheet for global or component-level styling. |
| `src/app/groups/[id]/income/page.tsx` | tracked | Next page | 368 | Next App Router page component; symbols: GroupIncomePage. |
| `src/app/groups/[id]/members/page.tsx` | tracked | Next page | 590 | Next App Router page component; symbols: MembersPage. |
| `src/app/groups/[id]/page.tsx` | tracked | Next page | 473 | Next App Router page component; symbols: GroupDetailPage. |
| `src/app/groups/[id]/savings/page.tsx` | tracked | Next page | 419 | Next App Router page component; symbols: GroupSavingsPage. |
| `src/app/groups/[id]/settings/page.tsx` | tracked | Next page | 719 | Next App Router page component; symbols: GroupSettingsPage. |
| `src/app/groups/layout.tsx` | tracked | Next layout | 9 | Next App Router layout component; symbols: GroupsLayout. |
| `src/app/groups/page.tsx` | tracked | Next page | 149 | Next App Router page component; symbols: GroupsPage. |
| `src/app/income/layout.tsx` | tracked | Next layout | 9 | Next App Router layout component; symbols: IncomeLayout. |
| `src/app/income/page.tsx` | tracked | Next page | 309 | Next App Router page component; symbols: IncomePage. |
| `src/app/layout.tsx` | tracked | Next layout | 83 | Next App Router layout component; symbols: RootLayout, metadata, viewport. |
| `src/app/login/page.tsx` | tracked | Next page | 337 | Next App Router page component; symbols: LoginPage, LoginForm. |
| `src/app/page.tsx` | tracked | Next page | 829 | Next App Router page component; symbols: Home. |
| `src/app/privacy/data-processors/page.tsx` | tracked | Next page | 116 | Next App Router page component; symbols: DataProcessorsPage, metadata. |
| `src/app/privacy/page.tsx` | tracked | Next page | 67 | Next App Router page component; symbols: PrivacyPolicy. |
| `src/app/profile/page.tsx` | tracked | Next page | 171 | Next App Router page component; symbols: ProfilePage. |
| `src/app/reset-password/page.tsx` | tracked | Next page | 333 | Next App Router page component; symbols: ResetPasswordPage, ResetPasswordForm. |
| `src/app/savings/layout.tsx` | tracked | Next layout | 9 | Next App Router layout component; symbols: SavingsLayout. |
| `src/app/savings/page.tsx` | tracked | Next page | 349 | Next App Router page component; symbols: SavingsPage. |
| `src/app/settings/notifications/page.tsx` | tracked | Next page | 386 | Next App Router page component; symbols: NotificationSettingsPage. |
| `src/app/signup/page.tsx` | tracked | Next page | 267 | Next App Router page component; symbols: SignUpPage. |
| `src/app/support/page.tsx` | tracked | Next page | 574 | Next App Router page component; symbols: SupportPage, IconRocket, IconReceipt, IconChart, IconShield, IconUsers. |
| `src/app/test-nav/page.tsx` | tracked | Next page | 99 | Next App Router page component; symbols: TestNavigationPage. |

## src/components

Files: 94.

| Path | Git | Kind | Lines | Notes |
| --- | --- | --- | ---: | --- |
| `src/components/allocation/AllocationPreview.tsx` | tracked | React component/module | 157 | React/TSX module; symbols: AllocationPreview. |
| `src/components/allocation/AllocationStatusBadge.tsx` | tracked | React component/module | 65 | React/TSX module; symbols: AllocationStatusBadge. |
| `src/components/allocation/AllocationWarningDialog.tsx` | tracked | React component/module | 133 | React/TSX module; symbols: AllocationWarningDialog. |
| `src/components/allocation/IncomeReductionWarning.tsx` | tracked | React component/module | 97 | React/TSX module; symbols: IncomeReductionWarning. |
| `src/components/app-layout.tsx` | tracked | React component/module | 361 | React/TSX module; symbols: AppLayout. |
| `src/components/auth-guard.tsx` | tracked | React component/module | 66 | React/TSX module; symbols: AuthGuard. |
| `src/components/budgets/BudgetCard.tsx` | tracked | React component/module | 141 | React/TSX module; symbols: BudgetCard. |
| `src/components/budgets/BudgetImpactPreview.tsx` | tracked | React component/module | 232 | React/TSX module; symbols: BudgetImpactPreview. |
| `src/components/budgets/BudgetProgressBar.tsx` | tracked | React component/module | 79 | React/TSX module; symbols: BudgetProgressBar. |
| `src/components/budgets/BudgetStatusBadge.tsx` | tracked | React component/module | 86 | React/TSX module; symbols: BudgetStatusBadge. |
| `src/components/budgets/BudgetWidget.tsx` | tracked | React component/module | 252 | React/TSX module; symbols: BudgetWidget. |
| `src/components/budgets/OverBudgetWarningModal.tsx` | tracked | React component/module | 116 | React/TSX module; symbols: OverBudgetWarningModal. |
| `src/components/budgets/index.ts` | tracked | TypeScript module | 6 | TypeScript module. |
| `src/components/chat-input.tsx` | tracked | React component/module | 247 | React/TSX module; symbols: ChatInput. |
| `src/components/chat/conversation-card.tsx` | tracked | React component/module | 147 | React/TSX module; symbols: ConversationCard. |
| `src/components/chat/conversation-drawer.tsx` | tracked | React component/module | 275 | React/TSX module; symbols: ConversationDrawer, getDateGroup. |
| `src/components/chat/conversation-header.tsx` | tracked | React component/module | 112 | React/TSX module; symbols: ConversationHeader. |
| `src/components/chat/conversation-sidebar.tsx` | tracked | React component/module | 248 | React/TSX module; symbols: ConversationSidebar, getDateGroup. |
| `src/components/chat/empty-conversation.tsx` | tracked | React component/module | 168 | React/TSX module; symbols: EmptyConversation. |
| `src/components/dashboard/category-filter.tsx` | tracked | React component/module | 174 | React/TSX module; symbols: CategoryFilter, CategoryFilterProps. |
| `src/components/dashboard/category-pie-chart.tsx` | tracked | React component/module | 178 | React/TSX module; symbols: CategoryPieChart. |
| `src/components/dashboard/date-range-picker.tsx` | tracked | React component/module | 190 | React/TSX module; symbols: DateRangePicker, DateRangePickerProps. |
| `src/components/dashboard/expense-list-view.tsx` | tracked | React component/module | 519 | React/TSX module; symbols: ExpenseListView. |
| `src/components/dashboard/export-data.tsx` | tracked | React component/module | 220 | React/TSX module; symbols: ExportData, ExportDataProps. |
| `src/components/dashboard/index.ts` | tracked | TypeScript module | 5 | TypeScript module. |
| `src/components/dashboard/view-expense-modal.tsx` | tracked | React component/module | 223 | React/TSX module; symbols: ViewExpenseModal. |
| `src/components/dev-tools.tsx` | tracked | React component/module | 191 | React/TSX module; symbols: DevTools. |
| `src/components/expense-confirmation-card.tsx` | tracked | React component/module | 489 | React/TSX module; symbols: ExpenseConfirmationCard, to. |
| `src/components/finances/ContextSelector.tsx` | tracked | React component/module | 173 | React/TSX module; symbols: ContextSelector, FinancialContext. |
| `src/components/finances/FinancialSectionCard.tsx` | tracked | React component/module | 112 | React/TSX module; symbols: FinancialSectionCard. |
| `src/components/groups/create-group-dialog.tsx` | tracked | React component/module | 206 | React/TSX module; symbols: CreateGroupDialog. |
| `src/components/groups/group-invitations.tsx` | tracked | React component/module | 156 | React/TSX module; symbols: GroupInvitations. |
| `src/components/groups/group-selector.tsx` | tracked | React component/module | 93 | React/TSX module; symbols: GroupSelector. |
| `src/components/groups/index.ts` | tracked | TypeScript module | 5 | TypeScript module. |
| `src/components/groups/invite-member-dialog.tsx` | tracked | React component/module | 215 | React/TSX module; symbols: InviteMemberDialog. |
| `src/components/income/AIRecommendations.tsx` | tracked | React component/module | 322 | React/TSX module; symbols: AIRecommendations. |
| `src/components/income/AllocationSummary.tsx` | tracked | React component/module | 243 | React/TSX module; symbols: AllocationSummary. |
| `src/components/income/GroupIncomeForm.tsx` | tracked | React component/module | 293 | React/TSX module; symbols: GroupIncomeForm. |
| `src/components/income/IncomeSourceCard.tsx` | tracked | React component/module | 240 | React/TSX module; symbols: IncomeSourceCard. |
| `src/components/income/IncomeSourceForm.tsx` | tracked | React component/module | 291 | React/TSX module; symbols: IncomeSourceForm. |
| `src/components/income/MonthlySetupWizard.tsx` | tracked | React component/module | 568 | React/TSX module; symbols: MonthlySetupWizard, MonthlySetupData. |
| `src/components/message-list.tsx` | tracked | React component/module | 249 | React/TSX module; symbols: MessageList. |
| `src/components/mobile-first/CompactStatCard.tsx` | tracked | React component/module | 44 | React/TSX module; symbols: CompactStatCard. |
| `src/components/mobile-first/MobilePageHeader.tsx` | tracked | React component/module | 95 | React/TSX module; symbols: MobilePageHeader. |
| `src/components/mobile-first/index.ts` | tracked | TypeScript module | 3 | TypeScript module. |
| `src/components/notifications/notification-bell.tsx` | tracked | React component/module | 51 | React/TSX module; symbols: NotificationBell. |
| `src/components/notifications/notification-panel.tsx` | tracked | React component/module | 389 | React/TSX module; symbols: NotificationPanel, NotificationItem, GroupedNotificationItem. |
| `src/components/observability/ConsentBanner.tsx` | tracked | React component/module | 67 | React/TSX module; symbols: ConsentBanner. |
| `src/components/observability/ErrorBoundary.tsx` | tracked | React component/module | 55 | React/TSX module; symbols: ErrorBoundary. |
| `src/components/observability/PostHogProvider.tsx` | tracked | React component/module | 26 | React/TSX module; symbols: PostHogProvider. |
| `src/components/observability/SentryUserBoundary.tsx` | tracked | React component/module | 11 | React/TSX module; symbols: SentryUserBoundary. |
| `src/components/observability/__tests__/ConsentBanner.test.tsx` | tracked | React component/module | 53 | React/TSX module. |
| `src/components/observability/__tests__/ErrorBoundary.test.tsx` | tracked | React component/module | 61 | React/TSX module. |
| `src/components/passkey-management.tsx` | tracked | React component/module | 256 | React/TSX module; symbols: PasskeyManagement. |
| `src/components/receipt/ReceiptDisplay.tsx` | tracked | React component/module | 52 | React/TSX module; symbols: ReceiptDisplay. |
| `src/components/receipt/ReceiptImageViewer.tsx` | tracked | React component/module | 238 | React/TSX module; symbols: ReceiptImageViewer. |
| `src/components/receipt/index.ts` | tracked | TypeScript module | 3 | TypeScript module. |
| `src/components/savings/GroupSavingsForm.tsx` | tracked | React component/module | 377 | React/TSX module; symbols: GroupSavingsForm. |
| `src/components/savings/SavingsGoalCard.tsx` | tracked | React component/module | 311 | React/TSX module; symbols: SavingsGoalCard. |
| `src/components/savings/SavingsGoalForm.tsx` | tracked | React component/module | 349 | React/TSX module; symbols: SavingsGoalForm. |
| `src/components/theme-provider.tsx` | tracked | React component/module | 10 | React/TSX module; symbols: ThemeProvider. |
| `src/components/ui/alert-dialog.tsx` | tracked | React component/module | 157 | React/TSX module; symbols: AlertDialog, AlertDialogTrigger, AlertDialogPortal, AlertDialogOverlay, AlertDialogContent, AlertDialogHeader. |
| `src/components/ui/alert.tsx` | tracked | React component/module | 66 | React/TSX module; symbols: Alert, AlertTitle, AlertDescription. |
| `src/components/ui/avatar.tsx` | tracked | React component/module | 53 | React/TSX module; symbols: Avatar, AvatarImage, AvatarFallback. |
| `src/components/ui/badge.tsx` | tracked | React component/module | 46 | React/TSX module; symbols: Badge. |
| `src/components/ui/bottom-sheet.tsx` | tracked | React component/module | 121 | React/TSX module. |
| `src/components/ui/button.tsx` | tracked | React component/module | 60 | React/TSX module; symbols: Button. |
| `src/components/ui/calendar.tsx` | tracked | React component/module | 213 | React/TSX module; symbols: Calendar, CalendarDayButton. |
| `src/components/ui/card.tsx` | tracked | React component/module | 92 | React/TSX module; symbols: Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent. |
| `src/components/ui/checkbox-indeterminate.tsx` | tracked | React component/module | 43 | React/TSX module; symbols: IndeterminateCheckboxProps. |
| `src/components/ui/checkbox.tsx` | tracked | React component/module | 32 | React/TSX module; symbols: Checkbox. |
| `src/components/ui/command.tsx` | tracked | React component/module | 184 | React/TSX module; symbols: Command, CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup. |
| `src/components/ui/confirm-dialog.tsx` | tracked | React component/module | 103 | React/TSX module; symbols: ConfirmDialog, ConfirmDialogVariant. |
| `src/components/ui/dialog.tsx` | tracked | React component/module | 143 | React/TSX module; symbols: Dialog, DialogTrigger, DialogPortal, DialogClose, DialogOverlay, DialogContent. |
| `src/components/ui/dropdown-menu.tsx` | tracked | React component/module | 257 | React/TSX module; symbols: DropdownMenu, DropdownMenuPortal, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem. |
| `src/components/ui/empty-state.tsx` | tracked | React component/module | 39 | React/TSX module; symbols: EmptyState. |
| `src/components/ui/form.tsx` | tracked | React component/module | 167 | React/TSX module; symbols: FormItem, FormLabel, FormControl, FormDescription, FormMessage. |
| `src/components/ui/gradient-button.tsx` | tracked | React component/module | 29 | React/TSX module; symbols: GradientButton, GradientButtonProps. |
| `src/components/ui/input.tsx` | tracked | React component/module | 21 | React/TSX module; symbols: Input. |
| `src/components/ui/label.tsx` | tracked | React component/module | 24 | React/TSX module; symbols: Label. |
| `src/components/ui/page-container.tsx` | tracked | React component/module | 36 | React/TSX module; symbols: PageContainer. |
| `src/components/ui/page-header.tsx` | tracked | React component/module | 45 | React/TSX module; symbols: PageHeader. |
| `src/components/ui/popover.tsx` | tracked | React component/module | 48 | React/TSX module; symbols: Popover, PopoverTrigger, PopoverContent, PopoverAnchor. |
| `src/components/ui/progress.tsx` | tracked | React component/module | 29 | React/TSX module. |
| `src/components/ui/scroll-area.tsx` | tracked | React component/module | 58 | React/TSX module; symbols: ScrollArea, ScrollBar. |
| `src/components/ui/select.tsx` | tracked | React component/module | 187 | React/TSX module; symbols: Select, SelectGroup, SelectValue, SelectTrigger, SelectContent, SelectLabel. |
| `src/components/ui/separator.tsx` | tracked | React component/module | 28 | React/TSX module; symbols: Separator. |
| `src/components/ui/sheet.tsx` | tracked | React component/module | 139 | React/TSX module; symbols: Sheet, SheetTrigger, SheetClose, SheetPortal, SheetOverlay, SheetContent. |
| `src/components/ui/skeleton.tsx` | tracked | React component/module | 16 | React/TSX module; symbols: Skeleton. |
| `src/components/ui/stat-card.tsx` | tracked | React component/module | 65 | React/TSX module; symbols: StatCard. |
| `src/components/ui/switch.tsx` | tracked | React component/module | 31 | React/TSX module; symbols: Switch. |
| `src/components/ui/table.tsx` | tracked | React component/module | 116 | React/TSX module; symbols: Table, TableHeader, TableBody, TableFooter, TableRow, TableHead. |
| `src/components/ui/tabs.tsx` | tracked | React component/module | 66 | React/TSX module; symbols: Tabs, TabsList, TabsTrigger, TabsContent. |
| `src/components/ui/textarea.tsx` | tracked | React component/module | 18 | React/TSX module; symbols: Textarea. |

## src/hooks

Files: 27.

| Path | Git | Kind | Lines | Notes |
| --- | --- | --- | ---: | --- |
| `src/hooks/useAuth.ts` | tracked | TypeScript module | 70 | TypeScript module; symbols: useAuth. |
| `src/hooks/useBudgetManagement.ts` | tracked | TypeScript module | 293 | TypeScript module; symbols: useBudgetManagement. |
| `src/hooks/useBudgetUsage.ts` | tracked | TypeScript module | 80 | TypeScript module; symbols: useBudgetUsage, const. |
| `src/hooks/useConfirm.tsx` | tracked | React component/module | 63 | React/TSX module; symbols: useConfirm. |
| `src/hooks/useConversation.ts` | tracked | TypeScript module | 179 | TypeScript module; symbols: useConversation. |
| `src/hooks/useConversationHistory.ts` | tracked | TypeScript module | 182 | TypeScript module; symbols: useConversationHistory. |
| `src/hooks/useConversations.ts` | tracked | TypeScript module | 153 | TypeScript module; symbols: useConversations. |
| `src/hooks/useDefaultGroup.ts` | tracked | TypeScript module | 115 | TypeScript module; symbols: useDefaultGroup. |
| `src/hooks/useExpenses.ts` | tracked | TypeScript module | 248 | TypeScript module; symbols: useExpenses. |
| `src/hooks/useGroupBudgets.ts` | tracked | TypeScript module | 94 | TypeScript module; symbols: useGroupBudgets. |
| `src/hooks/useGroupExpenses.ts` | tracked | TypeScript module | 64 | TypeScript module; symbols: useGroupExpenses. |
| `src/hooks/useGroupInvitations.ts` | tracked | TypeScript module | 171 | TypeScript module; symbols: useGroupInvitations. |
| `src/hooks/useGroupMembers.ts` | tracked | TypeScript module | 196 | TypeScript module; symbols: useGroupMembers. |
| `src/hooks/useGroupStats.ts` | tracked | TypeScript module | 44 | TypeScript module; symbols: useGroupStats. |
| `src/hooks/useGroups.ts` | tracked | TypeScript module | 228 | TypeScript module; symbols: useGroups, GroupWithRole. |
| `src/hooks/useIncome.ts` | tracked | TypeScript module | 166 | TypeScript module; symbols: useIncome, useIncomeSource. |
| `src/hooks/useIncomeAllocation.ts` | tracked | TypeScript module | 222 | TypeScript module; symbols: useIncomeAllocation, useGroupIncomeAllocation, const. |
| `src/hooks/useIncomeAnalytics.ts` | tracked | TypeScript module | 98 | TypeScript module; symbols: useIncomeAnalytics. |
| `src/hooks/useNotificationActions.ts` | tracked | TypeScript module | 217 | TypeScript module; symbols: useNotificationActions. |
| `src/hooks/useNotificationPreferences.ts` | tracked | TypeScript module | 206 | TypeScript module; symbols: useNotificationPreferences, to, shouldSendNotification. |
| `src/hooks/useNotifications.ts` | tracked | TypeScript module | 237 | TypeScript module; symbols: useNotifications, useUnreadNotificationCount. |
| `src/hooks/useOfflineSync.ts` | tracked | TypeScript module | 390 | TypeScript module; symbols: useOfflineSync. |
| `src/hooks/usePasskey.ts` | tracked | TypeScript module | 290 | TypeScript module; symbols: usePasskey. |
| `src/hooks/usePersonalBudgets.ts` | tracked | TypeScript module | 86 | TypeScript module; symbols: usePersonalBudgets. |
| `src/hooks/useSavingsAnalytics.ts` | tracked | TypeScript module | 119 | TypeScript module; symbols: useSavingsAnalytics. |
| `src/hooks/useSavingsGoals.ts` | tracked | TypeScript module | 227 | TypeScript module; symbols: useSavingsGoals, useSavingsGoal. |
| `src/hooks/useSentryUser.ts` | tracked | TypeScript module | 18 | TypeScript module; symbols: useSentryUser. |

## src/lib

Files: 50.

| Path | Git | Kind | Lines | Notes |
| --- | --- | --- | ---: | --- |
| `src/lib/__tests__/admin-auth.test.ts` | tracked | TypeScript module | 74 | TypeScript module; symbols: mk. |
| `src/lib/admin-auth.ts` | tracked | TypeScript module | 186 | TypeScript module; symbols: verifyAdminCredentials, createAdminSession, verifyAdminSession, AdminAuthError, AdminAuthInfo, setAdminSessionCookie. |
| `src/lib/ai-functions/index.ts` | tracked | TypeScript module | 453 | TypeScript module; symbols: fetches, getBudgetStatus, getExpenseSummary, getCategoryBreakdown, getGroupExpenses, searchExpenses. |
| `src/lib/auth-middleware.ts` | tracked | TypeScript module | 37 | TypeScript module; symbols: getAuthenticatedUserId. |
| `src/lib/budgetCalculations.ts` | tracked | TypeScript module | 437 | TypeScript module; symbols: getCurrentPeriod, isInPeriod, getPeriodBounds, getDaysInMonth, getCurrentDayOfMonth, getBudgetStatus. |
| `src/lib/categories.ts` | tracked | TypeScript module | 122 | TypeScript module; symbols: getCategoryGroup, expenseCategories, categoryGroups, ExpenseCategory, to. |
| `src/lib/db.ts` | tracked | TypeScript module | 48 | TypeScript module; symbols: db, PendingExpenseRequest, OfflineExpense, PennyDatabase. |
| `src/lib/firebase-admin.ts` | tracked | TypeScript module | 51 | TypeScript module; symbols: initializeFirebaseAdmin. |
| `src/lib/firebase.ts` | tracked | TypeScript module | 25 | TypeScript module; symbols: auth, db, storage. |
| `src/lib/gemini-functions.ts` | tracked | TypeScript module | 279 | TypeScript module; symbols: GEMINI_FUNCTIONS, BudgetStatusParams, ExpenseSummaryParams, CategoryBreakdownParams, GroupExpensesParams, SearchExpensesParams. |
| `src/lib/groupMatching.ts` | tracked | TypeScript module | 120 | TypeScript module; symbols: findMatchingGroup, findMatchingGroups, validateGroupId, similarity, levenshteinDistance. |
| `src/lib/imageOptimization.ts` | tracked | TypeScript module | 216 | TypeScript module; symbols: isValidImageFile, formatFileSize, blobToFile, generateReceiptFileName, ImageOptimizationOptions, OptimizedImage. |
| `src/lib/observability/__tests__/analytics.test.ts` | tracked | TypeScript module | 70 | TypeScript module. |
| `src/lib/observability/__tests__/consent.test.ts` | tracked | TypeScript module | 34 | TypeScript module. |
| `src/lib/observability/__tests__/env.test.ts` | tracked | TypeScript module | 110 | TypeScript module. |
| `src/lib/observability/__tests__/errors.test.ts` | tracked | TypeScript module | 50 | TypeScript module. |
| `src/lib/observability/__tests__/logger.test.ts` | tracked | TypeScript module | 29 | TypeScript module. |
| `src/lib/observability/__tests__/requestId.test.ts` | tracked | TypeScript module | 28 | TypeScript module. |
| `src/lib/observability/__tests__/withObservability.test.ts` | tracked | TypeScript module | 66 | TypeScript module. |
| `src/lib/observability/analytics.ts` | tracked | TypeScript module | 61 | TypeScript module; symbols: track, __testing__, TrackableEvent, stripPII. |
| `src/lib/observability/axiomShip.ts` | tracked | TypeScript module | 63 | TypeScript module; symbols: shipToAxiom, AxiomLogEntry, getConfig. |
| `src/lib/observability/consent.ts` | tracked | TypeScript module | 28 | TypeScript module; symbols: getConsentState, setConsentState, isConsentGiven, CONSENT_COOKIE, ConsentState. |
| `src/lib/observability/env.ts` | tracked | TypeScript module | 51 | TypeScript module; symbols: isObservabilityEnabled, getObservabilityEnv, getSentryDsn, getSentryAuthToken, getSentryOrg, getSentryProject. |
| `src/lib/observability/errors.ts` | tracked | TypeScript module | 40 | TypeScript module; symbols: classifyError, reportError, ErrorClass, ErrorContext. |
| `src/lib/observability/featureFlags.ts` | tracked | TypeScript module | 29 | TypeScript module; symbols: isFeatureEnabled, getFeatureFlagVariant, KnownFlag. |
| `src/lib/observability/logger.ts` | tracked | TypeScript module | 41 | TypeScript module; symbols: createLogger. |
| `src/lib/observability/posthog.ts` | tracked | TypeScript module | 67 | TypeScript module; symbols: initPostHog, identifyUser, resetUser, onConsentChange. |
| `src/lib/observability/requestId.ts` | tracked | TypeScript module | 11 | TypeScript module; symbols: generateRequestId, extractRequestId, REQUEST_ID_HEADER. |
| `src/lib/observability/withObservability.ts` | tracked | TypeScript module | 101 | TypeScript module; symbols: withObservability, ObservabilityContext, serializeError. |
| `src/lib/passkey-config.ts` | tracked | TypeScript module | 76 | TypeScript module; symbols: getRPID, getOrigin, getRPName, getPasskeyConfig. |
| `src/lib/passkey-utils.ts` | tracked | TypeScript module | 218 | TypeScript module; symbols: getDeviceInfo, isWebAuthnAvailable, generatePasskeyRegistrationOptions, verifyPasskeyRegistration, generatePasskeyAuthenticationOptions, verifyPasskeyAuthentication. |
| `src/lib/services/budgetNotificationService.ts` | tracked | TypeScript module | 383 | TypeScript module; symbols: BudgetNotificationService. |
| `src/lib/services/incomeSavingsNotifications.ts` | tracked | TypeScript module | 260 | TypeScript module; symbols: IncomeSavingsNotificationService. |
| `src/lib/services/incomeService.ts` | tracked | TypeScript module | 415 | TypeScript module; symbols: PersonalIncomeService, GroupIncomeService, IncomeBatchService. |
| `src/lib/services/notificationCleanup.ts` | tracked | TypeScript module | 233 | TypeScript module; symbols: cleanupExpiredNotifications, cleanupExpiredByDate, runFullCleanup, deleteAllUserNotifications, getCleanupStats. |
| `src/lib/services/notificationGrouping.ts` | tracked | TypeScript module | 252 | TypeScript module; symbols: isGroupable, generateGroupKey, findExistingGroup, addToGroup, createGroupNotification, generateGroupTitle. |
| `src/lib/services/notificationService.ts` | tracked | TypeScript module | 424 | TypeScript module; symbols: CreateNotificationData, NotificationService. |
| `src/lib/services/pushService.ts` | tracked | TypeScript module | 179 | TypeScript module; symbols: PushService. |
| `src/lib/services/savingsService.ts` | tracked | TypeScript module | 622 | TypeScript module; symbols: PersonalSavingsGoalService, GroupSavingsGoalService, SavingsContributionService. |
| `src/lib/storageService.ts` | tracked | TypeScript module | 267 | TypeScript module; symbols: extractStoragePath, UploadProgress, UploadResult, uploadReceipt, deleteReceipt, uploadMessageAttachment. |
| `src/lib/store-metrics/appStoreConnect.ts` | tracked | TypeScript module | 77 | TypeScript module; symbols: makeToken, fetchAppStoreMetrics. |
| `src/lib/store-metrics/googlePlay.ts` | tracked | TypeScript module | 63 | TypeScript module; symbols: getAuth, fetchGooglePlayMetrics. |
| `src/lib/types.ts` | tracked | TypeScript module | 578 | TypeScript module; symbols: DEFAULT_ROLE_PERMISSIONS, Expense, ChatMessage, UserProfile, ExpenseSummary, ExpenseFormData. |
| `src/lib/types/income.ts` | tracked | TypeScript module | 260 | TypeScript module; symbols: IncomeCategory, IncomeFrequency, PersonalIncomeSource, GroupIncomeSource, MonthlyIncomeRecord, MonthlySetupStatus. |
| `src/lib/types/notifications.ts` | tracked | TypeScript module | 445 | TypeScript module; symbols: DEFAULT_NOTIFICATION_PREFERENCES, NotificationType, NotificationPriority, NotificationCategory, NotificationFrequency, NotificationAction. |
| `src/lib/types/savings.ts` | tracked | TypeScript module | 245 | TypeScript module; symbols: SAVINGS_CATEGORY_LABELS, SAVINGS_CATEGORY_EMOJIS, SavingsCategory, GoalStatus, GoalPriority, PersonalSavingsGoal. |
| `src/lib/types/store-metrics.ts` | tracked | TypeScript module | 23 | TypeScript module; symbols: StoreRating, StoreReview, StoreMetrics. |
| `src/lib/utils.ts` | tracked | TypeScript module | 6 | TypeScript module; symbols: cn. |
| `src/lib/utils/incomeCalculations.ts` | tracked | TypeScript module | 261 | TypeScript module; symbols: calculateMonthlyIncome, calculateTotalMonthlyIncome, calculateTotalMonthlySavings, calculateAllocationPercentage, calculateSavingsRate, calculateUnallocatedIncome. |
| `src/lib/utils/savingsCalculations.ts` | tracked | TypeScript module | 324 | TypeScript module; symbols: calculateProgressPercentage, calculateMonthsToGoal, isGoalOnTrack, calculateTotalContributions, calculateContributionsByCategory, calculateYTDByCategory. |

## mobile/lib

Files: 104.

| Path | Git | Kind | Lines | Notes |
| --- | --- | --- | ---: | --- |
| `mobile/lib/app.dart` | tracked | Flutter/Dart module | 60 | Flutter/Dart module; symbols: PennyApp. |
| `mobile/lib/core/constants/app_colors.dart` | tracked | Flutter/Dart module | 38 | Flutter/Dart module; symbols: AppColors. |
| `mobile/lib/core/constants/app_spacing.dart` | tracked | Flutter/Dart module | 12 | Flutter/Dart module; symbols: AppSpacing. |
| `mobile/lib/core/constants/categories.dart` | tracked | Flutter/Dart module | 101 | Flutter/Dart module. |
| `mobile/lib/core/constants/env_config.dart` | tracked | Flutter/Dart module | 22 | Flutter/Dart module; symbols: EnvConfig. |
| `mobile/lib/core/constants/notification_types.dart` | tracked | Flutter/Dart module | 134 | Flutter/Dart module; symbols: NotificationType, NotificationCategory. |
| `mobile/lib/core/network/api_client.dart` | tracked | Flutter/Dart module | 59 | Flutter/Dart module; symbols: ApiClient. |
| `mobile/lib/core/network/api_endpoints.dart` | tracked | Flutter/Dart module | 14 | Flutter/Dart module; symbols: ApiEndpoints. |
| `mobile/lib/core/router/app_router.dart` | tracked | Flutter/Dart module | 229 | Flutter/Dart module; symbols: routerProvider. |
| `mobile/lib/core/theme/app_theme.dart` | tracked | Flutter/Dart module | 349 | Flutter/Dart module; symbols: AppTheme. |
| `mobile/lib/core/utils/validators.dart` | tracked | Flutter/Dart module | 37 | Flutter/Dart module; symbols: Validators. |
| `mobile/lib/data/guest/guest_expense_store.dart` | tracked | Flutter/Dart module | 177 | Flutter/Dart module; symbols: GuestAddResult, GuestExpenseNotifier, guestExpenseProvider. |
| `mobile/lib/data/guest/guest_migration_service.dart` | tracked | Flutter/Dart module | 46 | Flutter/Dart module; symbols: GuestMigrationService, _expenseRepoProvider. |
| `mobile/lib/data/guest/guest_sample_data.dart` | tracked | Flutter/Dart module | 343 | Flutter/Dart module. |
| `mobile/lib/data/models/budget_model.dart` | tracked | Flutter/Dart module | 134 | Flutter/Dart module; symbols: BudgetModel, BudgetPeriod, BudgetSettings, BudgetUsage, BudgetStatus. |
| `mobile/lib/data/models/conversation_model.dart` | tracked | Flutter/Dart module | 97 | Flutter/Dart module; symbols: ConversationModel, ConversationMetadata. |
| `mobile/lib/data/models/expense_model.dart` | tracked | Flutter/Dart module | 135 | Flutter/Dart module; symbols: ExpenseModel. |
| `mobile/lib/data/models/group_activity_model.dart` | tracked | Flutter/Dart module | 68 | Flutter/Dart module; symbols: GroupActivityModel. |
| `mobile/lib/data/models/group_income_model.dart` | tracked | Flutter/Dart module | 110 | Flutter/Dart module; symbols: GroupIncomeSourceModel. |
| `mobile/lib/data/models/group_member_model.dart` | tracked | Flutter/Dart module | 117 | Flutter/Dart module; symbols: GroupMemberModel, GroupPermissions. |
| `mobile/lib/data/models/group_model.dart` | tracked | Flutter/Dart module | 109 | Flutter/Dart module; symbols: GroupModel, GroupSettings, GroupStats. |
| `mobile/lib/data/models/group_savings_model.dart` | tracked | Flutter/Dart module | 122 | Flutter/Dart module; symbols: GroupSavingsGoalModel. |
| `mobile/lib/data/models/income_model.dart` | tracked | Flutter/Dart module | 100 | Flutter/Dart module; symbols: IncomeSourceModel. |
| `mobile/lib/data/models/message_model.dart` | tracked | Flutter/Dart module | 127 | Flutter/Dart module; symbols: MessageModel, MessageAttachment, MessageExpenseData. |
| `mobile/lib/data/models/notification_model.dart` | tracked | Flutter/Dart module | 124 | Flutter/Dart module; symbols: NotificationAction, NotificationModel. |
| `mobile/lib/data/models/notification_preferences_model.dart` | tracked | Flutter/Dart module | 132 | Flutter/Dart module; symbols: NotificationTypePreference, NotificationPreferencesModel, NotificationSettingsModel. |
| `mobile/lib/data/models/savings_model.dart` | tracked | Flutter/Dart module | 121 | Flutter/Dart module; symbols: SavingsGoalModel. |
| `mobile/lib/data/repositories/ai_repository.dart` | tracked | Flutter/Dart module | 131 | Flutter/Dart module; symbols: AiRepository, AnalyzeExpenseResult, ParsedExpense. |
| `mobile/lib/data/repositories/budget_repository.dart` | tracked | Flutter/Dart module | 86 | Flutter/Dart module; symbols: BudgetRepository. |
| `mobile/lib/data/repositories/conversation_repository.dart` | tracked | Flutter/Dart module | 176 | Flutter/Dart module; symbols: ConversationRepository. |
| `mobile/lib/data/repositories/expense_repository.dart` | tracked | Flutter/Dart module | 159 | Flutter/Dart module; symbols: ExpenseRepository. |
| `mobile/lib/data/repositories/group_budget_repository.dart` | tracked | Flutter/Dart module | 100 | Flutter/Dart module; symbols: GroupBudgetModel, GroupBudgetRepository. |
| `mobile/lib/data/repositories/group_income_repository.dart` | tracked | Flutter/Dart module | 70 | Flutter/Dart module; symbols: GroupIncomeRepository. |
| `mobile/lib/data/repositories/group_repository.dart` | tracked | Flutter/Dart module | 200 | Flutter/Dart module; symbols: GroupRepository. |
| `mobile/lib/data/repositories/group_savings_repository.dart` | tracked | Flutter/Dart module | 91 | Flutter/Dart module; symbols: GroupSavingsRepository. |
| `mobile/lib/data/repositories/income_repository.dart` | tracked | Flutter/Dart module | 61 | Flutter/Dart module; symbols: IncomeRepository. |
| `mobile/lib/data/repositories/notification_preferences_repository.dart` | tracked | Flutter/Dart module | 87 | Flutter/Dart module; symbols: NotificationPreferencesRepository. |
| `mobile/lib/data/repositories/notification_repository.dart` | tracked | Flutter/Dart module | 50 | Flutter/Dart module; symbols: NotificationRepository. |
| `mobile/lib/data/repositories/savings_repository.dart` | tracked | Flutter/Dart module | 86 | Flutter/Dart module; symbols: SavingsRepository. |
| `mobile/lib/data/services/auth_service.dart` | tracked | Flutter/Dart module | 37 | Flutter/Dart module; symbols: AuthService. |
| `mobile/lib/data/services/biometric_service.dart` | tracked | Flutter/Dart module | 44 | Flutter/Dart module; symbols: BiometricService. |
| `mobile/lib/data/services/duplicate_detector.dart` | tracked | Flutter/Dart module | 165 | Flutter/Dart module; symbols: DuplicateDetector, DuplicateMatchType, DuplicateResult. |
| `mobile/lib/data/services/export_service.dart` | tracked | Flutter/Dart module | 54 | Flutter/Dart module; symbols: ExportService. |
| `mobile/lib/data/services/oauth_service.dart` | tracked | Flutter/Dart module | 124 | Flutter/Dart module; symbols: OAuthService. |
| `mobile/lib/data/services/push_notification_service.dart` | tracked | Flutter/Dart module | 161 | Flutter/Dart module; symbols: PushNotificationService. |
| `mobile/lib/data/services/storage_service.dart` | tracked | Flutter/Dart module | 55 | Flutter/Dart module; symbols: StorageService. |
| `mobile/lib/firebase_options.dart` | tracked | Flutter/Dart module | 49 | Generated, lock, or environment-specific configuration; values intentionally not reproduced in docs. |
| `mobile/lib/main.dart` | tracked | Flutter/Dart module | 62 | Flutter/Dart module. |
| `mobile/lib/presentation/providers/auth_provider.dart` | tracked | Flutter/Dart module | 20 | Flutter/Dart module; symbols: authServiceProvider, oauthServiceProvider, authStateProvider, currentUserProvider. |
| `mobile/lib/presentation/providers/biometric_provider.dart` | tracked | Flutter/Dart module | 39 | Flutter/Dart module; symbols: biometricServiceProvider, biometricAvailableProvider, hasLoggedInBeforeProvider. |
| `mobile/lib/presentation/providers/budget_providers.dart` | tracked | Flutter/Dart module | 48 | Flutter/Dart module; symbols: budgetPeriodProvider, budgetsProvider, budgetUsageProvider, totalBudgetLimitProvider, totalBudgetSpentProvider. |
| `mobile/lib/presentation/providers/chat_provider.dart` | tracked | Flutter/Dart module | 267 | Flutter/Dart module; symbols: ChatState, ChatNotifier, messagesProvider, chatProvider. |
| `mobile/lib/presentation/providers/expense_providers.dart` | tracked | Flutter/Dart module | 266 | Flutter/Dart module; symbols: DashboardPeriod, ExpenseTypeFilter, ExpenseFilter, CategoryBreakdown, DailySpending. |
| `mobile/lib/presentation/providers/group_budget_providers.dart` | tracked | Flutter/Dart module | 22 | Flutter/Dart module; symbols: groupBudgetRepositoryProvider, groupBudgetsProvider, totalGroupBudgetLimitProvider. |
| `mobile/lib/presentation/providers/group_income_providers.dart` | tracked | Flutter/Dart module | 20 | Flutter/Dart module; symbols: groupIncomeSourcesProvider, totalGroupMonthlyIncomeProvider. |
| `mobile/lib/presentation/providers/group_providers.dart` | tracked | Flutter/Dart module | 67 | Flutter/Dart module; symbols: userGroupsProvider, groupMembersProvider, groupExpensesProvider, currentUserMembershipProvider, groupByIdProvider. |
| `mobile/lib/presentation/providers/group_savings_providers.dart` | tracked | Flutter/Dart module | 28 | Flutter/Dart module; symbols: groupSavingsGoalsProvider, groupTotalSavedProvider, groupTotalTargetProvider. |
| `mobile/lib/presentation/providers/guest_provider.dart` | tracked | Flutter/Dart module | 15 | Flutter/Dart module; symbols: guestModeProvider. |
| `mobile/lib/presentation/providers/income_providers.dart` | tracked | Flutter/Dart module | 34 | Flutter/Dart module; symbols: incomeSourcesProvider, activeIncomeSourcesProvider, totalMonthlyIncomeProvider. |
| `mobile/lib/presentation/providers/notification_preferences_providers.dart` | tracked | Flutter/Dart module | 30 | Flutter/Dart module; symbols: notificationPreferencesRepoProvider, notificationSettingsProvider, notificationTypePrefsProvider. |
| `mobile/lib/presentation/providers/notification_providers.dart` | tracked | Flutter/Dart module | 19 | Flutter/Dart module; symbols: notificationsProvider, unreadCountProvider. |
| `mobile/lib/presentation/providers/providers.dart` | tracked | Flutter/Dart module | 109 | Flutter/Dart module; symbols: apiClientProvider, aiRepositoryProvider, conversationRepositoryProvider, expenseRepositoryProvider, budgetRepositoryProvider. |
| `mobile/lib/presentation/providers/savings_providers.dart` | tracked | Flutter/Dart module | 26 | Flutter/Dart module; symbols: savingsGoalsProvider, totalSavedProvider, totalTargetProvider. |
| `mobile/lib/presentation/providers/theme_provider.dart` | tracked | Flutter/Dart module | 32 | Flutter/Dart module; symbols: ThemeModeNotifier, themeModeProvider. |
| `mobile/lib/presentation/screens/auth/forgot_password_screen.dart` | tracked | Flutter/Dart module | 226 | Flutter/Dart module; symbols: ForgotPasswordScreen. |
| `mobile/lib/presentation/screens/auth/login_screen.dart` | tracked | Flutter/Dart module | 439 | Flutter/Dart module; symbols: LoginScreen. |
| `mobile/lib/presentation/screens/auth/signup_screen.dart` | tracked | Flutter/Dart module | 269 | Flutter/Dart module; symbols: SignupScreen. |
| `mobile/lib/presentation/screens/budgets/budgets_screen.dart` | tracked | Flutter/Dart module | 854 | Flutter/Dart module; symbols: BudgetsScreen. |
| `mobile/lib/presentation/screens/dashboard/dashboard_screen.dart` | tracked | Flutter/Dart module | 1358 | Flutter/Dart module; symbols: DashboardScreen. |
| `mobile/lib/presentation/screens/dashboard/widgets/cash_flow_chart.dart` | tracked | Flutter/Dart module | 209 | Flutter/Dart module; symbols: MonthCashFlow, CashFlowChart. |
| `mobile/lib/presentation/screens/dashboard/widgets/category_bar_chart.dart` | tracked | Flutter/Dart module | 101 | Flutter/Dart module; symbols: CategoryBarChart. |
| `mobile/lib/presentation/screens/dashboard/widgets/expense_list_tile.dart` | tracked | Flutter/Dart module | 210 | Flutter/Dart module; symbols: ExpenseListTile. |
| `mobile/lib/presentation/screens/dashboard/widgets/spending_trend_chart.dart` | tracked | Flutter/Dart module | 141 | Flutter/Dart module; symbols: SpendingTrendChart. |
| `mobile/lib/presentation/screens/expenses/expense_detail_screen.dart` | tracked | Flutter/Dart module | 595 | Flutter/Dart module; symbols: ExpenseDetailScreen. |
| `mobile/lib/presentation/screens/expenses/expense_search_screen.dart` | tracked | Flutter/Dart module | 256 | Flutter/Dart module; symbols: ExpenseSearchScreen. |
| `mobile/lib/presentation/screens/finances/finances_screen.dart` | tracked | Flutter/Dart module | 833 | Flutter/Dart module; symbols: FinancesScreen. |
| `mobile/lib/presentation/screens/groups/group_detail_screen.dart` | tracked | Flutter/Dart module | 2737 | Flutter/Dart module; symbols: GroupDetailScreen. |
| `mobile/lib/presentation/screens/groups/groups_screen.dart` | tracked | Flutter/Dart module | 390 | Flutter/Dart module; symbols: GroupsScreen. |
| `mobile/lib/presentation/screens/home/conversation_list_screen.dart` | tracked | Flutter/Dart module | 733 | Flutter/Dart module; symbols: ConversationListDrawer, conversationsListProvider, searchAllConversationsProvider. |
| `mobile/lib/presentation/screens/home/home_screen.dart` | tracked | Flutter/Dart module | 691 | Flutter/Dart module; symbols: HomeScreen. |
| `mobile/lib/presentation/screens/income/income_screen.dart` | tracked | Flutter/Dart module | 574 | Flutter/Dart module; symbols: IncomeScreen. |
| `mobile/lib/presentation/screens/notifications/notifications_screen.dart` | tracked | Flutter/Dart module | 384 | Flutter/Dart module; symbols: NotificationsScreen. |
| `mobile/lib/presentation/screens/onboarding/onboarding_screen.dart` | tracked | Flutter/Dart module | 235 | Flutter/Dart module; symbols: OnboardingScreen. |
| `mobile/lib/presentation/screens/profile/profile_screen.dart` | tracked | Flutter/Dart module | 704 | Flutter/Dart module; symbols: ProfileScreen. |
| `mobile/lib/presentation/screens/savings/savings_screen.dart` | tracked | Flutter/Dart module | 751 | Flutter/Dart module; symbols: SavingsScreen. |
| `mobile/lib/presentation/screens/settings/notification_preferences_screen.dart` | tracked | Flutter/Dart module | 620 | Flutter/Dart module; symbols: NotificationPreferencesScreen. |
| `mobile/lib/presentation/screens/settings/settings_screen.dart` | tracked | Flutter/Dart module | 411 | Flutter/Dart module; symbols: SettingsScreen, userPreferencesProvider. |
| `mobile/lib/presentation/screens/splash_screen.dart` | tracked | Flutter/Dart module | 208 | Flutter/Dart module; symbols: SplashScreen, PennyLoader. |
| `mobile/lib/presentation/widgets/animated_counter.dart` | tracked | Flutter/Dart module | 46 | Flutter/Dart module; symbols: AnimatedCounter. |
| `mobile/lib/presentation/widgets/animated_list_item.dart` | tracked | Flutter/Dart module | 32 | Flutter/Dart module; symbols: AnimatedListItem. |
| `mobile/lib/presentation/widgets/app_shell.dart` | tracked | Flutter/Dart module | 133 | Flutter/Dart module; symbols: AppShell. |
| `mobile/lib/presentation/widgets/budget_impact_preview.dart` | tracked | Flutter/Dart module | 261 | Flutter/Dart module; symbols: BudgetImpactPreview. |
| `mobile/lib/presentation/widgets/chat_bubble.dart` | tracked | Flutter/Dart module | 75 | Flutter/Dart module; symbols: ChatBubble. |
| `mobile/lib/presentation/widgets/connectivity_banner.dart` | tracked | Flutter/Dart module | 75 | Flutter/Dart module; symbols: ConnectivityBanner. |
| `mobile/lib/presentation/widgets/error_state.dart` | tracked | Flutter/Dart module | 57 | Flutter/Dart module; symbols: ErrorState. |
| `mobile/lib/presentation/widgets/expense_card.dart` | tracked | Flutter/Dart module | 851 | Flutter/Dart module; symbols: ExpenseCard. |
| `mobile/lib/presentation/widgets/expense_confirmation_sheet.dart` | tracked | Flutter/Dart module | 659 | Flutter/Dart module; symbols: ExpenseConfirmationSheet. |
| `mobile/lib/presentation/widgets/guest_sign_up_prompt.dart` | tracked | Flutter/Dart module | 57 | Flutter/Dart module. |
| `mobile/lib/presentation/widgets/over_budget_warning_sheet.dart` | tracked | Flutter/Dart module | 217 | Flutter/Dart module; symbols: OverBudgetWarningSheet. |
| `mobile/lib/presentation/widgets/penny_empty_state.dart` | tracked | Flutter/Dart module | 79 | Flutter/Dart module; symbols: PennyEmptyState. |
| `mobile/lib/presentation/widgets/quick_add_expense.dart` | tracked | Flutter/Dart module | 412 | Flutter/Dart module; symbols: QuickAddExpense. |
| `mobile/lib/presentation/widgets/receipt_image_viewer.dart` | tracked | Flutter/Dart module | 183 | Flutter/Dart module; symbols: ReceiptImageViewer. |
| `mobile/lib/presentation/widgets/shimmer_loading.dart` | tracked | Flutter/Dart module | 200 | Flutter/Dart module; symbols: ShimmerListTile, ShimmerCard, ShimmerContentCard, ShimmerLoadingList, ShimmerCardAndList. |
| `mobile/lib/presentation/widgets/success_overlay.dart` | tracked | Flutter/Dart module | 69 | Flutter/Dart module; symbols: SuccessOverlay. |

## mobile/test

Files: 36.

| Path | Git | Kind | Lines | Notes |
| --- | --- | --- | ---: | --- |
| `mobile/test/helpers/test_helpers.dart` | tracked | Flutter/Dart module | 93 | Flutter/Dart module. |
| `mobile/test/unit/constants/env_config_test.dart` | tracked | Flutter/Dart module | 18 | Flutter/Dart module. |
| `mobile/test/unit/models/budget_model_test.dart` | tracked | Flutter/Dart module | 67 | Flutter/Dart module. |
| `mobile/test/unit/models/conversation_model_test.dart` | tracked | Flutter/Dart module | 43 | Flutter/Dart module. |
| `mobile/test/unit/models/expense_model_approval_test.dart` | tracked | Flutter/Dart module | 223 | Flutter/Dart module. |
| `mobile/test/unit/models/expense_model_test.dart` | tracked | Flutter/Dart module | 142 | Flutter/Dart module. |
| `mobile/test/unit/models/group_activity_model_test.dart` | tracked | Flutter/Dart module | 241 | Flutter/Dart module. |
| `mobile/test/unit/models/group_income_model_test.dart` | tracked | Flutter/Dart module | 264 | Flutter/Dart module. |
| `mobile/test/unit/models/group_member_status_test.dart` | tracked | Flutter/Dart module | 246 | Flutter/Dart module. |
| `mobile/test/unit/models/group_model_test.dart` | tracked | Flutter/Dart module | 179 | Flutter/Dart module. |
| `mobile/test/unit/models/group_savings_model_test.dart` | tracked | Flutter/Dart module | 307 | Flutter/Dart module. |
| `mobile/test/unit/models/income_model_test.dart` | tracked | Flutter/Dart module | 128 | Flutter/Dart module. |
| `mobile/test/unit/models/notification_model_test.dart` | tracked | Flutter/Dart module | 125 | Flutter/Dart module. |
| `mobile/test/unit/models/notification_preferences_test.dart` | tracked | Flutter/Dart module | 565 | Flutter/Dart module. |
| `mobile/test/unit/models/savings_model_test.dart` | tracked | Flutter/Dart module | 131 | Flutter/Dart module. |
| `mobile/test/unit/providers/budget_providers_test.dart` | tracked | Flutter/Dart module | 56 | Flutter/Dart module. |
| `mobile/test/unit/providers/expense_providers_test.dart` | tracked | Flutter/Dart module | 38 | Flutter/Dart module. |
| `mobile/test/unit/providers/filter_providers_test.dart` | tracked | Flutter/Dart module | 177 | Flutter/Dart module. |
| `mobile/test/unit/providers/income_providers_test.dart` | tracked | Flutter/Dart module | 50 | Flutter/Dart module. |
| `mobile/test/unit/providers/theme_provider_test.dart` | tracked | Flutter/Dart module | 103 | Flutter/Dart module. |
| `mobile/test/unit/repositories/budget_repository_test.dart` | tracked | Flutter/Dart module | 123 | Flutter/Dart module. |
| `mobile/test/unit/repositories/conversation_repository_test.dart` | tracked | Flutter/Dart module | 517 | Flutter/Dart module. |
| `mobile/test/unit/repositories/expense_repository_approval_test.dart` | tracked | Flutter/Dart module | 296 | Flutter/Dart module. |
| `mobile/test/unit/repositories/expense_repository_test.dart` | tracked | Flutter/Dart module | 183 | Flutter/Dart module. |
| `mobile/test/unit/repositories/group_income_repository_test.dart` | tracked | Flutter/Dart module | 244 | Flutter/Dart module. |
| `mobile/test/unit/repositories/group_savings_repository_test.dart` | tracked | Flutter/Dart module | 341 | Flutter/Dart module. |
| `mobile/test/unit/repositories/income_repository_test.dart` | tracked | Flutter/Dart module | 71 | Flutter/Dart module. |
| `mobile/test/unit/repositories/notification_preferences_repository_test.dart` | tracked | Flutter/Dart module | 275 | Flutter/Dart module. |
| `mobile/test/unit/repositories/notification_repository_test.dart` | tracked | Flutter/Dart module | 93 | Flutter/Dart module. |
| `mobile/test/unit/repositories/savings_repository_test.dart` | tracked | Flutter/Dart module | 89 | Flutter/Dart module. |
| `mobile/test/unit/services/duplicate_detector_test.dart` | tracked | Flutter/Dart module | 197 | Flutter/Dart module. |
| `mobile/test/unit/services/export_service_test.dart` | tracked | Flutter/Dart module | 241 | Flutter/Dart module. |
| `mobile/test/unit/services/push_notification_service_test.dart` | tracked | Flutter/Dart module | 23 | Flutter/Dart module. |
| `mobile/test/unit/services/storage_service_test.dart` | tracked | Flutter/Dart module | 31 | Flutter/Dart module. |
| `mobile/test/unit/utils/validators_test.dart` | tracked | Flutter/Dart module | 109 | Flutter/Dart module. |
| `mobile/test/widget_test.dart` | tracked | Flutter/Dart module | 38 | Flutter/Dart module. |

## mobile/android

Files: 28.

| Path | Git | Kind | Lines | Notes |
| --- | --- | --- | ---: | --- |
| `mobile/android/.gitignore` | tracked | repository file | 14 | Native mobile project/configuration file. |
| `mobile/android/app/build.gradle.kts` | tracked | configuration | 77 | Native mobile project/configuration file. |
| `mobile/android/app/google-services.json` | tracked | configuration | 70 | Generated, lock, or environment-specific configuration; values intentionally not reproduced in docs. |
| `mobile/android/app/proguard-rules.pro` | tracked | repository file | 29 | Native mobile project/configuration file. |
| `mobile/android/app/src/debug/AndroidManifest.xml` | tracked | repository file | 7 | Native mobile project/configuration file. |
| `mobile/android/app/src/main/AndroidManifest.xml` | tracked | repository file | 55 | Native mobile project/configuration file. |
| `mobile/android/app/src/main/kotlin/com/penny/penny_mobile/MainActivity.kt` | tracked | native platform code | 5 | Native mobile project/configuration file. |
| `mobile/android/app/src/main/res/drawable-hdpi/ic_launcher_foreground.png` | tracked | binary asset | - | Binary PNG file; 31036 bytes; inspect visually when task touches assets. |
| `mobile/android/app/src/main/res/drawable-mdpi/ic_launcher_foreground.png` | tracked | binary asset | - | Binary PNG file; 13903 bytes; inspect visually when task touches assets. |
| `mobile/android/app/src/main/res/drawable-v21/launch_background.xml` | tracked | repository file | 9 | Native mobile project/configuration file. |
| `mobile/android/app/src/main/res/drawable-xhdpi/ic_launcher_foreground.png` | tracked | binary asset | - | Binary PNG file; 50954 bytes; inspect visually when task touches assets. |
| `mobile/android/app/src/main/res/drawable-xxhdpi/ic_launcher_foreground.png` | tracked | binary asset | - | Binary PNG file; 112904 bytes; inspect visually when task touches assets. |
| `mobile/android/app/src/main/res/drawable-xxxhdpi/ic_launcher_foreground.png` | tracked | binary asset | - | Binary PNG file; 199727 bytes; inspect visually when task touches assets. |
| `mobile/android/app/src/main/res/drawable/launch_background.xml` | tracked | repository file | 9 | Native mobile project/configuration file. |
| `mobile/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml` | tracked | repository file | 9 | Native mobile project/configuration file. |
| `mobile/android/app/src/main/res/mipmap-hdpi/ic_launcher.png` | tracked | binary asset | - | Binary PNG file; 6903 bytes; inspect visually when task touches assets. |
| `mobile/android/app/src/main/res/mipmap-mdpi/ic_launcher.png` | tracked | binary asset | - | Binary PNG file; 3392 bytes; inspect visually when task touches assets. |
| `mobile/android/app/src/main/res/mipmap-xhdpi/ic_launcher.png` | tracked | binary asset | - | Binary PNG file; 11241 bytes; inspect visually when task touches assets. |
| `mobile/android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png` | tracked | binary asset | - | Binary PNG file; 23933 bytes; inspect visually when task touches assets. |
| `mobile/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png` | tracked | binary asset | - | Binary PNG file; 40799 bytes; inspect visually when task touches assets. |
| `mobile/android/app/src/main/res/values-night/styles.xml` | tracked | repository file | 18 | Native mobile project/configuration file. |
| `mobile/android/app/src/main/res/values/colors.xml` | tracked | repository file | 4 | Native mobile project/configuration file. |
| `mobile/android/app/src/main/res/values/styles.xml` | tracked | repository file | 18 | Native mobile project/configuration file. |
| `mobile/android/app/src/profile/AndroidManifest.xml` | tracked | repository file | 7 | Native mobile project/configuration file. |
| `mobile/android/build.gradle.kts` | tracked | configuration | 24 | Native mobile project/configuration file. |
| `mobile/android/gradle.properties` | tracked | configuration | 2 | Native mobile project/configuration file. |
| `mobile/android/gradle/wrapper/gradle-wrapper.properties` | tracked | configuration | 5 | Native mobile project/configuration file. |
| `mobile/android/settings.gradle.kts` | tracked | configuration | 29 | Native mobile project/configuration file. |

## mobile/ios

Files: 53.

| Path | Git | Kind | Lines | Notes |
| --- | --- | --- | ---: | --- |
| `mobile/ios/.gitignore` | tracked | repository file | 34 | Native mobile project/configuration file. |
| `mobile/ios/Flutter/AppFrameworkInfo.plist` | tracked | configuration | 24 | Native mobile project/configuration file. |
| `mobile/ios/Flutter/Debug.xcconfig` | tracked | configuration | 2 | Native mobile project/configuration file. |
| `mobile/ios/Flutter/Release.xcconfig` | tracked | configuration | 2 | Native mobile project/configuration file. |
| `mobile/ios/Podfile` | tracked | configuration | 52 | Native mobile project/configuration file. |
| `mobile/ios/Podfile.lock` | tracked | configuration | 1644 | Native mobile project/configuration file. |
| `mobile/ios/Runner.xcodeproj/project.pbxproj` | tracked | configuration | 762 | Native mobile project/configuration file. |
| `mobile/ios/Runner.xcodeproj/project.xcworkspace/contents.xcworkspacedata` | tracked | configuration | 7 | Native mobile project/configuration file. |
| `mobile/ios/Runner.xcodeproj/project.xcworkspace/xcshareddata/IDEWorkspaceChecks.plist` | tracked | configuration | 8 | Native mobile project/configuration file. |
| `mobile/ios/Runner.xcodeproj/project.xcworkspace/xcshareddata/WorkspaceSettings.xcsettings` | tracked | configuration | 8 | Native mobile project/configuration file. |
| `mobile/ios/Runner.xcodeproj/xcshareddata/xcschemes/Runner.xcscheme` | tracked | repository file | 101 | Native mobile project/configuration file. |
| `mobile/ios/Runner.xcworkspace/contents.xcworkspacedata` | tracked | configuration | 10 | Native mobile project/configuration file. |
| `mobile/ios/Runner.xcworkspace/xcshareddata/IDEWorkspaceChecks.plist` | tracked | configuration | 8 | Native mobile project/configuration file. |
| `mobile/ios/Runner.xcworkspace/xcshareddata/WorkspaceSettings.xcsettings` | tracked | configuration | 8 | Native mobile project/configuration file. |
| `mobile/ios/Runner/AppDelegate.swift` | tracked | native platform code | 18 | Native mobile project/configuration file. |
| `mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Contents.json` | tracked | configuration | 1 | Native mobile project/configuration file. |
| `mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-1024x1024@1x.png` | tracked | binary asset | - | Binary PNG file; 895079 bytes; inspect visually when task touches assets. |
| `mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-20x20@1x.png` | tracked | binary asset | - | Binary PNG file; 746 bytes; inspect visually when task touches assets. |
| `mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-20x20@2x.png` | tracked | binary asset | - | Binary PNG file; 2057 bytes; inspect visually when task touches assets. |
| `mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-20x20@3x.png` | tracked | binary asset | - | Binary PNG file; 4149 bytes; inspect visually when task touches assets. |
| `mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-29x29@1x.png` | tracked | binary asset | - | Binary PNG file; 1262 bytes; inspect visually when task touches assets. |
| `mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-29x29@2x.png` | tracked | binary asset | - | Binary PNG file; 3881 bytes; inspect visually when task touches assets. |
| `mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-29x29@3x.png` | tracked | binary asset | - | Binary PNG file; 8006 bytes; inspect visually when task touches assets. |
| `mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-40x40@1x.png` | tracked | binary asset | - | Binary PNG file; 2057 bytes; inspect visually when task touches assets. |
| `mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-40x40@2x.png` | tracked | binary asset | - | Binary PNG file; 6838 bytes; inspect visually when task touches assets. |
| `mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-40x40@3x.png` | tracked | binary asset | - | Binary PNG file; 14707 bytes; inspect visually when task touches assets. |
| `mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-50x50@1x.png` | tracked | binary asset | - | Binary PNG file; 3030 bytes; inspect visually when task touches assets. |
| `mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-50x50@2x.png` | tracked | binary asset | - | Binary PNG file; 10353 bytes; inspect visually when task touches assets. |
| `mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-57x57@1x.png` | tracked | binary asset | - | Binary PNG file; 3772 bytes; inspect visually when task touches assets. |
| `mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-57x57@2x.png` | tracked | binary asset | - | Binary PNG file; 13307 bytes; inspect visually when task touches assets. |
| `mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-60x60@2x.png` | tracked | binary asset | - | Binary PNG file; 14707 bytes; inspect visually when task touches assets. |
| `mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-60x60@3x.png` | tracked | binary asset | - | Binary PNG file; 32069 bytes; inspect visually when task touches assets. |
| `mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-72x72@1x.png` | tracked | binary asset | - | Binary PNG file; 5747 bytes; inspect visually when task touches assets. |
| `mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-72x72@2x.png` | tracked | binary asset | - | Binary PNG file; 20864 bytes; inspect visually when task touches assets. |
| `mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-76x76@1x.png` | tracked | binary asset | - | Binary PNG file; 6275 bytes; inspect visually when task touches assets. |
| `mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-76x76@2x.png` | tracked | binary asset | - | Binary PNG file; 23144 bytes; inspect visually when task touches assets. |
| `mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-83.5x83.5@2x.png` | tracked | binary asset | - | Binary PNG file; 27710 bytes; inspect visually when task touches assets. |
| `mobile/ios/Runner/Assets.xcassets/LaunchImage.imageset/Contents.json` | tracked | configuration | 23 | Native mobile project/configuration file. |
| `mobile/ios/Runner/Assets.xcassets/LaunchImage.imageset/LaunchImage.png` | tracked | binary asset | - | Binary PNG file; 44632 bytes; inspect visually when task touches assets. |
| `mobile/ios/Runner/Assets.xcassets/LaunchImage.imageset/LaunchImage@2x.png` | tracked | binary asset | - | Binary PNG file; 173352 bytes; inspect visually when task touches assets. |
| `mobile/ios/Runner/Assets.xcassets/LaunchImage.imageset/LaunchImage@3x.png` | tracked | binary asset | - | Binary PNG file; 385038 bytes; inspect visually when task touches assets. |
| `mobile/ios/Runner/Assets.xcassets/LaunchImage.imageset/README.md` | tracked | documentation | 5 | Documentation: Launch Screen Assets |
| `mobile/ios/Runner/Base.lproj/LaunchScreen.storyboard` | tracked | repository file | 37 | Native mobile project/configuration file. |
| `mobile/ios/Runner/Base.lproj/Main.storyboard` | tracked | repository file | 26 | Native mobile project/configuration file. |
| `mobile/ios/Runner/GoogleService-Info.plist` | tracked | configuration | 34 | Generated, lock, or environment-specific configuration; values intentionally not reproduced in docs. |
| `mobile/ios/Runner/Info.plist` | tracked | configuration | 96 | Native mobile project/configuration file. |
| `mobile/ios/Runner/Runner-Bridging-Header.h` | tracked | native platform code | 1 | Native mobile project/configuration file. |
| `mobile/ios/Runner/Runner.entitlements` | tracked | repository file | 16 | Native mobile project/configuration file. |
| `mobile/ios/Runner/SceneDelegate.swift` | tracked | native platform code | 6 | Native mobile project/configuration file. |
| `mobile/ios/RunnerTests/RunnerTests.swift` | tracked | native platform code | 12 | Native mobile project/configuration file. |
| `mobile/ios/ci_scripts/ci_post_clone.sh` | tracked | shell script | 42 | Shell script; inspect command side effects before running. |
| `mobile/ios/ci_scripts/ci_post_xcodebuild.sh` | tracked | shell script | 19 | Shell script; inspect command side effects before running. |
| `mobile/ios/ci_scripts/ci_pre_xcodebuild.sh` | tracked | shell script | 18 | Shell script; inspect command side effects before running. |

## mobile/fastlane

Files: 25.

| Path | Git | Kind | Lines | Notes |
| --- | --- | --- | ---: | --- |
| `mobile/fastlane/Appfile` | tracked | repository file | 9 | repository file; 210 bytes. |
| `mobile/fastlane/Fastfile` | tracked | repository file | 350 | repository file; 11157 bytes. |
| `mobile/fastlane/README.md` | tracked | documentation | 48 | Documentation: Installation |
| `mobile/fastlane/metadata/android/en-US/changelogs/26.txt` | tracked | repository file | 8 | Native mobile project/configuration file. |
| `mobile/fastlane/metadata/android/en-US/full_description.txt` | tracked | repository file | 27 | Native mobile project/configuration file. |
| `mobile/fastlane/metadata/android/en-US/images/featureGraphic.png` | tracked | binary asset | - | Binary PNG file; 69174 bytes; inspect visually when task touches assets. |
| `mobile/fastlane/metadata/android/en-US/images/icon.png` | tracked | binary asset | - | Binary PNG file; 315851 bytes; inspect visually when task touches assets. |
| `mobile/fastlane/metadata/android/en-US/images/phoneScreenshots/1_en-US.png` | tracked | binary asset | - | Binary PNG file; 164795 bytes; inspect visually when task touches assets. |
| `mobile/fastlane/metadata/android/en-US/images/phoneScreenshots/2_en-US.png` | tracked | binary asset | - | Binary PNG file; 183218 bytes; inspect visually when task touches assets. |
| `mobile/fastlane/metadata/android/en-US/images/phoneScreenshots/3_en-US.png` | tracked | binary asset | - | Binary PNG file; 123732 bytes; inspect visually when task touches assets. |
| `mobile/fastlane/metadata/android/en-US/images/phoneScreenshots/4_en-US.png` | tracked | binary asset | - | Binary PNG file; 159408 bytes; inspect visually when task touches assets. |
| `mobile/fastlane/metadata/android/en-US/images/phoneScreenshots/5_en-US.png` | tracked | binary asset | - | Binary PNG file; 144946 bytes; inspect visually when task touches assets. |
| `mobile/fastlane/metadata/android/en-US/images/sevenInchScreenshots/1_en-US.png` | tracked | binary asset | - | Binary PNG file; 62317 bytes; inspect visually when task touches assets. |
| `mobile/fastlane/metadata/android/en-US/images/sevenInchScreenshots/2_en-US.png` | tracked | binary asset | - | Binary PNG file; 50453 bytes; inspect visually when task touches assets. |
| `mobile/fastlane/metadata/android/en-US/images/sevenInchScreenshots/3_en-US.png` | tracked | binary asset | - | Binary PNG file; 73323 bytes; inspect visually when task touches assets. |
| `mobile/fastlane/metadata/android/en-US/images/sevenInchScreenshots/4_en-US.png` | tracked | binary asset | - | Binary PNG file; 40389 bytes; inspect visually when task touches assets. |
| `mobile/fastlane/metadata/android/en-US/images/sevenInchScreenshots/5_en-US.png` | tracked | binary asset | - | Binary PNG file; 50867 bytes; inspect visually when task touches assets. |
| `mobile/fastlane/metadata/android/en-US/images/tenInchScreenshots/1_en-US.png` | tracked | binary asset | - | Binary PNG file; 92293 bytes; inspect visually when task touches assets. |
| `mobile/fastlane/metadata/android/en-US/images/tenInchScreenshots/2_en-US.png` | tracked | binary asset | - | Binary PNG file; 39343 bytes; inspect visually when task touches assets. |
| `mobile/fastlane/metadata/android/en-US/images/tenInchScreenshots/3_en-US.png` | tracked | binary asset | - | Binary PNG file; 55438 bytes; inspect visually when task touches assets. |
| `mobile/fastlane/metadata/android/en-US/images/tenInchScreenshots/4_en-US.png` | tracked | binary asset | - | Binary PNG file; 44407 bytes; inspect visually when task touches assets. |
| `mobile/fastlane/metadata/android/en-US/images/tenInchScreenshots/5_en-US.png` | tracked | binary asset | - | Binary PNG file; 79247 bytes; inspect visually when task touches assets. |
| `mobile/fastlane/metadata/android/en-US/short_description.txt` | tracked | repository file | 1 | Native mobile project/configuration file. |
| `mobile/fastlane/metadata/android/en-US/title.txt` | tracked | repository file | 1 | Native mobile project/configuration file. |
| `mobile/fastlane/metadata/android/en-US/video.txt` | tracked | repository file | 0 | Native mobile project/configuration file. |

## mobile

Files: 53.

| Path | Git | Kind | Lines | Notes |
| --- | --- | --- | ---: | --- |
| `mobile/.flutter-version` | tracked | repository file | 1 | repository file; 7 bytes. |
| `mobile/.gitignore` | tracked | repository file | 71 | repository file; 1182 bytes. |
| `mobile/.metadata` | tracked | repository file | 33 | repository file; 1114 bytes. |
| `mobile/.ruby-version` | tracked | repository file | 1 | repository file; 6 bytes. |
| `mobile/APP_STORE_METADATA.md` | tracked | documentation | 163 | Documentation: Penny - AI Expense Tracker  App Store Metadata |
| `mobile/CICD.md` | tracked | documentation | 185 | Documentation: Penny Mobile  CI/CD Runbook |
| `mobile/CLAUDE.md` | tracked | documentation | 238 | Documentation: Penny Mobile  Flutter App |
| `mobile/Gemfile` | tracked | configuration | 16 | configuration; 761 bytes. |
| `mobile/Gemfile.lock` | tracked | configuration | 311 | configuration; 8436 bytes. |
| `mobile/PRODUCTION_READINESS.md` | tracked | documentation | 138 | Documentation: Penny Mobile  Production Readiness |
| `mobile/README.md` | tracked | documentation | 17 | Documentation: penny_mobile |
| `mobile/analysis_options.yaml` | tracked | configuration | 28 | configuration; 1420 bytes. |
| `mobile/assets/icon/penny_icon.png` | tracked | binary asset | - | Binary PNG file; 1074425 bytes; inspect visually when task touches assets. |
| `mobile/assets/lottie/empty_box.json` | tracked | configuration | 1 | configuration; 1002 bytes. |
| `mobile/assets/lottie/success_check.json` | tracked | configuration | 1 | configuration; 1283 bytes. |
| `mobile/integration_test/comprehensive_test.dart` | tracked | Flutter/Dart module | 901 | Flutter/Dart module. |
| `mobile/integration_test/expense_crud_test.dart` | tracked | Flutter/Dart module | 1163 | Flutter/Dart module. |
| `mobile/integration_test/full_journey_test.dart` | tracked | Flutter/Dart module | 1922 | Flutter/Dart module. |
| `mobile/playstore_assets/feature_graphic.png` | tracked | binary asset | - | Binary PNG file; 69174 bytes; inspect visually when task touches assets. |
| `mobile/playstore_assets/metadata/en-CA/short_description.txt` | tracked | repository file | 1 | repository file; 71 bytes. |
| `mobile/pubspec.lock` | tracked | configuration | 1777 | configuration; 53134 bytes. |
| `mobile/pubspec.yaml` | tracked | configuration | 108 | configuration; 2355 bytes. |
| `mobile/release_notes/README.md` | tracked | documentation | 16 | Documentation: Release notes |
| `mobile/release_notes/v2.2.1.txt` | tracked | repository file | 1 | repository file; 59 bytes. |
| `mobile/release_notes/v2.3.0.txt` | tracked | repository file | 8 | repository file; 522 bytes. |
| `mobile/release_notes/v2.3.1.txt` | tracked | repository file | 8 | repository file; 522 bytes. |
| `mobile/release_notes/v2.3.2.txt` | tracked | repository file | 8 | repository file; 522 bytes. |
| `mobile/release_notes/v2.3.3.txt` | tracked | repository file | 8 | repository file; 522 bytes. |
| `mobile/release_notes/v2.3.4.txt` | tracked | repository file | 8 | repository file; 522 bytes. |
| `mobile/screenshots/01_onboarding_ai_chat.png` | tracked | binary asset | - | Binary PNG file; 124728 bytes; inspect visually when task touches assets. |
| `mobile/screenshots/02_onboarding_budgets.png` | tracked | binary asset | - | Binary PNG file; 129317 bytes; inspect visually when task touches assets. |
| `mobile/screenshots/03_onboarding_groups.png` | tracked | binary asset | - | Binary PNG file; 134301 bytes; inspect visually when task touches assets. |
| `mobile/screenshots/04_login.png` | tracked | binary asset | - | Binary PNG file; 116279 bytes; inspect visually when task touches assets. |
| `mobile/screenshots/05_signup.png` | tracked | binary asset | - | Binary PNG file; 145128 bytes; inspect visually when task touches assets. |
| `mobile/screenshots/6.5/01_home.png` | tracked | binary asset | - | Binary PNG file; 273220 bytes; inspect visually when task touches assets. |
| `mobile/screenshots/6.5/02_dashboard.png` | tracked | binary asset | - | Binary PNG file; 369475 bytes; inspect visually when task touches assets. |
| `mobile/screenshots/6.5/03_budgets.png` | tracked | binary asset | - | Binary PNG file; 321381 bytes; inspect visually when task touches assets. |
| `mobile/screenshots/6.5/04_groups.png` | tracked | binary asset | - | Binary PNG file; 166015 bytes; inspect visually when task touches assets. |
| `mobile/screenshots/6.5/07_savings.png` | tracked | binary asset | - | Binary PNG file; 349793 bytes; inspect visually when task touches assets. |
| `mobile/screenshots/6.5/12_notifications.png` | tracked | binary asset | - | Binary PNG file; 248883 bytes; inspect visually when task touches assets. |
| `mobile/screenshots/6.9/01_home.png` | tracked | binary asset | - | Binary PNG file; 287524 bytes; inspect visually when task touches assets. |
| `mobile/screenshots/6.9/02_dashboard.png` | tracked | binary asset | - | Binary PNG file; 389426 bytes; inspect visually when task touches assets. |
| `mobile/screenshots/6.9/03_budgets.png` | tracked | binary asset | - | Binary PNG file; 336029 bytes; inspect visually when task touches assets. |
| `mobile/screenshots/6.9/04_groups.png` | tracked | binary asset | - | Binary PNG file; 173581 bytes; inspect visually when task touches assets. |
| `mobile/screenshots/6.9/07_savings.png` | tracked | binary asset | - | Binary PNG file; 368737 bytes; inspect visually when task touches assets. |
| `mobile/screenshots/6.9/12_notifications.png` | tracked | binary asset | - | Binary PNG file; 262381 bytes; inspect visually when task touches assets. |
| `mobile/screenshots/ipad-13/01_home.png` | tracked | binary asset | - | Binary PNG file; 379506 bytes; inspect visually when task touches assets. |
| `mobile/screenshots/ipad-13/02_dashboard.png` | tracked | binary asset | - | Binary PNG file; 506950 bytes; inspect visually when task touches assets. |
| `mobile/screenshots/ipad-13/03_budgets.png` | tracked | binary asset | - | Binary PNG file; 443996 bytes; inspect visually when task touches assets. |
| `mobile/screenshots/ipad-13/04_groups.png` | tracked | binary asset | - | Binary PNG file; 230886 bytes; inspect visually when task touches assets. |
| `mobile/screenshots/ipad-13/07_savings.png` | tracked | binary asset | - | Binary PNG file; 484914 bytes; inspect visually when task touches assets. |
| `mobile/screenshots/ipad-13/12_notifications.png` | tracked | binary asset | - | Binary PNG file; 351471 bytes; inspect visually when task touches assets. |
| `mobile/scripts/run_tests.sh` | tracked | shell script | 47 | Shell script; inspect command side effects before running. |
