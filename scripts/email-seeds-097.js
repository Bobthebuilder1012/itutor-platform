/** Seed rows for migration 097 + core welcome/day1/day3 templates (stages 0–1, 3). */
module.exports = [
  {
    name: 'Student Welcome Email',
    subject: 'Welcome to iTutor, {{firstName}}! 🎓',
    html_content: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;font-family:system-ui,sans-serif;background:#f9fafb;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
<div style="text-align:center;padding:30px 0;background:#000;border-radius:8px 8px 0 0;"><img src="https://myitutor.com/assets/logo/itutor-logo-dark.png" alt="iTutor" style="height:60px;display:block;margin:0 auto"/></div>
<div style="background:#fff;padding:40px;border-radius:0 0 8px 8px;box-shadow:0 1px 3px rgba(0,0,0,.1)">
<h1 style="font-size:24px;color:#1f2937;margin:0 0 20px">Welcome to iTutor, {{firstName}}!</h1>
<p style="color:#4b5563;line-height:1.6">We're excited to have you join our Caribbean community of students and iTutors. Whether you need CXC, CAPE, or university-level help, we've got tutors ready to help you succeed.</p>
<p style="color:#4b5563;line-height:1.6">Ready to start?</p>
<a href="https://myitutor.com/student/find-tutors" style="display:inline-block;background:#199358;color:#fff!important;text-decoration:none;padding:14px 32px;border-radius:6px;font-weight:600">Find Your iTutor</a>
<p style="color:#4b5563;line-height:1.6;margin-top:20px">Questions? <a href="mailto:hello@myitutor.com" style="color:#199358">hello@myitutor.com</a></p>
</div>
<p style="text-align:center;color:#9ca3af;font-size:13px;margin-top:24px">© iTutor · Nora Digital, Ltd.</p>
</div></body></html>`,
    user_type: 'student',
    stage: 0,
  },
  {
    name: 'Student Day 1 Email',
    subject: '{{firstName}}, ready for your first session?',
    html_content: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;font-family:system-ui,sans-serif;background:#f9fafb;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
<div style="text-align:center;padding:30px 0;background:#000;border-radius:8px 8px 0 0;"><img src="https://myitutor.com/assets/logo/itutor-logo-dark.png" alt="iTutor" style="height:60px;display:block;margin:0 auto"/></div>
<div style="background:#fff;padding:40px;border-radius:0 0 8px 8px">
<h1 style="font-size:24px;color:#1f2937">Ready for your first session?</h1>
<p style="color:#4b5563;line-height:1.6">Hi {{firstName}},</p>
<p style="color:#4b5563;line-height:1.6">You're one step away from the help you need. Browse tutors, check availability, book online via Meet or Zoom.</p>
<a href="https://myitutor.com/student/find-tutors" style="display:inline-block;background:#199358;color:#fff!important;text-decoration:none;padding:14px 32px;border-radius:6px;font-weight:600;margin-top:12px">Book Your First Session</a>
</div>
<p style="text-align:center;color:#9ca3af;font-size:13px;margin-top:24px">© iTutor · Nora Digital, Ltd.</p>
</div></body></html>`,
    user_type: 'student',
    stage: 1,
  },
  {
    name: 'Student Day 3 Email',
    subject: 'How iTutor works - Quick guide for {{firstName}}',
    html_content: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;font-family:system-ui,sans-serif;background:#f9fafb;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
<div style="text-align:center;padding:30px 0;background:#000;border-radius:8px 8px 0 0;"><img src="https://myitutor.com/assets/logo/itutor-logo-dark.png" alt="iTutor" style="height:60px"/></div>
<div style="background:#fff;padding:40px;border-radius:0 0 8px 8px">
<h1 style="font-size:24px;color:#1f2937">How iTutor Works</h1>
<p style="color:#4b5563;line-height:1.6">Hi {{firstName}},</p>
<p style="color:#4b5563;line-height:1.6"><strong>Find</strong> tutors by subject and form level.<br><strong>Book</strong> a time that suits you.<br><strong>Meet</strong> online — no travel.</p>
<a href="https://myitutor.com/student/find-tutors" style="display:inline-block;background:#199358;color:#fff!important;text-decoration:none;padding:14px 32px;border-radius:6px;font-weight:600;margin-top:12px">Explore iTutors</a>
</div>
<p style="text-align:center;color:#9ca3af;font-size:13px;margin-top:24px">© iTutor · Nora Digital, Ltd.</p>
</div></body></html>`,
    user_type: 'student',
    stage: 3,
  },
  {
    name: 'Tutor Welcome Email',
    subject: 'Welcome to iTutor, {{firstName}}! Complete your profile 🎓',
    html_content: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;font-family:system-ui,sans-serif;background:#f9fafb;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
<div style="text-align:center;padding:30px 0;background:#000;border-radius:8px 8px 0 0;"><img src="https://myitutor.com/assets/logo/itutor-logo-dark.png" alt="iTutor" style="height:60px"/></div>
<div style="background:#fff;padding:40px;border-radius:0 0 8px 8px">
<h1 style="font-size:24px;color:#1f2937">Welcome to iTutor, {{firstName}}!</h1>
<p style="color:#4b5563;line-height:1.6">Complete your profile to start receiving bookings: subjects & rates, availability, bio, and credentials for verification.</p>
<div style="background:#f0fdf4;padding:20px;border-radius:6px;border-left:4px solid #199358;margin:16px 0">
<p style="color:#4b5563;margin:0;line-height:1.6">Tutors who finish in the first 24 hours often get their first student faster.</p>
</div>
<a href="https://myitutor.com/onboarding/tutor" style="display:inline-block;background:#199358;color:#fff!important;text-decoration:none;padding:14px 32px;border-radius:6px;font-weight:600">Complete Your Profile</a>
<p style="color:#4b5563;margin-top:20px"><a href="mailto:hello@myitutor.com" style="color:#199358">hello@myitutor.com</a></p>
</div>
<p style="text-align:center;color:#9ca3af;font-size:13px;margin-top:24px">© iTutor · Nora Digital, Ltd.</p>
</div></body></html>`,
    user_type: 'tutor',
    stage: 0,
  },
  {
    name: 'Tutor Day 1 Email',
    subject: '{{firstName}}, set your availability and start earning',
    html_content: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;font-family:system-ui,sans-serif;background:#f9fafb;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
<div style="text-align:center;padding:30px 0;background:#000;border-radius:8px 8px 0 0;"><img src="https://myitutor.com/assets/logo/itutor-logo-dark.png" alt="iTutor" style="height:60px"/></div>
<div style="background:#fff;padding:40px;border-radius:0 0 8px 8px">
<h1 style="font-size:24px;color:#1f2937">Set your rates & availability</h1>
<p style="color:#4b5563;line-height:1.6">Hi {{firstName}},</p>
<p style="color:#4b5563;line-height:1.6">Add subjects, set competitive rates, and open your calendar so students can book.</p>
<a href="https://myitutor.com/onboarding/tutor" style="display:inline-block;background:#199358;color:#fff!important;text-decoration:none;padding:14px 32px;border-radius:6px;font-weight:600;margin-top:12px">Set Up Your Profile</a>
</div>
<p style="text-align:center;color:#9ca3af;font-size:13px;margin-top:24px">© iTutor · Nora Digital, Ltd.</p>
</div></body></html>`,
    user_type: 'tutor',
    stage: 1,
  },
  {
    name: 'Tutor onboarding — stage 2',
    subject: '{{firstName}}, tips to get your first booking',
    html_content: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;font-family:system-ui,sans-serif;background:#f9fafb;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
<div style="text-align:center;padding:24px 0;background:#000;border-radius:8px 8px 0 0;"><img src="https://myitutor.com/assets/logo/itutor-logo-dark.png" alt="iTutor" style="height:56px"/></div>
<div style="background:#fff;padding:32px;border-radius:0 0 8px 8px;">
<h1 style="color:#111827;font-size:22px;">Hi {{firstName}},</h1>
<p style="color:#4b5563;line-height:1.6;">Students search by subject and availability. Complete your bio, keep your calendar updated, and respond quickly to messages — tutors who reply within an hour get booked more often.</p>
<p style="color:#4b5563;line-height:1.6;">Need help? <a href="mailto:hello@myitutor.com" style="color:#199358;">hello@myitutor.com</a></p>
<a href="https://myitutor.com/tutor/dashboard" style="display:inline-block;background:#199358;color:#fff!important;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;margin-top:12px;">Open dashboard</a>
</div>
<p style="text-align:center;color:#6b7280;font-size:13px;margin-top:24px;">© iTutor · Nora Digital, Ltd.</p>
</div></body></html>`,
    user_type: 'tutor',
    stage: 2,
  },
  {
    name: 'Tutor onboarding — stage 3',
    subject: '{{firstName}}, verification helps students trust you',
    html_content: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;font-family:system-ui,sans-serif;background:#f9fafb;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
<div style="text-align:center;padding:24px 0;background:#000;border-radius:8px 8px 0 0;"><img src="https://myitutor.com/assets/logo/itutor-logo-dark.png" alt="iTutor" style="height:56px"/></div>
<div style="background:#fff;padding:32px;border-radius:0 0 8px 8px;">
<h1 style="color:#111827;font-size:22px;">Stand out with verification</h1>
<p style="color:#4b5563;line-height:1.6;">Hi {{firstName}},</p>
<p style="color:#4b5563;line-height:1.6;">Uploading credentials and completing verification helps you appear in more searches and gives parents and students confidence to book.</p>
<a href="https://myitutor.com/onboarding/tutor" style="display:inline-block;background:#199358;color:#fff!important;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;margin-top:12px;">Complete verification</a>
</div>
<p style="text-align:center;color:#6b7280;font-size:13px;margin-top:24px;">© iTutor · Nora Digital, Ltd.</p>
</div></body></html>`,
    user_type: 'tutor',
    stage: 3,
  },
  {
    name: 'Tutor onboarding — stage 4',
    subject: "{{firstName}}, you're almost ready to earn",
    html_content: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;font-family:system-ui,sans-serif;background:#f9fafb;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
<div style="text-align:center;padding:24px 0;background:#000;border-radius:8px 8px 0 0;"><img src="https://myitutor.com/assets/logo/itutor-logo-dark.png" alt="iTutor" style="height:56px"/></div>
<div style="background:#fff;padding:32px;border-radius:0 0 8px 8px;">
<h1 style="color:#111827;font-size:22px;">Finish your profile</h1>
<p style="color:#4b5563;line-height:1.6;">Hi {{firstName}},</p>
<p style="color:#4b5563;line-height:1.6;">A full profile with subjects, rates, availability, and a short bio is what turns views into bookings. It only takes a few minutes.</p>
<a href="https://myitutor.com/onboarding/tutor" style="display:inline-block;background:#199358;color:#fff!important;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;margin-top:12px;">Update profile</a>
<p style="color:#6b7280;font-size:14px;margin-top:20px;">Questions? <a href="mailto:hello@myitutor.com" style="color:#199358;">hello@myitutor.com</a></p>
</div>
<p style="text-align:center;color:#6b7280;font-size:13px;margin-top:24px;">© iTutor · Nora Digital, Ltd.</p>
</div></body></html>`,
    user_type: 'tutor',
    stage: 4,
  },
  {
    name: 'Student onboarding — stage 2',
    subject: '{{firstName}}, find the right iTutor in minutes',
    html_content: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;font-family:system-ui,sans-serif;background:#f9fafb;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
<div style="text-align:center;padding:24px 0;background:#000;border-radius:8px 8px 0 0;"><img src="https://myitutor.com/assets/logo/itutor-logo-dark.png" alt="iTutor" style="height:56px"/></div>
<div style="background:#fff;padding:32px;border-radius:0 0 8px 8px;">
<h1 style="color:#111827;font-size:22px;">Browse by subject</h1>
<p style="color:#4b5563;line-height:1.6;">Hi {{firstName}},</p>
<p style="color:#4b5563;line-height:1.6;">Filter by your form level, read tutor bios, and pick a time that works. Sessions are online — no commute.</p>
<a href="https://myitutor.com/student/find-tutors" style="display:inline-block;background:#199358;color:#fff!important;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;margin-top:12px;">Find iTutors</a>
</div>
<p style="text-align:center;color:#6b7280;font-size:13px;margin-top:24px;">© iTutor · Nora Digital, Ltd.</p>
</div></body></html>`,
    user_type: 'student',
    stage: 2,
  },
  {
    name: 'Student onboarding — stage 4',
    subject: '{{firstName}}, still looking for help?',
    html_content: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;font-family:system-ui,sans-serif;background:#f9fafb;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
<div style="text-align:center;padding:24px 0;background:#000;border-radius:8px 8px 0 0;"><img src="https://myitutor.com/assets/logo/itutor-logo-dark.png" alt="iTutor" style="height:56px"/></div>
<div style="background:#fff;padding:32px;border-radius:0 0 8px 8px;">
<h1 style="color:#111827;font-size:22px;">We're here to help</h1>
<p style="color:#4b5563;line-height:1.6;">Hi {{firstName}},</p>
<p style="color:#4b5563;line-height:1.6;">If you have not booked yet, browse verified iTutors or email us and we'll point you to a good match.</p>
<a href="https://myitutor.com/student/find-tutors" style="display:inline-block;background:#199358;color:#fff!important;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;margin-top:12px;">Browse iTutors</a>
<p style="color:#6b7280;font-size:14px;margin-top:16px;"><a href="mailto:hello@myitutor.com" style="color:#199358;">hello@myitutor.com</a></p>
</div>
<p style="text-align:center;color:#6b7280;font-size:13px;margin-top:24px;">© iTutor · Nora Digital, Ltd.</p>
</div></body></html>`,
    user_type: 'student',
    stage: 4,
  },
  {
    name: 'Parent welcome — stage 0',
    subject: 'Welcome to iTutor, {{firstName}}',
    html_content: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;font-family:system-ui,sans-serif;background:#f9fafb;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
<div style="text-align:center;padding:24px 0;background:#000;border-radius:8px 8px 0 0;"><img src="https://myitutor.com/assets/logo/itutor-logo-dark.png" alt="iTutor" style="height:56px"/></div>
<div style="background:#fff;padding:32px;border-radius:0 0 8px 8px;">
<h1 style="color:#111827;font-size:22px;">Welcome, {{firstName}}</h1>
<p style="color:#4b5563;line-height:1.6;">Manage your child's learning on iTutor — find verified tutors, book online sessions, and track progress from one place.</p>
<a href="https://myitutor.com/parent/dashboard" style="display:inline-block;background:#199358;color:#fff!important;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;margin-top:12px;">Go to dashboard</a>
</div>
<p style="text-align:center;color:#6b7280;font-size:13px;margin-top:24px;">© iTutor · Nora Digital, Ltd.</p>
</div></body></html>`,
    user_type: 'parent',
    stage: 0,
  },
  {
    name: 'Parent onboarding — stage 1',
    subject: "{{firstName}}, add your child's profile",
    html_content: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;font-family:system-ui,sans-serif;background:#f9fafb;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
<div style="text-align:center;padding:24px 0;background:#000;border-radius:8px 8px 0 0;"><img src="https://myitutor.com/assets/logo/itutor-logo-dark.png" alt="iTutor" style="height:56px"/></div>
<div style="background:#fff;padding:32px;border-radius:0 0 8px 8px;">
<p style="color:#4b5563;line-height:1.6;">Hi {{firstName}}, add your student's form level and subjects so we can recommend the right tutors.</p>
<a href="https://myitutor.com/parent/dashboard" style="display:inline-block;background:#199358;color:#fff!important;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;margin-top:12px;">Open dashboard</a>
</div>
<p style="text-align:center;color:#6b7280;font-size:13px;margin-top:24px;">© iTutor · Nora Digital, Ltd.</p>
</div></body></html>`,
    user_type: 'parent',
    stage: 1,
  },
  {
    name: 'Parent onboarding — stage 2',
    subject: '{{firstName}}, book a session when it suits you',
    html_content: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;font-family:system-ui,sans-serif;background:#f9fafb;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
<div style="text-align:center;padding:24px 0;background:#000;border-radius:8px 8px 0 0;"><img src="https://myitutor.com/assets/logo/itutor-logo-dark.png" alt="iTutor" style="height:56px"/></div>
<div style="background:#fff;padding:32px;border-radius:0 0 8px 8px;">
<p style="color:#4b5563;line-height:1.6;">Hi {{firstName}}, sessions are online via Meet or Zoom. Pick a tutor, choose a time, and your child learns from home.</p>
<a href="https://myitutor.com/student/find-tutors" style="display:inline-block;background:#199358;color:#fff!important;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;margin-top:12px;">Find iTutors</a>
</div>
<p style="text-align:center;color:#6b7280;font-size:13px;margin-top:24px;">© iTutor · Nora Digital, Ltd.</p>
</div></body></html>`,
    user_type: 'parent',
    stage: 2,
  },
  {
    name: 'Parent onboarding — stage 3',
    subject: '{{firstName}}, verified tutors you can trust',
    html_content: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;font-family:system-ui,sans-serif;background:#f9fafb;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
<div style="text-align:center;padding:24px 0;background:#000;border-radius:8px 8px 0 0;"><img src="https://myitutor.com/assets/logo/itutor-logo-dark.png" alt="iTutor" style="height:56px"/></div>
<div style="background:#fff;padding:32px;border-radius:0 0 8px 8px;">
<p style="color:#4b5563;line-height:1.6;">Hi {{firstName}}, iTutor verifies credentials for tutors who complete verification — look for verified profiles when you browse.</p>
<a href="https://myitutor.com/student/find-tutors" style="display:inline-block;background:#199358;color:#fff!important;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;margin-top:12px;">Browse tutors</a>
</div>
<p style="text-align:center;color:#6b7280;font-size:13px;margin-top:24px;">© iTutor · Nora Digital, Ltd.</p>
</div></body></html>`,
    user_type: 'parent',
    stage: 3,
  },
  {
    name: 'Parent onboarding — stage 4',
    subject: '{{firstName}}, need help choosing a tutor?',
    html_content: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;font-family:system-ui,sans-serif;background:#f9fafb;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
<div style="text-align:center;padding:24px 0;background:#000;border-radius:8px 8px 0 0;"><img src="https://myitutor.com/assets/logo/itutor-logo-dark.png" alt="iTutor" style="height:56px"/></div>
<div style="background:#fff;padding:32px;border-radius:0 0 8px 8px;">
<p style="color:#4b5563;line-height:1.6;">Hi {{firstName}}, reply to this thread or email <a href="mailto:hello@myitutor.com" style="color:#199358;">hello@myitutor.com</a> — we're happy to recommend someone for CXC, CAPE, or exam prep.</p>
<a href="https://myitutor.com/parent/dashboard" style="display:inline-block;background:#199358;color:#fff!important;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;margin-top:12px;">Dashboard</a>
</div>
<p style="text-align:center;color:#6b7280;font-size:13px;margin-top:24px;">© iTutor · Nora Digital, Ltd.</p>
</div></body></html>`,
    user_type: 'parent',
    stage: 4,
  },
];
