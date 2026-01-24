# Email Template Updates for Organization Email Delays

## How to Update the Confirmation Email Template

### Step 1: Access Supabase Email Templates
1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/nfkrfciozjxrodkusrhh
2. Click **Authentication** in the left sidebar
3. Click **Email Templates**
4. Find the **"Confirm signup"** template

### Step 2: Add Organization Email Delay Notice

Add this text to your confirmation email template (suggested placement: after the main message, before the button):

---

**Suggested Addition:**

```html
<p style="margin: 20px 0; padding: 15px; background-color: #FEF3C7; border-left: 4px solid #F59E0B; border-radius: 4px; font-size: 14px; color: #92400E;">
  <strong>📧 Note for Organization/Company Emails:</strong><br>
  If you're using a work or school email address, this confirmation email may take 5-30 minutes to arrive as your organization's security system vets it. Please check your spam/junk folder if you don't see it immediately.
</p>
```

**OR** (Plain Text Version):

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📧 Note for Organization/Company Emails:

If you're using a work or school email address, this confirmation 
email may take 5-30 minutes to arrive as your organization's 
security system vets it. Please check your spam/junk folder if 
you don't see it immediately.

Need help? Visit: {{ .SiteURL }}/verify-email
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

### Step 3: Full Template Example

Here's how your complete "Confirm signup" email template should look:

```html
<h2>Confirm Your Email</h2>

<p>Hi there,</p>

<p>Thank you for signing up with iTutor! Please confirm your email address by clicking the button below:</p>

<!-- Organization Email Delay Notice -->
<div style="margin: 20px 0; padding: 15px; background-color: #FEF3C7; border-left: 4px solid #F59E0B; border-radius: 4px;">
  <p style="margin: 0; font-size: 14px; color: #92400E;">
    <strong>📧 Note for Organization/Company Emails:</strong><br>
    If you're using a work or school email address, this confirmation email may take 5-30 minutes to arrive as your organization's security system vets it. Please check your spam/junk folder if you don't see it immediately.
  </p>
</div>

<p style="text-align: center; margin: 30px 0;">
  <a href="{{ .ConfirmationURL }}" 
     style="background-color: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
    Confirm Email Address
  </a>
</p>

<p style="font-size: 12px; color: #666;">
  If the button doesn't work, copy and paste this link into your browser:<br>
  <a href="{{ .ConfirmationURL }}">{{ .ConfirmationURL }}</a>
</p>

<p style="font-size: 12px; color: #666; margin-top: 30px;">
  Didn't request this? You can safely ignore this email or visit <a href="{{ .SiteURL }}/verify-email">{{ .SiteURL }}/verify-email</a> if you need assistance.
</p>

<hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">

<p style="font-size: 11px; color: #999; text-align: center;">
  © {{ now.Year }} iTutor. All rights reserved.
</p>
```

---

## Alternative: Add to "Magic Link" Email Template Too

If you use magic links for login, add the same notice to the **"Magic Link"** template:

```html
<div style="margin: 20px 0; padding: 15px; background-color: #FEF3C7; border-left: 4px solid #F59E0B; border-radius: 4px;">
  <p style="margin: 0; font-size: 14px; color: #92400E;">
    <strong>📧 Note:</strong> Organization/company email systems may delay this email by 5-30 minutes for security scanning.
  </p>
</div>
```

---

## Testing Your Changes

After updating the template:

1. Sign up with a test organization email
2. Check that the new notice appears in the confirmation email
3. Verify the styling looks good on mobile and desktop
4. Confirm all links work correctly

---

## Benefits of This Addition

✅ **Sets expectations** - Users know delays are normal  
✅ **Reduces support tickets** - Fewer "I didn't get the email" complaints  
✅ **Professional** - Shows you understand corporate email systems  
✅ **Helpful** - Directs users to check spam folders  

