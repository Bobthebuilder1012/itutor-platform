# iTutor - Standalone HTML Frontend Skeleton

This directory contains standalone HTML pages with Tailwind CSS and vanilla JavaScript that connect to Supabase. These pages can be opened directly in a browser without a build step.

## 📁 Files Created

### Student Pages
- `student-dashboard.html` - Student dashboard with profile, quick links, and recent sessions
- `student-sessions.html` - Full list of student's tutoring sessions
- `student-ratings.html` - Ratings the student has given

### Tutor Pages
- `tutor-dashboard.html` - Tutor dashboard with profile, rating, and subjects taught

### Parent Pages
- `parent-dashboard.html` - Parent dashboard showing all linked children

## 🔧 Setup Instructions

1. **Update Supabase Credentials**
   
   In each HTML file, replace these placeholder values:
   ```javascript
   const SUPABASE_URL = 'YOUR_SUPABASE_URL';
   const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
   ```

2. **Open in Browser**
   
   Simply double-click any HTML file or serve them with a local server:
   ```bash
   # Python 3
   python -m http.server 8000
   
   # Node.js
   npx serve
   ```

3. **Authentication**
   
   Users need to sign in through your existing authentication pages (`index.html` or `itutor-auth.html`).

## ✨ Features

- **No Build Required** - Uses Tailwind CDN and vanilla JavaScript
- **Real Supabase Integration** - Connects to your actual database
- **Responsive Design** - Mobile-friendly Tailwind styling
- **Role-Based Routing** - Automatically redirects to appropriate dashboard
- **Loading States** - Shows spinners and placeholders while data loads
- **Error Handling** - Displays user-friendly error messages

## 🎨 Styling

All pages use:
- **Tailwind CSS 3.x** via CDN
- Consistent color scheme (blue primary, gray neutrals)
- Responsive breakpoints for mobile/tablet/desktop
- Clean card-based layouts
- Hover states and transitions

## 🔐 Security Notes

- Replace `YOUR_SUPABASE_URL` and `YOUR_SUPABASE_ANON_KEY` with real values
- The anon key is safe to expose (it's public by design)
- Row Level Security (RLS) policies in Supabase protect your data
- Always validate user authentication before showing sensitive data

## 🚀 Next Steps

To complete the skeleton, you may want to add:
- `tutor-sessions.html` - Tutor's session list
- `tutor-verification.html` - Certificate upload page
- `parent-add-child.html` - Form to add new child account
- `parent-child-profile.html` - View child's profile
- `parent-child-sessions.html` - View child's sessions
- `parent-child-ratings.html` - View child's ratings

## 📝 Code Structure

Each page follows this pattern:
1. **Navigation** - Consistent header with role-specific links
2. **Main Content** - Dashboard-specific content with cards
3. **JavaScript** - Supabase client initialization and data fetching
4. **Error Handling** - Redirects to login if not authenticated

## 🔗 Page Links

- Login: `index.html` or `itutor-auth.html`
- Student: `student-dashboard.html`
- Tutor: `tutor-dashboard.html`
- Parent: `parent-dashboard.html`










