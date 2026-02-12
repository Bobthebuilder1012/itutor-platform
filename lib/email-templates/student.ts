import { EmailTemplateProps, EmailTemplate } from './types';

const baseStyles = `
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f9fafb; }
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
              We're excited to have you join our Caribbean community of students and itutors. 
              iTutor connects you with experienced itutors across Trinidad & Tobago and the wider Caribbean region.
            </p>
            <p class="text">
              Whether you need help with CXC, CAPE, or university-level subjects, we've got top itutors ready to help you succeed.
            </p>
            <p class="text">
              Ready to start your learning journey?
            </p>
            <a href="${ctaUrl}" class="cta-button">Find Your iTutor</a>
            <p class="text">
              If you have any questions, contact us at <a href="mailto:hello@myitutor.com" style="color: #199358; text-decoration: none;">hello@myitutor.com</a>. We're here to help!
            </p>
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
              You're just one step away from getting the help you need. Our itutors are ready and waiting to work with you.
            </p>
            <p class="text">
              <strong>Here's how easy it is:</strong>
            </p>
            <p class="text">
              1️⃣ Browse itutors by subject<br>
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
              Pay securely through our platform. Your money is protected, and itutors get paid after successful sessions.
            </p>
            <a href="${ctaUrl}" class="cta-button">Explore iTutors</a>
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
      </html>
    `
  };
}

export function day5Email({ firstName, ctaUrl }: EmailTemplateProps): EmailTemplate {
  return {
    subject: `Top itutors available now, ${firstName}`,
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
            <h1 class="title">Top iTutors Available Now</h1>
            <p class="text">
              Hi ${firstName},
            </p>
            <p class="text">
              We have amazing itutors with proven track records ready to help you excel. Here's what makes our itutors special:
            </p>
            <p class="text">
              ✅ <strong>Verified Credentials</strong> - All itutors are vetted with verified qualifications<br>
              ⭐ <strong>Student Reviews</strong> - See real ratings from students like you<br>
              🎓 <strong>Subject Experts</strong> - Specialized in CXC, CAPE, and Caribbean curriculum<br>
              💬 <strong>Fast Response</strong> - Most itutors respond within hours<br>
              💰 <strong>Fair Prices</strong> - Rates from $50-$200/hour depending on level
            </p>
            <p class="text">
              Whether you need help with Maths, Sciences, Languages, or exam prep, we've got you covered.
            </p>
            <p class="text">
              <strong>Pro tip:</strong> iTutors with 4.5+ ratings and "Professional Teacher" badges are in high demand. Book early to secure your spot!
            </p>
            <a href="${ctaUrl}" class="cta-button">Browse Top iTutors</a>
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
              Just email us at <a href="mailto:hello@myitutor.com" style="color: #199358; text-decoration: none;">hello@myitutor.com</a> with:
            </p>
            <p class="text">
              📝 Your subject(s) (e.g., Maths, Chemistry, English)<br>
              📚 Your form level (e.g., Form 4, CAPE, University)<br>
              🎯 Any specific topics or exam prep needs
            </p>
            <p class="text">
              We'll personally recommend 2-3 itutors who are perfect for your needs and budget. Many students find this helpful when starting out!
            </p>
            <p class="text">
              You can also browse our full tutor directory anytime:
            </p>
            <a href="${ctaUrl}" class="cta-button">Find Your iTutor</a>
            <p class="text" style="margin-top: 30px; padding-top: 30px; border-top: 1px solid #e5e7eb;">
              <em>Having technical issues or questions? We're here to help!</em><br>
              Contact us at <a href="mailto:hello@myitutor.com" style="color: #199358; text-decoration: none;">hello@myitutor.com</a> or visit our Help Centre.
            </p>
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
      </html>
    `
  };
}

export function longWeekendPromoEmail({ firstName, ctaUrl }: EmailTemplateProps): EmailTemplate {
  return {
    subject: `🎉 Long weekend coming up, ${firstName}! Perfect time to book sessions`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        ${baseStyles}
        <style>
          .highlight-box { background: #f0fdf4; border-left: 4px solid #199358; padding: 20px; margin: 25px 0; border-radius: 4px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <img src="${process.env.NEXT_PUBLIC_SITE_URL || 'https://myitutor.com'}/assets/logo/itutor-logo-dark.png" alt="iTutor" class="logo" />
          </div>
          <div class="content">
            <h1 class="title">🎉 Long Weekend Coming Up!</h1>
            <p class="text">
              Hi ${firstName},
            </p>
            <p class="text">
              The long weekend is almost here - and what better time to catch up on your studies? 
              While everyone else is relaxing, you can use this extra time to get ahead in your classes!
            </p>
            
            <div class="highlight-box">
              <p class="text" style="margin-bottom: 10px; font-weight: 600; color: #199358;">
                ⏰ Perfect Time to Book:
              </p>
              <p class="text" style="margin-bottom: 0;">
                📚 Catch up on topics you're struggling with<br>
                📝 Prepare for upcoming tests and exams<br>
                🎯 Get ahead on assignments and projects<br>
                💡 Review before the new school week starts
              </p>
            </div>

            <p class="text">
              <strong>Why book during the long weekend?</strong>
            </p>
            <p class="text">
              ✅ <strong>More availability</strong> - iTutors have extra time slots open<br>
              ✅ <strong>No time pressure</strong> - Schedule longer, more thorough sessions<br>
              ✅ <strong>Fresh start</strong> - Go into next week feeling confident and prepared<br>
              ✅ <strong>Beat the rush</strong> - Book now before spots fill up!
            </p>

            <p class="text">
              Whether you need help with Maths, Sciences, English, or exam prep, our top-rated iTutors are ready to help you succeed.
            </p>

            <a href="${ctaUrl}" class="cta-button">Find Your iTutor Now</a>

            <p class="text" style="font-size: 14px; color: #6b7280; margin-top: 30px;">
              <em>💡 Pro Tip: Sessions booked 24-48 hours in advance give you the best choice of time slots. Don't wait until the last minute!</em>
            </p>

            <p class="text" style="margin-top: 30px; padding-top: 30px; border-top: 1px solid #e5e7eb;">
              Have questions? We're here to help! Contact us at <a href="mailto:hello@myitutor.com" style="color: #199358; text-decoration: none;">hello@myitutor.com</a>
            </p>
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
      </html>
    `
  };
}
