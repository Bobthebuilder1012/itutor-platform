# Communities v2 – Manual QA Checklist

- [ ] **Nav**: Communities link goes to `/communities` list (no auto-redirect to a single community).
- [ ] **List**: Shows only communities the user is ACTIVE in; muted icon appears when muted.
- [ ] **3-dot menu**: Mute (1h, 8h, 1 week, Until off), Leave; state persists after refresh.
- [ ] **Discover**: SCHOOL community shows “Join” when eligible; PUBLIC communities show “Join”; Create community opens modal.
- [ ] **Create community**: Name, description, avatar; creator is ADMIN; redirects to new community after create.
- [ ] **Open community**: Discord-style layout (center feed, right members sidebar, bottom composer).
- [ ] **Search**: Filters messages (client-side by content).
- [ ] **Post message**: Post works; reply opens thread inline; timestamps show as “10:52” or “Mon 10:52”.
- [ ] **Message “…”**: Delete (own only), Pin (admin only), Favorite (any member), Copy link.
- [ ] **Pinned**: Pinned section shows pinned messages; Favorites view shows user’s favorites.
- [ ] **Auto-join**: Complete onboarding with school → user appears in that school’s community and sees it in list.
- [ ] **Access**: Cannot join another school’s SCHOOL community; can join PUBLIC communities.
