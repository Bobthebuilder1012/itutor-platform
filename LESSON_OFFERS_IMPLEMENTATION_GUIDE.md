# iTutor - Lesson Offers & Universal Search Implementation Guide

## ✅ COMPLETED

### 1. Database & Backend
- ✅ **Lesson Offers Table** (`src/supabase/migrations/016_lesson_offers_system.sql`)
  - All fields: tutor_id, student_id, subject, times, notes, status, counters
  - RLS policies for tutors and students
  - Triggers for notifications on create and status change
  
- ✅ **Biography Field** (already exists in profiles table from previous work)

- ✅ **TypeScript Types** (`lib/types/lessonOffers.ts`)
  - LessonOffer, LessonOfferWithDetails
  - Helper functions for formatting and display

- ✅ **Service Layer** (`lib/services/lessonOffersService.ts`)
  - createLessonOffer()
  - getTutorSentOffers()
  - getStudentReceivedOffers()
  - acceptOffer(), declineOffer(), counterOffer()
  - acceptCounterOffer(), deleteOffer()
  - Real-time subscriptions

- ✅ **EditProfileModal** (`components/EditProfileModal.tsx`)
  - Works for all roles (student/tutor/parent)
  - Edit: display_name, school, country, subjects, biography
  - Dark theme with iTutor branding
  - Validation and success feedback

- ✅ **CountrySelect** - Updated to dark theme

## 🔨 TO BE IMPLEMENTED

### 2. Search Components

#### **UniversalSearchBar** (`components/UniversalSearchBar.tsx`)
Location: Below header, above profile card

```tsx
'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Profile } from '@/lib/types/database';
import { getDisplayName } from '@/lib/utils/displayName';

type SearchBarProps = {
  userRole: 'student' | 'tutor' | 'parent';
  onResultClick: (profile: Profile) => void;
};

export default function UniversalSearchBar({ userRole, onResultClick }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    subject: '',
    country: '',
    school: ''
  });

  // Role-based placeholders
  const placeholder = {
    student: "Search tutors by subject, school, or country…",
    tutor: "Search students by subject, school, or country…",
    parent: "Search tutors for your child…"
  }[userRole];

  // Determine target role
  const targetRole = userRole === 'student' || userRole === 'parent' ? 'tutor' : 'student';

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.length >= 2 || filters.subject || filters.country || filters.school) {
        performSearch();
      } else {
        setResults([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, filters]);

  async function performSearch() {
    setLoading(true);
    try {
      let queryBuilder = supabase
        .from('profiles')
        .select('*')
        .eq('role', targetRole);

      // Apply filters
      if (filters.country) {
        queryBuilder = queryBuilder.eq('country', filters.country);
      }
      if (filters.school) {
        queryBuilder = queryBuilder.ilike('school', `%${filters.school}%`);
      }
      if (filters.subject && targetRole === 'tutor') {
        queryBuilder = queryBuilder.contains('subjects_of_study', [filters.subject]);
      }

      // Text search across fields
      if (query) {
        queryBuilder = queryBuilder.or(`
          display_name.ilike.%${query}%,
          full_name.ilike.%${query}%,
          username.ilike.%${query}%,
          school.ilike.%${query}%
        `);
      }

      const { data, error } = await queryBuilder.limit(10);

      if (error) throw error;
      setResults(data || []);
    } catch (err) {
      console.error('Search error:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative w-full mb-6">
      {/* Search Input */}
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className="w-full px-4 py-3 pl-11 bg-gray-800/50 border-2 border-gray-700 text-itutor-white rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition placeholder-gray-500"
          />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="px-4 py-3 bg-gray-800 border-2 border-gray-700 text-itutor-white rounded-lg hover:border-itutor-green transition"
        >
          Filters
        </button>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="mt-3 p-4 bg-gray-800/50 border-2 border-gray-700 rounded-lg">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input
              type="text"
              placeholder="Subject..."
              value={filters.subject}
              onChange={(e) => setFilters({ ...filters, subject: e.target.value })}
              className="px-3 py-2 bg-gray-900 border border-gray-700 text-itutor-white rounded-lg"
            />
            <input
              type="text"
              placeholder="Country..."
              value={filters.country}
              onChange={(e) => setFilters({ ...filters, country: e.target.value })}
              className="px-3 py-2 bg-gray-900 border border-gray-700 text-itutor-white rounded-lg"
            />
            <input
              type="text"
              placeholder="School..."
              value={filters.school}
              onChange={(e) => setFilters({ ...filters, school: e.target.value })}
              className="px-3 py-2 bg-gray-900 border border-gray-700 text-itutor-white rounded-lg"
            />
          </div>
        </div>
      )}

      {/* Results */}
      {(query || filters.subject || filters.country || filters.school) && (
        <div className="absolute z-50 w-full mt-2 bg-gray-900 border-2 border-gray-700 rounded-lg shadow-2xl max-h-96 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-gray-400">Searching...</div>
          ) : results.length > 0 ? (
            results.map((profile) => (
              <button
                key={profile.id}
                onClick={() => {
                  onResultClick(profile);
                  setQuery('');
                  setResults([]);
                }}
                className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-800 transition border-b border-gray-800 last:border-b-0"
              >
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-itutor-green to-emerald-600 flex items-center justify-center text-white font-bold">
                  {getDisplayName(profile).charAt(0)}
                </div>
                <div className="flex-1 text-left">
                  <p className="text-itutor-white font-medium">{getDisplayName(profile)}</p>
                  <p className="text-sm text-gray-400">{profile.school || 'No school listed'}</p>
                </div>
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ))
          ) : (
            <div className="p-4 text-center text-gray-400">No results found</div>
          )}
        </div>
      )}
    </div>
  );
}
```

### 3. Offer Components

#### **SendOfferModal** (`components/offers/SendOfferModal.tsx`)
```tsx
'use client';

import { useState } from 'react';
import { createLessonOffer } from '@/lib/services/lessonOffersService';

type SendOfferModalProps = {
  isOpen: boolean;
  onClose: () => void;
  tutorId: string;
  studentId: string;
  studentName: string;
  prefilledSubject?: string;
};

export default function SendOfferModal({
  isOpen,
  onClose,
  tutorId,
  studentId,
  studentName,
  prefilledSubject = ''
}: SendOfferModalProps) {
  const [subject, setSubject] = useState(prefilledSubject);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [duration, setDuration] = useState(60);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!subject || !date || !time) return;

    setSending(true);
    try {
      const proposedStart = new Date(`${date}T${time}`).toISOString();
      
      const { error } = await createLessonOffer(tutorId, {
        student_user_id: studentId,
        subject,
        proposed_start: proposedStart,
        duration_minutes: duration,
        note: note.trim() || undefined
      });

      if (error) throw error;

      alert('Offer sent successfully!');
      onClose();
    } catch (err) {
      console.error('Error sending offer:', err);
      alert('Failed to send offer');
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-gradient-to-br from-gray-900 to-black border-2 border-itutor-green/30 rounded-2xl shadow-2xl max-w-lg w-full">
        <div className="px-6 py-4 border-b border-gray-800">
          <h2 className="text-2xl font-bold text-itutor-white">Send Lesson Offer</h2>
          <p className="text-gray-400 text-sm mt-1">to {studentName}</p>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-itutor-white mb-2">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-4 py-3 bg-gray-800/50 border-2 border-gray-700 text-itutor-white rounded-lg focus:ring-2 focus:ring-itutor-green"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-itutor-white mb-2">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full px-4 py-3 bg-gray-800/50 border-2 border-gray-700 text-itutor-white rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-itutor-white mb-2">Time</label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full px-4 py-3 bg-gray-800/50 border-2 border-gray-700 text-itutor-white rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-itutor-white mb-2">Duration</label>
            <select
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full px-4 py-3 bg-gray-800/50 border-2 border-gray-700 text-itutor-white rounded-lg"
            >
              <option value={30}>30 minutes</option>
              <option value={60}>1 hour</option>
              <option value={90}>1.5 hours</option>
              <option value={120}>2 hours</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-itutor-white mb-2">Note (Optional)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="w-full px-4 py-3 bg-gray-800/50 border-2 border-gray-700 text-itutor-white rounded-lg resize-none"
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-800 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={sending}
            className="px-6 py-2.5 border-2 border-gray-700 text-itutor-white rounded-lg font-medium hover:bg-gray-800 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !subject || !date || !time}
            className="px-6 py-2.5 bg-gradient-to-r from-itutor-green to-emerald-600 text-black rounded-lg font-semibold transition disabled:opacity-50"
          >
            {sending ? 'Sending...' : 'Send Offer'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

## 📋 IMPLEMENTATION CHECKLIST

### Step 1: Run Database Migration
```bash
# In Supabase Dashboard > SQL Editor, run:
src/supabase/migrations/016_lesson_offers_system.sql
```

### Step 2: Create Remaining Components
- [ ] `components/offers/OffersReceivedList.tsx` (for students)
- [ ] `components/offers/SentOffersList.tsx` (for tutors)
- [ ] `components/offers/CounterOfferModal.tsx`
- [ ] `components/UniversalSearchBar.tsx` (code provided above)
- [ ] `components/offers/SendOfferModal.tsx` (code provided above)

### Step 3: Update Dashboards
Add to each dashboard:
```tsx
// Student Dashboard
import UniversalSearchBar from '@/components/UniversalSearchBar';
import OffersReceivedList from '@/components/offers/OffersReceivedList';
import EditProfileModal from '@/components/EditProfileModal';

// In the dashboard, add:
<UniversalSearchBar userRole="student" onResultClick={(profile) => {
  router.push(`/student/tutors/${profile.id}`);
}} />

<OffersReceivedList studentId={profile.id} />

// Add Edit Profile button to ProfileHeader
<button onClick={() => setEditModalOpen(true)}>
  Edit Profile
</button>

<EditProfileModal
  isOpen={editModalOpen}
  onClose={() => setEditModalOpen(false)}
  profile={profile}
  onSuccess={() => window.location.reload()}
/>
```

### Step 4: Create Offer Pages
- `/app/student/offers/page.tsx` - Full offers received view
- `/app/tutor/offers/page.tsx` - Full sent offers view

## 🎨 DESIGN TOKENS

```css
--itutor-black: #000000
--itutor-green: #199358
--itutor-white: #F4F4F4
```

## 📝 NOTES

- All components use dark theme
- Real-time updates via Supabase subscriptions
- Notifications automatically created on offer actions
- Biography supports emojis and up to 1000 characters
- Search is debounced (300ms) for performance
- Filters are required for tutor searching students

## 🚀 NEXT STEPS

1. Run the database migration
2. Implement the remaining UI components
3. Test the full flow: search → send offer → accept/decline/counter
4. Add real-time subscriptions to dashboards for live updates
5. Style polish and responsive design checks







