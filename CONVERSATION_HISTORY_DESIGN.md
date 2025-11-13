# 💬 Conversation History - Complete Feature Design

## 🎯 Overview

Design and implement a ChatGPT-style conversation history system for Penny's AI expense chat interface. Users should be able to:
- View all past conversations
- Resume conversations from history
- Delete individual conversations
- Search through conversation history
- Automatic conversation summarization

---

## 📊 Database Schema

### Collections Structure

```typescript
// Firestore Collections

1. conversations (Collection)
   └── {conversationId} (Document)
       ├── userId: string
       ├── title: string (auto-generated from first message)
       ├── summary: string (AI-generated summary)
       ├── createdAt: Timestamp
       ├── updatedAt: Timestamp
       ├── lastMessagePreview: string (last 100 chars)
       ├── messageCount: number
       ├── status: "active" | "archived"
       ├── totalExpensesCreated: number
       └── metadata: {
           firstMessageTimestamp: Timestamp
           lastAccessedAt: Timestamp
           isPinned: boolean
         }

2. messages (Subcollection under conversations)
   └── {messageId} (Document)
       ├── conversationId: string (parent reference)
       ├── role: "user" | "assistant" | "system"
       ├── content: string
       ├── timestamp: Timestamp
       ├── attachments?: {
           type: "image" | "file"
           url: string
           fileName: string
           mimeType: string
         }[]
       ├── expenseData?: {  // If message resulted in expense
           expenseId: string
           vendor: string
           amount: number
           category: string
           confirmed: boolean
         }
       ├── metadata: {
           tokenCount?: number
           model?: string
           processingTime?: number
         }
       └── status: "sending" | "sent" | "error"
```

### Why This Structure?

**Conversations as Root Collection:**
- Easy to query all user's conversations
- Simple pagination
- Efficient listing without loading all messages

**Messages as Subcollection:**
- Keeps conversations lightweight for list views
- Messages loaded on-demand when viewing conversation
- Better Firebase query performance
- Automatic cleanup when conversation deleted

---

## 🎨 UI/UX Design

### 1. Conversation History Sidebar (Desktop)

```
┌─────────────────────────────────────────────────────────┐
│  Penny AI Expense Tracker                          [☰]  │
├───────────────────┬─────────────────────────────────────┤
│                   │                                     │
│ 💬 Chat History   │  Current Conversation              │
│ ───────────────   │  ──────────────────────────────    │
│                   │                                     │
│ [+ New Chat]      │  User: I bought groceries at...   │
│                   │                                     │
│ 📌 Pinned         │  Penny: I found receipt for:       │
│ • Grocery Run     │  • Sobeys: $45.32                  │
│   2 hours ago     │  • Groceries                       │
│                   │  [Confirm] [Edit]                  │
│ Today             │                                     │
│ • Gas Station     │  User: Add it                      │
│   5 min ago       │                                     │
│                   │  Penny: Expense saved! ✓           │
│ Yesterday         │                                     │
│ • Restaurant      │  ────────────────────────          │
│   Bills           │                                     │
│   3 expenses      │  [Message input...]      [Send]    │
│                   │                                     │
│ Last 7 Days       │                                     │
│ • Home Depot      │                                     │
│ • Uber Rides      │                                     │
│                   │                                     │
│ [See All]         │                                     │
└───────────────────┴─────────────────────────────────────┘
```

### 2. Mobile Conversation History

```
Mobile View (Slide-in Drawer):

┌─────────────────────────┐
│ ← Chat History     [+]  │ ← Header
├─────────────────────────┤
│ 🔍 Search chats...      │ ← Search
├─────────────────────────┤
│                         │
│ 📌 PINNED              │
│ ┌─────────────────────┐│
│ │ 🏪 Grocery Run       ││
│ │ "Sobeys, Walmart..." ││
│ │ 2 hours ago • 5 msgs ││
│ └─────────────────────┘│
│                         │
│ TODAY                   │
│ ┌─────────────────────┐│
│ │ ⛽ Gas Station       ││
│ │ "Shell station..."   ││
│ │ 5 min ago • 2 msgs   ││
│ └─────────────────────┘│
│                         │
│ YESTERDAY               │
│ ┌─────────────────────┐│
│ │ 🍽️ Restaurant Bills  ││
│ │ "Dinner at..."       ││
│ │ Yesterday • 8 msgs   ││
│ └─────────────────────┘│
│                         │
│ [Load More...]          │
└─────────────────────────┘
```

### 3. Conversation Card Design

```tsx
// Compact Card for List
<ConversationCard>
  <Icon>🏪</Icon>
  <Content>
    <Title>Grocery Run</Title>
    <Preview>Sobeys, Walmart, and Costco receipts</Preview>
    <Meta>
      <Time>2 hours ago</Time>
      <Dot>•</Dot>
      <Count>5 messages</Count>
      <Dot>•</Dot>
      <Expenses>3 expenses</Expenses>
    </Meta>
  </Content>
  <Actions>
    <Pin />
    <Delete />
  </Actions>
</ConversationCard>
```

---

## 🔄 User Flows

### Flow 1: Starting a New Conversation

```
1. User lands on /chat (homepage)
2. If no active conversation → Show empty state
3. User types first message
4. On send:
   a. Create new conversation document
   b. Generate initial title (from first message)
   c. Add message to messages subcollection
   d. Update URL: /chat/{conversationId}
5. Continue conversation in this thread
```

### Flow 2: Viewing History

```
Mobile:
1. User taps menu icon
2. Drawer slides in from left
3. Shows conversation list (paginated)
4. User taps conversation
5. Drawer closes, loads conversation

Desktop:
1. Sidebar always visible
2. Click conversation
3. Main chat area loads that conversation
4. URL updates to /chat/{conversationId}
```

### Flow 3: Resuming Conversation

```
1. User clicks past conversation
2. Load all messages for that conversation
3. Display in chronological order
4. Scroll to bottom (most recent)
5. Input active, ready for new message
6. New messages append to same conversation
```

### Flow 4: Deleting Conversation

```
1. User clicks delete icon/option
2. Confirmation dialog:
   "Delete 'Grocery Run'?"
   "This will permanently delete 5 messages and cannot be undone."
   [Cancel] [Delete]
3. If confirmed:
   a. Delete conversation document
   b. All messages auto-deleted (subcollection)
   c. Remove from UI
   d. If current conversation → redirect to new chat
```

---

## 🛠️ Technical Implementation

### 1. Custom Hooks

```typescript
// src/hooks/useConversations.ts
export function useConversations() {
  // Fetch all user conversations
  // Real-time updates
  // Pagination support
}

// src/hooks/useConversation.ts
export function useConversation(conversationId: string | null) {
  // Fetch single conversation with messages
  // Real-time updates for new messages
  // Handle message sending
}

// src/hooks/useConversationHistory.ts
export function useConversationHistory() {
  // Manage conversation CRUD operations
  // Create, delete, pin, archive
}
```

### 2. Components

```typescript
// src/components/chat/ConversationSidebar.tsx
- Desktop sidebar
- Shows conversation list
- Search, filter, group by date

// src/components/chat/ConversationDrawer.tsx
- Mobile slide-in drawer
- Same content as sidebar

// src/components/chat/ConversationCard.tsx
- Reusable conversation item
- Shows title, preview, metadata
- Pin/delete actions

// src/components/chat/ConversationHeader.tsx
- Shows current conversation title
- Edit title, delete, share options

// src/components/chat/EmptyConversation.tsx
- Welcome screen for new chat
- Suggestions, quick actions
```

### 3. API Routes

```typescript
// src/app/api/conversations/route.ts
GET  /api/conversations?limit=20&offset=0
  - List user conversations (paginated)
POST /api/conversations
  - Create new conversation

// src/app/api/conversations/[id]/route.ts
GET    /api/conversations/{id}
  - Get conversation + messages
PATCH  /api/conversations/{id}
  - Update conversation (title, pin, etc)
DELETE /api/conversations/{id}
  - Delete conversation + messages

// src/app/api/conversations/[id]/messages/route.ts
GET  /api/conversations/{id}/messages?limit=50&before={timestamp}
  - Get messages (paginated)
POST /api/conversations/{id}/messages
  - Add new message
```

### 4. Message Flow Architecture

```
User Types Message
       ↓
[Optimistic UI Update]
       ↓
Save to Local State
       ↓
POST /api/analyze-expense
       ↓
Save Message to Firestore
       ↓
[Real-time Listener Updates UI]
       ↓
AI Response Created
       ↓
Save Assistant Message
       ↓
[UI Updates with Response]
```

### 5. Title Generation

```typescript
// Auto-generate conversation title from first message
function generateConversationTitle(firstMessage: string): string {
  // Option 1: Use first 50 chars
  // "I bought groceries at Sobeys for $45.32"
  // → "Grocery Shopping"
  
  // Option 2: Use AI to summarize
  const prompt = `Summarize this expense conversation in 3-5 words: "${firstMessage}"`;
  
  // Option 3: Extract key entities
  // Detect: vendor name, category, or main topic
  // "Sobeys" → "Groceries at Sobeys"
}
```

---

## 📱 Responsive Behavior

### Mobile (< 768px)
- No sidebar, use drawer
- Drawer triggered by menu icon
- Full-screen conversation view
- Swipe gesture to open drawer

### Desktop (≥ 768px)
- Persistent sidebar (250-300px wide)
- Split view: sidebar + chat
- Resizable sidebar (optional)
- Keyboard shortcuts (Cmd+K to search)

---

## 🎯 Features Breakdown

### Phase 1: Core Functionality (MVP)
- [ ] Create conversation on first message
- [ ] Store messages in Firestore
- [ ] Display conversation history list
- [ ] Load and resume conversations
- [ ] Delete conversations

### Phase 2: Enhanced UX
- [ ] Auto-generate conversation titles
- [ ] Search conversations
- [ ] Pin important conversations
- [ ] Group by date (Today, Yesterday, etc)
- [ ] Pagination for long lists

### Phase 3: Advanced Features
- [ ] Archive conversations
- [ ] Bulk delete
- [ ] Export conversation (JSON, CSV)
- [ ] Share conversation (generate link)
- [ ] Conversation analytics (expense count, total spent)

### Phase 4: AI Enhancements
- [ ] AI-generated conversation summaries
- [ ] Smart search (semantic, not just text)
- [ ] Suggested conversation categories
- [ ] Auto-archive old conversations

---

## 🔐 Security & Privacy

### Firestore Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Conversations - user can only access their own
    match /conversations/{conversationId} {
      allow read, delete: if request.auth != null 
        && resource.data.userId == request.auth.uid;
      
      allow create: if request.auth != null 
        && request.resource.data.userId == request.auth.uid;
      
      allow update: if request.auth != null 
        && resource.data.userId == request.auth.uid;
      
      // Messages subcollection
      match /messages/{messageId} {
        allow read, create: if request.auth != null 
          && get(/databases/$(database)/documents/conversations/$(conversationId)).data.userId == request.auth.uid;
        
        allow delete, update: if request.auth != null 
          && get(/databases/$(database)/documents/conversations/$(conversationId)).data.userId == request.auth.uid;
      }
    }
  }
}
```

### Data Retention

- Conversations kept indefinitely by default
- User can delete anytime
- Option to auto-archive after 30 days (Phase 3)
- Deleted conversations → permanent delete (no soft delete)

---

## 💾 State Management

### Current Chat State (in-memory)
```typescript
{
  currentConversationId: string | null;
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
}
```

### Conversations List State
```typescript
{
  conversations: Conversation[];
  loading: boolean;
  hasMore: boolean;
  lastVisible: Timestamp | null; // for pagination
}
```

### Optimistic Updates

```typescript
// When sending message:
1. Add to local state immediately (optimistic)
2. Show message with "sending" status
3. Send to server
4. On success: update status to "sent"
5. On error: show error, allow retry
```

---

## 📊 Performance Considerations

### Pagination
- Load 20 conversations at a time
- Load 50 messages per conversation
- Infinite scroll for older messages

### Caching
- Cache recent conversations in memory
- Use SWR pattern (stale-while-revalidate)
- IndexedDB for offline support

### Real-time Updates
- Use Firestore snapshots for current conversation
- Polling for conversation list (less frequent)
- Debounce typing indicators

---

## 🎨 UI Components Hierarchy

```
Page: /chat or /chat/[conversationId]
├── AppLayout
│   ├── ConversationSidebar (desktop) or ConversationDrawer (mobile)
│   │   ├── SearchBar
│   │   ├── NewChatButton
│   │   └── ConversationList
│   │       ├── ConversationCard (pinned)
│   │       ├── DateDivider ("Today")
│   │       ├── ConversationCard
│   │       ├── ConversationCard
│   │       ├── DateDivider ("Yesterday")
│   │       └── ...
│   │
│   └── ChatArea
│       ├── ConversationHeader (title, actions)
│       ├── MessageList
│       │   ├── MessageBubble (user)
│       │   ├── MessageBubble (assistant)
│       │   ├── ExpenseConfirmationCard
│       │   └── ...
│       └── ChatInput
```

---

## 🔄 Migration Strategy

### Current State
- Messages stored only in React state
- Lost on page refresh
- No history

### Migration Steps
1. ✅ Create Firestore schema
2. ✅ Build hooks for data fetching
3. ✅ Create UI components
4. Update chat page to use conversations
5. Migrate existing chat messages (if any)
6. Add sidebar/drawer navigation
7. Test & deploy

### Backward Compatibility
- Current chat still works as "temporary conversation"
- On first message → auto-create conversation
- No breaking changes to existing API

---

## 📈 Success Metrics

### User Engagement
- % of users with multiple conversations
- Average messages per conversation
- Conversation retention (resumed conversations)

### Performance
- Time to load conversation list < 500ms
- Time to load messages < 300ms
- Real-time message delivery < 100ms

### Adoption
- Feature discovery rate
- Daily active conversations
- Search usage rate

---

## 🚀 Implementation Timeline

### Week 1: Foundation
- Day 1-2: Database schema + Firestore rules
- Day 3-4: Core hooks (useConversations, useConversation)
- Day 5: API routes

### Week 2: UI Components
- Day 1-2: Sidebar/Drawer components
- Day 3-4: Conversation list + cards
- Day 5: Integration with existing chat

### Week 3: Features
- Day 1-2: Search + pagination
- Day 3-4: Pin, delete, archive
- Day 5: Polish + testing

### Week 4: Launch
- Day 1-2: Bug fixes
- Day 3-4: Performance optimization
- Day 5: Deploy to production

---

## 💡 Key Design Decisions

1. **Subcollections for Messages**
   - Pro: Lightweight conversation list, auto-cleanup
   - Con: Extra read for messages (acceptable tradeoff)

2. **Auto-generated Titles**
   - Extract from first message initially
   - User can edit manually
   - AI summarization in Phase 3

3. **No Soft Delete**
   - Permanent delete for simplicity
   - User confirms deletion
   - Could add "Recently Deleted" in future

4. **Real-time Updates**
   - Current conversation: Firestore snapshots
   - Conversation list: Refresh on focus
   - Balance between real-time and performance

5. **Pagination Strategy**
   - Cursor-based (using lastVisible)
   - Better than offset for large datasets
   - Consistent results even with new data

---

## 📚 References & Best Practices

### Firestore Best Practices
- Use subcollections for 1:N relationships
- Index frequently queried fields
- Denormalize for read performance
- Use batch writes for atomicity

### Chat UI Patterns
- ChatGPT-style conversation list
- WhatsApp-style message bubbles
- Telegram-style pinned chats
- Discord-style channel organization

### Performance Patterns
- Virtual scrolling for long message lists
- Lazy loading images/attachments
- Optimistic UI updates
- Request deduplication

---

**Document Version:** 1.0  
**Last Updated:** 2025-01-13  
**Status:** Ready for Implementation

