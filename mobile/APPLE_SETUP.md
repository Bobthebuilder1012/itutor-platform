# Getting the Apple side ready — iTutor iOS app

Bundle ID: **`com.myitutor.app`** · App name: **iTutor** · Min iOS: 15 · iPhone only for v1

Work top to bottom. Steps 1–2 have waiting periods, so start them today.

---

## 0. What you need before you start

- [ ] **A Mac** with macOS that runs **Xcode 26 or later**. Since 28 April 2026 App Store Connect only accepts builds made with Xcode 26 / the iOS 26 SDK. There is no way to build or upload an iOS app from Windows. (A cloud Mac — MacStadium, Codemagic, GitHub Actions macOS runners — works too.)
- [ ] An **Apple Account** with two-factor authentication turned on. Use a company address you'll keep (e.g. `apps@myitutor.com`), not a personal one — this becomes the Account Holder.
- [ ] At least one **iPhone** for testing push and sign-in (the simulator can't do everything).
- [ ] A company card for the **US$99/year** fee.

## 1. Decide: Organization or Individual — enroll as an Organization

| | Individual | **Organization (recommended)** |
|---|---|---|
| Seller name on the App Store | Your personal legal name | **iTutor's legal company name** |
| D-U-N-S number | Not needed | **Required** |
| Team members with their own logins | Limited | Yes |
| Can transfer the app later | Awkward | Normal |

Organization requirements (Apple checks all of these):
- The company must be a **registered legal entity** — a trade name / DBA / branch is rejected. Use the exact name on the registration certificate (Trinidad & Tobago Companies Registry).
- The person enrolling must have **legal authority to bind the company** (owner, director, or someone they authorise in writing).
- A **work email on the company domain** (`@myitutor.com`).
- A **public website on that domain** — myitutor.com qualifies. Make sure the company's legal name and contact details appear on it (footer / About / Terms).
- No P.O. box addresses.

## 2. Get the D-U-N-S number (free, the slow part)

1. Check whether iTutor already has one: https://developer.apple.com/enroll/duns-lookup/
2. If not found, request it from that same page (Apple's free D-U-N-S request route). Use the **exact** legal name and registered address — mismatches are the #1 cause of delays.
3. Apple says to allow up to 5 business days for D&B to issue it, then up to 2 more business days before Apple's systems see it. If it's been over two weeks, email D&B through the Apple developer support link on that page.
4. Dun & Bradstreet may phone or email to verify — answer promptly.

## 3. Enroll in the Apple Developer Program

1. Install the **Apple Developer app** on an iPhone (fastest route — identity verification happens in-app), or go to https://developer.apple.com/programs/enroll/
2. Choose **Organization**, enter the D-U-N-S number and legal entity details exactly as D&B has them.
3. Apple may call the Account Holder to verify authority — keep the phone nearby.
4. Pay the US$99 (shown in local currency) and accept the Program License Agreement.
5. Once approved, note your **Team ID** (Membership details page, 10 characters). You'll need it below.

> If iTutor qualifies as an **accredited educational institution or nonprofit**, Apple offers a fee waiver — only worth pursuing if that legal status is already true.

## 4. Set up the App ID and capabilities

developer.apple.com → **Certificates, IDs & Profiles → Identifiers → +**

1. **App IDs → App** → Description `iTutor`, Bundle ID **Explicit** `com.myitutor.app`.
2. Tick these capabilities (they match `ios/App/App/App.entitlements`, already in the project):
   - **Push Notifications**
   - **Sign in with Apple** (Enable as a primary App ID)
   - **Associated Domains**
3. Save.

Signing certificates and provisioning profiles: let Xcode manage them. In Xcode → App target → **Signing & Capabilities** → tick **Automatically manage signing** → pick your Team. That's all.

## 5. Push notifications key (APNs → Firebase)

1. **Keys → +** → name `iTutor APNs` → tick **Apple Push Notifications service (APNs)** → Continue → Register.
2. **Download the `.p8` file now — Apple only lets you download it once.** Store it in your password manager / secure drive. Note the **Key ID**.
3. Firebase Console → your iTutor project → ⚙ Project settings → **Cloud Messaging** → *Apple app configuration* → upload the `.p8`, enter the Key ID and Team ID.
4. Firebase → add an **iOS app** with bundle ID `com.myitutor.app` → download `GoogleService-Info.plist` → drag into Xcode under `App/App` (Copy items if needed, App target ticked).
5. Before the App Store build, change `aps-environment` in `ios/App/App/App.entitlements` from `development` to `production` (Xcode does this automatically on Archive with automatic signing — check once).

## 6. Sign in with Apple (required — the app offers Google sign-in)

Guideline 4.8 says an app that offers Google sign-in must also offer an equivalent privacy-friendly login. The iOS app now shows **Continue with Apple** on the login pages; it needs Supabase configured:

1. **Identifiers → +** → **Services IDs** → Identifier `com.myitutor.app.signin`, Description `iTutor Sign in with Apple` → Continue → Register.
2. Open it → tick **Sign in with Apple** → Configure:
   - Primary App ID: `com.myitutor.app`
   - Domains: `myitutor.com` and your Supabase project domain `nfkrfciozjxrodkusrhh.supabase.co`
   - Return URL: `https://nfkrfciozjxrodkusrhh.supabase.co/auth/v1/callback`
3. **Keys → +** → name `iTutor Sign in with Apple` → tick **Sign in with Apple** → Configure → primary App ID `com.myitutor.app` → Register → **download the `.p8`** (again, only once) and note its Key ID.
4. Supabase Dashboard → **Authentication → Providers → Apple** → enable, and enter:
   - Client IDs: `com.myitutor.app.signin,com.myitutor.app`
   - Secret key: generate it from the `.p8`, Team ID, Key ID and Services ID (Supabase's Apple provider page links a generator). **The secret expires every 6 months** — put a calendar reminder to regenerate it.
5. Supabase → **Authentication → URL Configuration → Redirect URLs** → make sure `com.myitutor.app://**` is listed (also needed for Google).

## 7. Universal links (optional for launch, nice to have)

So a myitutor.com link in an email or WhatsApp opens the app:
1. Copy `mobile/well-known/apple-app-site-association` to `public/.well-known/apple-app-site-association` and replace `YOUR_TEAM_ID` with the Team ID.
2. It must be served as `application/json` with no redirect — add a header rule in `vercel.json` if needed. Deploy, then check `https://myitutor.com/.well-known/apple-app-site-association` loads.

## 8. App Store Connect — create the app record

https://appstoreconnect.apple.com → **Apps → + → New App**
- Platform iOS · Name **iTutor** (if taken, e.g. "iTutor – Caribbean Tutors") · Primary language English · Bundle ID `com.myitutor.app` · SKU `itutor-ios-001` · Full access.

Then fill in:
- [ ] **Agreements, Tax and Banking** — accept the Free Apps agreement (needed even for a free app). Banking/tax only if you ever sell in-app purchases.
- [ ] **App Privacy** questionnaire — declare: contact info (name, email, phone), user content (messages, photos, voice notes, documents), identifiers (user ID), purchases (payment history), usage data if you use analytics, **children's data**. All "linked to the user", none "used for tracking" unless you run ad tracking.
- [ ] **Privacy Policy URL** `https://myitutor.com/privacy` · **Support URL** `https://myitutor.com/help`
- [ ] **Age rating** questionnaire (new system since 2026). Answer the user-generated content / messaging questions honestly — in-app messaging between adults and minors is reviewed closely.
- [ ] **Category** Education · Secondary: Productivity
- [ ] **Screenshots** — 6.9" iPhone (1320 × 2868) is the required size; 3–10 images. Show real screens: find a tutor, tutor profile, booking, messages, sessions.
- [ ] **Review notes + demo accounts** — give Apple a working **student** login and **tutor** login (and parent if relevant) with sample data, and explain that tutoring happens with real tutors over Zoom/Google Meet.
- [ ] **Export compliance** — already answered in the project (`ITSAppUsesNonExemptEncryption = NO`; the app only uses standard HTTPS).

## 9. Build, upload, TestFlight

On the Mac:
```bash
git pull && npm install && npx cap sync ios
npx cap open ios
```
In Xcode: select **Any iOS Device (arm64)** → **Product → Archive** → Organizer → **Distribute App → App Store Connect → Upload**.

Then App Store Connect → **TestFlight** → add internal testers (up to 100 team members, no review) → test on real iPhones: Google sign-in, Apple sign-in, push after a booking, voice note, photo upload, a WiPay checkout, joining a Zoom/Meet session.

When happy: App Store tab → select the build → **Submit for Review**. First reviews usually take 1–3 days.

---

## Review risks specific to iTutor — fix before submitting

| Risk | Guideline | Status / what to do |
|---|---|---|
| "It's just the website in a wrapper" | 4.2 Minimum Functionality | Mitigated: native push, native Apple sign-in, deep links, offline screen, native splash. Strengthen further by making the review notes describe the push flow, and consider a native share sheet or calendar export next. This is the most common rejection for WebView apps — if it happens, reply in Resolution Center describing the native features rather than resubmitting unchanged. |
| Paid **group classes** collected through WiPay/Stripe | 3.1.3(d) | 1-to-1 live tutoring may be paid outside Apple (tutoring is Apple's own example). **One-to-few and one-to-many live classes must use Apple In-App Purchase.** `PAID_CLASSES_ENABLED` is currently `false`, so this is fine today — before turning it on, decide whether to hide paid group-class checkout in the iOS app or add IAP. |
| **Parent accounts can't delete themselves in-app** | 5.1.1(v) | Student, tutor and admin settings link to delete-account; `app/parent/settings` doesn't. **Add a delete-account option for parents before submitting.** |
| Google sign-in without Apple sign-in | 4.8 | Done in code — needs step 6 configured, or the Apple button will fail during review. |
| Messaging between adults and minors | 1.2 / Kids | Have a visible **report/block** for messages and users, and mention moderation in review notes. |
| Demo account doesn't work / no data | 2.1 | Test the demo logins on a fresh device the day you submit. |

## Ongoing costs and calendar

| What | When |
|---|---|
| Apple Developer Program US$99 | Every year on enrollment date |
| Sign in with Apple client secret | Regenerate every **6 months** |
| APNs `.p8` key | Doesn't expire — just don't lose it |
| Xcode / SDK minimum | Apple raises it each spring (Xcode 26 since Apr 2026) |
