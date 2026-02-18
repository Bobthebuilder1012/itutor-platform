import { EmailTemplateProps, EmailTemplate } from './types';

const logoUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://myitutor.com'}/assets/logo/itutor-logo-dark.png`;
const logoImg = `<img src="${logoUrl}" alt="iTutor" class="logo" style="height: 60px; width: auto; display: block; margin: 0 auto;" />`;
const footerBlock = `
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
            <p style="margin-top: 10px; color: #9ca3af; font-size: 13px;">© iTutor. Nora Digital, Ltd.</p>`;

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
    .highlight { background: #f0fdf4; padding: 20px; border-radius: 6px; border-left: 4px solid #199358; }
  </style>
`;

export function welcomeEmail({ firstName, ctaUrl }: EmailTemplateProps): EmailTemplate {
  return {
    subject: `Welcome to iTutor, ${firstName}! Complete your profile 🎓`,
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
            ${logoImg}
          </div>
          <div class="content">
            <h1 class="title">Welcome to iTutor, ${firstName}!</h1>
            <p class="text">
              Congrats on joining the #1 tutoring platform in the Caribbean! You're about to connect with students who need your expertise.
            </p>
            <p class="text">
              <strong>To start receiving booking requests, complete these quick steps:</strong>
            </p>
            <div class="highlight">
              <p class="text">
                ✅ Add your subjects and hourly rates<br>
                ✅ Set your availability<br>
                ✅ Write a short bio about your experience<br>
                ✅ Upload credentials for verification
              </p>
            </div>
            <p class="text">
              iTutors who complete their profile in the first 24 hours get their first student 3x faster!
            </p>
            <a href="${ctaUrl}" class="cta-button">Complete Your Profile</a>
            <p class="text">
              Questions? Contact us at <a href="mailto:hello@myitutor.com" style="color: #199358; text-decoration: none;">hello@myitutor.com</a>. We're here to help you succeed!
            </p>
          </div>
          <div class="footer">${footerBlock}
          </div>
        </div>
      </body>
      </html>
    `
  };
}

export function verificationCongratulationsEmail(firstName: string): EmailTemplate {
  return {
    subject: "Congratulations – You're now a verified iTutor!",
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
            ${logoImg}
          </div>
          <div class="content">
            <h1 class="title">Congratulations, ${firstName}!</h1>
            <p class="text">
              Your verification has been approved. You are now a verified iTutor.
            </p>
            <p class="text">
              Your verified badge will appear on your profile, helping students and parents trust your qualifications.
            </p>
            <p class="text">
              Best,<br>The iTutor Team
            </p>
          </div>
          <div class="footer">${footerBlock}
          </div>
        </div>
      </body>
      </html>
    `
  };
}

export function day1Email({ firstName, ctaUrl }: EmailTemplateProps): EmailTemplate {
  return {
    subject: `${firstName}, set your availability and start earning`,
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
            <h1 class="title">Set Your Rates & Availability</h1>
            <p class="text">
              Hi ${firstName},
            </p>
            <p class="text">
              Ready to start earning? The next step is setting up your subjects, rates, and teaching preferences.
            </p>
            <p class="text">
              <strong>Here's what to do:</strong>
            </p>
            <div class="highlight">
              <p class="text">
                <strong>1. Add Your Subjects</strong><br>
                List all subjects you can teach (Maths, Chemistry, English, etc.)
              </p>
              <p class="text">
                <strong>2. Set Competitive Rates</strong><br>
                Average rates: Form 1-3 ($50-80/hr), Form 4-5 ($80-120/hr), CAPE/University ($120-200/hr)
              </p>
              <p class="text">
                <strong>3. Set Your Availability</strong><br>
                Choose the times that work best for your schedule!
              </p>
            </div>
            <p class="text">
              <strong>Pro tip:</strong> iTutors who complete their profiles within 24 hours get their first booking faster!
            </p>
            <a href="${ctaUrl}" class="cta-button">Set Up Your Profile</a>
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
    subject: `How to get your first student on iTutor`,
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
            <h1 class="title">Get Your First Student</h1>
            <p class="text">
              Hi ${firstName},
            </p>
            <p class="text">
              Here's how to stand out and get bookings fast:
            </p>
            <div class="highlight">
              <p class="text">
                <strong>🌟 Complete Your Profile</strong><br>
                Students look at: Your bio, credentials, and response time. Make sure everything is filled out!
              </p>
              <p class="text">
                <strong>⚡ Respond Quickly</strong><br>
                Students often book the first tutor who replies. Check your email and iTutor dashboard regularly.
              </p>
              <p class="text">
                <strong>💰 Price Competitively</strong><br>
                Check similar itutors' rates in your subjects. You can always adjust prices later based on demand.
              </p>
              <p class="text">
                <strong>✅ Get Verified</strong><br>
                Verified itutors with credentials get 2x more bookings. Upload your certificates or degree!
              </p>
            </div>
            <p class="text">
              Students are actively searching for itutors right now. Make sure your profile is ready!
            </p>
            <a href="${ctaUrl}" class="cta-button">View Your Profile</a>
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
    subject: `${firstName}, tips to improve your tutor profile`,
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
            <h1 class="title">Improve Your Profile</h1>
            <p class="text">
              Hi ${firstName},
            </p>
            <p class="text">
              Want to attract more students? Here are the profile elements that matter most:
            </p>
            <p class="text">
              <strong>📝 Write a Strong Bio</strong><br>
              Mention: Your qualifications, teaching experience, exam results you've helped students achieve, and what makes you unique. Keep it friendly and conversational!
            </p>
            <p class="text">
              <strong>📸 Add a Profile Photo</strong><br>
              Profiles with photos get 60% more views. Use a clear, professional-looking headshot.
            </p>
            <p class="text">
              <strong>🎓 List Your Credentials</strong><br>
              Degrees, certifications, teaching experience - students want to know you're qualified.
            </p>
            <p class="text">
              <strong>💬 Response Time Matters</strong><br>
              Aim to respond to booking requests within 4-6 hours. Fast responses = more bookings.
            </p>
            <div class="highlight">
              <p class="text">
                <strong>Example of a great bio:</strong><br>
                "Hi! I'm a certified teacher with 5+ years helping students ace their CXC and CAPE exams. I specialize in Maths and Physics and love making complex topics simple. My students consistently score Grade 1-2. I offer flexible online sessions via Zoom. Let's work together to reach your goals!"
              </p>
            </div>
            <a href="${ctaUrl}" class="cta-button">Edit Your Profile</a>
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
    subject: `${firstName}, need help getting verified?`,
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
            <h1 class="title">Get Verified & Stand Out</h1>
            <p class="text">
              Hi ${firstName},
            </p>
            <p class="text">
              We noticed you haven't set up your subjects and availability yet. No worries - we're here to help!
            </p>
            <p class="text">
              <strong>Why verification matters:</strong>
            </p>
            <div class="highlight">
              <p class="text">
                ✅ Verified itutors appear first in search results<br>
                ✅ Students trust verified profiles 2x more<br>
                ✅ Verified badge increases booking rates by 150%<br>
                ✅ Unlock higher rate tiers ($150-200/hour)
              </p>
            </div>
            <p class="text">
              <strong>What you can upload:</strong>
            </p>
            <p class="text">
              • University degrees or transcripts<br>
              • Teaching certificates (MOE, private school)<br>
              • Professional credentials (CAPE results for Form 6 itutors)<br>
              • CXC/CAPE Grade 1-2 certificates for subject verification
            </p>
            <p class="text">
              <strong>Need help?</strong> Just email us at <a href="mailto:hello@myitutor.com" style="color: #199358; text-decoration: none;">hello@myitutor.com</a> with:
            </p>
            <p class="text">
              📚 Subjects you want to teach<br>
              🎓 Your qualifications<br>
              ❓ Any questions about the verification process
            </p>
            <p class="text">
              We'll guide you through it step by step!
            </p>
            <a href="${ctaUrl}" class="cta-button">Complete Your Profile</a>
            <p class="text" style="margin-top: 30px; padding-top: 30px; border-top: 1px solid #e5e7eb;">
              <em>Already set up but not receiving bookings?</em><br>
              Email us at <a href="mailto:hello@myitutor.com" style="color: #199358; text-decoration: none;">hello@myitutor.com</a> and we'll review your profile and give you personalized tips.
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
    subject: `💰 ${firstName}, earn extra during the long weekend!`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        ${baseStyles}
        <style>
          .earnings-box { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 20px; margin: 25px 0; border-radius: 4px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <img src="${process.env.NEXT_PUBLIC_SITE_URL || 'https://myitutor.com'}/assets/logo/itutor-logo-dark.png" alt="iTutor" class="logo" />
          </div>
          <div class="content">
            <h1 class="title">💰 Long Weekend = Earning Opportunity!</h1>
            <p class="text">
              Hi ${firstName},
            </p>
            <p class="text">
              The long weekend is coming up - and that means students are looking to catch up on their studies with extra sessions. 
              This is your chance to boost your earnings while helping more students!
            </p>
            
            <div class="earnings-box">
              <p class="text" style="margin-bottom: 10px; font-weight: 600; color: #92400e; font-size: 18px;">
                💵 Potential Extra Earnings:
              </p>
              <p class="text" style="margin-bottom: 0; color: #92400e;">
                <strong>2-3 extra sessions</strong> = $300-$600+ 💸<br>
                <strong>Full weekend availability</strong> = Even more opportunities!
              </p>
            </div>

            <p class="text">
              <strong>Why iTutors earn more during long weekends:</strong>
            </p>
            <p class="text">
              ✅ <strong>Higher demand</strong> - Students want to use extra time productively<br>
              ✅ <strong>Flexible scheduling</strong> - Offer morning, afternoon, and evening slots<br>
              ✅ <strong>Longer sessions</strong> - Students book 2-3 hour sessions for deep work<br>
              ✅ <strong>Less competition</strong> - Many tutors take the weekend off
            </p>

            <div class="highlight">
              <p class="text" style="margin-bottom: 10px; font-weight: 600; color: #199358;">
                🎯 Quick Action Steps:
              </p>
              <p class="text" style="margin-bottom: 0;">
                1️⃣ <strong>Update your availability</strong> - Add extra time slots<br>
                2️⃣ <strong>Open your calendar early</strong> - Students are booking now<br>
                3️⃣ <strong>Promote your availability</strong> - Students see "available now" first<br>
                4️⃣ <strong>Be responsive</strong> - Quick replies = more bookings
              </p>
            </div>

            <p class="text">
              <strong>Popular subjects in high demand:</strong> Maths, Physics, Chemistry, English, Accounting, and exam prep (CXC, CAPE)
            </p>

            <a href="${ctaUrl}" class="cta-button">Update My Availability</a>

            <p class="text" style="font-size: 14px; color: #6b7280; margin-top: 30px;">
              <em>💡 Pro Tip: iTutors who set availability 24-48 hours in advance get 3x more bookings. Don't wait - update your calendar now!</em>
            </p>

            <p class="text" style="margin-top: 30px; padding-top: 30px; border-top: 1px solid #e5e7eb;">
              Questions about maximizing your earnings? Contact us at <a href="mailto:hello@myitutor.com" style="color: #199358; text-decoration: none;">hello@myitutor.com</a>
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
