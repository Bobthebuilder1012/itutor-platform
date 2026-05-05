-- =====================================================
-- Onboarding email templates for cron stages 0–4
-- =====================================================
-- Cron (send-onboarding-emails) loads templates by user_type + stage (0–4).
-- Legacy seed scripts only inserted tutor 0–1 and skipped student stage 2 / tutor 2–4;
-- other scripts used wrong stage numbers (5, 7). Insert any missing (user_type, stage).

INSERT INTO public.email_templates (name, subject, html_content, user_type, stage)
SELECT
  'Tutor onboarding — stage 2',
  '{{firstName}}, tips to get your first booking',
  '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;font-family:system-ui,sans-serif;background:#f9fafb;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
<div style="text-align:center;padding:24px 0;background:#000;border-radius:8px 8px 0 0;"><img src="https://myitutor.com/assets/logo/itutor-logo-dark.png" alt="iTutor" style="height:56px"/></div>
<div style="background:#fff;padding:32px;border-radius:0 0 8px 8px;">
<h1 style="color:#111827;font-size:22px;">Hi {{firstName}},</h1>
<p style="color:#4b5563;line-height:1.6;">Students search by subject and availability. Complete your bio, keep your calendar updated, and respond quickly to messages — tutors who reply within an hour get booked more often.</p>
<p style="color:#4b5563;line-height:1.6;">Need help? <a href="mailto:hello@myitutor.com" style="color:#199358;">hello@myitutor.com</a></p>
<a href="https://myitutor.com/tutor/dashboard" style="display:inline-block;background:#199358;color:#fff!important;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;margin-top:12px;">Open dashboard</a>
</div>
<p style="text-align:center;color:#6b7280;font-size:13px;margin-top:24px;">© iTutor · Nora Digital, Ltd.</p>
</div></body></html>',
  'tutor',
  2
WHERE NOT EXISTS (SELECT 1 FROM public.email_templates t WHERE t.user_type = 'tutor' AND t.stage = 2);

INSERT INTO public.email_templates (name, subject, html_content, user_type, stage)
SELECT
  'Tutor onboarding — stage 3',
  '{{firstName}}, verification helps students trust you',
  '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;font-family:system-ui,sans-serif;background:#f9fafb;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
<div style="text-align:center;padding:24px 0;background:#000;border-radius:8px 8px 0 0;"><img src="https://myitutor.com/assets/logo/itutor-logo-dark.png" alt="iTutor" style="height:56px"/></div>
<div style="background:#fff;padding:32px;border-radius:0 0 8px 8px;">
<h1 style="color:#111827;font-size:22px;">Stand out with verification</h1>
<p style="color:#4b5563;line-height:1.6;">Hi {{firstName}},</p>
<p style="color:#4b5563;line-height:1.6;">Uploading credentials and completing verification helps you appear in more searches and gives parents and students confidence to book.</p>
<a href="https://myitutor.com/onboarding/tutor" style="display:inline-block;background:#199358;color:#fff!important;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;margin-top:12px;">Complete verification</a>
</div>
<p style="text-align:center;color:#6b7280;font-size:13px;margin-top:24px;">© iTutor · Nora Digital, Ltd.</p>
</div></body></html>',
  'tutor',
  3
WHERE NOT EXISTS (SELECT 1 FROM public.email_templates t WHERE t.user_type = 'tutor' AND t.stage = 3);

INSERT INTO public.email_templates (name, subject, html_content, user_type, stage)
SELECT
  'Tutor onboarding — stage 4',
  '{{firstName}}, you''re almost ready to earn',
  '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;font-family:system-ui,sans-serif;background:#f9fafb;">
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
</div></body></html>',
  'tutor',
  4
WHERE NOT EXISTS (SELECT 1 FROM public.email_templates t WHERE t.user_type = 'tutor' AND t.stage = 4);

INSERT INTO public.email_templates (name, subject, html_content, user_type, stage)
SELECT
  'Student onboarding — stage 2',
  '{{firstName}}, find the right iTutor in minutes',
  '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;font-family:system-ui,sans-serif;background:#f9fafb;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
<div style="text-align:center;padding:24px 0;background:#000;border-radius:8px 8px 0 0;"><img src="https://myitutor.com/assets/logo/itutor-logo-dark.png" alt="iTutor" style="height:56px"/></div>
<div style="background:#fff;padding:32px;border-radius:0 0 8px 8px;">
<h1 style="color:#111827;font-size:22px;">Browse by subject</h1>
<p style="color:#4b5563;line-height:1.6;">Hi {{firstName}},</p>
<p style="color:#4b5563;line-height:1.6;">Filter by your form level, read tutor bios, and pick a time that works. Sessions are online — no commute.</p>
<a href="https://myitutor.com/student/find-tutors" style="display:inline-block;background:#199358;color:#fff!important;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;margin-top:12px;">Find iTutors</a>
</div>
<p style="text-align:center;color:#6b7280;font-size:13px;margin-top:24px;">© iTutor · Nora Digital, Ltd.</p>
</div></body></html>',
  'student',
  2
WHERE NOT EXISTS (SELECT 1 FROM public.email_templates t WHERE t.user_type = 'student' AND t.stage = 2);

INSERT INTO public.email_templates (name, subject, html_content, user_type, stage)
SELECT
  'Student onboarding — stage 4',
  '{{firstName}}, still looking for help?',
  '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;font-family:system-ui,sans-serif;background:#f9fafb;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
<div style="text-align:center;padding:24px 0;background:#000;border-radius:8px 8px 0 0;"><img src="https://myitutor.com/assets/logo/itutor-logo-dark.png" alt="iTutor" style="height:56px"/></div>
<div style="background:#fff;padding:32px;border-radius:0 0 8px 8px;">
<h1 style="color:#111827;font-size:22px;">We''re here to help</h1>
<p style="color:#4b5563;line-height:1.6;">Hi {{firstName}},</p>
<p style="color:#4b5563;line-height:1.6;">If you have not booked yet, browse verified iTutors or email us and we''ll point you to a good match.</p>
<a href="https://myitutor.com/student/find-tutors" style="display:inline-block;background:#199358;color:#fff!important;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;margin-top:12px;">Browse iTutors</a>
<p style="color:#6b7280;font-size:14px;margin-top:16px;"><a href="mailto:hello@myitutor.com" style="color:#199358;">hello@myitutor.com</a></p>
</div>
<p style="text-align:center;color:#6b7280;font-size:13px;margin-top:24px;">© iTutor · Nora Digital, Ltd.</p>
</div></body></html>',
  'student',
  4
WHERE NOT EXISTS (SELECT 1 FROM public.email_templates t WHERE t.user_type = 'student' AND t.stage = 4);

INSERT INTO public.email_templates (name, subject, html_content, user_type, stage)
SELECT
  'Parent welcome — stage 0',
  'Welcome to iTutor, {{firstName}}',
  '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;font-family:system-ui,sans-serif;background:#f9fafb;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
<div style="text-align:center;padding:24px 0;background:#000;border-radius:8px 8px 0 0;"><img src="https://myitutor.com/assets/logo/itutor-logo-dark.png" alt="iTutor" style="height:56px"/></div>
<div style="background:#fff;padding:32px;border-radius:0 0 8px 8px;">
<h1 style="color:#111827;font-size:22px;">Welcome, {{firstName}}</h1>
<p style="color:#4b5563;line-height:1.6;">Manage your child''s learning on iTutor — find verified tutors, book online sessions, and track progress from one place.</p>
<a href="https://myitutor.com/parent/dashboard" style="display:inline-block;background:#199358;color:#fff!important;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;margin-top:12px;">Go to dashboard</a>
</div>
<p style="text-align:center;color:#6b7280;font-size:13px;margin-top:24px;">© iTutor · Nora Digital, Ltd.</p>
</div></body></html>',
  'parent',
  0
WHERE NOT EXISTS (SELECT 1 FROM public.email_templates t WHERE t.user_type = 'parent' AND t.stage = 0);

INSERT INTO public.email_templates (name, subject, html_content, user_type, stage)
SELECT
  'Parent onboarding — stage 1',
  '{{firstName}}, add your child''s profile',
  '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;font-family:system-ui,sans-serif;background:#f9fafb;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
<div style="text-align:center;padding:24px 0;background:#000;border-radius:8px 8px 0 0;"><img src="https://myitutor.com/assets/logo/itutor-logo-dark.png" alt="iTutor" style="height:56px"/></div>
<div style="background:#fff;padding:32px;border-radius:0 0 8px 8px;">
<p style="color:#4b5563;line-height:1.6;">Hi {{firstName}}, add your student''s form level and subjects so we can recommend the right tutors.</p>
<a href="https://myitutor.com/parent/dashboard" style="display:inline-block;background:#199358;color:#fff!important;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;margin-top:12px;">Open dashboard</a>
</div>
<p style="text-align:center;color:#6b7280;font-size:13px;margin-top:24px;">© iTutor · Nora Digital, Ltd.</p>
</div></body></html>',
  'parent',
  1
WHERE NOT EXISTS (SELECT 1 FROM public.email_templates t WHERE t.user_type = 'parent' AND t.stage = 1);

INSERT INTO public.email_templates (name, subject, html_content, user_type, stage)
SELECT
  'Parent onboarding — stage 2',
  '{{firstName}}, book a session when it suits you',
  '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;font-family:system-ui,sans-serif;background:#f9fafb;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
<div style="text-align:center;padding:24px 0;background:#000;border-radius:8px 8px 0 0;"><img src="https://myitutor.com/assets/logo/itutor-logo-dark.png" alt="iTutor" style="height:56px"/></div>
<div style="background:#fff;padding:32px;border-radius:0 0 8px 8px;">
<p style="color:#4b5563;line-height:1.6;">Hi {{firstName}}, sessions are online via Meet or Zoom. Pick a tutor, choose a time, and your child learns from home.</p>
<a href="https://myitutor.com/student/find-tutors" style="display:inline-block;background:#199358;color:#fff!important;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;margin-top:12px;">Find iTutors</a>
</div>
<p style="text-align:center;color:#6b7280;font-size:13px;margin-top:24px;">© iTutor · Nora Digital, Ltd.</p>
</div></body></html>',
  'parent',
  2
WHERE NOT EXISTS (SELECT 1 FROM public.email_templates t WHERE t.user_type = 'parent' AND t.stage = 2);

INSERT INTO public.email_templates (name, subject, html_content, user_type, stage)
SELECT
  'Parent onboarding — stage 3',
  '{{firstName}}, verified tutors you can trust',
  '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;font-family:system-ui,sans-serif;background:#f9fafb;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
<div style="text-align:center;padding:24px 0;background:#000;border-radius:8px 8px 0 0;"><img src="https://myitutor.com/assets/logo/itutor-logo-dark.png" alt="iTutor" style="height:56px"/></div>
<div style="background:#fff;padding:32px;border-radius:0 0 8px 8px;">
<p style="color:#4b5563;line-height:1.6;">Hi {{firstName}}, iTutor verifies credentials for tutors who complete verification — look for verified profiles when you browse.</p>
<a href="https://myitutor.com/student/find-tutors" style="display:inline-block;background:#199358;color:#fff!important;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;margin-top:12px;">Browse tutors</a>
</div>
<p style="text-align:center;color:#6b7280;font-size:13px;margin-top:24px;">© iTutor · Nora Digital, Ltd.</p>
</div></body></html>',
  'parent',
  3
WHERE NOT EXISTS (SELECT 1 FROM public.email_templates t WHERE t.user_type = 'parent' AND t.stage = 3);

INSERT INTO public.email_templates (name, subject, html_content, user_type, stage)
SELECT
  'Parent onboarding — stage 4',
  '{{firstName}}, need help choosing a tutor?',
  '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;font-family:system-ui,sans-serif;background:#f9fafb;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
<div style="text-align:center;padding:24px 0;background:#000;border-radius:8px 8px 0 0;"><img src="https://myitutor.com/assets/logo/itutor-logo-dark.png" alt="iTutor" style="height:56px"/></div>
<div style="background:#fff;padding:32px;border-radius:0 0 8px 8px;">
<p style="color:#4b5563;line-height:1.6;">Hi {{firstName}}, reply to this thread or email <a href="mailto:hello@myitutor.com" style="color:#199358;">hello@myitutor.com</a> — we''re happy to recommend someone for CXC, CAPE, or exam prep.</p>
<a href="https://myitutor.com/parent/dashboard" style="display:inline-block;background:#199358;color:#fff!important;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;margin-top:12px;">Dashboard</a>
</div>
<p style="text-align:center;color:#6b7280;font-size:13px;margin-top:24px;">© iTutor · Nora Digital, Ltd.</p>
</div></body></html>',
  'parent',
  4
WHERE NOT EXISTS (SELECT 1 FROM public.email_templates t WHERE t.user_type = 'parent' AND t.stage = 4);
