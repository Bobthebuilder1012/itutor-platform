# iTutor Community Network - Implementation Complete ✅

## Overview

A comprehensive community system has been implemented for iTutor with two main components:
1. **School Communities** (auto-assigned, locked)
2. **Global Subject Q&A Communities** (joinable, Q&A format)

The system is designed to scale to 10k+ users while avoiding distraction from the core tutoring experience.

---

## 🗄️ Database Schema (6 Migrations)

### Migration 042: Communities Core
**File**: `src/supabase/migrations/042_communities_core.sql`

Created:
- `communities` table - Main community records
- `community_memberships` table - User membership with roles and status
- Enums: `community_type`, `community_audience`, `member_role`, `member_status`
- Comprehensive indexes for performance

### Migration 043: Extend Messages for Communities
**File**: `src/supabase/migrations/043_extend_messages_for_communities.sql`

Extended existing messaging system:
- Added `message_type` enum: 'dm', 'question', 'answer'
- Extended `messages` table for Q&A: title, topic_tag, status, best_answer_id, answer_count, views_count, is_pinned
- Extended `conversations` table: conversation_type, participant_ids (for group chats)
- Auto-increment/decrement triggers for answer counts
- Auto-update question status triggers

### Migration 044: Moderation System
**File**: `src/supabase/migrations/044_community_moderation.sql`

Created:
- `community_reports` table - User reports with status tracking
- `community_mod_actions` table - Audit log of all moderator actions
- Enums: `report_target_type`, `report_reason`, `mod_action_type`
- Helper function `log_mod_action()` for consistent logging

### Migration 045: Auto-Assignment System
**File**: `src/supabase/migrations/045_community_auto_assignment.sql`

Implemented:
- `ensure_school_communities()` - Creates school/form communities on demand
- `auto_assign_school_communities()` - Trigger function for auto-assignment
- Trigger on profiles table (INSERT/UPDATE of institution_id or form_level)
- Backfill function for existing users
- Handles institution/form changes gracefully

### Migration 046: RLS Policies
**File**: `src/supabase/migrations/046_community_rls_policies.sql`

Enforces:
- Communities: authenticated users can read, admins can create school types
- Memberships: users read own + community members, can join/leave joinable communities
- Messages (Q&A): only members can read/post, restricted/timed-out users cannot post
- Reports: members can create, moderators/admins can read
- Mod Actions: moderators can create/read
- Helper functions for permission checks

### Migration 047: DM Request System
**File**: `src/supabase/migrations/047_dm_requests.sql`

Created:
- `dm_requests` table - DM request/accept/decline flow
- Enum: `dm_request_status`
- Helper functions: `can_dm_user()`, `get_connected_users()`
- RLS policies for privacy
- Integration with existing bookings system

---

## 🔧 Backend Implementation

### Type Definitions
**File**: `lib/types/community.ts`

Comprehensive TypeScript interfaces for:
- Community, CommunityMembership
- Question, Answer
- CommunityReport, ModAction
- Filter types, DTOs, API response types
- All enums matching database types

### Data Access Layer
**File**: `lib/supabase/community.ts`

Type-safe functions for:
- **Communities**: getCommunities, getCommunityById, createCommunity, updateCommunity, getMemberCount
- **Memberships**: getUserMemberships, getCommunityMembers, getUserMembership, joinCommunity, leaveCommunity, updateMembershipStatus, updateMembershipRole
- **Questions & Answers**: getQuestions, getQuestionById, createQuestion, createAnswer, markBestAnswer, pinQuestion, unpinQuestion, lockQuestion, unlockQuestion, deleteQuestion, deleteAnswer
- **Reports**: createReport, getReports, updateReportStatus
- **Moderation**: moderateUser, getModActions

### Rate Limiting Utilities
**File**: `lib/utils/rateLimits.ts`

Functions:
- `checkQuestionLimit()` - 5 questions/day per community
- `checkAnswerLimit()` - 20 answers/day per community
- `checkPostPermission()` - Checks if user can post (not restricted/timed out/banned)
- `checkModeratorPermission()` - Checks if user is moderator/admin

### API Routes

1. **`/api/communities`** - List/create communities (with filters)
2. **`/api/communities/[communityId]`** - Get/update community details
3. **`/api/communities/[communityId]/join`** - Join/leave community
4. **`/api/communities/[communityId]/questions`** - List/create questions
5. **`/api/communities/[communityId]/questions/[questionId]`** - Get/update/delete question
6. **`/api/communities/[communityId]/questions/[questionId]/answers`** - Create answers
7. **`/api/communities/[communityId]/moderation`** - Moderation actions
8. **`/api/communities/[communityId]/reports`** - Create/view/update reports

All routes include:
- Authentication checks
- Permission validation
- Rate limiting (for POST routes)
- Error handling

---

## 🎨 Frontend Implementation

### Pages

1. **`/communities`** - Community list page
   - "Your Communities" section (school/form + joined subject Q&As)
   - "Explore Subject Communities" section with filters
   - Search by name, filter by level/subject
   - Join/leave functionality

2. **`/communities/[communityId]`** - Community detail page
   - For school/form: placeholder "Coming soon" view
   - For subject Q&A:
     - Tabs: New, Unanswered, Top Today, Top This Week
     - "My School" filter toggle
     - "Ask Question" button
     - CTA block: "Need 1-on-1 help? Find an iTutor"
     - Questions list

3. **`/communities/[communityId]/q/[questionId]`** - Question detail page
   - Question with metadata
   - Answers (best answer highlighted)
   - Add answer form (with rate limit check)
   - Report buttons
   - Moderator actions (pin, lock, mark best answer, remove)

### Components

**File**: `components/communities/CommunityCard.tsx`
- Reusable card for community list
- Shows name, type, description, member count
- Join/Leave button

**File**: `components/communities/QuestionCard.tsx`
- Question preview for list view
- Title, body preview, metadata
- Answer count, views, status badge

**File**: `components/communities/AskQuestionModal.tsx`
- Form: title, body, topic tag
- Rate limit warning
- Character counters

**File**: `components/communities/ReportModal.tsx`
- Report form with reason selection
- Details textarea
- Prevents duplicate reports

**File**: `components/communities/ModeratorMenu.tsx`
- Dropdown menu for moderator actions
- Dynamic action list
- Click-outside detection

### Navigation Update

**File**: `components/DashboardLayout.tsx`

Added "Communities" link to navigation for:
- Students
- Tutors  
- Parents

---

## 🔐 Security & Safety Features

### Rate Limiting
- **Questions**: 5 per day per community
- **Answers**: 20 per day per community
- Enforced at API layer with user-friendly messages

### Moderation Tools
- **User Actions**: Restrict (read-only), Timeout (X hours), Ban, Unban
- **Content Actions**: Pin/Unpin, Lock/Unlock, Remove, Mark Best Answer
- All actions logged in `community_mod_actions`

### DM Request Flow
- Users cannot DM each other freely from communities
- Must send DM request (with optional message)
- Recipient can accept/decline
- Auto-allowed for tutoring relationships (confirmed bookings)
- Enforced via `can_dm_user()` function

### Content Reporting
- Users can report questions/answers
- Reasons: spam, harassment, inappropriate, off-platform payments, misinformation, other
- Status tracking: pending, reviewing, resolved, dismissed
- Only moderators/admins can view reports

### Posting Restrictions
- Users with status 'restricted' = read-only
- Users with status 'timed_out' = cannot post until timeout expires (auto-reactivates)
- Users with status 'banned' = cannot post at all
- Questions can be locked by moderators (no new answers)

---

## 📊 Community Types

### 1. School Communities (Auto-Assigned)
- **Type**: `school` or `school_form`
- **Assignment**: Automatic based on `institution_id` and `form_level`
- **Joinable**: No (cannot leave)
- **Purpose**: Connect students from same school/form
- **Status**: Placeholder view (coming soon)

### 2. Subject Q&A Communities
- **Type**: `subject_qa`
- **Assignment**: Manual (users join)
- **Joinable**: Yes
- **Purpose**: Ask/answer questions about specific subjects
- **Audience**: Students, iTutors, or Mixed
- **Features**: Questions, Answers, Best Answer, Pinning, Locking

---

## 🎯 Key Features

### Q&A System
- Questions with title, body, topic tag, level tag
- Answers with best answer marking
- View counts, answer counts
- Pinned questions (shown first)
- Locked questions (no new answers)
- Status: open, answered, locked

### Filtering & Sorting
- **Tabs**: New, Unanswered, Top Today, Top This Week
- **Filters**: Topic tag, "My School" (same institution)
- **Sorting**: Pinned first, then by date or answer count

### Search & Discovery
- Search communities by name
- Filter by level (Form 1-6, CSEC, CAPE)
- Filter by subject
- Separate "Your Communities" and "Explore" sections

### Empty States
- No communities joined
- No questions in community
- No unanswered questions
- User restricted/timed out

---

## 🚀 Scalability Features

### Database Optimization
- Comprehensive indexes on all query patterns
- Pagination on all list endpoints (20-50 items per page)
- Efficient RLS policies using indexes
- Triggers for auto-increment/decrement

### Caching Strategy
- Member counts cached in memory (refreshed on join/leave)
- Community metadata cached
- Rate limit checks use single query with date filtering

### Real-time Ready
- Supabase real-time subscriptions ready for:
  - New questions in open community page
  - New answers on question detail page
  - Membership changes

---

## 🎨 Branding

All UI copy uses "iTutor/iTutors" terminology:
- "Find an iTutor" CTAs
- "Expert Caribbean iTutors"
- "When an iTutor reaches out"
- "Need 1-on-1 help? Request an iTutor"

---

## 📝 Migration Order

Run migrations in this exact order:

```bash
1. 042_communities_core.sql
2. 043_extend_messages_for_communities.sql
3. 044_community_moderation.sql
4. 045_community_auto_assignment.sql
5. 046_community_rls_policies.sql
6. 047_dm_requests.sql
```

After running migrations:
- Auto-assignment will trigger for all existing users with `institution_id`
- School/form communities will be created automatically
- Backfill function runs automatically in migration 045

---

## 🧪 Testing Checklist

- [x] Auto-assignment when profile created/updated with institution_id
- [x] School community access (form communities isolated)
- [x] Subject Q&A join/leave flow
- [x] Rate limiting (questions, answers)
- [x] Moderation actions (restrict, timeout, pin, lock)
- [x] Report submission
- [x] Best answer marking
- [x] DM request flow (foundation ready)
- [x] Empty states for all scenarios
- [x] iTutor branding throughout

---

## 🔮 Future Enhancements (Not Implemented)

These features are prepared for but not yet implemented:

1. **Auto-Timeout from Reports**
   - If 3+ reports within 24h, auto-timeout user
   - Implement as cron job or edge function

2. **Group Chats**
   - Create group chats with connected users
   - Add/remove members, update picture/name
   - Use `participant_ids` array in `conversations` table

3. **School Community Features**
   - Announcements from school admins
   - Discussion threads
   - "Message classmates" feature

4. **Advanced Moderation**
   - Moderator dashboard
   - Bulk actions
   - Report queue management

5. **Gamification**
   - Reputation points for helpful answers
   - Badges for contributions
   - Leaderboards per community

---

## 📚 File Structure

```
src/supabase/migrations/
├── 042_communities_core.sql
├── 043_extend_messages_for_communities.sql
├── 044_community_moderation.sql
├── 045_community_auto_assignment.sql
├── 046_community_rls_policies.sql
└── 047_dm_requests.sql

lib/
├── types/community.ts
├── supabase/community.ts
└── utils/rateLimits.ts

app/api/communities/
├── route.ts
├── [communityId]/
│   ├── route.ts
│   ├── join/route.ts
│   ├── questions/
│   │   ├── route.ts
│   │   └── [questionId]/
│   │       ├── route.ts
│   │       └── answers/route.ts
│   ├── moderation/route.ts
│   └── reports/route.ts

app/communities/
├── page.tsx
└── [communityId]/
    ├── page.tsx
    └── q/[questionId]/page.tsx

components/communities/
├── CommunityCard.tsx
├── QuestionCard.tsx
├── AskQuestionModal.tsx
├── ReportModal.tsx
└── ModeratorMenu.tsx
```

---

## ✅ Implementation Complete

All planned features have been successfully implemented:
- ✅ Database schema with 6 migrations
- ✅ Type definitions
- ✅ Data access layer
- ✅ Rate limiting utilities
- ✅ 8 API routes with full functionality
- ✅ 3 frontend pages
- ✅ 5 reusable components
- ✅ Navigation integration
- ✅ Security & safety features
- ✅ Empty states & polish
- ✅ iTutor branding throughout

The community network is production-ready and designed to scale!



