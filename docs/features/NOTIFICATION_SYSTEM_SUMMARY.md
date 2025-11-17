# 🔔 Notification System - Quick Reference

## 🎯 Overview

A comprehensive, non-intrusive notification system for Penny that includes:
- **In-app notifications** with a notification center
- **PWA push notifications** for mobile/desktop  
- **Smart grouping** to reduce noise
- **Granular user controls** for preferences
- **Per-group settings** for customization

## 📊 Key Features

### Notification Types
1. **Group Activity** (6 types)
   - New expenses added
   - Group invitations
   - Member joined/left
   - Role changes
   - Settings updated

2. **Budget Alerts** (4 types)
   - Warning (75%)
   - Critical (90%)
   - Exceeded (>100%)
   - Monthly reset

3. **System** (3 types)
   - Weekly summary
   - Monthly summary
   - Uncategorized receipts

### User Controls
- Master on/off switch
- Per-notification-type preferences
- Per-group settings (frequency, priority)
- Quiet hours (e.g., 10 PM - 8 AM)
- Do Not Disturb mode
- Smart grouping toggle

### Priority Levels
- **Critical**: Cannot be disabled (budget exceeded)
- **High**: Important actions (invitations, warnings)
- **Medium**: Regular updates (new expenses)
- **Low**: Nice-to-have (summaries, member activity)

## 🏗️ Architecture

```
Client (React)
  ↓
Next.js API Routes
  ↓
Firestore Collections:
  - notifications/
  - notificationPreferences/
  - pushSubscriptions/
  ↓
Web Push Service (VAPID)
```

## 💾 Key Collections

### `notifications/`
```typescript
{
  userId: string,
  type: NotificationType,
  title: string,
  body: string,
  read: boolean,
  priority: 'low' | 'medium' | 'high' | 'critical',
  category: 'group' | 'budget' | 'system',
  groupId?: string,
  actorId?: string,
  actions?: Action[],
  createdAt: Timestamp
}
```

### `notificationPreferences/`
```typescript
{
  userId: string,
  enabled: boolean,
  pushEnabled: boolean,
  quietHours: { enabled, start, end },
  types: {
    [NotificationType]: {
      inApp: boolean,
      push: boolean,
      frequency: 'realtime' | 'hourly' | 'daily'
    }
  },
  groups: {
    [groupId]: {
      enabled: boolean,
      frequency: string,
      priority: string
    }
  }
}
```

## 🎨 UI Components

### 1. Notification Bell (Header)
- Bell icon with unread badge
- Animated pulse on new notification
- Opens notification panel

### 2. Notification Panel (Dropdown)
- List of recent notifications
- Tabs: All | Groups | Budgets
- Inline actions (Accept/Decline)
- Mark as read/Delete
- "View All" link

### 3. Settings Page
- Global settings
- Per-type preferences
- Per-group settings  
- Quiet hours configuration
- Test notifications button

### 4. Group Settings (Per-Group)
- Enable/disable notifications
- Frequency selector
- Notification types (expenses, members, budget)
- Priority level

## 🚀 Implementation Phases

### Phase 1: Foundation (Week 1-2)
- Database schema
- Core hooks (`useNotifications`)
- Basic UI (bell + panel)
- Real-time listeners

### Phase 2: Notification Types (Week 3)
- Implement all 13 notification types
- Trigger functions
- Integration with existing features

### Phase 3: User Preferences (Week 4)
- Settings page
- Preferences hook
- Apply preferences to delivery
- Quiet hours logic

### Phase 4: Smart Grouping (Week 5)
- Grouping algorithm
- Grouped notification UI
- Testing

### Phase 5: PWA Push (Week 6-7)
- VAPID keys setup
- Service worker updates
- Push subscription management
- Server-side push delivery

### Phase 6: Polish (Week 8)
- Performance optimization
- Animations
- Analytics
- Documentation

## 📱 PWA Push Setup

### 1. Generate VAPID Keys
```bash
npx web-push generate-vapid-keys
```

### 2. Environment Variables
```env
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BNX...
VAPID_PRIVATE_KEY=5J8...
VAPID_SUBJECT=mailto:your-email@example.com
```

### 3. Request Permission
```typescript
const { subscribe, isSubscribed } = usePushNotifications();

// Request permission and subscribe
await subscribe();
```

### 4. Service Worker Handles Push
```javascript
// sw.js
self.addEventListener('push', (event) => {
  const data = event.data.json();
  self.registration.showNotification(data.title, {
    body: data.body,
    icon: data.icon,
    data: { url: data.url }
  });
});
```

## 🔒 Privacy & Security

### User Privacy
- Users control all notification settings
- Sensitive data not in push notifications
- Auto-delete after 90 days
- GDPR compliant (export/delete data)

### Security
- All endpoints require authentication
- Users only see their own notifications
- Rate limiting (100/day, 10/hour)
- VAPID-secured push notifications

### Spam Prevention
- Smart grouping reduces volume
- "John and 5 others" instead of 6 notifications
- Quiet hours respected
- Digest mode available

## 🧪 Testing Checklist

- [ ] Notification bell shows count
- [ ] Panel displays notifications correctly
- [ ] Mark as read works
- [ ] Delete notification works
- [ ] Settings save correctly
- [ ] Quiet hours respected
- [ ] Push permission request works
- [ ] Push notifications deliver (mobile/desktop)
- [ ] Clicking notification navigates correctly
- [ ] Grouped notifications display properly

## 📊 Success Metrics

### Targets
- Notification open rate: **>40%**
- Action click rate: **>20%**
- Push opt-in rate: **>60%**
- Push delivery success: **>95%**
- User complaints: **<5%**

### Track
- Notifications created/delivered
- Open/click rates
- Time to action
- Opt-in/opt-out rates
- Delivery failures

## 🎯 Default Settings (New Users)

```typescript
{
  enabled: true,
  pushEnabled: true,
  emailEnabled: false,
  
  types: {
    // Group invitations: Always real-time + push
    group_invitation: {
      inApp: true,
      push: true,
      frequency: 'realtime',
      priority: 'high'
    },
    
    // New expenses: Real-time + push
    group_expense_added: {
      inApp: true,
      push: true,
      frequency: 'realtime',
      priority: 'medium'
    },
    
    // Budget critical: Real-time + push (can't disable)
    budget_critical: {
      inApp: true,
      push: true,
      frequency: 'realtime',
      priority: 'critical'
    },
    
    // Member activity: Daily digest, no push
    group_member_joined: {
      inApp: true,
      push: false,
      frequency: 'daily',
      priority: 'low'
    },
    
    // Summaries: Disabled by default
    weekly_summary: {
      inApp: false,
      push: false,
      frequency: 'never',
      priority: 'low'
    }
  }
}
```

## 🚦 Migration for Existing Users

1. **No Breaking Changes**: System is additive
2. **Auto-create Preferences**: Default settings for all users
3. **One-time Onboarding**: Modal explaining new feature
4. **Encourage Opt-in**: Show benefits of push notifications
5. **Monitor & Iterate**: Track engagement, adjust defaults

## 💡 Pro Tips

### For Developers
- Use `NotificationService.create()` to create notifications
- Always check user preferences before creating
- Critical notifications bypass quiet hours
- Group similar notifications automatically
- Test push on multiple devices/browsers

### For Users
- Set high-priority groups for important teams
- Use daily digest for low-priority groups
- Enable quiet hours for better sleep
- Customize per-group to avoid spam
- Budget alerts can't be fully disabled (for your own good!)

## 🔗 Related Files

- **Full Design Doc**: `NOTIFICATION_SYSTEM_DESIGN.md`
- **Service Worker**: `public/sw.js`
- **Hooks**: `src/hooks/useNotifications.ts`, `src/hooks/usePushNotifications.ts`
- **API Routes**: `src/app/api/notifications/*`
- **Components**: `src/components/notifications/*`
- **Service**: `src/lib/notificationService.ts`

## 📝 Next Steps

1. ✅ Review and approve design
2. ⏳ Phase 1 implementation (Foundation)
3. ⏳ Phase 2 implementation (Types)
4. ⏳ Phase 3 implementation (Preferences)
5. ⏳ Phase 4 implementation (Grouping)
6. ⏳ Phase 5 implementation (Push)
7. ⏳ Phase 6 implementation (Polish)
8. ⏳ Testing and QA
9. ⏳ User documentation
10. ⏳ Launch! 🚀

---

**For full details, see:** `NOTIFICATION_SYSTEM_DESIGN.md`

**Questions?** Let's discuss before starting implementation!

