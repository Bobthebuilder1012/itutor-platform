# Admin Payment & Revenue Tracking System

## 📊 Overview

Admins can now view and analyze all payments and revenue with powerful filtering options.

## ✨ Features

### 1. Revenue Dashboard
- **Platform Revenue**: Total commission fees collected
- **Transaction Volume**: Total value of all transactions
- **Tutor Payouts**: Total amount paid to tutors
- **Session Count**: Number of sessions

### 2. Powerful Filters

#### Quick Date Filters
- Today
- Last 7 Days
- Last 30 Days
- All Time

#### Advanced Filters
- **School**: Filter by student's school (e.g., "Presentation College Chaguanas")
- **Date Range**: Custom start and end dates
- **Student Search**: Search by student name or email
- **Tutor Search**: Search by tutor name or email
- **Status**: Filter by session status (Completed, Confirmed, Cancelled)

### 3. Detailed Transaction List

Each row shows:
- Session date
- Student name and school
- Tutor name
- Subject
- Total amount charged
- Platform fee collected
- Status

## 📍 How to Access

1. Log in as an admin/reviewer
2. Click **"Payments & Revenue"** in the navigation menu
3. Use filters to analyze revenue

## 💡 Example Use Cases

### Example 1: Revenue from Presentation College Chaguanas (Last Week)
1. Go to `/reviewer/payments`
2. Click "Last 7 Days" quick filter
3. Select "Presentation College Chaguanas" from the School dropdown
4. View:
   - Total platform revenue from those students
   - Number of sessions
   - Individual transaction details

### Example 2: All Revenue This Month
1. Click "Last 30 Days"
2. Leave all other filters as "All"
3. See complete monthly revenue breakdown

### Example 3: Track a Specific Student
1. Enter student name in "Search Student" field
2. See all their sessions and payments
3. Track their total spending

### Example 4: Tutor Performance
1. Enter tutor name in "Search Tutor" field
2. See all sessions they've completed
3. View total payouts to that tutor

## 🔧 Technical Details

### API Endpoint
- **Route**: `/api/admin/payments`
- **Method**: GET
- **Query Parameters**:
  - `school` - Filter by school name
  - `start_date` - ISO date string (YYYY-MM-DD)
  - `end_date` - ISO date string (YYYY-MM-DD)
  - `student` - Search term for student
  - `tutor` - Search term for tutor
  - `status` - Session status filter

### Response Format
```json
{
  "sessions": [...],
  "totals": {
    "revenue": "1250.00",
    "transactionVolume": "8500.00",
    "tutorPayouts": "7250.00",
    "sessionCount": 45
  },
  "schools": ["School A", "School B", ...]
}
```

### Database Tables Used
- `sessions` - Session and payment data
- `profiles` - Student and tutor information
- `subjects` - Subject details

### Calculated Fields
- **Platform Revenue** = Sum of all `platform_fee_ttd`
- **Transaction Volume** = Sum of all `charge_amount_ttd`
- **Tutor Payouts** = Sum of all `tutor_payout_ttd`

## 📁 Files Created

### Backend
- `app/api/admin/payments/route.ts` - API endpoint for fetching payment data

### Frontend
- `app/reviewer/payments/page.tsx` - Revenue dashboard page

### Modified
- `components/DashboardLayout.tsx` - Added "Payments & Revenue" link

## 🎯 Key Benefits

1. **Financial Transparency**: See exactly how much revenue the platform is generating
2. **School Analytics**: Track which schools are driving the most revenue
3. **Time-based Analysis**: Compare revenue across different time periods
4. **Tutor Performance**: Monitor individual tutor earnings
5. **Student Tracking**: View spending patterns by student or school

## 🚀 Future Enhancements (Ideas)

- Export to CSV/Excel
- Revenue charts and graphs
- Month-over-month comparison
- Top performing schools/tutors
- Payment status tracking (pending, completed, refunded)
- Filter by subject or form level
- Commission rate breakdown by tier






