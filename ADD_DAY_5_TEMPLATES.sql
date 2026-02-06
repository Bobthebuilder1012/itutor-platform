-- Add Day 5 email templates for students and tutors

-- Student Day 5 Email
INSERT INTO email_templates (name, subject, html_content, user_type, stage) VALUES
(
  'Student Day 5 Email',
  '{{firstName}}, meet your perfect iTutor today',
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
    .highlight { background: #dbeafe; padding: 20px; border-radius: 6px; border-left: 4px solid #3b82f6; margin: 20px 0; }
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
      <h1 class="title">Meet Our Top-Rated iTutors</h1>
      <p class="text">Hi {{firstName}},</p>
      <p class="text">Don''t let another week pass without getting the help you need! Our verified iTutors have helped hundreds of Caribbean students improve their grades.</p>
      
      <div class="highlight">
        <p class="text"><strong>📚 Why students love iTutor:</strong></p>
        <p class="text">
          ⭐ Verified, experienced itutors<br>
          💻 Learn online from anywhere<br>
          📅 Flexible scheduling that fits your life<br>
          💰 Competitive rates across all subjects<br>
          🎯 Proven results - better grades guaranteed
        </p>
      </div>
      
      <p class="text">Whether you''re preparing for CXC, CAPE, or university exams, we have the perfect iTutor waiting for you.</p>
      <a href="https://myitutor.com/student/find-tutors" class="cta-button">Find Your iTutor</a>
      <p class="text">Need help choosing the right iTutor? Contact us at <a href="mailto:hello@myitutor.com" style="color: #199358;">hello@myitutor.com</a></p>
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
  5
),
(
  'Tutor Day 5 Email',
  '{{firstName}}, students are searching for itutors like you',
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
    .stats { background: #f0fdf4; padding: 20px; border-radius: 6px; margin: 20px 0; text-align: center; }
    .stat-number { font-size: 32px; font-weight: bold; color: #199358; }
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
      <h1 class="title">Students Are Waiting For You</h1>
      <p class="text">Hi {{firstName}},</p>
      <p class="text">Right now, students across Trinidad & Tobago are searching for an iTutor with your expertise. Don''t miss out on these opportunities!</p>
      
      <div class="stats">
        <div class="stat-number">50+</div>
        <p class="text" style="margin-bottom: 0;">Students searched for itutors this week</p>
      </div>
      
      <p class="text"><strong>Here''s what you''re missing:</strong></p>
      <p class="text">
        📊 Profile views from interested students<br>
        💰 Earning potential of $400-800/week<br>
        🎓 Helping students achieve their academic goals<br>
        ⭐ Building your reputation with 5-star reviews
      </p>
      
      <p class="text">Complete your profile today and start receiving booking requests immediately. It takes just 5 minutes!</p>
      <a href="https://myitutor.com/onboarding/tutor" class="cta-button">Activate Your Profile</a>
      <p class="text">Questions about getting started? Contact us at <a href="mailto:hello@myitutor.com" style="color: #199358;">hello@myitutor.com</a></p>
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
  5
);

-- Verify Day 5 templates were added
SELECT id, name, user_type, stage, created_at
FROM email_templates
WHERE stage = 5
ORDER BY user_type;

-- Show all templates by stage
SELECT name, user_type, stage
FROM email_templates
ORDER BY user_type, stage;
