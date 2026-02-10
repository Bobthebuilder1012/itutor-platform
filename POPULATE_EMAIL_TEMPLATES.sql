-- Populate email_templates table with all existing email templates
-- Run this in Supabase SQL Editor after creating the email_templates table

-- Clear existing templates (optional - comment out if you want to keep existing)
-- DELETE FROM email_templates;

-- Student Email Templates
INSERT INTO email_templates (name, subject, html_content, user_type, stage) VALUES
(
  'Student Welcome Email',
  'Welcome to iTutor, {{firstName}}! 🎓',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif; background-color: #f9fafb; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; padding: 30px 0; background: #000000; border-radius: 8px 8px 0 0; }
    .logo { height: 60px; width: auto; display: block; margin: 0 auto; }
    .content { background: #ffffff; padding: 40px; border-radius: 0 0 8px 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .title { font-size: 24px; color: #1f2937; margin-bottom: 20px; font-weight: 600; }
    .text { font-size: 16px; color: #4b5563; line-height: 1.6; margin-bottom: 20px; }
    .cta-button { display: inline-block; background: #199358; color: #ffffff !important; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600; margin: 20px 0; }
    .footer { text-align: center; padding: 30px 0; color: #6b7280; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="https://myitutor.com/assets/logo/itutor-logo-dark.png" alt="iTutor" class="logo" />
    </div>
    <div class="content">
      <h1 class="title">Welcome to iTutor, {{firstName}}!</h1>
      <p class="text">We''re excited to have you join our Caribbean community of students and itutors. iTutor connects you with experienced itutors across Trinidad & Tobago and the wider Caribbean region.</p>
      <p class="text">Whether you need help with CXC, CAPE, or university-level subjects, we''ve got top itutors ready to help you succeed.</p>
      <p class="text">Ready to start your learning journey?</p>
      <a href="https://myitutor.com/student/find-tutors" class="cta-button">Find Your iTutor</a>
      <p class="text">If you have any questions, contact us at <a href="mailto:hello@myitutor.com" style="color: #199358;">hello@myitutor.com</a>. We''re here to help!</p>
    </div>
    <div class="footer">
      <div style="margin: 20px 0;">
        <a href="https://www.facebook.com/share/1E91o2u1yM/" style="display: inline-block; margin: 0 8px;">
          <img src="https://img.icons8.com/ios-filled/50/6b7280/facebook-new.png" alt="Facebook" style="width: 28px; height: 28px; filter: grayscale(100%);" />
        </a>
        <a href="https://www.instagram.com/myitutor?igsh=MXgyNjdrMTR1ampyag%3D%3D&utm_source=qr" style="display: inline-block; margin: 0 8px;">
          <img src="https://img.icons8.com/ios-filled/50/6b7280/instagram-new.png" alt="Instagram" style="width: 28px; height: 28px; filter: grayscale(100%);" />
        </a>
        <a href="https://www.linkedin.com/company/myitutor/" style="display: inline-block; margin: 0 8px;">
          <img src="https://img.icons8.com/ios-filled/50/6b7280/linkedin.png" alt="LinkedIn" style="width: 28px; height: 28px; filter: grayscale(100%);" />
        </a>
      </div>
      <p style="margin-top: 15px; color: #6b7280;">Trinidad & Tobago</p>
      <p style="margin-top: 10px; color: #9ca3af; font-size: 13px;">© iTutor. Nora Digital, Ltd.</p>
    </div>
  </div>
</body>
</html>',
  'student',
  0
),
(
  'Student Day 1 Email',
  '{{firstName}}, ready for your first session?',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif; background-color: #f9fafb; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; padding: 30px 0; background: #000000; border-radius: 8px 8px 0 0; }
    .logo { height: 60px; width: auto; display: block; margin: 0 auto; }
    .content { background: #ffffff; padding: 40px; border-radius: 0 0 8px 8px; }
    .title { font-size: 24px; color: #1f2937; margin-bottom: 20px; font-weight: 600; }
    .text { font-size: 16px; color: #4b5563; line-height: 1.6; margin-bottom: 20px; }
    .cta-button { display: inline-block; background: #199358; color: #ffffff !important; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600; margin: 20px 0; }
    .footer { text-align: center; padding: 30px 0; color: #6b7280; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="https://myitutor.com/assets/logo/itutor-logo-dark.png" alt="iTutor" class="logo" />
    </div>
    <div class="content">
      <h1 class="title">Ready for your first session?</h1>
      <p class="text">Hi {{firstName}},</p>
      <p class="text">You''re just one step away from getting the help you need. Our itutors are ready and waiting to work with you.</p>
      <p class="text"><strong>Here''s how easy it is:</strong></p>
      <p class="text">1️⃣ Browse itutors by subject<br>2️⃣ Check their ratings and availability<br>3️⃣ Book a session that works for your schedule<br>4️⃣ Meet online via Google Meet or Zoom</p>
      <p class="text">Most students book their first session within 24 hours. Don''t wait - your grades will thank you!</p>
      <a href="https://myitutor.com/student/find-tutors" class="cta-button">Book Your First Session</a>
    </div>
    <div class="footer">
      <p style="margin-top: 15px;">Trinidad & Tobago</p>
      <p style="margin-top: 10px; color: #9ca3af; font-size: 13px;">© iTutor. Nora Digital, Ltd.</p>
    </div>
  </div>
</body>
</html>',
  'student',
  1
),
(
  'Student Day 3 Email',
  'How iTutor works - Quick guide for {{firstName}}',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, sans-serif; background-color: #f9fafb; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; padding: 30px 0; background: #000000; border-radius: 8px 8px 0 0; }
    .content { background: #ffffff; padding: 40px; border-radius: 0 0 8px 8px; }
    .title { font-size: 24px; color: #1f2937; margin-bottom: 20px; font-weight: 600; }
    .text { font-size: 16px; color: #4b5563; line-height: 1.6; margin-bottom: 20px; }
    .cta-button { display: inline-block; background: #199358; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="https://myitutor.com/assets/logo/itutor-logo-dark.png" alt="iTutor" style="height: 60px;" />
    </div>
    <div class="content">
      <h1 class="title">How iTutor Works</h1>
      <p class="text">Hi {{firstName}},</p>
      <p class="text">Let me break down how iTutor makes getting help super easy:</p>
      <p class="text"><strong>📚 Find Your iTutor</strong><br>Search by subject (Maths, English, Chemistry, etc.) and filter by form level.</p>
      <p class="text"><strong>📅 Book When It Suits You</strong><br>Pick a time that works with your schedule. Sessions are typically 1-2 hours.</p>
      <p class="text"><strong>💻 Meet Online</strong><br>All sessions happen via Google Meet or Zoom. No travel needed!</p>
      <a href="https://myitutor.com/student/find-tutors" class="cta-button">Explore iTutors</a>
    </div>
    <div style="text-align: center; padding: 30px 0; color: #6b7280;">
      <p>Trinidad & Tobago</p>
      <p style="margin-top: 10px; color: #9ca3af; font-size: 13px;">© iTutor. Nora Digital, Ltd.</p>
    </div>
  </div>
</body>
</html>',
  'student',
  3
);

-- Tutor Email Templates
INSERT INTO email_templates (name, subject, html_content, user_type, stage) VALUES
(
  'Tutor Welcome Email',
  'Welcome to iTutor, {{firstName}}! Complete your profile 🎓',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, sans-serif; background-color: #f9fafb; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; padding: 30px 0; background: #000000; border-radius: 8px 8px 0 0; }
    .content { background: #ffffff; padding: 40px; border-radius: 0 0 8px 8px; }
    .title { font-size: 24px; color: #1f2937; margin-bottom: 20px; font-weight: 600; }
    .text { font-size: 16px; color: #4b5563; line-height: 1.6; margin-bottom: 20px; }
    .highlight { background: #f0fdf4; padding: 20px; border-radius: 6px; border-left: 4px solid #199358; }
    .cta-button { display: inline-block; background: #199358; color: #ffffff !important; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="https://myitutor.com/assets/logo/itutor-logo-dark.png" alt="iTutor" style="height: 60px;" />
    </div>
    <div class="content">
      <h1 class="title">Welcome to iTutor, {{firstName}}!</h1>
      <p class="text">Congrats on joining the #1 tutoring platform in the Caribbean! You''re about to connect with students who need your expertise.</p>
      <p class="text"><strong>To start receiving booking requests, complete these quick steps:</strong></p>
      <div class="highlight">
        <p class="text">✅ Add your subjects and hourly rates<br>✅ Set your availability<br>✅ Write a short bio about your experience<br>✅ Upload credentials for verification</p>
      </div>
      <p class="text">iTutors who complete their profile in the first 24 hours get their first student 3x faster!</p>
      <a href="https://myitutor.com/onboarding/tutor" class="cta-button">Complete Your Profile</a>
      <p class="text">Questions? Contact us at <a href="mailto:hello@myitutor.com" style="color: #199358;">hello@myitutor.com</a>. We''re here to help you succeed!</p>
    </div>
    <div style="text-align: center; padding: 30px 0; color: #6b7280;">
      <p>Trinidad & Tobago</p>
      <p style="margin-top: 10px; color: #9ca3af; font-size: 13px;">© iTutor. Nora Digital, Ltd.</p>
    </div>
  </div>
</body>
</html>',
  'tutor',
  0
),
(
  'Tutor Day 1 Email',
  '{{firstName}}, set your availability and start earning',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, sans-serif; background-color: #f9fafb; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; padding: 30px 0; background: #000000; border-radius: 8px 8px 0 0; }
    .content { background: #ffffff; padding: 40px; border-radius: 0 0 8px 8px; }
    .title { font-size: 24px; color: #1f2937; margin-bottom: 20px; font-weight: 600; }
    .text { font-size: 16px; color: #4b5563; line-height: 1.6; margin-bottom: 20px; }
    .highlight { background: #f0fdf4; padding: 20px; border-radius: 6px; border-left: 4px solid #199358; }
    .cta-button { display: inline-block; background: #199358; color: #ffffff !important; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="https://myitutor.com/assets/logo/itutor-logo-dark.png" alt="iTutor" style="height: 60px;" />
    </div>
    <div class="content">
      <h1 class="title">Set Your Rates & Availability</h1>
      <p class="text">Hi {{firstName}},</p>
      <p class="text">Ready to start earning? The next step is setting up your subjects, rates, and teaching preferences.</p>
      <div class="highlight">
        <p class="text"><strong>1. Add Your Subjects</strong><br>List all subjects you can teach (Maths, Chemistry, English, etc.)</p>
        <p class="text"><strong>2. Set Competitive Rates</strong><br>Average rates: Form 1-3 ($50-80/hr), Form 4-5 ($80-120/hr), CAPE/University ($120-200/hr)</p>
      </div>
      <p class="text"><strong>Pro tip:</strong> iTutors who complete their profiles within 24 hours get their first booking faster!</p>
      <a href="https://myitutor.com/onboarding/tutor" class="cta-button">Set Up Your Profile</a>
    </div>
    <div style="text-align: center; padding: 30px 0; color: #6b7280;">
      <p>Trinidad & Tobago</p>
      <p style="margin-top: 10px; color: #9ca3af; font-size: 13px;">© iTutor. Nora Digital, Ltd.</p>
    </div>
  </div>
</body>
</html>',
  'tutor',
  1
);

-- Verify templates were inserted
SELECT id, name, user_type, stage, created_at 
FROM email_templates 
ORDER BY user_type, stage;
