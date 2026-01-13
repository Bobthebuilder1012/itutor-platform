# Institutions Frontend Integration Guide

This document explains the institutions autocomplete/search system for the iTutor frontend.

## Overview

The institutions system allows students and tutors to search and select their schools/colleges from a comprehensive database of Trinidad & Tobago educational institutions. It provides a fast, debounced typeahead search experience similar to the subjects selector.

## Components

### 1. InstitutionAutocomplete Component

**File:** `components/InstitutionAutocomplete.tsx`

A single-select autocomplete component with real-time search.

#### Props

```typescript
type InstitutionAutocompleteProps = {
  selectedInstitution: Institution | null;
  onChange: (institution: Institution | null) => void;
  filters?: InstitutionSearchFilters;
  disabled?: boolean;
  placeholder?: string;
  required?: boolean;
};
```

#### Usage Example

```tsx
import InstitutionAutocomplete from '@/components/InstitutionAutocomplete';
import { Institution } from '@/lib/hooks/useInstitutionsSearch';

function MyForm() {
  const [institution, setInstitution] = useState<Institution | null>(null);

  return (
    <InstitutionAutocomplete
      selectedInstitution={institution}
      onChange={setInstitution}
      filters={{ institution_level: 'secondary', country_code: 'TT' }}
      placeholder="Type to search schools..."
      required
    />
  );
}
```

### 2. useInstitutionsSearch Hook

**File:** `lib/hooks/useInstitutionsSearch.ts`

Custom React hook that queries Supabase with debouncing.

#### Features

- **Debounced search** (300ms default)
- **Real-time Supabase queries**
- **Filtered results** (level, island, type, country)
- **Case-insensitive search** on name and normalized_name
- **Limited results** (20 max for performance)
- **Loading and error states**

#### API

```typescript
const { results, loading, error } = useInstitutionsSearch(
  searchQuery,
  filters,
  debounceMs
);
```

#### Filters

```typescript
type InstitutionSearchFilters = {
  institution_level?: 'secondary' | 'tertiary';
  island?: 'Trinidad' | 'Tobago';
  institution_type?: string;
  country_code?: string;
};
```

## Integration in Onboarding

### Student Onboarding

**File:** `app/onboarding/student/page.tsx`

Students select a **secondary school** only.

**Key Changes:**
- Replaced text input with `InstitutionAutocomplete`
- Filters: `{ institution_level: 'secondary', country_code: 'TT' }`
- Saves both `school` (name) and `institution_id` (UUID) to profile

**Form Flow:**
1. Student types "Queen" → sees Queen's Royal College
2. Clicks to select
3. Selected institution displayed as a pill/card
4. Can clear and re-search
5. On submit, saves to `profiles.institution_id` and `profiles.school`

### Tutor Onboarding

**File:** `app/onboarding/tutor/page.tsx`

Tutors can select **secondary school OR tertiary institution**.

**Key Changes:**
- Added toggle: "Secondary School" vs "University/College"
- Institution selector filters by selected level
- When toggling levels, clears current selection
- Saves both `school` and `institution_id` to profile

**Form Flow:**
1. Tutor selects institution level (secondary/tertiary)
2. Searches and selects institution
3. Can switch levels (clears selection)
4. On submit, saves to `profiles.institution_id` and `profiles.school`

## Database Schema Updates Required

### Add institution_id to profiles

You need to add an `institution_id` column to the `profiles` table:

```sql
-- Add institution_id column to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS institution_id uuid 
REFERENCES public.institutions(id) 
ON DELETE SET NULL;

-- Create index for better join performance
CREATE INDEX IF NOT EXISTS idx_profiles_institution 
ON public.profiles(institution_id);
```

**Note:** This is a nullable foreign key. Existing profiles won't break. The onboarding flow makes it required for new users.

## Search Behavior

### How Search Works

1. User types in the autocomplete input
2. Hook debounces for 300ms (prevents spam)
3. Queries Supabase `institutions` table:
   ```sql
   SELECT * FROM institutions
   WHERE is_active = true
     AND (name ILIKE '%query%' OR normalized_name ILIKE '%query%')
     AND institution_level = 'secondary'  -- if filtered
   ORDER BY name ASC
   LIMIT 20;
   ```
4. Results displayed in dropdown
5. User clicks to select

### Search Examples

| User Types | Matches |
|------------|---------|
| `pres` | **Pres**entation College San Fernando, **Pres**entation College Chaguanas |
| `uwi` | University of the West Indies - St. Augustine Campus |
| `qrc` | Queen's Royal College |
| `nap` | **Nap**arima College, **Nap**arima Girls' High School |
| `catholic` | Providence Girls' **Catholic** School, **Catholic** Religious Education... |

### Case Insensitivity

Search is fully case-insensitive thanks to:
- `ILIKE` queries in Supabase
- `normalized_name` field (lowercase, trimmed)
- `pg_trgm` indexes for fast pattern matching

## UI/UX Features

### Visual Badges

Institutions display badges showing:
- **Level:** Secondary (blue) / Tertiary (green)
- **Island:** Trinidad / Tobago (gray)
- **Type:** Government, Assisted, Private, etc. (various colors)
- **Denomination:** Catholic, Anglican, Hindu, Muslim, etc. (amber)

### Selected State

When an institution is selected:
- Shows as a highlighted card/pill
- Displays all metadata (level, island, denomination)
- Has a clear (X) button
- Search input is hidden until cleared

### Loading States

- Spinner appears while searching
- Dropdown shows "No results" if nothing found
- Error message if Supabase query fails

### Accessibility

- Proper labels and ARIA attributes
- Keyboard navigation supported
- Focus management
- Required field validation

## RLS Security

The `institutions` table has Row Level Security enabled:

```sql
-- Anyone authenticated can read institutions
CREATE POLICY "Institutions are readable by authenticated users"
ON public.institutions FOR SELECT
TO authenticated
USING (true);
```

**Frontend uses client Supabase** (no admin/service keys), so RLS is enforced.

## Performance Optimizations

### 1. Debouncing
- 300ms delay prevents excessive queries
- Only searches after user stops typing

### 2. Limited Results
- Returns max 20 institutions per query
- Prevents overwhelming UI and slow queries

### 3. Indexed Searches
- `pg_trgm` GIN indexes on `name` and `normalized_name`
- Fast pattern matching even on large datasets

### 4. Minimal Data Transfer
- Returns only necessary fields
- No eager loading of relationships

## TypeScript Types

```typescript
export type Institution = {
  id: string;
  name: string;
  normalized_name: string;
  country_code: string;
  island: 'Trinidad' | 'Tobago';
  institution_level: 'secondary' | 'tertiary';
  institution_type: string;
  denomination: string | null;
  is_active: boolean;
};
```

## Common Use Cases

### Filter by Island

```tsx
<InstitutionAutocomplete
  selectedInstitution={institution}
  onChange={setInstitution}
  filters={{ 
    institution_level: 'secondary',
    island: 'Tobago'  // Only Tobago schools
  }}
/>
```

### Filter by Type

```tsx
<InstitutionAutocomplete
  selectedInstitution={institution}
  onChange={setInstitution}
  filters={{ 
    institution_level: 'tertiary',
    institution_type: 'public_tertiary'  // Only public universities
  }}
/>
```

### Make Optional

```tsx
<InstitutionAutocomplete
  selectedInstitution={institution}
  onChange={setInstitution}
  required={false}  // Not mandatory
/>
```

## Error Handling

### Hook Level

```typescript
const { results, loading, error } = useInstitutionsSearch(query, filters);

if (error) {
  console.error('Search error:', error);
  // Error displayed in component automatically
}
```

### Component Level

- Network errors → Shows error message in dropdown
- No results → Shows "No institutions found" message
- Supabase RLS errors → Check authentication status

## Troubleshooting

### "No institutions found"
**Cause:** Either no matches, or Supabase table is empty.
**Fix:** Run the institutions seed SQL in Supabase.

### Search not working
**Cause:** RLS policy blocking reads.
**Fix:** Ensure user is authenticated and policy allows `SELECT` for authenticated users.

### Slow search
**Cause:** Missing indexes or too many results.
**Fix:** Verify `pg_trgm` indexes exist and limit is set to 20.

### TypeScript errors
**Cause:** Import path issues.
**Fix:** Ensure `@/` alias is configured in `tsconfig.json`:
```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

## Future Enhancements

### Possible Additions

1. **Favorite/Recent Institutions**
   - Cache recently selected institutions in localStorage
   - Show as quick picks at top of dropdown

2. **Grouped Results**
   - Group by island or type
   - Hierarchical dropdown

3. **Fuzzy Matching**
   - Use `pg_trgm` similarity scoring
   - Rank results by relevance

4. **Multi-Select Support**
   - For tutors who teach at multiple institutions
   - Similar to `SubjectMultiSelect` component

5. **Institution Details Modal**
   - Click institution for full details
   - Show address, website, contact info

6. **Custom Institution Entry**
   - "Not listed? Add custom institution"
   - Admin review/approval flow

## Testing

### Manual Testing Checklist

- [ ] Student can search and select secondary school
- [ ] Tutor can toggle between secondary/tertiary
- [ ] Search is debounced (no query spam)
- [ ] Results are relevant and sorted
- [ ] Selected institution displays correctly
- [ ] Clear button works
- [ ] Form validation prevents submission without selection
- [ ] Data saves to `profiles.institution_id` and `profiles.school`
- [ ] Works on Trinidad and Tobago islands
- [ ] Handles "Other (Not listed)" option

### Edge Cases

- [ ] User types very fast (debounce works)
- [ ] User types then immediately clears (no stale results)
- [ ] User switches institution level mid-search (clears selection)
- [ ] No network connection (error shown)
- [ ] Empty institutions table (graceful degradation)
- [ ] User is not authenticated (RLS blocks, shows error)

## Summary

The institutions system provides a polished, fast, and user-friendly way for students and tutors to select their educational institutions. It mirrors the subjects selector UX and integrates seamlessly with the existing onboarding flow.

**Key Benefits:**
- ✅ Fast, debounced search
- ✅ Comprehensive T&T institution database
- ✅ Filters by level, island, type
- ✅ Clean, modern UI
- ✅ Type-safe TypeScript
- ✅ RLS-secure Supabase queries
- ✅ Easy to extend and customize

For questions or issues, check the troubleshooting section or review the component source code.
















