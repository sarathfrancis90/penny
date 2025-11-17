# 💰 Penny - AI-Powered Expense Tracker

**Penny** is a modern, AI-powered expense tracking application built with Next.js, Firebase, and Gemini AI. Track expenses, manage budgets, collaborate in groups, and get intelligent insights - all with a beautiful, mobile-first interface.

[![Deploy to Firebase](https://github.com/sarathfrancis90/penny/actions/workflows/firebase-deploy.yml/badge.svg)](https://github.com/sarathfrancis90/penny/actions)
[![Next.js](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org/)
[![Firebase](https://img.shields.io/badge/Firebase-10-orange)](https://firebase.google.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org/)

---

## ✨ Features

### 🤖 AI-Powered Expense Tracking
- **Natural Language Input**: Describe expenses in plain English
- **Smart Categorization**: AI automatically categorizes expenses
- **Receipt OCR**: Upload receipts and extract details automatically
- **Conversational Interface**: Chat with Penny to manage your finances

### 💰 Smart Budgeting
- **Personal & Group Budgets**: Set budgets at individual or group level
- **Real-time Tracking**: Live budget usage with visual indicators
- **Smart Alerts**: Get notified at 75%, 90%, and 100% thresholds
- **Budget Impact Preview**: See impact before saving expenses

### 👥 Group Expense Management
- **Shared Groups**: Track expenses with family, roommates, or teams
- **Role-Based Permissions**: Owner, Admin, Member roles with granular controls
- **Group Invitations**: Invite members via email
- **Group Budgets**: Set and track budgets for the entire group

### 🔔 Smart Notifications
- **Real-time Updates**: Get notified of group activity instantly
- **Budget Alerts**: Never exceed your budget unknowingly
- **Smart Grouping**: Similar notifications grouped to reduce noise
- **Customizable Settings**: Control what you're notified about

### 📊 Analytics & Insights
- **Dashboard**: Visual overview of spending patterns
- **Category Breakdown**: See where your money goes
- **Trends**: Track spending over time
- **Group Analytics**: Compare personal vs group spending

### 🔐 Advanced Security
- **Passkey Authentication**: Passwordless login with biometrics
- **Firebase Auth**: Secure authentication with email/password
- **Row-Level Security**: Firestore rules ensure data isolation
- **Admin Console**: Monitoring and management tools

### 📱 Progressive Web App (PWA)
- **Offline Support**: Work without internet connection
- **Mobile-First Design**: Optimized for mobile devices
- **Push Notifications**: Native-like notification experience
- **Install to Home Screen**: Works like a native app

---

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- Firebase account
- Google Gemini API key (for AI features)

### 1. Clone and Install
```bash
git clone https://github.com/sarathfrancis90/penny.git
cd penny
npm install
```

### 2. Configure Environment
```bash
cp env.example .env.local
# Edit .env.local with your Firebase and Gemini API keys
```

### 3. Deploy Database Configuration
```bash
firebase login
firebase deploy --only firestore
```

### 4. Run Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app!

---

## 📚 Documentation

### 🗄️ Database
- [**Database Schema**](docs/database/DATABASE_SCHEMA.md) - Complete database structure
- [**DevOps Guide**](docs/database/DATABASE_DEVOPS_GUIDE.md) - CI/CD and best practices
- [**Setup Complete**](docs/database/DATABASE_SETUP_COMPLETE.md) - Infrastructure overview
- [**Firestore Rules**](docs/database/FIRESTORE_RULES_DEPLOY.md) - Security rules deployment
- [**Permission Fixes**](docs/database/FIX_FIREBASE_PERMISSIONS.md) - Troubleshooting

### 🎨 Features
- [**AI Conversational Interface**](docs/features/AI_CONVERSATIONAL_INTERFACE_DESIGN.md)
- [**Budgeting System**](docs/features/BUDGETING_FEATURE_DESIGN.md)
- [**Conversation History**](docs/features/CONVERSATION_HISTORY_DESIGN.md)
- [**Groups Management**](docs/features/GROUPS_MANAGEMENT_DESIGN.md)
- [**Notification System**](docs/features/NOTIFICATION_SYSTEM_DESIGN.md)
- [**Mobile-First Design**](docs/features/MOBILE_FIRST_DESIGN_SYSTEM.md)
- [**Passkey Authentication**](docs/features/IMPLEMENTATION_SUMMARY_PASSKEYS.md)
- [**Receipt Storage**](docs/features/RECEIPT_STORAGE_IMPLEMENTATION.md)

### 🚢 Deployment
- [**Deployment Guide**](docs/deployment/DEPLOYMENT.md) - Full deployment instructions
- [**Quick Start**](docs/deployment/DEPLOY_QUICK_START.md) - Get started in 5 minutes
- [**Firebase Setup**](docs/deployment/FIREBASE_SETUP.md) - Firebase configuration
- [**Gemini Setup**](docs/deployment/GEMINI_SETUP.md) - AI integration
- [**PWA Setup**](docs/deployment/PWA_SETUP.md) - Progressive Web App
- [**Vercel Deployment**](docs/deployment/VERCEL_DEPLOYMENT_FIX.md) - Vercel-specific fixes

### 🧪 Testing
- [**Testing Guide**](docs/testing/TESTING_GUIDE.md) - Comprehensive testing strategy
- [**Groups Testing**](docs/testing/GROUPS_TESTING_GUIDE.md) - Group features testing
- [**Notifications Testing**](docs/testing/NOTIFICATION_TESTING_GUIDE.md) - Notification testing
- [**Default Group Verification**](docs/testing/DEFAULT_GROUP_VERIFICATION.md)

### 👨‍💼 Admin
- [**Admin Console**](docs/admin/ADMIN_CONSOLE_README.md) - Admin dashboard setup
- [**Costs & Monitoring**](docs/admin/ADMIN_COSTS_AND_MONITORING.md) - Cost tracking
- [**Admin Updates**](docs/admin/ADMIN_UPDATES_v2.md) - Latest admin features

---

## 🏗️ Architecture

### Tech Stack
- **Frontend**: Next.js 15, React 18, TypeScript
- **Backend**: Next.js API Routes, Firebase Admin SDK
- **Database**: Cloud Firestore (NoSQL)
- **Storage**: Firebase Storage (receipts/images)
- **AI**: Google Gemini 1.5 Pro
- **Authentication**: Firebase Auth + Passkeys
- **Styling**: Tailwind CSS, Shadcn UI
- **State Management**: React Hooks, Firestore Real-time
- **PWA**: Workbox, Service Workers

### Project Structure
```
penny/
├── database/                   # Database configuration
│   ├── firestore.rules        # Security rules
│   ├── firestore.indexes.json # Query indexes
│   └── storage.rules          # Storage rules
├── docs/                       # Documentation
│   ├── admin/                 # Admin guides
│   ├── database/              # Database docs
│   ├── deployment/            # Deployment guides
│   ├── features/              # Feature documentation
│   └── testing/               # Testing guides
├── public/                     # Static assets
│   └── manifest.json          # PWA manifest
├── scripts/                    # Utility scripts
├── src/
│   ├── app/                   # Next.js app router
│   │   ├── api/              # API routes
│   │   ├── admin-console/    # Admin dashboard
│   │   ├── budgets/          # Budget management
│   │   ├── groups/           # Group management
│   │   └── settings/         # User settings
│   ├── components/            # React components
│   │   ├── budgets/          # Budget components
│   │   ├── chat/             # Chat interface
│   │   ├── groups/           # Group components
│   │   ├── notifications/    # Notification UI
│   │   └── ui/               # Shadcn UI components
│   ├── hooks/                 # Custom React hooks
│   └── lib/                   # Utilities & services
│       ├── services/         # Business logic
│       └── types/            # TypeScript types
└── .github/
    └── workflows/             # CI/CD pipelines
```

---

## 🔧 Development

### Available Scripts
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npm run type-check   # Run TypeScript compiler
```

### Database Management
```bash
# Deploy database configuration
firebase deploy --only firestore

# Deploy specific components
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
firebase deploy --only storage

# Start emulators for local testing
firebase emulators:start
```

### Environment Variables
See `env.example` for required environment variables:
- Firebase configuration
- Gemini API key
- JWT secret for passkeys
- NextAuth configuration

---

## 🚀 Deployment

### Automated CI/CD
Every push to `main` automatically deploys database configuration via GitHub Actions.

**Triggers on changes to:**
- `database/firestore.rules`
- `database/firestore.indexes.json`
- `database/storage.rules`
- `firebase.json`

### Manual Deployment
```bash
# Deploy everything
npm run build
vercel --prod

# Deploy only database
firebase deploy --only firestore
```

See [Deployment Guide](docs/deployment/DEPLOYMENT.md) for detailed instructions.

---

## 📊 Monitoring

### Firebase Console
- **Firestore Usage**: Monitor read/write operations
- **Storage Usage**: Track file storage
- **Auth Users**: Monitor active users
- **Performance**: Track query performance

### Admin Console
Access at `/admin-console` for:
- User management
- Cost monitoring
- System health
- Analytics

See [Admin Console Guide](docs/admin/ADMIN_CONSOLE_README.md) for details.

---

## 🤝 Contributing

Contributions are welcome! Please follow these guidelines:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Commit changes**: `git commit -m 'Add amazing feature'`
4. **Push to branch**: `git push origin feature/amazing-feature`
5. **Open a Pull Request**

### Development Guidelines
- Follow TypeScript best practices
- Write clear commit messages
- Add tests for new features
- Update documentation
- Ensure CI/CD passes

---

## 📝 License

This project is private and proprietary. All rights reserved.

---

## 🙏 Acknowledgments

- **Next.js Team** - Amazing React framework
- **Firebase** - Backend infrastructure
- **Google Gemini** - AI capabilities
- **Shadcn** - Beautiful UI components
- **Vercel** - Hosting and deployment

---

## 📞 Support

- **Documentation**: Check the [docs](docs/) folder
- **Issues**: Open a GitHub issue
- **Questions**: Contact the maintainer

---

## 🔗 Links

- **Live App**: https://penny-amber.vercel.app
- **Firebase Console**: https://console.firebase.google.com/project/penny-f4acd
- **GitHub Actions**: https://github.com/sarathfrancis90/penny/actions

---

**Built with ❤️ by Sarath Francis**

*Making expense tracking effortless with AI*
