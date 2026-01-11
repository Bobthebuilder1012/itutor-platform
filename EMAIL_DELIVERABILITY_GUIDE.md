# 📬 Email Deliverability - Keep Emails Out of Spam

## ✅ Critical Steps (Do These First)

### 1. Set Up Email Authentication (Most Important!)

These DNS records prove your emails are legitimate and drastically improve deliverability.

#### Go to Resend Dashboard → Domains → Your Domain

You should see these records:

**SPF Record** ✅
```
Type: TXT
Name: @
Value: v=spf1 include:amazonses.com ~all
```

**DKIM Records** ✅ (Resend provides 3 records)
```
Type: CNAME
Name: resend._domainkey
Value: [provided by Resend]

Type: CNAME  
Name: resend2._domainkey
Value: [provided by Resend]

Type: CNAME
Name: resend3._domainkey
Value: [provided by Resend]
```

**DMARC Record** ⚠️ (Often missing!)
```
Type: TXT
Name: _dmarc
Value: v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com
```

#### How to Add These to Your Domain:

**If using Cloudflare:**
1. Go to: DNS → Records
2. Click "Add record"
3. Add each record (Type, Name, Value)
4. Wait 5-10 minutes for propagation

**If using GoDaddy/Namecheap/Other:**
1. Go to DNS Management
2. Add TXT and CNAME records as shown
3. Save changes
4. Wait 15-30 minutes

#### Verify Records Are Working:
```bash
# Check SPF
nslookup -type=txt yourdomain.com

# Check DKIM  
nslookup -type=cname resend._domainkey.yourdomain.com

# Check DMARC
nslookup -type=txt _dmarc.yourdomain.com
```

Or use: https://mxtoolbox.com/SuperTool.aspx

### 2. Use a Verified Custom Domain

❌ **Don't use:** `noreply@resend.dev` (Resend's shared domain)
✅ **Do use:** `noreply@myitutor.com` (Your own domain)

**Why?** Shared domains have poor reputation. Your own domain gives you control.

**How to set up:**
1. Go to Resend Dashboard → **Domains**
2. Click **"Add Domain"**
3. Enter: `myitutor.com`
4. Add the DNS records Resend provides
5. Wait for verification (green checkmark)
6. Update Supabase SMTP settings to use: `noreply@myitutor.com`

### 3. Optimize Email Template Content

Password reset emails often get flagged because of their content. Here's a spam-safe template:

#### ❌ Avoid These (Spam Triggers):
- ALL CAPS TEXT
- Multiple exclamation marks!!!
- "Click here now!!!"
- "Verify immediately"
- "Urgent action required"
- Too many links
- Attachments
- Red text or excessive styling
- Images from external sources

#### ✅ Use This Instead:

Go to: **Supabase Dashboard** → **Authentication** → **Email Templates** → **Reset Password**

```html
<h2>Reset Your Password</h2>

<p>Hello,</p>

<p>You requested to reset your password for your iTutor account.</p>

<p>Click the button below to create a new password:</p>

<p>
  <a href="{{ .ConfirmationURL }}" 
     style="display: inline-block; padding: 12px 24px; background-color: #10b981; 
            color: #ffffff; text-decoration: none; border-radius: 6px; 
            font-weight: 600;">
    Reset Password
  </a>
</p>

<p>Or copy and paste this link into your browser:</p>
<p style="color: #666; font-size: 14px; word-break: break-all;">{{ .ConfirmationURL }}</p>

<p style="color: #666; font-size: 14px;">This link expires in 1 hour.</p>

<p>If you did not request a password reset, you can safely ignore this email. Your password will not be changed.</p>

<p>Best regards,<br>
The iTutor Team</p>

<hr style="border: none; border-top: 1px solid #e5e5e5; margin: 20px 0;">

<p style="color: #999; font-size: 12px;">
  This is an automated message from iTutor. Please do not reply to this email.
</p>
```

**Key Points:**
- Simple, clear language
- No urgency or pressure tactics
- Plain professional design
- Includes both button and text link
- Explains what happens if they ignore it
- Professional signature

### 4. Improve Sender Reputation

Email providers track your sending reputation. Poor reputation = spam folder.

#### Build Good Reputation:
- ✅ Start slow (10-20 emails/day, then gradually increase)
- ✅ Keep bounce rate low (<5%)
- ✅ Avoid spam complaints
- ✅ Maintain consistent sending volume
- ✅ Only send to users who requested it (no cold emails)
- ✅ Remove inactive/bounced emails

#### Check Your Current Reputation:
- **Google Postmaster Tools:** https://postmaster.google.com (for Gmail)
- **Microsoft SNDS:** https://sendersupport.olc.protection.outlook.com/snds/ (for Outlook)
- **Resend Analytics:** Check bounce and complaint rates

### 5. Configure Better Subject Lines

#### ❌ Bad Subject Lines (Likely Spam):
- "URGENT: Reset your password NOW!!!"
- "ACTION REQUIRED: Verify your account"
- "⚠️⚠️⚠️ Password Reset"
- "Click here to reset password"

#### ✅ Good Subject Lines:
- "Reset your iTutor password"
- "Password reset request for iTutor"
- "Your iTutor password reset link"
- "Complete your password reset"

**Rules:**
- Keep it under 50 characters
- No special characters or emojis
- No urgency words
- Clear and professional

### 6. Add Text Version (Plain Text)

Most spam filters prefer emails with both HTML and plain text versions.

In Supabase, ensure your template includes plain text fallback:

**Plain Text Version:**
```
Reset Your Password

Hello,

You requested to reset your password for your iTutor account.

Click this link to create a new password:
{{ .ConfirmationURL }}

This link expires in 1 hour.

If you did not request a password reset, you can safely ignore this email.

Best regards,
The iTutor Team
```

### 7. Configure Resend Settings

#### In Resend Dashboard:

1. **Enable Click Tracking:** No (can trigger spam filters)
2. **Enable Open Tracking:** Optional (better to disable for transactional emails)
3. **Custom Return-Path:** Set to your domain

#### Update Supabase SMTP Config:

```
Sender Email: noreply@myitutor.com (not noreply@resend.dev)
Sender Name: iTutor (not "iTutor Security" or "iTutor Alerts")
```

## 🧪 Test Your Email Deliverability

### Test 1: Mail Tester
1. Go to: https://www.mail-tester.com
2. Get the test email address
3. Send a password reset to that address
4. Check your score (aim for 9/10 or higher)

**What it checks:**
- SPF, DKIM, DMARC records
- Email content for spam triggers
- Domain reputation
- Email formatting

### Test 2: Multiple Email Providers
Test with accounts on:
- Gmail
- Outlook/Hotmail
- Yahoo Mail
- ProtonMail
- Apple iCloud Mail

**Do they all go to inbox?** If only one provider marks as spam, that's okay. If multiple do, you have a problem.

### Test 3: GlockApps or Litmus
These paid tools test deliverability across 20+ email providers:
- https://glockapps.com
- https://www.litmus.com

## 📊 Resend Best Practices

### 1. Monitor Your Analytics

In Resend Dashboard, watch for:
- **Bounce Rate:** Should be <5%
- **Complaint Rate:** Should be <0.1%
- **Delivery Rate:** Should be >95%

If these are bad, your reputation suffers.

### 2. Set Up Webhooks

Get notified when emails bounce or are marked as spam:

```javascript
// In your API route
export async function POST(request: Request) {
  const event = await request.json();
  
  if (event.type === 'email.bounced') {
    // Remove this email from your database
    console.log('Bounced:', event.data.email);
  }
  
  if (event.type === 'email.complained') {
    // User marked as spam - investigate why
    console.log('Spam complaint:', event.data.email);
  }
  
  return Response.json({ received: true });
}
```

### 3. Use Tags for Organization

When sending reset emails:
```javascript
const { error } = await supabase.auth.resetPasswordForEmail(email, {
  redirectTo: `${window.location.origin}/reset-password`,
  options: {
    emailRedirectTo: `${window.location.origin}/reset-password`,
  }
});
```

In Resend API (if you were using it directly):
```javascript
{
  tags: [
    { name: 'category', value: 'password-reset' },
    { name: 'environment', value: 'production' }
  ]
}
```

## 🚀 Quick Wins (Do Right Now)

### Priority 1: DNS Records (30 minutes)
- [ ] Add SPF record
- [ ] Add all 3 DKIM records
- [ ] Add DMARC record
- [ ] Verify in Resend dashboard (should show green checkmarks)

### Priority 2: Update Email Template (10 minutes)
- [ ] Remove any urgency language
- [ ] Use simple, professional tone
- [ ] Keep it short and clear
- [ ] Test with Mail Tester

### Priority 3: Use Custom Domain (5 minutes)
- [ ] Change from `noreply@resend.dev` to `noreply@myitutor.com`
- [ ] Update in Supabase SMTP settings
- [ ] Verify domain is verified in Resend

### Priority 4: Update Subject Line (2 minutes)
- [ ] Change to simple: "Reset your iTutor password"
- [ ] Remove any emojis or urgency words

## 📈 Long-Term Strategy

### Month 1: Build Reputation
- Send consistently but moderately
- Monitor bounce rates
- Fix any issues immediately
- Goal: <2% bounce rate, 0% complaints

### Month 2-3: Scale Up
- Gradually increase volume
- Continue monitoring
- A/B test subject lines
- Goal: 98%+ delivery rate

### Month 4+: Maintain
- Regular monitoring
- Quick response to issues
- Keep DNS records updated
- Annual review of templates

## 🛠️ Advanced: Custom Email Service

For even better control, consider building a custom email service:

```typescript
// lib/services/emailService.ts
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendPasswordReset(email: string, resetUrl: string) {
  const { data, error } = await resend.emails.send({
    from: 'iTutor <noreply@myitutor.com>',
    to: email,
    subject: 'Reset your iTutor password',
    html: `
      <h2>Reset Your Password</h2>
      <p>Click below to reset your password:</p>
      <a href="${resetUrl}">Reset Password</a>
    `,
    text: `Reset your password: ${resetUrl}`,
    tags: [
      { name: 'category', value: 'password-reset' }
    ],
    headers: {
      'X-Entity-Ref-ID': crypto.randomUUID(),
    }
  });

  return { data, error };
}
```

## ✅ Final Checklist

Before going to production:
- [ ] All DNS records (SPF, DKIM, DMARC) added and verified
- [ ] Using custom domain (not shared resend.dev)
- [ ] Email template is spam-safe (tested with Mail Tester)
- [ ] Subject line is simple and professional
- [ ] Tested on Gmail, Outlook, Yahoo
- [ ] Set up bounce/complaint handling
- [ ] Monitoring Resend analytics
- [ ] Sender name is consistent and professional

## 🎯 Expected Results

After implementing these changes:
- **Before:** 30-50% going to spam
- **After:** <5% going to spam
- **Inbox placement:** 95%+ for most providers

**Note:** It may take 1-2 weeks for reputation to improve after making changes.

---

**Most Important:** 
1. ✅ Set up SPF, DKIM, DMARC records
2. ✅ Use your own verified domain
3. ✅ Keep email content simple and professional

Do these three things and 95%+ of your emails will hit the inbox! 📬




