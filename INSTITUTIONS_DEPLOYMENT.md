# Institutions Feature - Quick Deployment Guide

This is a quick reference for deploying the institutions autocomplete feature.

## Prerequisites

- ✅ Supabase project set up
- ✅ Next.js 14 app with App Router
- ✅ Supabase client configured (`@/lib/supabase/client`)
- ✅ User authentication working

## Step-by-Step Deployment

### 1️⃣ Run Supabase Migrations

Run these SQL scripts in your Supabase SQL Editor **in order**:

#### A. Create Institutions Table (if not done)

```bash
File: src/supabase/migrations/003_institutions_table.sql
```

**What it does:**
- Creates `institutions` table
- Seeds ~200 T&T schools and universities
- Creates search indexes (pg_trgm)
- Sets up RLS policies

#### B. Add institution_id to Profiles

```bash
File: src/supabase/migrations/004_add_institution_id_to_profiles.sql
```

**What it does:**
- Adds `institution_id uuid` column to `profiles`
- Creates foreign key to `institutions.id`
- Creates index for performance

**To run:**
1. Open Supabase Dashboard → SQL Editor
2. Copy/paste each migration file
3. Click "Run"
4. Verify success (no errors)

### 2️⃣ Verify Database

Check that everything is set up correctly:

```sql
-- Check institutions table
SELECT COUNT(*) FROM public.institutions;
-- Should return ~200 (Trinidad & Tobago schools + colleges)

-- Check profiles has new column
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'profiles' 
  AND column_name = 'institution_id';
-- Should return: institution_id | uuid

-- Check RLS policy
SELECT * FROM pg_policies 
WHERE tablename = 'institutions';
-- Should see policy allowing authenticated SELECT
```

### 3️⃣ Deploy Frontend Code

All frontend files are already created:

**New Files:**
- ✅ `lib/hooks/useInstitutionsSearch.ts`
- ✅ `components/InstitutionAutocomplete.tsx`

**Modified Files:**
- ✅ `app/onboarding/student/page.tsx`
- ✅ `app/onboarding/tutor/page.tsx`

**Deploy:**
```bash
# Build and deploy
npm run build

# Or deploy to Vercel
vercel deploy
```

### 4️⃣ Test Onboarding

#### Test Student Onboarding

1. Navigate to `/onboarding/student`
2. Type in institution search: "queen"
3. Select "Queen's Royal College"
4. Complete form and submit
5. Verify in Supabase:
   ```sql
   SELECT school, institution_id FROM profiles WHERE role = 'student' ORDER BY created_at DESC LIMIT 1;
   ```

#### Test Tutor Onboarding

1. Navigate to `/onboarding/tutor`
2. Toggle "University/College"
3. Type: "uwi"
4. Select "University of the West Indies"
5. Complete form and submit
6. Verify in Supabase:
   ```sql
   SELECT school, institution_id FROM profiles WHERE role = 'tutor' ORDER BY created_at DESC LIMIT 1;
   ```

### 5️⃣ Verify Integration

Check that institutions are properly linked:

```sql
SELECT 
  p.full_name,
  p.role,
  p.school,
  i.name as institution_name,
  i.institution_level,
  i.island,
  i.institution_type
FROM profiles p
LEFT JOIN institutions i ON p.institution_id = i.id
WHERE p.institution_id IS NOT NULL
ORDER BY p.created_at DESC
LIMIT 10;
```

## Quick Reference

### For Students
- **Filter:** `institution_level: 'secondary'`
- **Saves:** `school` (text) + `institution_id` (uuid)
- **Examples:** "Queen's", "Presentation", "Naparima"

### For Tutors
- **Toggle:** Secondary School ↔ University/College
- **Filters:** `institution_level: 'secondary'` or `'tertiary'`
- **Saves:** `school` (text) + `institution_id` (uuid)
- **Examples:** 
  - Secondary: "QRC", "St. Mary's"
  - Tertiary: "UWI", "UTT", "COSTAATT"

## Component Usage

### Basic Usage

```tsx
import InstitutionAutocomplete from '@/components/InstitutionAutocomplete';
import { Institution } from '@/lib/hooks/useInstitutionsSearch';

const [institution, setInstitution] = useState<Institution | null>(null);

<InstitutionAutocomplete
  selectedInstitution={institution}
  onChange={setInstitution}
  filters={{ institution_level: 'secondary', country_code: 'TT' }}
  placeholder="Type to search schools..."
  required
/>
```

### With Level Toggle (Tutors)

```tsx
const [level, setLevel] = useState<'secondary' | 'tertiary'>('secondary');
const [institution, setInstitution] = useState<Institution | null>(null);

// Toggle buttons
<button onClick={() => setLevel('secondary')}>Secondary School</button>
<button onClick={() => setLevel('tertiary')}>University/College</button>

// Autocomplete
<InstitutionAutocomplete
  selectedInstitution={institution}
  onChange={setInstitution}
  filters={{ institution_level: level, country_code: 'TT' }}
  placeholder="Type to search..."
  required
/>
```

## Troubleshooting

### Issue: "No institutions found"
**Fix:** Run the institutions seed SQL (migration 003)

### Issue: Search not working
**Fix:** Check RLS policy allows authenticated users to SELECT

### Issue: TypeScript errors
**Fix:** Verify `@/` alias in `tsconfig.json`:
```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

### Issue: Slow performance
**Fix:** Verify `pg_trgm` indexes exist:
```sql
SELECT indexname FROM pg_indexes WHERE tablename = 'institutions';
-- Should see: idx_institutions_name_trgm, idx_institutions_normalized_trgm
```

## Documentation

For detailed information, see:

- **Frontend Guide:** `docs/institutions-frontend-guide.md`
- **Implementation Summary:** `docs/institutions-implementation-summary.md`

## Checklist

Before going live:

- [ ] Migrations run successfully
- [ ] ~200 institutions in database
- [ ] RLS policies allow authenticated SELECT
- [ ] Student onboarding tested
- [ ] Tutor onboarding tested
- [ ] Data saves to `profiles.institution_id`
- [ ] Search is fast (< 500ms)
- [ ] No console errors
- [ ] Works on mobile

## Support

If issues arise:
1. Check Supabase logs
2. Check browser console
3. Verify RLS policies
4. Review documentation files

---

**Status:** ✅ Ready for Production  
**Last Updated:** December 2025















