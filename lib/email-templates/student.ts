import { EmailTemplateProps, EmailTemplate } from './types';

const baseStyles = `
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f9fafb; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; padding: 30px 0; }
    .logo { height: 60px; width: auto; }
    .content { background: #ffffff; padding: 40px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .title { font-size: 24px; color: #1f2937; margin-bottom: 20px; font-weight: 600; }
    .text { font-size: 16px; color: #4b5563; line-height: 1.6; margin-bottom: 20px; }
    .cta-button { display: inline-block; background: #199358; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600; margin: 20px 0; }
    .cta-button:hover { background: #157a48; }
    .footer { text-align: center; padding: 30px 0; color: #6b7280; font-size: 14px; }
    .social-links { margin: 20px 0; }
    .social-links a { color: #199358; text-decoration: none; margin: 0 12px; font-weight: 500; }
    .social-links a:hover { color: #157a48; text-decoration: underline; }
  </style>
`;

export function welcomeEmail({ firstName, ctaUrl }: EmailTemplateProps): EmailTemplate {
  return {
    subject: `Welcome to iTutor, ${firstName}! 🎓`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        ${baseStyles}
      </head>
      <body>
        <div class="container">
          <div class="header">
            <img src="${process.env.NEXT_PUBLIC_SITE_URL || 'https://myitutor.com'}/assets/logo/itutor-logo-dark.png" alt="iTutor" class="logo" />
          </div>
          <div class="content">
            <h1 class="title">Welcome to iTutor, ${firstName}!</h1>
            <p class="text">
              We're excited to have you join our Caribbean community of students and tutors. 
              iTutor connects you with experienced tutors across Trinidad & Tobago and the wider Caribbean region.
            </p>
            <p class="text">
              Whether you need help with CXC, CAPE, or university-level subjects, we've got top tutors ready to help you succeed.
            </p>
            <p class="text">
              Ready to start your learning journey?
            </p>
            <a href="${ctaUrl}" class="cta-button">Find Your Tutor</a>
            <p class="text">
              If you have any questions, just reply to this email. We're here to help!
            </p>
          </div>
          <div class="footer">
            <p>iTutor - Quality Caribbean Education</p>
            <div class="social-links">
              <a href="https://www.facebook.com/share/1E91o2u1yM/">Facebook</a>
              <a href="https://www.instagram.com/myitutor?igsh=Z3U5d2s3OG85N2V0">Instagram</a>
              <a href="https://www.linkedin.com/company/myitutor/">LinkedIn</a>
            </div>
            <p>Trinidad & Tobago | Barbados | Jamaica | Caribbean</p>
          </div>
        </div>
      </body>
      </html>
    `
  };
}

export function day1Email({ firstName, ctaUrl }: EmailTemplateProps): EmailTemplate {
  return {
    subject: `${firstName}, ready for your first session?`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        ${baseStyles}
      </head>
      <body>
        <div class="container">
          <div class="header">
            <img src="${process.env.NEXT_PUBLIC_SITE_URL || 'https://myitutor.com'}/assets/logo/itutor-logo-dark.png" alt="iTutor" class="logo" />
          </div>
          <div class="content">
            <h1 class="title">Ready for your first session?</h1>
            <p class="text">
              Hi ${firstName},
            </p>
            <p class="text">
              You're just one step away from getting the help you need. Our tutors are ready and waiting to work with you.
            </p>
            <p class="text">
              <strong>Here's how easy it is:</strong>
            </p>
            <p class="text">
              1️⃣ Browse tutors by subject<br>
              2️⃣ Check their ratings and availability<br>
              3️⃣ Book a session that works for your schedule<br>
              4️⃣ Meet online via Google Meet or Zoom
            </p>
            <p class="text">
              Most students book their first session within 24 hours. Don't wait - your grades will thank you!
            </p>
            <a href="${ctaUrl}" class="cta-button">Book Your First Session</a>
          </div>
          <div class="footer">
            <p>iTutor - Quality Caribbean Education</p>
          </div>
        </div>
      </body>
      </html>
    `
  };
}

export function day3Email({ firstName, ctaUrl }: EmailTemplateProps): EmailTemplate {
  return {
    subject: `How iTutor works - Quick guide for ${firstName}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        ${baseStyles}
      </head>
      <body>
        <div class="container">
          <div class="header">
            <img src="${process.env.NEXT_PUBLIC_SITE_URL || 'https://myitutor.com'}/assets/logo/itutor-logo-dark.png" alt="iTutor" class="logo" />
          </div>
          <div class="content">
            <h1 class="title">How iTutor Works</h1>
            <p class="text">
              Hi ${firstName},
            </p>
            <p class="text">
              Let me break down how iTutor makes getting help super easy:
            </p>
            <p class="text">
              <strong>📚 Find Your Tutor</strong><br>
              Search by subject (Maths, English, Chemistry, etc.) and filter by form level. See ratings, prices, and availability at a glance.
            </p>
            <p class="text">
              <strong>📅 Book When It Suits You</strong><br>
              Pick a time that works with your schedule. Sessions are typically 1-2 hours, and you can book multiple sessions in advance.
            </p>
            <p class="text">
              <strong>💻 Meet Online</strong><br>
              All sessions happen via Google Meet or Zoom. No travel needed - learn from the comfort of home!
            </p>
            <p class="text">
              <strong>💳 Safe & Secure Payment</strong><br>
              Pay securely through our platform. Your money is protected, and tutors get paid after successful sessions.
            </p>
            <a href="${ctaUrl}" class="cta-button">Explore Tutors</a>
          </div>
          <div class="footer">
            <p>iTutor - Quality Caribbean Education</p>
          </div>
        </div>
      </body>
      </html>
    `
  };
}

export function day5Email({ firstName, ctaUrl }: EmailTemplateProps): EmailTemplate {
  return {
    subject: `Top tutors available now, ${firstName}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        ${baseStyles}
      </head>
      <body>
        <div class="container">
          <div class="header">
            <img src="${process.env.NEXT_PUBLIC_SITE_URL || 'https://myitutor.com'}/assets/logo/itutor-logo-dark.png" alt="iTutor" class="logo" />
          </div>
          <div class="content">
            <h1 class="title">Top Tutors Available Now</h1>
            <p class="text">
              Hi ${firstName},
            </p>
            <p class="text">
              We have amazing tutors with proven track records ready to help you excel. Here's what makes our tutors special:
            </p>
            <p class="text">
              ✅ <strong>Verified Credentials</strong> - All tutors are vetted with verified qualifications<br>
              ⭐ <strong>Student Reviews</strong> - See real ratings from students like you<br>
              🎓 <strong>Subject Experts</strong> - Specialized in CXC, CAPE, and Caribbean curriculum<br>
              💬 <strong>Fast Response</strong> - Most tutors respond within hours<br>
              💰 <strong>Fair Prices</strong> - Rates from $50-$200/hour depending on level
            </p>
            <p class="text">
              Whether you need help with Maths, Sciences, Languages, or exam prep, we've got you covered.
            </p>
            <p class="text">
              <strong>Pro tip:</strong> Tutors with 4.5+ ratings and "Professional Teacher" badges are in high demand. Book early to secure your spot!
            </p>
            <a href="${ctaUrl}" class="cta-button">Browse Top Tutors</a>
          </div>
          <div class="footer">
            <p>iTutor - Quality Caribbean Education</p>
          </div>
        </div>
      </body>
      </html>
    `
  };
}

export function day7Email({ firstName, ctaUrl }: EmailTemplateProps): EmailTemplate {
  return {
    subject: `${firstName}, we're here to help you get started`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        ${baseStyles}
      </head>
      <body>
        <div class="container">
          <div class="header">
            <img src="${process.env.NEXT_PUBLIC_SITE_URL || 'https://myitutor.com'}/assets/logo/itutor-logo-dark.png" alt="iTutor" class="logo" />
          </div>
          <div class="content">
            <h1 class="title">Need Help Getting Started?</h1>
            <p class="text">
              Hi ${firstName},
            </p>
            <p class="text">
              We noticed you haven't booked your first session yet. No worries - sometimes finding the right tutor takes a bit of guidance!
            </p>
            <p class="text">
              <strong>Tell us what you need help with:</strong>
            </p>
            <p class="text">
              Just reply to this email with:
            </p>
            <p class="text">
              📝 Your subject(s) (e.g., Maths, Chemistry, English)<br>
              📚 Your form level (e.g., Form 4, CAPE, University)<br>
              🎯 Any specific topics or exam prep needs
            </p>
            <p class="text">
              We'll personally recommend 2-3 tutors who are perfect for your needs and budget. Many students find this helpful when starting out!
            </p>
            <p class="text">
              You can also browse our full tutor directory anytime:
            </p>
            <a href="${ctaUrl}" class="cta-button">Find Your Tutor</a>
            <p class="text" style="margin-top: 30px; padding-top: 30px; border-top: 1px solid #e5e7eb;">
              <em>Having technical issues or questions? We're here to help!</em><br>
              Reply to this email or visit our Help Centre.
            </p>
          </div>
          <div class="footer">
            <p>iTutor - Quality Caribbean Education</p>
          </div>
        </div>
      </body>
      </html>
    `
  };
}
