# iTutor Parent Dashboard - Implementation Guide

## Overview

The **Parent Dashboard** is a comprehensive view-only interface that allows parents to monitor their child's tutoring activity with complete transparency and reassurance.

---

## Dashboard Features (In Order)

### 1. **Child Profile Overview**
- **Location**: Top of dashboard
- **Purpose**: Quick summary of child information
- **Displays**:
  - Child's full name
  - School name
  - Form / Year level
  - All enrolled subjects (with badges)
  - Assigned tutors (with badges)

---

### 2. **Upcoming Sessions**
- **Purpose**: View scheduled lessons
- **Displays**:
  - Date & time of each session
  - Subject
  - Tutor name
  - Session type (Online / In-Person)
  - "Join Session" button for online sessions
- **Design**: Cards with hover effects, color-coded badges

---

### 3. **Recent Tutor Feedback**
- **Purpose**: View post-session feedback from tutors
- **Displays**:
  - Session date
  - Subject
  - Topic covered
  - Effort level (Low / Medium / High)
  - Understanding level (Needs Work / Improving / Strong)
  - Tutor comment (2-3 sentences)
- **Design**: Color-coded badges based on effort and understanding

---

### 4. **Academic Focus Areas**
- **Purpose**: View tutor-updated learning status
- **Displays** (3 sections):
  - **Struggling With**: Areas needing improvement (red theme)
  - **Currently Working On**: Active learning goals (blue theme)
  - **Confident In**: Mastered topics (green theme)
- **Note**: Updated by tutors only, not editable by parents

---

### 5. **Attendance Summary**
- **Purpose**: Track session attendance
- **Displays**:
  - Total sessions booked
  - Sessions attended
  - Sessions missed (student no-shows)
  - Tutor cancellations
  - Attendance rate percentage with progress bar
- **Design**: Grid of stat cards with color-coded borders

---

### 6. **Lesson History**
- **Purpose**: View all past sessions
- **Displays** (Table format):
  - Date
  - Subject
  - Tutor name
  - Duration
  - Status (Completed / Cancelled / Missed)
- **Features**: 
  - Filterable by subject (dropdown)
  - Responsive table design
  - Color-coded status badges

---

### 7. **Progress Indicators**
- **Purpose**: High-level progress tracking (non-grade based)
- **Displays** (Per subject):
  - **Improving**: Upward trend (green)
  - **Stable**: Consistent performance (blue)
  - **Needs Attention**: Requires focus (orange)
- **Design**: Grid of cards with icons
- **Note**: Based on tutor observations, not grades or test scores

---

### 8. **Payments & Billing**
- **Purpose**: Financial transparency
- **Displays**:
  - Sessions paid for
  - Sessions used
  - Sessions remaining
  - Usage percentage (progress bar)
  - Current balance (highlighted card)
  - Recent receipts/invoices (with download buttons)
- **Design**: Stat cards with gradient backgrounds

---

### 9. **Support & Help**
- **Purpose**: Easy access to assistance
- **Displays**:
  - "Contact Support" button (email link)
  - Quick links to FAQs and Help Centre
  - Reassurance message about safety and quality
- **Design**: Prominent green gradient call-to-action card

---

## Components Structure

All components are located in `components/parent/`:

```
components/parent/
├── ChildProfileOverview.tsx
├── UpcomingSessions.tsx
├── TutorFeedback.tsx
├── AcademicFocusAreas.tsx
├── AttendanceSummary.tsx
├── LessonHistory.tsx
├── ProgressIndicator.tsx
├── PaymentsBilling.tsx
└── SupportHelp.tsx
```

---

## Design Principles

### Color Scheme
- **Background**: Dark gradient (`gray-800` to `gray-900`)
- **Primary Accent**: iTutor Green (`#199358`)
- **Text**: White (`#F4F4F4`) and Gray shades
- **Status Colors**:
  - Green: Positive/Success
  - Blue: Informational
  - Orange: Warning/Attention
  - Red: Critical/Issues

### UI/UX Principles
- **Calm, reassuring tone**: No aggressive notifications
- **Clear hierarchy**: Large headings, organized sections
- **Mobile-responsive**: Adapts to all screen sizes
- **Accessible**: High contrast ratios, clear labels
- **Trustworthy**: Professional design with transparency

---

## Viewing the Dashboard

### Test Mode (With Mock Data)
To view the dashboard with placeholder data:

```
http://localhost:3000/parent/dashboard?test=true
```

This will display:
- All 9 sections fully populated
- Mock data for a student named "Sarah Johnson"
- Sample sessions, feedback, and billing information

### Production Mode (Real Data)
When authenticated as a parent:

```
http://localhost:3000/parent/dashboard
```

This will display:
- List of your registered children
- "Add Child" functionality
- Links to individual child dashboards (future feature)

---

## Permission Rules

### Parents CAN:
✅ View all sections
✅ Download invoices/receipts
✅ Read tutor feedback
✅ See upcoming sessions
✅ View lesson history
✅ Track attendance
✅ Monitor progress indicators
✅ Check payment status
✅ Contact support

### Parents CANNOT:
❌ Edit sessions
❌ Modify tutor notes
❌ Join lessons without permission
❌ See private student messages
❌ View internal tutor metrics
❌ Change academic focus areas
❌ Access live lesson monitoring
❌ View session recordings
❌ See raw chat logs

---

## Technical Details

### State Management
- Uses React hooks (`useState`, `useEffect`)
- Supabase integration ready (currently using mock data)
- Profile data fetched via `useProfile` hook

### Responsive Design
- Mobile-first approach
- Breakpoints: `sm`, `md`, `lg`, `xl`
- Grid layouts adapt to screen size
- Tables become scrollable on mobile

### Data Structure (Future Backend Integration)

When connecting to Supabase, the expected data structures are:

```typescript
// Child Profile
type ChildProfile = {
  id: string;
  full_name: string;
  school: string;
  form_level: string;
  subjects: string[];
  tutors: string[];
};

// Session
type Session = {
  id: string;
  date: string;
  time: string;
  subject: string;
  tutorName: string;
  sessionType: 'online' | 'in_person';
};

// Feedback
type Feedback = {
  id: string;
  date: string;
  subject: string;
  topicCovered: string;
  effortLevel: 'Low' | 'Medium' | 'High';
  understandingLevel: 'Needs Work' | 'Improving' | 'Strong';
  comment: string;
};

// And more...
```

---

## Customization

### Modifying Mock Data
Edit `app/parent/dashboard/page.tsx` and update the props passed to each component in the test mode section.

### Styling Changes
All components use Tailwind CSS classes. To modify:
1. Update component files in `components/parent/`
2. Adjust colors, spacing, or typography
3. All changes follow the iTutor brand guidelines

---

## Future Enhancements

Potential features for future versions:
- Individual child dashboard pages (`/parent/child/[id]`)
- Real-time session notifications
- Downloadable progress reports
- Calendar integration
- Mobile app version
- Push notifications for upcoming sessions
- Direct messaging with tutors (moderated)

---

## Support

For questions or issues:
- **Email**: support@itutor.com
- **Help Centre**: [Link to be added]
- **FAQ**: [Link to be added]

---

## Notes for Developers

1. **No Supabase Logic Yet**: Components use prop-based data for flexibility
2. **Easy Integration**: When ready, fetch data in `app/parent/dashboard/page.tsx` and pass as props
3. **Type Safety**: All components have TypeScript types defined
4. **Reusability**: Components can be used in other parent-facing pages
5. **Accessibility**: Components follow WCAG guidelines

---

**Last Updated**: December 25, 2025  
**Version**: 1.0 (MVP)









