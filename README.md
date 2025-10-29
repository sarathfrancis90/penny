# 🪙 Penny AI - Smart Expense Tracker for Self-Incorporated Professionals

An AI-powered Progressive Web App (PWA) for tracking business expenses, optimized for self-incorporated software professionals in Canada. Penny AI uses Google Gemini to intelligently categorize expenses based on Canadian tax filing requirements.

## ✨ Key Features

### 💳 Smart Expense Tracking
- **AI-Powered Analysis**: Uses Google Gemini 2.0 Flash to analyze text descriptions and receipt images
- **Canadian Tax Categories**: Pre-configured with 38 Canadian business expense categories
- **Receipt OCR**: Automatically extract vendor, amount, date, and category from receipt photos
- **Offline Support**: Queue expenses offline, sync automatically when back online
- **Voice/Text Input**: Natural language processing for quick expense entry

### 🔐 Modern Authentication
- **🔑 Passkey Authentication** (October 2025)
  - Passwordless login with Face ID, Touch ID, or Windows Hello
  - WebAuthn Level 3 compliant
  - Phishing-resistant security
  - Multi-device sync via iCloud Keychain, Google Password Manager
- **Traditional Email/Password**: Fallback authentication via Firebase Auth

### 📊 Analytics Dashboard
- **Visual Charts**: Monthly spending trends, category breakdowns
- **Expense Management**: Edit, delete, or bulk clear expenses
- **Export Options**: Download expense data for tax filing
- **Real-time Sync**: Automatic synchronization across devices

### 👨‍💼 Admin Console
- **User Management**: View and manage all registered users
- **Cost Tracking**: Monitor AI usage, tokens, and estimated costs
- **System Monitoring**: Database stats, performance metrics
- **Analytics**: User activity, success rates, daily/monthly trends

### 📱 Progressive Web App
- **Install on Device**: Works like a native app on iOS, Android, macOS, Windows
- **Offline Mode**: Continue working without internet connection
- **Push Notifications**: (Future) Expense reminders and budget alerts
- **Fast & Responsive**: Optimized for performance

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ and npm
- Firebase project (Firestore + Authentication)
- Google Gemini API key

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd penny
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment variables**

Copy `env.example` to `.env.local` and fill in your credentials:

```bash
cp env.example .env.local
```

Required variables:
- Firebase configuration (client + admin SDK)
- Google Gemini API key
- Admin console credentials
- Passkey/WebAuthn configuration (for passwordless auth)

4. **Run the development server**
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

5. **Build for production**
```bash
npm run build
npm start
```

## 📚 Documentation

- **[Passkey Authentication Guide](PASSKEY_AUTHENTICATION_2025.md)** - WebAuthn Level 3 implementation details
- **[Passkey Implementation Summary](IMPLEMENTATION_SUMMARY_PASSKEYS.md)** - Executive overview of passkey features
- **[Admin Console Guide](ADMIN_CONSOLE_README.md)** - Admin features and user management
- **[Admin Costs & Monitoring](ADMIN_COSTS_AND_MONITORING.md)** - Cost tracking and system monitoring
- **[Deployment Guide](DEPLOYMENT.md)** - Deploy to Vercel, configure Firebase

## 🛠 Tech Stack

### Frontend
- **Next.js 15** - React framework with App Router
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first styling
- **Shadcn UI** - Component library
- **Lucide React** - Icon library

### Backend & Services
- **Firebase Firestore** - NoSQL database
- **Firebase Authentication** - User management
- **Google Gemini 2.0 Flash** - AI expense analysis
- **Dexie.js** - IndexedDB for offline support

### Authentication
- **@simplewebauthn/browser** v13.2.2 - WebAuthn client
- **@simplewebauthn/server** v13.2.2 - WebAuthn server
- **jose** - JWT session management

### PWA
- **next-pwa** - Service worker generation
- **Workbox** - Offline caching strategies

## 🔐 Security Features

- ✅ **Passkey Authentication**: WebAuthn Level 3, phishing-resistant
- ✅ **HttpOnly Cookies**: Secure session management
- ✅ **HTTPS Enforced**: Secure connections in production
- ✅ **Admin Authentication**: Separate secure admin access
- ✅ **Firebase Security Rules**: Server-side data protection
- ✅ **No Shared Secrets**: Public key cryptography for passkeys

## 📊 Canadian Tax Categories

Includes 38 pre-configured expense categories:

**General Business:**
- Advertising, Bad debts, Bank charges, Business tax/fees/dues, Delivery & freight
- Insurance, Interest, Legal/accounting, Management/admin fees, Meals & entertainment
- Motor vehicle expenses, Office expenses, Parking, Professional development
- Rent, Repairs & maintenance, Supplies, Telephone, Travel, Utilities, Wages/salaries

**Home Office:**
- Electricity, Heat, Insurance, Maintenance, Mortgage interest, Property taxes
- Rent, Water

**Automobile:**
- Fuel, Insurance, Interest, License & registration, Maintenance & repairs

## 🌐 Browser Support

### Passkey Authentication (October 2025)
- ✅ iOS/iPadOS 16+ (Face ID, Touch ID)
- ✅ macOS 13+ (Touch ID, Face ID)
- ✅ Android 9+ (Fingerprint, Face)
- ✅ Windows 10+ (Windows Hello)
- ✅ Chrome 108+, Safari 16+, Edge 108+, Firefox 119+

### PWA Support
- ✅ Chrome/Edge (Windows, macOS, Android)
- ✅ Safari (iOS, iPadOS, macOS)
- ✅ Firefox (Windows, macOS, Android)

## 🧪 Testing

### Run Tests
```bash
npm test
```

### Lint Code
```bash
npm run lint
```

### Type Check
```bash
npm run type-check
```

### Test Passkeys
Use Chrome DevTools > WebAuthn tab for virtual authenticator testing.

## 📈 Analytics & Monitoring

The admin console provides comprehensive analytics:
- **AI Usage**: Requests, tokens, estimated costs
- **User Activity**: Active users, new signups, authentication methods
- **System Health**: Database size, error rates, response times
- **Cost Breakdown**: Firestore operations, AI tokens, Vercel invocations

## 🚀 Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import project to Vercel
3. Configure environment variables
4. Deploy automatically on push

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed instructions.

### Other Platforms
- Netlify
- AWS Amplify
- Google Cloud Run
- Self-hosted with Docker

## 🤝 Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📝 License

[MIT License](LICENSE) - Feel free to use this project for your own purposes.

## 🙏 Acknowledgments

- **Google Gemini** - AI expense analysis
- **Firebase** - Backend services
- **SimpleWebAuthn** - Passkey implementation
- **Shadcn UI** - Beautiful components
- **Next.js Team** - Amazing framework

## 📞 Support

- 📖 Documentation: See `/docs` directory
- 🐛 Issues: [GitHub Issues](../../issues)
- 💬 Discussions: [GitHub Discussions](../../discussions)

## 🗺 Roadmap

### Q4 2025
- ✅ Passkey authentication (WebAuthn Level 3)
- ✅ Admin console with cost tracking
- ✅ Offline support

### Q1 2026
- ⏳ Recurring expense templates
- ⏳ Budget alerts and notifications
- ⏳ Multi-currency support
- ⏳ Expense sharing/collaboration

### Q2 2026
- ⏳ Mobile app (React Native)
- ⏳ Tax report generation
- ⏳ Integrations (QuickBooks, Xero)
- ⏳ Receipt storage in cloud

---

Built with ❤️ for Canadian entrepreneurs by [Your Name]

**Version**: 1.0.0 (October 2025)  
**Status**: ✅ Production Ready
