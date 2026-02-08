-- =====================================================
-- DIRECT FIX - Copy Working Format to Broken Templates
-- =====================================================
-- Just copy the exact working HTML structure directly

-- Fix Student Day 3 Email - Copy from working Student template format
UPDATE email_templates
SET html_content = '<!DOCTYPE html>
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
    .cta-button { display: inline-block; background: #199358; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600; margin: 20px 0; }
    .cta-button:hover { background: #157a48; }
    .footer { text-align: center; padding: 30px 0; color: #6b7280; font-size: 14px; }
    .social-links { margin: 20px 0; }
    .social-links a { color: #199358; text-decoration: none; margin: 0 12px; font-weight: 500; }
    .social-links a:hover { color: #157a48; text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="https://myitutor.com/assets/logo/itutor-logo-dark.png" alt="iTutor" class="logo" style="height: 60px; width: auto; display: block; margin: 0 auto;" />
    </div>
    <div class="content">
      <h1 class="title">How iTutor Works</h1>
      <p class="text">Hi {{firstName}},</p>
      <p class="text">Let me break down how iTutor makes getting help super easy:</p>
      <p class="text"><strong>📚 Find Your Tutor</strong><br>Search by subject (Maths, English, Chemistry, etc.) and filter by form level. See ratings, prices, and availability at a glance.</p>
      <p class="text"><strong>📅 Book When It Suits You</strong><br>Pick a time that works with your schedule. Sessions are typically 1-2 hours, and you can book multiple sessions in advance.</p>
      <p class="text"><strong>💻 Meet Online</strong><br>All sessions happen via Google Meet or Zoom. No travel needed - learn from the comfort of home!</p>
      <p class="text"><strong>💳 Safe & Secure Payment</strong><br>Pay securely through our platform. Your money is protected, and itutors get paid after successful sessions.</p>
      <a href="https://myitutor.com/student/find-tutors" class="cta-button">Explore iTutors</a>
    </div>
    <div class="footer">
      <div class="social-links">
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
</html>'
WHERE name = 'Student Day 3 Email';

-- Verify
SELECT name, 
  CASE WHEN html_content LIKE '%style="height: 60px; width: auto; display: block; margin: 0 auto;"%' THEN '✅ Fixed' ELSE '❌ Still broken' END as status 
FROM email_templates 
WHERE name = 'Student Day 3 Email';
