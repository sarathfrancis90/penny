# 🎯 Group Management - Complete Feature Design

## Overview
Comprehensive group management system with settings, member management, expense controls, and analytics.

---

## 🏗️ Architecture

### Pages Structure
```
/groups                          → List all groups
/groups/[id]                     → Group detail & expenses
/groups/[id]/settings            → Group settings (NEW)
/groups/[id]/members             → Member management (NEW)
/groups/[id]/analytics           → Group analytics (FUTURE)
```

### API Routes
```
POST   /api/groups                          → Create group (✅ Done)
GET    /api/groups                          → List user's groups (✅ Done)
GET    /api/groups/[id]                     → Get group details (✅ Done)
PUT    /api/groups/[id]                     → Update group (✅ Done)
DELETE /api/groups/[id]                     → Delete group (⏳ To implement)
POST   /api/groups/[id]/archive             → Archive group (⏳ To implement)
POST   /api/groups/[id]/leave               → Leave group (⏳ To implement)

GET    /api/groups/[id]/members             → List members (✅ Done)
POST   /api/groups/[id]/members             → Invite member (✅ Done)
PATCH  /api/groups/[id]/members/[memberId] → Update role (✅ Done)
DELETE /api/groups/[id]/members/[memberId] → Remove member (✅ Done)

GET    /api/groups/[id]/expenses            → List group expenses (⏳ To implement)
POST   /api/groups/[id]/expenses/[expenseId]/approve → Approve expense (FUTURE)
POST   /api/groups/[id]/expenses/[expenseId]/reject  → Reject expense (FUTURE)

GET    /api/groups/[id]/activity            → Get activity log (⏳ To implement)
GET    /api/groups/[id]/analytics           → Get analytics (FUTURE)
```

---

## 📋 Feature Breakdown

### 1. ⚙️ Group Settings Page (Priority: HIGH)

**Location:** `/groups/[id]/settings`

**Sections:**

#### A. Basic Information
- **Name**: Text input (required, 3-50 chars)
- **Description**: Textarea (optional, max 200 chars)
- **Icon**: Emoji picker (default: 👥)
- **Color**: Color picker (hex, default: #6366f1)

#### B. Expense Settings
- **Default Category**: Dropdown (from expense categories)
- **Currency**: Dropdown (CAD, USD, EUR, GBP, etc.)
- **Require Approval**: Toggle
  - If ON: All expenses need admin/owner approval
  - Shows approval status on expense cards

#### C. Budget Settings
- **Budget Amount**: Number input (optional)
- **Budget Period**: Dropdown (Monthly, Quarterly, Yearly)
- **Budget Alert**: Percentage threshold (e.g., 80%)

#### D. Member Permissions
- **Allow Member Invites**: Toggle
  - If ON: Members can invite others
  - If OFF: Only admin/owner can invite

#### E. Danger Zone
- **Archive Group**: 
  - Makes group read-only
  - Can be restored later
  - Keeps all data
  
- **Delete Group**: 
  - Permanent deletion
  - Removes all group data
  - Expenses become personal
  - Requires confirmation with group name

**Permissions:**
- Owner: Can change all settings
- Admin: Can change expense settings, member permissions
- Member/Viewer: Read-only

---

### 2. 👥 Member Management (Priority: HIGH)

**Location:** `/groups/[id]/members` (or tab on detail page)

**Features:**

#### A. Member List
- Avatar with initials
- Name & email
- Role badge (Owner/Admin/Member/Viewer)
- Join date
- Last activity
- Actions dropdown (if permitted)

#### B. Member Actions
**For Owner:**
- Change any member's role (except own)
- Remove any member
- Transfer ownership (requires confirmation)

**For Admin:**
- Change member/viewer roles
- Remove members (not admins/owner)
- Invite members

**For Members:**
- Invite members (if allowed in settings)
- Leave group

#### C. Pending Invitations
- List of pending invites
- Cancel invitation button
- Resend invitation button
- Copy invitation link

#### D. Role Descriptions
Show what each role can do:
- **Owner**: Full control, can delete group
- **Admin**: Manage members, approve expenses, change settings
- **Member**: Add/edit own expenses, view reports
- **Viewer**: View expenses and reports only

---

### 3. 💰 Expense Management (Priority: MEDIUM)

**Location:** `/groups/[id]` (current page, enhance)

**Enhancements:**

#### A. Expense List Improvements
- **Filters**:
  - By member
  - By category
  - By approval status
  - By date range

- **Sorting**:
  - Date (newest/oldest)
  - Amount (high/low)
  - Category

- **Bulk Actions**:
  - Export selected
  - Approve/reject multiple (if admin)

#### B. Approval Workflow (if requireApproval: true)
- Pending expenses show yellow badge
- Admin/owner sees "Approve" / "Reject" buttons
- Can add rejection reason
- Member gets notification
- Approved expenses show green badge

#### C. Expense Actions
**For Owner/Admin:**
- Edit any expense
- Delete any expense
- Approve/reject expenses

**For Member:**
- Edit own expenses (before approval)
- Delete own expenses (before approval)

**For Viewer:**
- View only

---

### 4. 📊 Activity Log (Priority: MEDIUM)

**Location:** `/groups/[id]/activity` (or tab on detail page)

**Features:**

#### A. Activity Types
```typescript
type ActivityAction = 
  | "group_created"
  | "group_updated"
  | "group_archived"
  | "group_deleted"
  | "member_invited"
  | "member_joined"
  | "member_left"
  | "member_removed"
  | "member_role_changed"
  | "expense_added"
  | "expense_updated"
  | "expense_deleted"
  | "expense_approved"
  | "expense_rejected"
  | "settings_updated";
```

#### B. Activity Card Display
- Icon based on action type
- User avatar & name
- Action description
- Timestamp (relative, e.g., "2 hours ago")
- Details/metadata
- Link to related item (if applicable)

#### C. Filters
- By action type
- By user
- By date range

#### D. Pagination
- Load more / infinite scroll
- Show 20 activities per page

---

### 5. 📈 Analytics Dashboard (Priority: LOW - FUTURE)

**Location:** `/groups/[id]/analytics`

**Features:**

#### A. Overview Cards
- Total expenses this month
- Total expenses this year
- Average expense amount
- Top category
- Top spender

#### B. Charts
- **Spending Trend**: Line chart (last 6 months)
- **Category Breakdown**: Pie chart
- **Member Spending**: Bar chart
- **Budget Progress**: Progress bar (if budget set)

#### C. Insights
- "Spending increased 15% this month"
- "Most expenses on weekends"
- "Budget on track" / "Budget exceeded"

#### D. Export Options
- Export to Excel
- Export to PDF
- Send report by email

---

## 🎨 UI/UX Design Patterns

### Color Coding
- **Owner**: Purple gradient (`from-violet-500 to-purple-500`)
- **Admin**: Blue gradient (`from-blue-500 to-indigo-500`)
- **Member**: Green gradient (`from-green-500 to-emerald-500`)
- **Viewer**: Gray gradient (`from-gray-500 to-slate-500`)
- **Pending**: Yellow/Amber
- **Approved**: Green
- **Rejected**: Red

### Confirmation Dialogs
For destructive actions (delete, remove member):
- Modal with title & description
- Show impact ("This will affect X expenses")
- Require typing group name for delete
- "Cancel" (gray) and "Confirm" (red) buttons

### Success/Error Feedback
- Toast notifications
- Success: Green with checkmark
- Error: Red with X
- Info: Blue with info icon

### Loading States
- Skeleton loaders for cards
- Spinner for buttons during action
- Progress bar for bulk operations

---

## 🔐 Security & Permissions

### Permission Matrix

| Action | Owner | Admin | Member | Viewer |
|--------|-------|-------|--------|--------|
| View group | ✅ | ✅ | ✅ | ✅ |
| Edit settings | ✅ | ⚠️ Limited | ❌ | ❌ |
| Delete group | ✅ | ❌ | ❌ | ❌ |
| Archive group | ✅ | ✅ | ❌ | ❌ |
| Leave group | ✅* | ✅ | ✅ | ✅ |
| Invite members | ✅ | ✅ | ⚠️ If allowed | ❌ |
| Change roles | ✅ | ⚠️ Limited | ❌ | ❌ |
| Remove members | ✅ | ⚠️ Limited | ❌ | ❌ |
| Add expenses | ✅ | ✅ | ✅ | ❌ |
| Edit own expenses | ✅ | ✅ | ✅ | ❌ |
| Edit any expense | ✅ | ✅ | ❌ | ❌ |
| Delete expenses | ✅ | ✅ | ❌ | ❌ |
| Approve expenses | ✅ | ✅ | ❌ | ❌ |
| View reports | ✅ | ✅ | ✅ | ✅ |
| Export data | ✅ | ✅ | ❌ | ❌ |

*Owner can only leave if they transfer ownership first

### Firestore Rules (already implemented)
- All operations check authentication
- Permission-based access control
- Ownership validation
- Data validation on create/update

---

## 🚀 Implementation Priority

### Phase 1: Core Management (Current Sprint)
1. ✅ Group Settings Page
   - Basic info editing
   - Settings toggles
   - Archive/delete functionality

2. ✅ Enhanced Member Management
   - Change member roles
   - Remove members
   - Leave group action

3. ✅ API Routes for Management
   - Delete group endpoint
   - Archive group endpoint
   - Leave group endpoint
   - Update member role endpoint

### Phase 2: Enhanced Features (Next Sprint)
4. ⏳ Activity Log
   - View recent activity
   - Filter by type/user
   - Pagination

5. ⏳ Expense Approval Workflow
   - Approve/reject UI
   - Approval status badges
   - Notification system

6. ⏳ Enhanced Expense List
   - Advanced filters
   - Bulk actions
   - Export group expenses

### Phase 3: Analytics (Future)
7. ⏳ Analytics Dashboard
   - Charts and insights
   - Budget tracking
   - Spending trends

---

## 📱 Mobile Considerations

- All management features work on mobile
- Bottom sheet for action menus
- Swipe actions for quick operations
- Simplified layouts for small screens
- Touch-friendly buttons (min 44px)

---

## 🧪 Testing Scenarios

1. **Owner transfers ownership to admin**
   - Verify new owner has all permissions
   - Verify old owner becomes admin

2. **Admin tries to change owner's role**
   - Should fail with permission error

3. **Member leaves group**
   - Their membership status becomes "left"
   - They can't access group anymore
   - Their expenses remain in group

4. **Owner deletes group**
   - All members lose access
   - Group status becomes "deleted"
   - Expenses become personal (optional)

5. **Archive and restore group**
   - Archived group is read-only
   - Can view but not edit
   - Can restore to active state

---

## 🎯 Success Metrics

- User can create and manage groups easily
- Clear permission system
- No unauthorized actions possible
- Smooth member management
- Activity log provides transparency
- Analytics provide value

---

This design provides a complete, secure, and user-friendly group management system!

