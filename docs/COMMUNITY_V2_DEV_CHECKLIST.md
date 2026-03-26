# Community v2 – Dev Checklist

Lightweight manual checks for the school-first community (v2) at `/community`.

- [ ] **Sign up / complete onboarding with a school selected**  
  User is auto-joined to that school’s community (visible in Members tab, can post in Feed).

- [ ] **Cannot access another school’s community**  
  Open `/community/[other-school-community-id]` (e.g. from another user’s URL) → 403-style “Access denied” (or equivalent) and link to “my community”.

- [ ] **Mute toggle**  
  Mute/Unmute in the header updates membership and UI state (no push implementation required).

- [ ] **Leave community**  
  Leave → posting disabled, “Rejoin” button shown.

- [ ] **Rejoin**  
  Rejoin → posting enabled again, user can post.

- [ ] **Posting blocked when LEFT**  
  When membership status is LEFT, the composer is hidden or disabled and “Rejoin” is shown; no new posts possible until rejoin.

- [ ] **Pinned messages in Pins tab**  
  Pinned messages appear in the Pins tab; only admin (community ADMIN or platform admin) can pin/unpin.

- [ ] **(Optional) Edit/delete own message**  
  If implemented: edit/delete only for own messages and restricted to owner.
