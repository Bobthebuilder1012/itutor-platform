export interface HelpArticle {
  title: string;
  slug: string;
  category: string;
  summary: string;
  content: string;
  updatedAt: string;
  isPopular?: boolean;
}

export const helpArticles: HelpArticle[] = [
  {
    title: "Create Your iTutor Account and Profile",
    slug: "create-itutor-profile",
    category: "Getting Started",
    summary: "Step-by-step guide to signing up and completing your iTutor profile.",
    isPopular: false,
    updatedAt: "2025-01-01",
    content: `
# Create Your iTutor Account and Profile

Welcome to iTutor! Follow these steps to create your account and set up your profile.

## Sign Up

1. Visit the iTutor homepage
2. Click **"Become an iTutor"** or navigate to the signup page
3. Choose **"Sign up as iTutor"**
4. Enter your details:
   - Full name
   - Username
   - Email address
   - Password
   - Country
5. Accept the Terms & Conditions
6. Click **"Sign up"**

## Complete Your Profile

After creating your account, complete your profile to attract more students:

1. Navigate to **Settings** from your dashboard
2. Add a professional profile picture
3. Write a compelling bio that highlights:
   - Your teaching approach
   - Your experience or passion for the subjects
   - What makes you a great iTutor
4. Add your school (optional but recommended)
5. Verify your email address if prompted

## Important Recommendations

- **Only add subjects you can confidently teach** - Your reputation depends on delivering quality sessions
- **Be honest in your bio** - Students appreciate authenticity
- **Use a clear profile picture** - A friendly, professional photo helps students connect with you
- **Keep your profile updated** - Update your bio and availability regularly

Your profile is your first impression. Make it count!

## Next Steps

Once your profile is complete:
- Add the subjects you teach and set your rates
- Optionally submit verification to display your verified badge
- Start receiving booking requests from students

Need help? Contact us at support@myitutor.com
`
  },
  {
    title: "Add Subjects You Teach and Set Your Rate",
    slug: "add-subjects-and-rate",
    category: "Subjects & Rates",
    summary: "Learn how to add subjects to your teaching list and set competitive rates.",
    isPopular: true,
    updatedAt: "2025-01-01",
    content: `
# Add Subjects You Teach and Set Your Rate

Adding subjects and setting rates is essential to start receiving booking requests.

## How to Add a Subject

1. Go to your **Dashboard**
2. Look for the **"Subjects you teach"** section
3. Click **"Add Subject"**
4. Use the search bar to find your subject (e.g., "Math", "CSEC Biology", "CAPE Chemistry")
5. Select the subject from the dropdown
6. Set your hourly rate in TTD (Trinidad and Tobago Dollars)
7. Click **"Add"** to save

## Setting Your Rate

Consider these factors when setting your rate:

- **Your experience level** - More experienced iTutors can charge higher rates
- **Subject complexity** - Advanced subjects (CAPE) typically command higher rates than foundational subjects
- **Market rates** - Browse other iTutors to see competitive pricing
- **Your goals** - Set rates that match your teaching goals and availability

### Rate Guidelines

- **CSEC subjects**: Typically $50-150 TTD per hour
- **CAPE subjects**: Typically $100-250 TTD per hour
- **Specialized topics**: Can go higher based on demand

**Remember**: You can adjust your rates at any time by editing the subject.

## Managing Your Subjects

- You can add multiple subjects you're qualified to teach
- Edit rates at any time from your dashboard
- Remove subjects you no longer want to teach
- Students will see all your available subjects when viewing your profile

## Commission Structure

iTutor takes a commission from each session:
- **10%** for sessions under $100
- **15%** for sessions $100-$199
- **20%** for sessions $200 and above

This commission covers platform maintenance, payment processing, and support.

## Tips for Success

- Start with competitive rates to build your reputation
- Add subjects you're genuinely confident teaching
- Update your subject list as you expand your expertise
- Be transparent about your teaching style in your bio

Questions? Reach out to support@myitutor.com
`
  },
  {
    title: "Submit Verification (Optional)",
    slug: "verification-submit",
    category: "Verification",
    summary: "Submit your CXC results for verification to earn the verified iTutor badge.",
    isPopular: true,
    updatedAt: "2025-01-01",
    content: `
# Submit Verification (Optional)

Verification is optional but highly recommended. It helps you stand out and build trust with students.

## What is Verification?

Verification allows you to:
- Display a **Verified iTutor badge** on your profile
- Show your verified subjects and grades publicly
- Appear higher in search results
- Attract more booking requests

## Who Should Get Verified?

Anyone with official CXC examination results can get verified. This includes:
- CSEC results
- CAPE results
- Both current students and graduates

## How to Submit Verification

1. From your dashboard, look for the **verification notification** in the top bar
2. Or navigate to **Verification** from the sidebar
3. Click **"Choose file"** and select your CXC results slip
4. Ensure your document is clear and readable
5. Click **"Submit for Verification"**

## Document Requirements

Your CXC results slip must include:
- ✅ Your full name (matching your iTutor profile)
- ✅ Subject names clearly visible
- ✅ Grades for each subject
- ✅ Official CXC formatting
- ✅ Clear, readable image (not blurry or corrupted)

## File Size and Format

- Maximum file size: **5MB**
- Accepted formats: JPG, PNG, PDF
- If your file is too large, compress it or take a clearer photo

## Review Timeline

- Verification review typically takes **a few hours**
- You'll receive a notification when your verification is approved or requires resubmission
- Check your dashboard for status updates

## After Approval

Once approved:
- Your **Verified iTutor badge** appears on your profile
- Your verified subjects and grades are displayed publicly
- Students can view your verified results
- You appear higher in search rankings

## What If Verification Fails?

If your submission is rejected, you'll receive feedback on what needs to be corrected. Common issues include:
- Blurry or low-quality image
- Name doesn't match your profile
- Subject names or grades not visible
- File corrupted or unreadable
- Not an official CXC slip

Simply fix the issue and resubmit.

## Can I Remove Verification Later?

Yes, you can manage the visibility of your verified subjects at any time from your dashboard.

Need help? Contact support@myitutor.com
`
  },
  {
    title: "Why Verification Fails (Common Reasons)",
    slug: "verification-common-failures",
    category: "Verification",
    summary: "Understand the common reasons verification submissions are rejected.",
    isPopular: false,
    updatedAt: "2025-01-01",
    content: `
# Why Verification Fails (Common Reasons)

If your verification was rejected, here are the most common reasons and how to fix them.

## 1. Blurry or Low-Quality Image

**Problem**: The document is too blurry to read clearly.

**Solution**:
- Retake the photo in good lighting
- Hold your camera steady
- Ensure all text is sharp and readable
- Use a scanner if available for best quality

## 2. File Corrupted or Unreadable

**Problem**: The file won't open or displays an error.

**Solution**:
- Re-export the document
- Try a different file format (JPG, PNG, or PDF)
- Ensure the file isn't damaged during upload
- Test the file on your device before uploading

## 3. Name Missing or Doesn't Match

**Problem**: Your name isn't visible or doesn't match your iTutor profile name.

**Solution**:
- Ensure your full name appears clearly on the document
- Update your iTutor profile name to match your official CXC results exactly
- If you use a different name professionally, update one to match the other

## 4. Subject Names Not Visible

**Problem**: The subject names are cut off, obscured, or illegible.

**Solution**:
- Capture the entire document
- Ensure no parts are cropped out
- All subject names must be clearly readable
- If you have multiple pages, submit all pages

## 5. Grades Missing or Unclear

**Problem**: Grades are not shown or are difficult to read.

**Solution**:
- Ensure all grades are visible in the photo
- Don't crop out any grade information
- Check that lighting doesn't wash out the grades
- Make sure the entire results section is captured

## 6. Not an Official CXC Slip

**Problem**: The document submitted isn't an official CXC examination results slip.

**Solution**:
- Only submit official CXC results slips
- School transcripts or report cards are not accepted
- Unofficial printouts are not accepted
- Contact CXC if you need a replacement official slip

## How to Resubmit

After fixing the issues:
1. Go to **Verification** in your dashboard
2. Upload your corrected document
3. Click **"Submit for Verification"** again
4. Wait for the review (usually a few hours)

## Still Having Issues?

If you've tried multiple times and still can't get verified, contact our support team at support@myitutor.com with:
- Your account username
- The issue you're experiencing
- Screenshots if helpful

We're here to help!
`
  },
  {
    title: "Upload Failed (Size/Format Issues)",
    slug: "upload-failed",
    category: "Troubleshooting & Support",
    summary: "Troubleshoot file upload errors when submitting verification documents.",
    isPopular: false,
    updatedAt: "2025-01-01",
    content: `
# Upload Failed (Size/Format Issues)

If your verification document upload is failing, it's likely due to file size or format issues.

## File Size Limit

**Maximum file size: 5MB**

If your file exceeds this limit, you'll see an error message.

## How to Compress Large Files

### Option 1: Reduce Image Quality
1. Open your image in a photo editor
2. Export or save as JPEG with reduced quality (70-80% is usually sufficient)
3. Check the new file size

### Option 2: Use Online Compression Tools
- TinyPNG (for PNG files)
- CompressJPEG (for JPEG files)
- Adobe Express (free online tool)
- SmallPDF (for PDF files)

### Option 3: Resize the Image
1. Open your image editing software
2. Resize to a maximum width of 1500-2000 pixels
3. Maintain aspect ratio
4. Save the compressed version

## Supported File Formats

iTutor accepts:
- **JPG / JPEG** (recommended)
- **PNG**
- **PDF**

Unsupported formats:
- HEIC/HEIF (iPhone default - convert to JPG first)
- BMP
- TIFF
- WebP

## Converting iPhone Photos to JPG

If you're using an iPhone:
1. Open Settings → Camera → Formats
2. Select **"Most Compatible"** instead of "High Efficiency"
3. Retake the photo

Or use a conversion app/website to convert HEIC to JPG.

## Tips for Successful Upload

- Use **JPEG format** for photos - it has the best compression while maintaining quality
- Ensure good lighting when taking photos to avoid large file sizes from grainy images
- Don't submit the same image multiple times if it fails - fix the underlying issue first
- Test your file size before uploading (right-click → Properties on Windows, Get Info on Mac)

## Retaking a Clearer Image

For best results:
1. Place your CXC slip on a flat surface
2. Use natural light or good artificial lighting
3. Hold your camera/phone parallel to the document
4. Ensure the entire document fits in frame
5. Take multiple shots and pick the clearest one
6. Check that all text is sharp before uploading

## Still Getting Errors?

If you've compressed your file and are still experiencing upload issues:
- Try a different browser
- Clear your browser cache
- Check your internet connection
- Try uploading from a different device

If the problem persists, contact support@myitutor.com with a description of the error message you're seeing.
`
  },
  {
    title: "Respond to Booking Requests",
    slug: "booking-requests",
    category: "Booking Requests",
    summary: "Learn how to review and respond to booking requests from students.",
    isPopular: true,
    updatedAt: "2025-01-01",
    content: `
# Respond to Booking Requests

When students request sessions, you'll receive notifications and see requests in your dashboard.

## Finding Your Booking Requests

1. Go to your **Dashboard**
2. Click **"Booking Requests"** in the sidebar
3. View all requests with status **"Pending"**

## Understanding a Booking Request

Each request shows:
- Student's name and profile
- Subject requested
- Proposed date and time
- Session duration
- Your rate for that session
- Any message from the student

## Your Response Options

You have three ways to respond:

### 1. Confirm Booking ✅

Accept the request as-is:
1. Review the request details
2. Click **"Confirm Booking"**
3. The session is automatically created
4. A meeting link is generated
5. Both you and the student receive confirmation

**When to confirm**: The proposed time works for you and you're available.

### 2. Propose New Time ⏰

Suggest alternative times:
1. Click **"Propose New Time"**
2. Select a date and time that works better for you
3. Add an optional message explaining why (e.g., "I'm available the next day at this time")
4. Click **"Send Proposal"**
5. The student reviews and can accept or suggest another time

**When to propose**: You're interested but the original time doesn't work.

### 3. Decline ❌

Politely decline the request:
1. Click **"Decline"**
2. Optionally provide a brief reason (e.g., "I'm not available during this time", "This subject is outside my expertise")
3. Confirm decline

**When to decline**: You cannot accommodate the request or the subject/time doesn't work for you.

## Best Practices

### Respond Quickly
- Try to respond within 24 hours
- Quick responses improve your reputation
- Students appreciate timely communication

### Be Professional
- Always be courteous and respectful
- If declining, provide a brief explanation
- Suggest alternatives when possible

### Check Your Calendar
- Ensure you're available before confirming
- Consider travel time between sessions
- Don't overbook yourself

### Communicate Clearly
- If proposing a new time, explain why
- Set clear expectations about the session
- Ask clarifying questions if needed

## After Confirming

Once confirmed:
- The session appears in **"Sessions"**
- Both parties receive a meeting link
- You can access the session details anytime
- Remember to join on time!

## Managing Multiple Requests

If you receive multiple requests:
- Review each one individually
- Don't feel pressured to accept everything
- Prioritize based on your schedule and expertise
- Decline respectfully if you're at capacity

## What If a Student Doesn't Show Up?

If a student fails to join the session within 33% of the scheduled time, you can mark it as a student no-show. You'll receive 50% of the session fee.

Need help managing requests? Contact support@myitutor.com
`
  },
  {
    title: "Cancel a Session",
    slug: "cancel-session",
    category: "Sessions",
    summary: "How to cancel a confirmed session if needed.",
    isPopular: false,
    updatedAt: "2025-01-01",
    content: `
# Cancel a Session

Life happens. If you need to cancel a confirmed session, follow these steps.

## How to Cancel

1. Go to **Sessions** from your dashboard
2. Find the session you need to cancel (look under "Upcoming Sessions")
3. Click on the session to view details
4. Click **"Actions"** or **"Options"**
5. Select **"Cancel Session"**
6. Provide a reason for cancellation (optional but recommended)
7. Confirm the cancellation

## When to Cancel

Cancel a session if:
- You have an emergency
- You're unwell and can't teach effectively
- There's a scheduling conflict you didn't notice
- Technical issues prevent you from conducting the session

## Cancellation Policy

- **24+ hours before**: Full refund to student, no penalty to you
- **Less than 24 hours**: May affect your iTutor rating
- **Repeated cancellations**: Can lead to account review

## Best Practices

### Cancel as Early as Possible
- Give students maximum notice
- They may need time to find another iTutor
- Shows professionalism and respect

### Communicate with the Student
- Send a message explaining the situation
- Offer to reschedule if appropriate
- Apologize for any inconvenience

### Avoid Last-Minute Cancellations
- Double-check your calendar before confirming
- Set reminders for upcoming sessions
- Only confirm sessions you can realistically attend

## Rescheduling Instead of Cancelling

Instead of cancelling, consider offering to reschedule:
1. Message the student with alternative times
2. Find a mutually convenient time
3. Once agreed, cancel the current session and create a new booking

## If the Student Cancels

If the student cancels:
- You'll receive a notification
- The session is removed from your schedule
- No impact on your rating (student-initiated)

## Technical Difficulties

If you're experiencing technical issues before or during a session:
1. Try troubleshooting quickly
2. Contact support immediately: support@myitutor.com
3. Communicate with the student
4. Reschedule if the issue can't be resolved

## Emergencies

In case of genuine emergencies:
- Cancel the session immediately
- Contact support for assistance: support@myitutor.com
- We'll work with you to resolve the situation fairly

## Impact on Your Profile

- Occasional cancellations are understood
- Frequent cancellations can hurt your reputation
- Students may leave feedback about reliability
- Build a track record of reliability for best results

Remember: Your reputation matters. Only confirm sessions you can commit to.

Questions about cancellations? Email support@myitutor.com
`
  },
  {
    title: "How Online Sessions Work",
    slug: "online-sessions-how-it-works",
    category: "Sessions",
    summary: "Understand how online teaching sessions work on iTutor.",
    isPopular: false,
    updatedAt: "2025-01-01",
    content: `
# How Online Sessions Work

iTutor makes it easy to conduct professional online teaching sessions. Here's everything you need to know.

## Overview

All sessions on iTutor are conducted online using video conferencing platforms. We support:
- **Google Meet**
- **Zoom**

## Setting Up Your Video Provider

Before you can accept bookings, connect a video provider:

1. Go to **Settings** from your dashboard
2. Navigate to **Video Provider**
3. Click **"Connect Google Meet"** or **"Connect Zoom"**
4. Authorize iTutor to create meetings on your behalf
5. Your provider is now active

**Important**: You must have at least one provider connected to conduct sessions.

## When a Booking is Confirmed

Here's what happens automatically:

1. **Meeting Link Created**: iTutor creates a unique meeting link for the session
2. **Notifications Sent**: Both you and the student receive the session details
3. **Calendar Updated**: The session appears in your "Upcoming Sessions"
4. **Access Granted**: Both parties can access the meeting link

## Before the Session

### Prepare Your Space
- Find a quiet location with minimal distractions
- Ensure good lighting (face a window or use a lamp)
- Test your microphone and camera
- Have necessary materials ready (notes, textbooks, digital whiteboard tools)

### Test Your Technology
- Check your internet connection
- Test your camera and microphone
- Verify your video provider is working
- Have a backup plan (phone hotspot, alternative device)

### Review the Session Details
- Subject and topics to cover
- Student's learning goals or questions
- Your teaching plan for the session
- Any materials the student requested

## Joining the Session

### The "Join Session" Button
- Appears on your dashboard ~10 minutes before the session
- Click it to join the video meeting
- Joins automatically via your connected provider

### Punctuality Matters
- Join on time (or slightly early)
- Waiting for the student is expected
- Give students a few minutes grace period

## During the Session

### Teaching Best Practices
- Greet the student warmly
- Confirm what they want to learn
- Teach clearly and at an appropriate pace
- Check for understanding regularly
- Encourage questions
- Use screen sharing for demonstrations
- Share relevant resources or links

### Managing Time
- Watch the clock to stay on schedule
- Give a 5-minute warning before ending
- Summarize key learnings
- Assign practice problems if appropriate

### Handling Issues
- If technical issues arise, stay calm
- Try basic troubleshooting (refresh, reconnect)
- Communicate with the student
- Contact support if needed: support@myitutor.com

## After the Session

### Automatic Completion
- Sessions end at the scheduled time
- Payment processing begins automatically
- Both parties can leave feedback/reviews

### Follow-Up (Optional)
- Send a summary message to the student
- Provide additional resources
- Suggest topics for future sessions

## Student No-Shows

If the student doesn't join within 33% of the session time:
- You can mark the session as a "student no-show"
- You'll receive 50% of the session fee
- Document the situation if needed

## Recording Sessions

**Recording is not currently supported** on the iTutor platform. Focus on live interaction and effective teaching.

## Technical Support

If you experience issues during a session:
- Check your internet connection first
- Try refreshing the page or rejoining
- Contact support immediately: support@myitutor.com
- We're here to help resolve issues quickly

## Tips for Successful Sessions

- Be patient and encouraging
- Adapt to different learning styles
- Use visual aids when possible
- Keep sessions interactive
- Build rapport with students
- Be yourself - authenticity matters!

Questions about online teaching? Reach out to support@myitutor.com
`
  },
  {
    title: "Join a Session",
    slug: "join-session",
    category: "Sessions",
    summary: "Step-by-step guide to joining your scheduled teaching sessions.",
    isPopular: true,
    updatedAt: "2025-01-01",
    content: `
# Join a Session

When it's time for your teaching session, joining is quick and easy.

## Before the Session Time

### Check Your Dashboard
1. Go to your **Dashboard**
2. Look for **"Upcoming Sessions"**
3. Your next session will be displayed prominently
4. Review session details (subject, student name, time)

### Get Ready
- Prepare your teaching materials
- Find a quiet space
- Test your camera and microphone
- Ensure stable internet connection

## When to Join

The **"Join Session"** button becomes available:
- Approximately **10 minutes before** the scheduled start time
- Remains active throughout the session
- Accessible from multiple locations on your dashboard

## How to Join

### Option 1: From Dashboard
1. Navigate to your **Dashboard**
2. Find the **"Upcoming Sessions"** card
3. Locate your next session
4. Click the **"Join Session"** button

### Option 2: From Sessions Page
1. Go to **Sessions** from the sidebar
2. Find your session in the list
3. Click **"Join Session"** or **"Actions" → "Join"**

### What Happens Next
- Your browser opens a new tab
- You're redirected to the video meeting (Google Meet or Zoom)
- The meeting loads automatically
- Click **"Join"** in the video provider interface

## Joining Early

It's recommended to join 1-2 minutes early:
- Shows professionalism
- Allows time to test audio/video
- Greet the student warmly when they arrive

## If the Student is Late

- Wait at least 10 minutes
- Send a message asking if they're still coming
- If they don't join within 33% of the session time, you can mark it as a student no-show

## Troubleshooting Join Issues

### Button Not Appearing?
- Refresh your dashboard
- Check the session time (may not be within the available window yet)
- Ensure the session is confirmed (not pending or cancelled)

### Meeting Link Not Working?
- Refresh the page
- Try clicking the button again
- Check your video provider connection in Settings
- Clear browser cache and try again

### Can't Access the Video Call?
- Verify your video provider (Google Meet or Zoom) is working
- Check if you're logged into the correct account
- Try a different browser
- Restart your browser

### Still Can't Join?
1. Contact support immediately: support@myitutor.com
2. Message the student to explain the situation
3. Provide an alternative meeting link if possible
4. We'll help resolve the issue quickly

## During the Session

Once joined:
- Greet the student
- Confirm what they want to learn
- Start teaching!

## After Joining

The meeting continues until:
- The scheduled end time is reached
- Either party leaves the meeting
- You manually end the session

Payment processing happens automatically after the session ends.

## Best Practices

- **Join on time** - Punctuality builds trust
- **Test beforehand** - Avoid technical delays
- **Be ready to teach** - Have materials prepared
- **Stay professional** - Treat every session seriously

Need help? Contact support@myitutor.com
`
  },
  {
    title: "Change Video Provider (Zoom ↔ Google Meet)",
    slug: "change-video-provider",
    category: "Video Provider",
    summary: "Switch between Zoom and Google Meet for your online sessions.",
    isPopular: false,
    updatedAt: "2025-01-01",
    content: `
# Change Video Provider (Zoom ↔ Google Meet)

iTutor supports both Zoom and Google Meet. You can switch between them as needed.

## Supported Providers

- **Google Meet** - Requires a Google account
- **Zoom** - Requires a Zoom account (free or paid)

## How to Change Your Provider

1. Go to **Settings** from your dashboard
2. Navigate to **Video Provider**
3. Click **"Manage Video Provider"**
4. You'll see your currently connected provider
5. Click **"Connect [Alternative Provider]"** to add the other option
6. Authorize iTutor to access your account
7. Select which provider you want to use as default

## Important Restrictions

### Cannot Switch If Upcoming Sessions Exist

If you have any upcoming confirmed sessions, you **cannot switch** video providers. This is to prevent confusion and ensure session links remain valid.

**To switch when you have upcoming sessions:**
1. Wait until all upcoming sessions are completed
2. Or cancel existing sessions (not recommended)
3. Then change your video provider

### Must Keep One Provider Connected

You **cannot remove your video provider entirely**. You must always have at least one provider connected to:
- Accept new booking requests
- Conduct sessions
- Maintain your iTutor account status

If you want to switch providers completely:
1. Connect the new provider first
2. Set it as default
3. You can then disconnect the old one (as long as no sessions depend on it)

## When to Switch Providers

Consider switching if:
- Your current provider has technical issues
- Students prefer a different platform
- You want to use a specific feature (e.g., Zoom breakout rooms)
- Your subscription or access changed

## Switching Process in Detail

### Step 1: Check for Upcoming Sessions
- Go to **Sessions**
- Review your **Upcoming Sessions**
- Ensure no sessions are scheduled

### Step 2: Connect New Provider
- Go to **Settings → Video Provider**
- Click **"Connect [Provider Name]"**
- Sign in and authorize access
- Grant necessary permissions

### Step 3: Set as Default
- Once connected, select the new provider as your default
- All future sessions will use this provider

### Step 4: Test the Connection
- Create a test meeting to verify it works
- Join the test meeting to ensure everything functions

## What Happens to Existing Sessions?

- Sessions already scheduled keep their original meeting links
- Those links remain valid even after you switch
- New sessions use your newly selected provider

## Disconnecting a Provider

To disconnect a provider:
1. Ensure no upcoming sessions use it
2. Connect an alternative provider first
3. Go to **Settings → Video Provider**
4. Click **"Disconnect"** next to the provider
5. Confirm disconnection

**Remember**: You cannot disconnect all providers. At least one must remain active.

## Troubleshooting

### Can't Connect Provider?
- Ensure you're using the correct account credentials
- Check that you've granted all necessary permissions
- Try a different browser
- Clear cache and cookies

### Switch Option Not Available?
- Check for upcoming sessions
- Wait until they're completed
- Or contact support for assistance

### Provider Not Working After Switch?
- Test your connection from Settings
- Verify authorization hasn't expired
- Reconnect the provider if needed

## Best Practices

- **Test before switching** - Create a test meeting to ensure the new provider works
- **Notify regular students** - If you have recurring students, let them know you're switching
- **Time it strategically** - Switch during a period with no booked sessions
- **Keep credentials updated** - Ensure your provider account stays active

## Which Provider Should I Use?

Both are excellent choices:

**Google Meet**:
- Simple and straightforward
- No time limits for one-on-one meetings
- Integrated with Google Calendar
- Works in browser without downloads

**Zoom**:
- Feature-rich (breakout rooms, polls, whiteboard)
- Familiar to many students
- Strong screen sharing capabilities
- May require downloads for full features

Choose based on your teaching style and student preferences.

Questions about video providers? Contact support@myitutor.com
`
  },
  {
    title: "Add Payment Information",
    slug: "payment-settings",
    category: "Payments & Payouts",
    summary: "Set up your payout method to receive earnings from completed sessions.",
    isPopular: true,
    updatedAt: "2025-01-01",
    content: `
# Add Payment Information

To receive payouts from your teaching sessions, you need to add your payment information.

## How to Add Payment Information

1. Go to **Settings** from your dashboard
2. Navigate to **Payment Settings**
3. Click **"Add Payout Method"** or **"Manage Payment Information"**
4. Enter your payment details:
   - Bank account information
   - Account holder name
   - Account number
   - Bank name and branch
   - Any additional required details
5. Verify your information is correct
6. Click **"Save"** or **"Add Payment Method"**

## Supported Payout Methods

Currently supported:
- **Bank transfer** (primary method)
- **Local bank accounts** in Trinidad and Tobago

Check with support@myitutor.com for additional payout options in your region.

## Information Required

You'll typically need:
- **Full name** (as it appears on your bank account)
- **Bank name**
- **Account number**
- **Branch information** (if applicable)
- **Account type** (checking/savings)

**Important**: Ensure all information is accurate to avoid payout delays.

## Verifying Your Payment Information

After adding your payment details:
1. Double-check all fields for accuracy
2. Confirm your name matches your bank account
3. Test with a small payout if possible
4. Save a copy of your payment information for your records

## Security and Privacy

- Your payment information is encrypted
- iTutor never stores full bank account details
- Information is only used for payouts
- We comply with financial security standards

## When Are Payouts Sent?

Once your payment information is saved:
- Payouts are processed after each completed session
- Funds typically arrive within 3-5 business days
- You'll receive notifications when payouts are sent
- Check your payment history in Settings

## Updating Payment Information

To update your payout method:
1. Go to **Settings → Payment Settings**
2. Click **"Edit"** or **"Update Payment Method"**
3. Change the necessary details
4. Save your changes

**Note**: Updates may take 24-48 hours to take effect.

## Multiple Payout Methods

Currently, iTutor supports one active payout method at a time. If you need to change banks or accounts, update your payment information before your next session.

## Troubleshooting

### Can't Save Payment Information?
- Ensure all required fields are filled
- Check for any error messages
- Verify account numbers are correct format
- Try a different browser

### Payment Method Not Appearing?
- Refresh the page
- Clear browser cache
- Check if it was successfully saved
- Contact support if issue persists

### Payout Not Received?
See our guide: [Troubleshooting Payout Issues](/help/itutors/troubleshooting-payouts)

## Best Practices

- **Add payment info early** - Set this up before your first session
- **Keep it updated** - If you change banks, update immediately
- **Verify details** - Double-check everything before saving
- **Secure your account** - Use strong passwords and enable 2FA

## Tax Considerations

- You are responsible for reporting income earned through iTutor
- Keep records of all payouts for tax purposes
- Consult a tax professional for guidance in your jurisdiction
- iTutor may provide payout summaries upon request

## Need Help?

If you have questions about payment setup or are experiencing issues, contact our support team at support@myitutor.com

We're here to ensure you get paid for your valuable teaching work!
`
  },
  {
    title: "When You Get Paid",
    slug: "payout-timing",
    category: "Payments & Payouts",
    summary: "Understand when and how you receive payment for completed sessions.",
    isPopular: false,
    updatedAt: "2025-01-01",
    content: `
# When You Get Paid

Understanding the payout process helps you manage your earnings effectively.

## Payout Timeline

### After Session Completion
1. **Session ends** at the scheduled time
2. **Payment processing begins** automatically
3. **Platform fee deducted** (10%, 15%, or 20% based on session price)
4. **Payout queued** to your saved payment method
5. **Funds sent** to your bank account

### Typical Timeline
- **Processing time**: 24-48 hours after session completion
- **Bank transfer time**: 3-5 business days
- **Total time**: Usually 4-7 business days from session end to funds in your account

## Commission Structure

iTutor deducts a platform fee:
- **10%** for sessions under $100 TTD
- **15%** for sessions $100-$199 TTD
- **20%** for sessions $200 TTD and above

This fee covers platform maintenance, payment processing, support, and infrastructure.

### Example Calculation
- **Session rate**: $150 TTD/hour (1 hour session)
- **Platform fee**: 15% = $22.50 TTD
- **Your payout**: $127.50 TTD

## Payment Methods

Payouts are sent via:
- **Bank transfer** (primary method)
- Directly to your registered bank account
- Uses the payment information in your Settings

## Tracking Your Payouts

### View Payout History
1. Go to **Settings**
2. Navigate to **Payment Settings** or **Payout History**
3. View all completed payouts with:
   - Date of session
   - Amount earned
   - Platform fee
   - Payout amount
   - Status (processing/completed)

### Payment Notifications
You'll receive notifications:
- When payment processing begins
- When payout is sent to your bank
- If there are any issues with payout

## Session Types and Payouts

### Regular Completed Sessions
- Full session payment processed
- Both parties attended and completed
- Standard commission applies

### Student No-Show Sessions
- If student doesn't join within 33% of session time
- You can mark as student no-show
- You receive **50% of the session fee**
- Platform fee still applies

### Cancelled Sessions
- If you cancel: No payout
- If student cancels before session: No payout
- Cancellation policies apply

## Factors That Can Delay Payouts

- **Missing or incorrect payment information** - Update immediately
- **Bank holidays** - Processing may be delayed
- **Account verification issues** - Ensure details are current
- **Technical issues** - Rare, but contact support if suspected

## Minimum Payout Threshold

Currently, there is **no minimum payout threshold**. Every completed session results in a payout, regardless of amount.

## Multiple Sessions

If you complete multiple sessions:
- Each session is processed individually
- Payouts may arrive separately
- Check your payout history for tracking

## Taxes and Reporting

- **You are responsible** for reporting income
- Keep records of all payouts
- iTutor can provide payout summaries on request
- Consult tax professionals for guidance

## What If Payment Doesn't Arrive?

If you haven't received payment after 7 business days:
1. Check your payout history first
2. Verify your payment information is correct
3. Check with your bank (sometimes there are delays on their end)
4. Contact support: support@myitutor.com

See our guide: [Troubleshooting Payout Issues](/help/itutors/troubleshooting-payouts)

## Best Practices

- **Set up payment info early** - Before your first session
- **Keep records** - Track sessions and expected payouts
- **Monitor your account** - Check payout history regularly
- **Update banking details** - If you change banks, update immediately

## Questions?

For payout-related questions or issues, contact support@myitutor.com

We want to ensure you're paid promptly for your excellent teaching!
`
  },
  {
    title: "Troubleshooting Payout Issues",
    slug: "troubleshooting-payouts",
    category: "Payments & Payouts",
    summary: "Resolve common payout problems and ensure you receive your earnings.",
    isPopular: true,
    updatedAt: "2025-01-01",
    content: `
# Troubleshooting Payout Issues

If you're experiencing problems receiving payouts, follow this troubleshooting guide.

## Common Payout Issues

### 1. Payment Not Received

**Check these first:**

✅ **Verify your payment information is saved**
- Go to Settings → Payment Settings
- Confirm your bank details are correct
- Ensure there are no error messages

✅ **Confirm the session was completed**
- Check Sessions → Completed Sessions
- Verify the session shows as "Completed" (not cancelled)
- Ensure both parties attended

✅ **Check the timeline**
- Payouts typically take 4-7 business days
- Check if it's been long enough
- Consider bank holidays or weekends

✅ **Review your payout history**
- Go to Settings → Payment Settings
- Check if the payout shows as "Processing" or "Completed"
- Look for any error messages

### 2. Payment Information Not Saving

**Solutions:**

- Check all required fields are filled correctly
- Verify your account number format is correct
- Ensure your name matches your bank account exactly
- Try a different browser
- Clear cache and cookies
- Check for browser extensions blocking the save

### 3. Incorrect Payout Amount

**Verify the calculation:**

Remember the commission structure:
- 10% fee for sessions under $100
- 15% fee for sessions $100-$199
- 20% fee for sessions $200+

**Example:**
- Session: $120 × 1 hour = $120
- Fee: 15% = $18
- Your payout: $102

If the amount still seems wrong, contact support with session details.

### 4. Bank Rejected the Transfer

**Possible reasons:**
- Incorrect account number
- Account closed or frozen
- Name mismatch
- Bank doesn't accept external transfers

**Solutions:**
- Verify account details with your bank
- Update payment information in Settings
- Contact your bank to confirm they accept transfers
- Try a different account if needed

## Step-by-Step Troubleshooting

### Step 1: Verify Session Completion
1. Go to **Sessions**
2. Find the session in question
3. Confirm status is **"Completed"**
4. Check the completion date

### Step 2: Check Payment Information
1. Go to **Settings → Payment Settings**
2. Verify all details are correct:
   - Full name (matching bank account)
   - Bank name
   - Account number
   - Branch information
3. Update if any information is incorrect

### Step 3: Review Payout History
1. In Payment Settings, view **Payout History**
2. Find the payout for your session
3. Check the status:
   - **Processing**: Still being processed
   - **Completed**: Sent to your bank
   - **Failed**: Issue occurred

### Step 4: Contact Your Bank
1. Call your bank's customer service
2. Confirm your account can receive transfers
3. Ask if any pending deposits are in their system
4. Verify your account details match what you provided

### Step 5: Contact iTutor Support
If all else fails:
1. Email support@myitutor.com
2. Provide:
   - Your username
   - Session date and details
   - Payment information (last 4 digits of account only)
   - Steps you've already tried
3. We'll investigate and resolve the issue

## Notifications

### Enable Payout Notifications
1. Check your notification settings
2. Ensure payout notifications are enabled
3. Add support@myitutor.com to your email whitelist
4. Check spam/junk folders

### Expected Notifications
- "Payout processing" - After session completes
- "Payout sent" - When transferred to your bank
- "Payout completed" - When confirmed received

## Preventing Future Issues

✅ **Set up payment info correctly from the start**
- Double-check all details before saving
- Test with your first session
- Keep information updated

✅ **Keep your bank account active**
- Ensure account remains open
- Update if you switch banks
- Confirm account can receive transfers

✅ **Monitor regularly**
- Check payout history after each session
- Report issues immediately
- Don't wait weeks to notice problems

✅ **Maintain communication**
- Respond to any emails from iTutor
- Contact support proactively if concerned
- Keep support@myitutor.com as a trusted contact

## When to Contact Support

Contact support@myitutor.com if:
- Payout is more than 7 business days overdue
- You see an error in Payout History
- Your bank rejected the transfer
- Payment information won't save
- You need help understanding your payout amount

## What Information to Provide

When contacting support, include:
- Your iTutor username
- Session date and subject
- Expected payout amount
- Current status in Payout History
- Steps you've already tried
- Any error messages you've seen

## Response Time

Support typically responds within:
- **24 hours** for payout issues
- **Faster** for urgent payment problems

## Alternative Payment Methods

If bank transfers aren't working:
- Ask support about alternative payout methods
- Provide details about your location and preferences
- We'll work with you to find a solution

## Remember

iTutor is committed to ensuring you're paid for your work. Don't hesitate to reach out if you're experiencing issues - we're here to help!

Contact: support@myitutor.com
`
  },
  {
    title: "Student No-Show Policy",
    slug: "student-no-show-policy",
    category: "No-shows & Policies",
    summary: "Understand the policy when students don't attend scheduled sessions.",
    isPopular: false,
    updatedAt: "2025-01-01",
    content: `
# Student No-Show Policy

When a student fails to attend a scheduled session, iTutor has a fair policy to protect your time.

## What is a No-Show?

A no-show occurs when:
- A session is confirmed and scheduled
- The iTutor joins the session on time
- The student does not join within **33% of the session duration**

### Time Examples
- **30-minute session**: Student doesn't join within 10 minutes
- **60-minute session**: Student doesn't join within 20 minutes
- **90-minute session**: Student doesn't join within 30 minutes

## No-Show Compensation

If a student no-shows, you receive:
- **50% of the session fee**
- Platform commission still applies
- Payment processed automatically

### Example Calculation
- Session rate: $100 TTD/hour
- Student no-shows
- You receive: 50% of $100 = $50
- Platform fee (10%): $5
- Your payout: $45 TTD

This compensates you for:
- Time spent preparing
- Blocking out your schedule
- Joining and waiting
- Opportunity cost

## How to Mark a No-Show

1. Join the session at the scheduled time
2. Wait for the student (33% of session duration)
3. If student doesn't join:
   - Go to the session details
   - Click **"Mark as Student No-Show"**
   - Confirm your action
4. System processes 50% payment automatically

## When to Mark as No-Show

**DO mark as no-show if:**
- Student didn't join at all
- No communication from student
- You waited the full grace period (33% of duration)
- You attempted to contact student with no response

**DON'T mark as no-show if:**
- Student messaged you about running late
- Technical issues are clearly the cause
- Student cancelled in advance
- You and student mutually decided to reschedule

## Best Practices

### Before Marking No-Show
1. **Wait the full grace period** - Give students the benefit of doubt
2. **Attempt to contact** - Send a message asking if they're coming
3. **Check for messages** - Student may have sent advance notice
4. **Consider circumstances** - Emergencies happen

### Communication
- Always try to message the student first
- Be professional and understanding
- Document any communication
- Give reasonable time for response

### Prevention
- Send session reminders to students
- Confirm sessions the day before
- Build rapport with regular students
- Communicate clearly about expectations

## What Happens After No-Show?

### For You
- Receive 50% compensation
- Session marked as "Student No-Show" in your history
- Can leave feedback (optional)
- Free to book other sessions

### For the Student
- Charged 50% of session fee
- Session marked as no-show on their record
- May receive warning from iTutor
- Can affect their ability to book future sessions

## Repeated No-Shows

If a student repeatedly no-shows:
- iTutor tracks this behavior
- Student may face account restrictions
- You can choose to decline future requests from them

## False No-Show Claims

**Important**: Only mark no-shows honestly.

Abuse of the no-show system (false claims) can result in:
- Account review
- Penalties
- Suspension
- Removal from platform

iTutor monitors no-show patterns and investigates suspicious claims.

## Disputes

If a student disputes a no-show:
- iTutor reviews the evidence
- Session logs and timestamps checked
- Both parties may be contacted
- Fair resolution applied

Keep your own records:
- Screenshots of waiting in meeting
- Message attempts to student
- Timestamps of when you joined

## Technical Issues vs. No-Show

If technical issues prevented the student from joining:
- Don't immediately mark as no-show
- Give extra time to resolve
- Communicate about the issue
- Consider rescheduling instead

Examples of legitimate technical issues:
- Internet outage
- Platform issues on iTutor or video provider
- Device malfunction

## Rescheduling After No-Show

If the student contacts you after a no-show:
- They can request to reschedule
- You can choose to accept or decline
- New session created separately
- No-show charge still applies to original session

## Questions About Policy

If you're unsure whether to mark a session as no-show:
- Contact support before marking: support@myitutor.com
- Explain the situation
- Get guidance on proper action
- We'll help you handle it fairly

## Fair Use

The no-show policy exists to:
- Respect your time as an iTutor
- Discourage student flakiness
- Ensure fair compensation
- Maintain platform reliability

Use it responsibly and honestly.

## Summary

- Wait 33% of session time before marking no-show
- Attempt to contact student first
- You receive 50% compensation
- Only mark genuine no-shows
- Document when necessary
- Contact support if unsure

Questions? Email support@myitutor.com
`
  },
  {
    title: "Contact Support",
    slug: "contact-support",
    category: "Troubleshooting & Support",
    summary: "How to reach iTutor support for help with any issues.",
    isPopular: true,
    updatedAt: "2025-01-01",
    content: `
# Contact Support

Need help? We're here for you. Here's how to reach the iTutor support team.

## Support Email

**support@myitutor.com**

This is your primary contact for all support needs.

## When to Contact Support

Reach out if you need help with:

### Account Issues
- Login problems
- Password reset
- Profile settings
- Account verification

### Technical Problems
- Video provider connection issues
- Can't join sessions
- Upload errors
- Platform bugs or glitches

### Payment & Payout Issues
- Missing payouts
- Payment information problems
- Payout calculation questions
- Bank transfer issues

### Verification Questions
- Verification submission help
- Understanding rejection reasons
- Document requirements
- Timeline concerns

### Booking & Session Help
- Booking request problems
- Session cancellation assistance
- No-show disputes
- Scheduling conflicts

### Policy Questions
- Understanding terms and conditions
- Commission structure clarification
- No-show policy
- General platform rules

### Safety & Security
- Reporting inappropriate behavior
- Suspicious activity
- Privacy concerns
- Account security issues

## What to Include in Your Email

Help us help you faster by providing:

### Essential Information
- **Your username** - So we can find your account
- **Specific issue** - Describe the problem clearly
- **When it happened** - Date and time if relevant
- **What you tried** - Steps you've already taken
- **Screenshots** - If applicable (helpful for technical issues)

### Example Email Format

\`\`\`
Subject: [Issue Type] - [Brief Description]

Hi iTutor Support,

Username: [your_username]

I'm experiencing [describe issue].

This started on [date/time].

Here's what happened:
[Detailed description]

I've already tried:
- [Step 1]
- [Step 2]

[Attach screenshots if relevant]

Thank you for your help!

[Your name]
\`\`\`

## Response Time

We aim to respond:
- **Urgent issues** (can't teach, payment problems): Within 24 hours
- **General questions**: Within 1-2 business days
- **Complex issues**: May take longer, but we'll acknowledge receipt

### Urgent Issues

If your issue prevents you from teaching or is time-sensitive:
- Mark email as "URGENT" in subject line
- Explain why it's urgent
- We'll prioritize your request

## Before Contacting Support

Try these first to potentially resolve your issue faster:

### Check Help Centre
- Browse iTutor Help Centre articles
- Search for your specific issue
- Follow troubleshooting guides

### Review Account Settings
- Double-check your settings
- Verify information is correct
- Try refreshing the page

### Basic Troubleshooting
- Clear browser cache and cookies
- Try a different browser
- Restart your device
- Check your internet connection

### Check for Announcements
- Look for platform notifications
- Check your email for updates
- Visit the help centre for known issues

## What to Expect

When you contact support:

1. **Confirmation Email** - You'll receive an automated confirmation
2. **Investigation** - Our team reviews your issue
3. **Response** - We'll email you with next steps or solutions
4. **Follow-up** - We may ask for more information
5. **Resolution** - We work with you until resolved

## Tips for Faster Resolution

✅ **Be specific** - Vague descriptions take longer to diagnose
✅ **Include details** - More information = faster solution
✅ **Be patient** - Complex issues need thorough investigation
✅ **Respond promptly** - When we ask for more info, reply quickly
✅ **Stay professional** - Respectful communication helps everyone

## Alternative Support Resources

### Help Centre
- Comprehensive articles
- Step-by-step guides
- FAQs and troubleshooting

### Platform Notifications
- Check your dashboard for updates
- System messages may address your issue
- Announcements about known problems

## Feedback and Suggestions

We welcome feedback! If you have:
- Feature requests
- Platform improvement ideas
- Positive feedback
- General suggestions

Email them to: support@myitutor.com

Your input helps us improve iTutor for everyone.

## Privacy and Confidentiality

When you contact support:
- Your information is kept confidential
- We never share your details without permission
- All communication is secure
- We respect your privacy

## Support Hours

Email support is monitored:
- **Monday - Friday**: 8 AM - 8 PM AST
- **Weekends**: 10 AM - 4 PM AST
- **Holidays**: Limited availability

Urgent issues are prioritized even outside regular hours.

## Language Support

Currently, we provide support in:
- English

If you need assistance in another language, let us know and we'll do our best to accommodate.

## Escalation

If your issue isn't resolved satisfactorily:
- Request to escalate to a supervisor
- Explain why you're unsatisfied
- We'll review your case with additional care

## Remember

We're here to help you succeed as an iTutor. Don't hesitate to reach out with any questions or concerns.

**Email: support@myitutor.com**

We look forward to assisting you!
`
  }
];

export const categories = [
  "Getting Started",
  "Subjects & Rates",
  "Verification",
  "Booking Requests",
  "Sessions",
  "Video Provider",
  "Payments & Payouts",
  "No-shows & Policies",
  "Troubleshooting & Support"
];

