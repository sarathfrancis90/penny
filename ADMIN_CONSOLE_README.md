# Penny AI - Admin Console Documentation

## 🔐 Admin Access

The Admin Console is a **hidden administrative interface** for managing users, monitoring system analytics, and controlling the application. It is not linked from the main application for security purposes.

### Access Information

**URL:** `/admin-console`  
**Login URL:** `/admin-console/login`

### Default Credentials

```

```

> ⚠️ **IMPORTANT**: Change these credentials in production by setting environment variables:
> - `ADMIN_USERNAME` - Your custom admin username
> - `ADMIN_PASSWORD` - Your custom secure password
> - `ADMIN_SESSION_SECRET` - Secret key for session encryption

---

## 📊 Features

### Overview Cards

The admin dashboard shows 4 key metrics at the top:
1. **Total Users** - Number of registered users (with count of users who have expenses)
2. **API Requests** - Total AI requests made (last 30 days)
3. **Total Cost** - Estimated total cost in USD
4. **Success Rate** - Percentage of successful API requests

### 1. User Management

**View All Users (from Firebase Auth):**
- Shows **ALL registered users**, even those who haven't added any expenses yet
- User display name and email (fetched from Firebase Authentication)
- Email verification status (verified/unverified indicator)
- Account status (Active/Disabled)
- User ID (truncated for display)
- Registration date (when account was created)
- Last sign-in time
- Last activity (latest of: last login or last expense)
- Total number of expenses
- Total amount spent

**Search & Filter:**
- Real-time search by email, display name, or user ID
- Shows filtered count vs total users
- Instant results as you type

**User Actions:**
- **Export User Data** - Downloads complete JSON export of user profile, expenses, and analytics
- **Reset Expenses** - Deletes all expenses for a user (preserves analytics)
  - Disabled for users with zero expenses
- **Delete User** - Completely removes all user data including expenses and analytics
- All destructive actions require confirmation dialog

**Data Retention:**
- Users remain visible in the admin console even after resetting all expenses
- This allows tracking of registered users who haven't added data yet
- Admin can see inactive accounts and users who are just getting started

### 2. Analytics Dashboard

**Summary Statistics (Last 30 days):**
- Total API requests
- Success rate
- Average response duration
- Total tokens consumed
- Estimated costs (USD)
- Failed request count

**Request Distribution:**
- By user (top 10 users by API usage)
- By date (time series data)
- By type (text vs. image requests)

**User Analytics:**
- Individual user request counts
- Token consumption per user
- Cost breakdown per user
- Success rate per user

### 3. API Usage Tracking

The system automatically tracks:
- Every expense analysis request
- Request type (text or image)
- Response time/duration
- Success/failure status
- Estimated token usage
- Estimated cost (based on Gemini pricing)

**Pricing Estimates:**
- Gemini 2.0 Flash model
- ~$0.075 per 1M input tokens
- ~$0.30 per 1M output tokens

### 4. System Information

- View admin credentials
- Quick access to system stats
- Refresh data functionality
- Secure logout

---

## 🔧 Technical Architecture

### Authentication System

```typescript
/src/lib/admin-auth.ts
```

**Features:**
- Session-based authentication with HMAC signatures
- 24-hour session expiration
- HttpOnly, Secure cookies
- Brute force protection (1-second delay on failed login)

### API Endpoints

**Authentication:**
- `POST /api/admin/auth` - Admin login
- `GET /api/admin/auth` - Check session
- `DELETE /api/admin/auth` - Logout

**User Management:**
- `GET /api/admin/users` - List **ALL registered users** from Firebase Auth + expense data
  - Returns: `users[]`, `totalUsers`, `registeredUsers`, `usersWithExpenses`
  - Merges Firebase Auth data with expense aggregations
  - Shows users even if they have zero expenses
- `GET /api/admin/users/[userId]/export` - Export complete user data as JSON
  - Returns: user profile, expenses, analytics, summary statistics
  - Useful for GDPR compliance and data portability
- `DELETE /api/admin/users/[userId]?type=expenses` - Reset user expenses only
- `DELETE /api/admin/users/[userId]?type=all` - Delete all user data (expenses + analytics)

**Analytics:**
- `GET /api/admin/analytics?days=30` - Get analytics for specified period
  - Returns: summary stats, user breakdown, daily breakdown, type breakdown

### Database Collections

**1. Analytics Collection (`analytics`)**
```typescript
{
  timestamp: Timestamp,
  userId: string,
  requestType: "text" | "image" | "unknown",
  success: boolean,
  duration: number, // milliseconds
  estimatedTokens: number,
  estimatedCost: number,
  hasImage: boolean,
  error?: string
}
```

**2. Expenses Collection (`expenses`)**
- Standard user expense data
- Tracked per user with userId field

**3. Offline Expenses (`offlineExpenses`)**
- Queued expenses for offline sync
- Can be deleted during user cleanup

---

## 🛡️ Security Features

### 1. Authentication
- Session-based with encrypted tokens
- HMAC signature verification
- Automatic session expiration
- Secure cookie flags (HttpOnly, Secure, SameSite)

### 2. Authorization
- All admin endpoints check authentication
- 401 Unauthorized for invalid/missing sessions
- No admin routes are publicly discoverable

### 3. Rate Limiting
- 1-second delay on failed login attempts
- Prevents brute force attacks

### 4. Audit Trail
- All login attempts are logged
- Analytics track all API usage
- User actions are timestamped

---

## 🚀 Usage Guide

### Accessing the Admin Console

1. Navigate to `/admin-console/login`
2. Enter admin credentials
3. Click "Sign In"
4. You'll be redirected to the admin dashboard

### Managing Users

**To Reset User Expenses:**
1. Go to "Users" tab
2. Find the user in the table
3. Click "Reset" button
4. Confirm the action
5. User's expenses will be deleted (analytics preserved)

**To Delete User Completely:**
1. Go to "Users" tab
2. Find the user in the table
3. Click "Delete" button
4. Confirm the action in the dialog
5. All user data (expenses + analytics) will be permanently deleted

### Viewing Analytics

1. Go to "Analytics" tab
2. View summary statistics
3. Check request types distribution
4. Review top users by usage
5. Analyze daily trends

### Refreshing Data

- Click "Refresh Data" button in System tab
- Or reload the page
- Data updates automatically on user actions

---

## 📈 Monitoring Best Practices

### Daily Checks
- Review total API requests
- Check success rate (should be >95%)
- Monitor cost estimates
- Identify unusual activity

### Weekly Reviews
- Analyze top users
- Review failed requests
- Check average response times
- Plan capacity based on trends

### Monthly Audits
- Export analytics data
- Review total costs
- Analyze user growth
- Optimize system performance

---

## 🐛 Troubleshooting

### Can't Log In
- Verify credentials are correct
- Check if session cookies are enabled
- Try incognito/private mode
- Clear browser cache

### Users Not Loading
- Check Firestore permissions
- Verify Firebase connection
- Check console for errors
- Refresh the page

### Analytics Not Tracking
- Verify Firestore write permissions
- Check expense analysis API logs
- Ensure analytics collection exists
- Review error logs

### Session Expired
- Sessions expire after 24 hours
- Simply log in again
- Check ADMIN_SESSION_SECRET is set correctly

---

## 🔄 Future Enhancements

Potential improvements to consider:

1. **Enhanced Analytics**
   - Real-time charts
   - Export to CSV/JSON
   - Custom date range selection
   - Advanced filtering

2. **User Notifications**
   - Email alerts on suspicious activity
   - Usage threshold warnings
   - Cost alerts

3. **Bulk Operations**
   - Bulk user deletion
   - Batch data export
   - Mass email functionality

4. **Advanced Security**
   - Two-factor authentication
   - IP whitelisting
   - Activity logs
   - Role-based access

5. **Performance Monitoring**
   - API endpoint health
   - Database query performance
   - Error rate tracking
   - Uptime monitoring

---

## 📝 Environment Variables

Add these to your `.env.local` or deployment environment:

```env
# Admin Console Configuration
ADMIN_USERNAME=your_secure_username
ADMIN_PASSWORD=your_secure_password_here
ADMIN_SESSION_SECRET=your_random_secret_key_min_32_chars

# Firebase Configuration - Client Side (existing)
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...

# Firebase Admin SDK - Server Side (for Admin Console user data)
# Get from Firebase Console > Project Settings > Service Accounts
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your_project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour_Key_Here\n-----END PRIVATE KEY-----\n"

# Gemini API (existing)
GEMINI_API_KEY=...
```

### 🔑 Getting Firebase Admin SDK Credentials

To display user names and emails in the admin console:

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Navigate to **Project Settings** (gear icon) → **Service Accounts** tab
4. Click **"Generate New Private Key"** button
5. Download the JSON file (keep it secure!)
6. Extract these values from the JSON:
   - `project_id` → `FIREBASE_PROJECT_ID`
   - `client_email` → `FIREBASE_CLIENT_EMAIL`
   - `private_key` → `FIREBASE_PRIVATE_KEY`

> **Important:** Keep the `\n` newline characters in the private key and wrap it in quotes.

---

## ⚠️ Security Warnings

1. **Never commit credentials** to version control
2. **Always use HTTPS** in production
3. **Rotate passwords regularly**
4. **Monitor admin access logs**
5. **Limit admin access** to trusted personnel only
6. **Use strong passwords** (minimum 16 characters, mixed case, numbers, symbols)
7. **Enable Firebase security rules** appropriately
8. **Regular security audits** of admin functions

---

## 📞 Support

For issues or questions about the Admin Console:

1. Check this documentation
2. Review error logs in browser console
3. Check Firestore permissions
4. Verify environment variables are set correctly

---

## 🎯 Quick Reference

**Login:** `/admin-console/login`  
**Dashboard:** `/admin-console`  
**Default Username:** `penny_admin_2024`  
**Default Password:** `PnY@2024#Secure$Admin!`  
**Session Duration:** 24 hours  
**Analytics Period:** Last 30 days (default)  

---

## 🚀 Future Enhancement Ideas

While the current admin console is comprehensive, here are potential additions:

**User Management:**
- Disable/Enable users temporarily
- Bulk operations on multiple users
- User activity timeline view

**Analytics:**
- Real-time dashboard updates
- Cost alerts and budget tracking
- Usage pattern analysis

**Security:**
- Multi-admin support with roles
- Two-factor authentication
- IP whitelisting

---

## 📝 Version History

**v2.0.0** (2024-10-22) - Enhanced User Tracking
- **ALL registered users now visible**, even those with 0 expenses
- Firebase Auth integration for complete user list
- User search and filtering
- Export individual user data (JSON)
- Email verification status indicators
- Account status display
- Enhanced user metadata

**v1.0.0** (2024) - Initial Release
- User management with delete/reset
- Analytics tracking
- Session-based authentication

---

**Last Updated:** October 22, 2024  
**Version:** 2.0.0

