# iTutor Platform — User Flows

All diagrams use [Mermaid](https://mermaid.js.org/) and render natively in GitHub, Notion, VS Code (with the Mermaid extension), and most modern markdown viewers.

---

## Table of Contents

1. [Authentication & Onboarding](#1-authentication--onboarding)
2. [Parent Flows](#2-parent-flows)
   - [Parent Dashboard Overview](#21-parent-dashboard-overview)
   - [Add / Link a Child](#22-add--link-a-child)
   - [Approve a Booking](#23-approve-a-booking)
   - [View Session Feedback](#24-view-session-feedback)
   - [Parent Messaging](#25-parent-messaging)
3. [Student Flows](#3-student-flows)
   - [Student Dashboard Overview](#31-student-dashboard-overview)
   - [Find & Book a Tutor](#32-find--book-a-tutor)
   - [Manage Bookings](#33-manage-bookings)
   - [Rate a Tutor](#34-rate-a-tutor)
   - [Curriculum & Syllabus](#35-curriculum--syllabus)
4. [Tutor Flows](#4-tutor-flows)
   - [Tutor Dashboard Overview](#41-tutor-dashboard-overview)
   - [Handle a Booking Request](#42-handle-a-booking-request)
   - [Set Availability](#43-set-availability)
   - [Verification Flow](#44-verification-flow)
   - [Find Students & Send Offers](#45-find-students--send-offers)
   - [Video Provider Setup](#46-video-provider-setup)
5. [Shared Flows](#5-shared-flows)
   - [Full Booking Lifecycle](#51-full-booking-lifecycle)
   - [Messaging (All Roles)](#52-messaging-all-roles)
   - [Groups & Communities](#53-groups--communities)

---

## 1. Authentication & Onboarding

### 1.1 Sign Up Flow

```mermaid
flowchart TD
    A([Landing Page /]) --> B{Authenticated?}
    B -- Yes --> C{Role?}
    B -- No --> D[/signup — Choose Role/]

    C -- student --> S[/student/dashboard/]
    C -- tutor --> T[/tutor/dashboard/]
    C -- parent --> P[/parent/dashboard/]
    C -- reviewer --> R[/reviewer/dashboard/]
    C -- admin --> AD[/admin/dashboard/]

    D --> D1[/signup/student/]
    D --> D2[/signup/tutor/]
    D --> D3[/signup/parent/]

    D1 --> E[Enter email + password]
    D2 --> E
    D3 --> E

    E --> F[Email verification sent]
    F --> G[/verify-email/]
    G --> H{Verified?}
    H -- No --> F
    H -- Yes --> I{Profile complete?}

    I -- Student, incomplete --> J[/onboarding/student/\nSet form level + subjects]
    I -- Tutor, incomplete --> K[/onboarding/tutor/\nAdd subjects + pricing]
    I -- Parent, complete --> P
    I -- Complete --> C

    J --> S
    K --> T
```

### 1.2 Login & Session Restore

```mermaid
flowchart TD
    A([/login/]) --> B[Enter email + password]
    B --> C{Credentials valid?}
    C -- No --> D[Show error, retry]
    C -- Yes --> E[Supabase session created]
    E --> F[AuthProvider fetches profile]
    F --> G{Role in profile}
    G -- student --> S[/student/dashboard/]
    G -- tutor --> T[/tutor/dashboard/]
    G -- parent --> P[/parent/dashboard/]
    G -- reviewer --> R[/reviewer/dashboard/]
    G -- admin --> AD[/admin/dashboard/]

    H([OAuth / Google]) --> E
```

### 1.3 Password Reset

```mermaid
flowchart TD
    A([/forgot-password/]) --> B[Enter email]
    B --> C[Supabase sends reset email]
    C --> D[User clicks link in email]
    D --> E[/reset-password/]
    E --> F[Enter new password]
    F --> G{Valid?}
    G -- No --> F
    G -- Yes --> H[Password updated]
    H --> I[Redirect to /login/]
```

---

## 2. Parent Flows

### 2.1 Parent Dashboard Overview

```mermaid
flowchart LR
    P([/parent/dashboard/]) --> A[Profile Header\nAvatar upload]
    P --> B[Children List\nColor-coded cards]
    P --> C[Upcoming Sessions\nNext 5 bookings]
    P --> D[Recent Bookings]
    P --> E[Recent Payments]

    B --> B1[Click child card]
    B1 --> B2[/parent/child/childId/\nChild profile + stats]
    B2 --> B3[/parent/child/childId/bookings/]
    B2 --> B4[/parent/child/childId/sessions/]
    B2 --> B5[/parent/child/childId/ratings/]
```

### 2.2 Add / Link a Child

```mermaid
flowchart TD
    A([/parent/dashboard/]) --> B[Click Add Child]
    B --> C[/parent/add-child/]
    C --> D{Mode?}

    D -- Create new account --> E[Enter child details\nName, email, password,\nschool, form, subjects]
    E --> F[POST /api/parent/add-child]
    F --> G{Success?}
    G -- Yes --> H[Child account created\nbilling_mode = parent_required]
    G -- No --> I[Show error]
    H --> J[Back to dashboard\nChild appears in list]

    D -- Link existing student --> K[Enter child's email]
    K --> L[POST /api/parent/link-child]
    L --> M{Student found?}
    M -- Yes --> N[Link created\nParent-child relationship stored]
    M -- No --> O[Student not found error]
    N --> J
```

### 2.3 Approve a Booking

```mermaid
flowchart TD
    A([Notification: child booking pending]) --> B[/parent/approve-bookings/]
    B --> C[View booking details\nTutor, subject, time, price]
    C --> D{Parent decision}

    D -- Approve --> E[PATCH /api/bookings/tutor-confirm]
    E --> F[Booking status → CONFIRMED]
    F --> G[Session created with meeting link]
    G --> H[Both student + tutor notified]

    D -- Counter-offer --> I[Select new time slot]
    I --> J[Booking status → PENDING_TUTOR_APPROVAL\nwith counter time]
    J --> K[Tutor receives counter-offer]

    D -- Decline --> L[Booking status → CANCELLED]
    L --> M[Student notified]
```

### 2.4 View Session Feedback

```mermaid
flowchart TD
    A([/parent/session-feedback/]) --> B[Fetch feedback for all children]
    B --> C[Tutor Notes tab\nSession notes from tutors]
    B --> D[Student Reviews tab\nRatings child gave tutors]

    C --> C1[Grouped by subject + tutor]
    C1 --> C2[Note text, date, session details]

    D --> D1[Star rating + comment]
    D1 --> D2[Date, tutor name, subject]
```

### 2.5 Parent Messaging

```mermaid
flowchart TD
    A([/parent/messages/]) --> B[Conversations list\nwith tutors]
    B --> C[Click conversation]
    C --> D[/parent/messages/conversationId/]
    D --> E[Real-time message thread\nvia Supabase]
    E --> F[Type + send message]
    F --> G[Message stored in DB]
    G --> H[Tutor receives notification]
```

---

## 3. Student Flows

### 3.1 Student Dashboard Overview

```mermaid
flowchart LR
    S([/student/dashboard/]) --> A[Welcome Header\nProfile snapshot]
    S --> B[Stats Row\nHours · Rating · Reviews]
    S --> C[Upcoming Sessions\nNext 5]
    S --> D[Lesson Offers\nOffers from tutors]
    S --> E[Learning Journey]
    S --> F[Recent Tutors]

    C --> C1[Click session\nView details / join link]
    D --> D1[Accept or decline offer]
    F --> F1[/student/tutors/tutorId/\nFull tutor profile]
```

### 3.2 Find & Book a Tutor

```mermaid
flowchart TD
    A([/student/find-tutors/]) --> B[Browse tutor cards\nAvatar · Name · Bio · Rating]
    B --> C[Apply filters\nSubject · Rating · Price · School]
    C --> D[Pagination — 12 per page]
    D --> E[Click tutor card]
    E --> F[/student/tutors/tutorId/\nFull profile + reviews]
    F --> G[Select subject + time slot]
    G --> H[POST /api/bookings/create]
    H --> I{billing_mode?}

    I -- self_allowed --> J[Booking status:\nPENDING_TUTOR_APPROVAL]
    I -- parent_required --> K[Booking status:\nPENDING_PARENT_APPROVAL]

    J --> L[Tutor receives request\nSee Tutor: Handle Booking]
    K --> M[Parent receives approval request\nSee Parent: Approve Booking]
```

### 3.3 Manage Bookings

```mermaid
flowchart TD
    A([/student/bookings/]) --> B[Tabs filter]
    B --> BA[All]
    B --> BB[Pending]
    B --> BC[Confirmed]
    B --> BD[Cancelled]
    B --> BE[Past]

    BB --> C[Pending booking card]
    C --> D{Student action}
    D -- Cancel --> E[POST /api/bookings/student-cancel]
    E --> F[Status → CANCELLED]
    D -- Wait --> G[Awaiting tutor/parent]

    BC --> H[Confirmed booking card]
    H --> I[View meeting link]
    H --> J[Join session at scheduled time]
    J --> K[POST /api/student/sessions/sessionId/attendance]

    BE --> L[Past session card]
    L --> M[Rate tutor if not yet rated]
    M --> N[See: Rate a Tutor flow]
```

### 3.4 Rate a Tutor

```mermaid
flowchart TD
    A([Session ends]) --> B{middleware.ts:\npending feedback?}
    B -- Yes --> C[Redirect to /rate-session/]
    B -- No --> D[/student/dashboard/]

    C --> E[Star rating 1–5]
    E --> F[Optional written review]
    F --> G[Submit rating]
    G --> H[Stored in ratings table]
    H --> I[/student/dashboard/]

    J([/student/ratings/]) --> K[View all ratings given]
    K --> L[Deduplicated by tutor]
```

### 3.5 Curriculum & Syllabus

```mermaid
flowchart TD
    A([/student/curriculum/]) --> B[Browse syllabuses\nfor enrolled subjects]
    B --> C[Search by keyword]
    C --> D[Click syllabus]
    D --> E[/student/curriculum/syllabusId/]
    E --> F[View full syllabus details]
    F --> G[Download PDF]
```

---

## 4. Tutor Flows

### 4.1 Tutor Dashboard Overview

```mermaid
flowchart LR
    T([/tutor/dashboard/]) --> A[Profile Header\nAvatar · Banner · Bio · Edit]
    T --> B[Verification Badge\nStatus indicator]
    T --> C[Subjects + Pricing\nAdd / edit subjects]
    T --> D[Upcoming Sessions\nNext 5]
    T --> E[Sent Offers\nOffers sent to students]
    T --> F[Rating & Reviews\nAverage + recent]
    T --> G[Video Provider\nConnection status]

    B --> B1[/tutor/verification/\nSee Verification Flow]
    C --> C1[Modal: add subject\nSubject · Price · Level]
    G --> G1[/tutor/video-setup/\nSee Video Setup]
```

### 4.2 Handle a Booking Request

```mermaid
flowchart TD
    A([/tutor/bookings/]) --> B[Tabs filter]
    B --> BA[Pending]
    B --> BB[Confirmed]
    B --> BC[Cancelled]
    B --> BD[Past]

    BA --> C[Booking request card\nStudent · Subject · Time · Price]
    C --> D{Tutor decision}

    D -- Confirm --> E[POST /api/bookings/tutor-confirm]
    E --> F{billing_mode?}
    F -- self_allowed --> G[Status → CONFIRMED]
    F -- parent_required --> H[Status → PENDING_PARENT_APPROVAL]
    G --> I[Session created + meeting link generated]
    H --> J[Parent notified for approval]

    D -- Counter-offer --> K[Select alternative time]
    K --> L[Status → PENDING_STUDENT_APPROVAL\nwith counter time]
    L --> M[Student notified of counter]

    D -- Decline --> N[POST /api/bookings/tutor-cancel]
    N --> O[Status → CANCELLED]
    O --> P[Student notified]

    BB --> Q[Confirmed booking card]
    Q --> R[View meeting link]
    Q --> S[Cancel if needed → CANCELLED]
```

### 4.3 Set Availability

```mermaid
flowchart TD
    A([/tutor/availability/]) --> B[Availability Rules Section]
    B --> C[Add weekly rule\nDay · Start time · End time\nSlot duration · Buffer]
    C --> D[Saved to tutor_availability_rules]

    A --> E[Unavailability Blocks Section]
    E --> F[Add date range block\nStart date · End date · Reason optional]
    F --> G[Saved to tutor_unavailability_blocks]

    A --> H[/tutor/calendar/\nWeek view]
    H --> I[See confirmed bookings\nas calendar events]
    H --> J[See availability rules\nas background slots]
    H --> K[Navigate by week]

    D --> L[Students can only book\nwithin available slots]
    G --> L
```

### 4.4 Verification Flow

```mermaid
flowchart TD
    A([/tutor/verification/]) --> B[Check current status]
    B --> C{Status?}

    C -- Not submitted --> D[Upload degree documents\nPDF or image]
    D --> E[POST /api/tutor/verification/upload]
    E --> F[Status → PENDING_REVIEW]
    F --> G[Reviewer notified]

    C -- Pending review --> H[Waiting state shown\nSupport contact available]

    C -- Approved --> I[Verified badge displayed]
    I --> J[/tutor/verification/manage-subjects/]
    J --> K[Toggle subject visibility ON/OFF]
    K --> L[PATCH /api/tutor/verified-subjects/id/visibility]
    L --> M[Visible subjects appear\nin student search]

    C -- Rejected --> N[Rejection reason shown]
    N --> D

    G --> O([/reviewer/dashboard/])
    O --> P[Reviewer reads documents]
    P --> Q{Decision}
    Q -- Approve --> I
    Q -- Reject --> N
```

### 4.5 Find Students & Send Offers

```mermaid
flowchart TD
    A([/tutor/find-students/]) --> B[Browse student cards\nAvatar · Name · School · Form level]
    B --> C[Apply filters\nForm level · School · Subjects]
    C --> D[Pagination — 12 per page]
    D --> E[Click student card]
    E --> F[/tutor/students/studentId/\nFull student profile]
    F --> G[Send lesson offer]
    G --> H[Offer appears on student dashboard\nunder Lesson Offers]
    H --> I{Student response}
    I -- Accept --> J[Booking created\nStatus → PENDING_TUTOR_APPROVAL]
    I -- Decline --> K[Offer removed]
```

### 4.6 Video Provider Setup

```mermaid
flowchart TD
    A([/tutor/video-setup/]) --> B{Provider choice}

    B -- Google Meet --> C[Connect Google account\nOAuth flow]
    C --> D[Google OAuth consent]
    D --> E[/auth/callback — tokens stored\nencrypted with TOKEN_ENCRYPTION_KEY]
    E --> F[Status: Google Meet connected]

    B -- Zoom --> G[Connect Zoom account\nOAuth flow]
    G --> H[Zoom OAuth consent]
    H --> E
    E --> I[Status: Zoom connected]

    F --> J[Meeting links auto-generated\nfor confirmed sessions]
    I --> J
```

---

## 5. Shared Flows

### 5.1 Full Booking Lifecycle

```mermaid
stateDiagram-v2
    [*] --> PENDING_TUTOR_APPROVAL : Student requests booking\n(self_allowed billing)
    [*] --> PENDING_PARENT_APPROVAL : Student requests booking\n(parent_required billing)

    PENDING_PARENT_APPROVAL --> PENDING_TUTOR_APPROVAL : Parent approves
    PENDING_PARENT_APPROVAL --> CANCELLED : Parent declines

    PENDING_TUTOR_APPROVAL --> CONFIRMED : Tutor confirms
    PENDING_TUTOR_APPROVAL --> CANCELLED : Tutor declines
    PENDING_TUTOR_APPROVAL --> PENDING_STUDENT_APPROVAL : Tutor counter-offers

    PENDING_STUDENT_APPROVAL --> CONFIRMED : Student accepts counter
    PENDING_STUDENT_APPROVAL --> CANCELLED : Student declines counter

    CONFIRMED --> IN_PROGRESS : Session start time reached
    IN_PROGRESS --> COMPLETED : Session ends
    CONFIRMED --> CANCELLED : Either party cancels

    COMPLETED --> [*] : Student rates tutor\nTutor leaves session notes
    CANCELLED --> [*]
```

### 5.2 Messaging (All Roles)

```mermaid
flowchart TD
    A([Any role: /messages/]) --> B[Conversations list\nSorted by latest message]
    B --> C[Click conversation]
    C --> D[/messages/conversationId/\nReal-time thread via Supabase]
    D --> E[View message history]
    E --> F[Type message]
    F --> G[Send]
    G --> H[INSERT into messages table]
    H --> I[Supabase realtime\npushes to recipient]
    I --> J[Recipient sees message\nin real time]
    J --> K[Push notification\nif recipient offline]

    L[New conversation] --> M[Find user via search\nor from their profile]
    M --> N[POST /api/conversations/create]
    N --> D
```

### 5.3 Groups & Communities

```mermaid
flowchart TD
    A([/groups/]) --> B{Feature flag:\nisGroupsFeatureEnabled?}
    B -- No --> C[Redirect to dashboard]
    B -- Yes --> D[Browse group classes]
    D --> E[/groups/groupId/]
    E --> F[Tabs: Feed · Members · Sessions · Reviews]

    F --> G[Enroll in group]
    G --> H[POST /api/groups/groupId/enroll]
    H --> I[/student/groups/\nMy enrolled groups]

    E --> J[Group sessions list]
    J --> K[/api/groups/groupId/sessions/sessionId/\nOccurrence details]
    K --> L[RSVP to occurrence]
    L --> M[/api/groups/.../rsvp]
    M --> N[Get meeting link at session time]
    N --> O[/api/groups/.../join-link]

    P([/communities/]) --> Q{Feature flag:\nisCommunitiesArchived?}
    Q -- Yes --> R[Redirect to dashboard]
    Q -- No --> S[Browse subject communities]
    S --> T[/communities/communityId/\nQ&A feed]
    T --> U[Post question]
    T --> V[Answer question]
    T --> W[/communities/communityId/q/questionId/\nQuestion + answers]
```

### 5.4 Cron Jobs (Background Tasks)

```mermaid
flowchart LR
    CRON[Scheduler] --> A[/api/cron/send-reminders/\nSession reminders to users]
    CRON --> B[/api/cron/process-charges/\nProcess session payments via WiPay]
    CRON --> C[/api/cron/send-onboarding-emails/\nOnboarding email sequences]

    A --> D[notificationService\nPush + email]
    B --> E[commissionCalculator\nTutor earnings after platform cut]
    C --> F[emailService\nResend API]

    G[CRON_SECRET header] --> A
    G --> B
    G --> C
```

---

## Role Access Summary

| Feature | Student | Tutor | Parent |
|---|:---:|:---:|:---:|
| Dashboard | ✅ | ✅ | ✅ |
| Find tutors | ✅ | — | ✅ |
| Find students | — | ✅ | — |
| Request booking | ✅ | — | — |
| Confirm/decline booking | — | ✅ | — |
| Approve child booking | — | — | ✅ |
| Set availability | — | ✅ | — |
| Verification upload | — | ✅ | — |
| Session feedback notes | — | ✅ (write) | ✅ (read) |
| Rate tutor | ✅ | — | — |
| Messaging | ✅ | ✅ | ✅ |
| Curriculum | ✅ | ✅ | — |
| Groups | ✅ | ✅ | — |
| Communities | ✅ | ✅ | ✅ |
| Add/manage children | — | — | ✅ |
| Video provider setup | — | ✅ | — |
