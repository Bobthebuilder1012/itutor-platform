# 🔔 Notifications & Messaging System

## ✅ What I've Created So Far:

### **1. Database Schema (`015_notifications_and_messages.sql`)**
- ✅ `notifications` table - stores all notifications
- ✅ `conversations` table - tracks 1-on-1 chats
- ✅ `messages` table - stores direct messages
- ✅ Automatic triggers for notifications:
  - New booking request → notify tutor
  - Booking accepted/declined/counter → notify student
  - New message → notify recipient
- ✅ Real-time subscriptions ready
- ✅ RLS policies configured

### **2. TypeScript Types (`lib/types/notifications.ts`)**
- ✅ `Notification` type
- ✅ `Conversation` and `ConversationWithParticipant` types
- ✅ `Message` and `MessageWithSender` types
- ✅ Helper functions for icons and colors

### **3. Service Layer (`lib/services/notificationService.ts`)**
- ✅ `getNotifications()` - fetch user's notifications
- ✅ `getUnreadNotificationCount()` - get badge count
- ✅ `markNotificationAsRead()` - mark as read
- ✅ `subscribeToNotifications()` - real-time updates
- ✅ `getConversations()` - fetch inbox
- ✅ `getMessages()` - fetch conversation messages
- ✅ `sendMessage()` - send a message
- ✅ `subscribeToMessages()` - real-time message updates

---

## 🚀 What Needs to Be Built Next:

### **Phase 1: Notification Bell (High Priority)**
**File:** `components/NotificationBell.tsx`

Features:
- Bell icon in navbar with unread count badge
- Dropdown showing recent notifications
- Click notification → navigate to relevant page
- "Mark all as read" button
- Real-time updates (new notifications appear instantly)

---

### **Phase 2: Messages Inbox (High Priority)**
**File:** `app/[role]/messages/page.tsx`

Features:
- List of conversations (like WhatsApp/Instagram)
- Show last message preview
- Unread count per conversation
- Click conversation → open chat
- Search/filter conversations

---

### **Phase 3: Individual Conversation (High Priority)**
**File:** `app/[role]/messages/[conversationId]/page.tsx`

Features:
- Full chat interface
- Messages in bubbles (own messages on right, theirs on left)
- Send message input
- Real-time updates (new messages appear instantly)
- Auto-scroll to bottom
- Mark messages as read when viewing

---

### **Phase 4: Integration Points**

#### A) Add to Navigation
Update `components/DashboardLayout.tsx`:
- Add notification bell to header
- Add "Messages" link to sidebar

#### B) Create Message Button
On tutor/student profiles, add "Send Message" button to start conversations

---

## 📋 Step-by-Step Implementation:

### **STEP 1: Run Database Migration** ⭐

```bash
# In Supabase SQL Editor, run:
src/supabase/migrations/015_notifications_and_messages.sql
```

This creates all tables, triggers, and RLS policies.

---

### **STEP 2: Test Notifications Work**

1. Have a student book a session
2. Check tutor's notifications table:
```sql
SELECT * FROM public.notifications WHERE user_id = 'TUTOR_ID';
```
3. Should see "New Booking Request" notification

---

### **STEP 3: Build UI Components**

I'll create these components for you:
1. `NotificationBell` - for navbar
2. `MessagesInbox` - inbox page
3. `ConversationView` - individual chat

---

## 🎯 User Experience Flow:

### **For Tutors:**

#### Scenario 1: Student Books Session
1. Student sends booking request
2. 🔔 Bell icon shows red badge (1 unread)
3. Tutor clicks bell → sees "Joshua wants to book CSEC Math"
4. Clicks notification → goes to booking request page
5. Notification marked as read, badge disappears

#### Scenario 2: Student Sends Message
1. Student types "Hi, can you help with Chapter 5?"
2. 🔔 Bell shows notification
3. 💬 Messages icon shows unread badge
4. Tutor clicks Messages → sees conversation list
5. Clicks Joshua's conversation → opens chat
6. Types reply, hits send
7. Message appears in real-time for both

---

### **For Students:**

#### Scenario 1: Tutor Accepts Booking
1. Tutor clicks "Confirm Booking"
2. 🔔 Student's bell shows notification: "✅ Booking Accepted!"
3. Student clicks → goes to booking details
4. Can now message tutor about the session

#### Scenario 2: Tutor Sends Message
1. Tutor types "Looking forward to our session!"
2. 🔔 Student gets notification
3. 💬 Messages shows unread count
4. Student opens conversation
5. Types reply, instant delivery

---

## 🎨 UI Design Mockups:

### **Notification Bell Dropdown:**
```
┌─────────────────────────────────────┐
│ 🔔 Notifications            [Clear] │
├─────────────────────────────────────┤
│ 📅 New Booking Request              │
│    Joshua wants to book CSEC Math   │
│    2 minutes ago                 ●  │
├─────────────────────────────────────┤
│ 💬 New Message                      │
│    Sarah: "Thanks for the help!"    │
│    1 hour ago                       │
├─────────────────────────────────────┤
│ ✅ Booking Accepted                 │
│    Michael accepted your session    │
│    3 hours ago                      │
└─────────────────────────────────────┘
```

### **Messages Inbox:**
```
┌─────────────────────────────────────┐
│ 💬 Messages            [+ New]      │
├─────────────────────────────────────┤
│ [👤] Joshua Solomon            (2)  │
│      "Hi, can you help with..."     │
│      5 min ago                      │
├─────────────────────────────────────┤
│ [👤] Sarah Williams                 │
│      "Thanks for the session!"      │
│      2 hours ago                    │
├─────────────────────────────────────┤
│ [👤] Michael Brown                  │
│      "See you tomorrow!"            │
│      Yesterday                      │
└─────────────────────────────────────┘
```

### **Conversation View:**
```
┌─────────────────────────────────────┐
│ ← Joshua Solomon            [@josh] │
├─────────────────────────────────────┤
│                                     │
│  ┌──────────────────┐               │
│  │ Hey, are you     │               │
│  │ available today? │  2:30 PM      │
│  └──────────────────┘               │
│                                     │
│               ┌──────────────────┐  │
│      2:32 PM  │ Yes! What time   │  │
│               │ works for you?   │  │
│               └──────────────────┘  │
│                                     │
│  ┌──────────────────┐               │
│  │ 4pm would be     │               │
│  │ perfect!         │  2:35 PM      │
│  └──────────────────┘               │
│                                     │
├─────────────────────────────────────┤
│ Type a message...           [Send]  │
└─────────────────────────────────────┘
```

---

## 🔧 Technical Implementation Details:

### **Real-Time Updates:**
- Uses Supabase real-time subscriptions
- No polling needed
- Instant delivery of notifications and messages

### **Notification Triggers (Automatic):**
✅ Student books session → Tutor notified
✅ Tutor accepts → Student notified
✅ Tutor declines → Student notified
✅ Tutor counter-offers → Student notified
✅ Anyone sends message → Other person notified

### **Unread Badges:**
- Notification bell shows total unread notifications
- Messages icon shows total unread messages
- Each conversation shows its unread count
- Auto-marks as read when viewing

---

## 📊 Database Structure:

### **notifications:**
- Stores: booking requests, status changes, messages
- Linked to: bookings, messages
- RLS: users see only their own

### **conversations:**
- Stores: 1-on-1 chat between two users
- Tracks: last message, preview
- RLS: participants only

### **messages:**
- Stores: actual message content
- Linked to: conversation
- RLS: conversation participants only

---

## 🧪 Testing Checklist:

### Notifications:
- [ ] Student books → tutor gets notification
- [ ] Tutor accepts → student gets notification
- [ ] Tutor declines → student gets notification
- [ ] Counter-offer → student gets notification
- [ ] Message sent → recipient gets notification
- [ ] Bell badge shows correct count
- [ ] Clicking notification navigates correctly
- [ ] Mark as read works
- [ ] Real-time updates work (no refresh needed)

### Messaging:
- [ ] Can start conversation from profile
- [ ] Messages appear in real-time
- [ ] Own messages on right, theirs on left
- [ ] Unread count accurate
- [ ] Opens to correct conversation
- [ ] Auto-scrolls to latest message
- [ ] Can send message
- [ ] Marks as read when viewing

---

## 🚨 Important Notes:

1. **Run the migration first!** Everything depends on the database tables.

2. **Real-time requires Supabase Realtime enabled** - it should be by default.

3. **Testing requires two accounts** - you need both a student and tutor to test messaging.

4. **Notifications are automatic** - no manual code needed, triggers handle it.

5. **Privacy:** RLS ensures users only see their own notifications and conversations.

---

## 🎯 Next Steps (Priority Order):

1. **Run `015_notifications_and_messages.sql`** in Supabase
2. **I'll build the UI components** (NotificationBell, Messages Inbox, Chat)
3. **Test with real bookings** to verify notifications fire
4. **Polish the UI** based on your feedback

---

## 💡 Future Enhancements (After MVP):

- [ ] Push notifications (browser/mobile)
- [ ] Email notifications
- [ ] Message read receipts (blue checkmarks)
- [ ] Typing indicators ("Joshua is typing...")
- [ ] File/image sharing in messages
- [ ] Voice messages
- [ ] Group chats (for multi-student sessions)
- [ ] Message reactions (like, heart, etc.)
- [ ] Search within conversations
- [ ] Archive conversations
- [ ] Notification preferences (mute, timing)

---

**Ready to proceed! Run the migration and I'll build the UI components next.** 🚀








