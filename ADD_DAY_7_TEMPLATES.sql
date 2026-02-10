-- Add Day 7 email templates for students and tutors

-- Student Day 7 Email
INSERT INTO email_templates (name, subject, html_content, user_type, stage) VALUES
(
  'Student Day 7 Email',
  '{{firstName}}, still looking for the right iTutor?',
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
    .highlight { background: #f0fdf4; padding: 20px; border-radius: 6px; border-left: 4px solid #199358; margin: 20px 0; }
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
      <h1 class="title">Having trouble finding the right iTutor?</h1>
      <p class="text">Hi {{firstName}},</p>
      <p class="text">We noticed you haven''t booked a session yet. We''re here to help you find the perfect iTutor!</p>
      
      <div class="highlight">
        <p class="text"><strong>💡 Tips for finding your iTutor:</strong></p>
        <p class="text">
          ✓ Browse by your specific subject and form level<br>
          ✓ Read iTutor bios and student reviews<br>
          ✓ Check their availability and hourly rates<br>
          ✓ Book a trial session to find the right fit
        </p>
      </div>
      
      <p class="text">All sessions are online via Google Meet or Zoom, so you can learn from anywhere in the Caribbean!</p>
      <p class="text">Need help choosing? Contact us at <a href="mailto:hello@myitutor.com" style="color: #199358;">hello@myitutor.com</a> and we''ll recommend the best iTutor for your needs.</p>
      <a href="https://myitutor.com/student/find-tutors" class="cta-button">Browse iTutors Now</a>
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
      <p style="margin-top: 10px; color: #9ca3af; font-size: 13px;">iTutor 2026, All rights reserved</p>
    </div>
  </div>
</body>
</html>',
  'student',
  7
),
(
  'Tutor Day 7 Email',
  '{{firstName}}, your iTutor profile is almost ready!',
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
    .highlight { background: #fef3c7; padding: 20px; border-radius: 6px; border-left: 4px solid #f59e0b; margin: 20px 0; }
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
      <h1 class="title">Complete Your Profile & Start Earning</h1>
      <p class="text">Hi {{firstName}},</p>
      <p class="text">Your iTutor account is ready, but you''re missing out on booking requests because your profile isn''t complete yet.</p>
      
      <div class="highlight">
        <p class="text"><strong>⚠️ What''s Missing:</strong></p>
        <p class="text">
          Students can''t find you until you:<br>
          ✓ Add your subjects and hourly rates<br>
          ✓ Write a bio about your teaching experience<br>
          ✓ Upload credentials for verification<br>
          ✓ Set your online availability
        </p>
      </div>
      
      <p class="text"><strong>Good news:</strong> It only takes 5 minutes to complete your profile and start receiving booking requests!</p>
      <p class="text">Verified itutors earn an average of $400-800 per week teaching online. Don''t wait - students are looking for help right now.</p>
      <a href="https://myitutor.com/onboarding/tutor" class="cta-button">Complete Profile Now</a>
      <p class="text">Questions? Contact us at <a href="mailto:hello@myitutor.com" style="color: #199358;">hello@myitutor.com</a>. We''re here to support your success!</p>
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
      <p style="margin-top: 10px; color: #9ca3af; font-size: 13px;">iTutor 2026, All rights reserved</p>
    </div>
  </div>
</body>
</html>',
  'tutor',
  7
);

-- Verify Day 7 templates were added
SELECT id, name, user_type, stage, created_at
FROM email_templates
WHERE stage = 7
ORDER BY user_type;

-- Show all templates
SELECT name, user_type, stage
FROM email_templates
ORDER BY user_type, stage;
