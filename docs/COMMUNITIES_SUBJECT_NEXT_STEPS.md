# Subject Communities – Next Steps

After implementing the spec-based communities system, complete these steps so the feature works in your environment.

---

## 1. Run the database migration

Apply migration **088** so the tables exist.

### Option A: Supabase Dashboard (recommended)

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project.
2. Go to **SQL Editor**.
3. Open the file `src/supabase/migrations/088_subject_communities_spec.sql` in this repo.
4. Copy its full contents and paste into the SQL Editor.
5. Click **Run**. You should see: `✅ Subject communities (spec) migration 088 applied`.

### Option B: Run from project (recommended if you have DATABASE_URL)

1. Add your database connection string to `.env.local`:
   - Supabase Dashboard → Settings → Database → **Connection string** → **URI**
   - Add: `DATABASE_URL="postgresql://postgres.[ref]:[PASSWORD]@..."`
2. From the project root run:

```bash
npm run communities:migrate
```

### Option C: Supabase CLI or psql

If you use the Supabase CLI and link to this project: `npx supabase db push`

Or with `psql`: `psql "$DATABASE_URL" -f src/supabase/migrations/088_subject_communities_spec.sql`

---

## 2. Enable Realtime for messages (optional but recommended)

For live chat updates in subject communities:

1. In Supabase Dashboard go to **Database** → **Replication**.
2. Find **subject_community_messages** in the list.
3. Turn **on** replication for this table.

If the table is not listed, run in the SQL Editor:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE subject_community_messages;
```

---

## 3. Set school on user profiles

Users must have a **school (institution)** set to:

- See the School Community header.
- See and join subject communities.

- **Students:** [Settings](/student/settings) → set **School**.
- **Tutors / Parents:** Set institution in the relevant profile/settings.

The Communities page shows *“Set your school in your profile to discover and join subject communities”* when no school is set, with a link to settings.

---

## Quick check

- **Migration applied:** From the project root run:
  ```bash
  npm run communities:check
  ```
  If the migration is not applied, the script prints instructions. You can also run in SQL Editor:
  `SELECT COUNT(*) FROM subject_communities;` — it should run without error (count can be 0).
- **Realtime:** After enabling, new messages in a subject community should appear for other members without refresh.
- **School:** Your test user has `institution_id` set in `profiles` (e.g. via student settings).
