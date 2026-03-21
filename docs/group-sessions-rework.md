# Group Sessions Rework Commands

## Run migration (Supabase-first)

Use the existing project migration workflow:

```bash
npx supabase db push
```

If you use linked remote projects:

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push
```

## Prisma-equivalent reference

Where Prisma `migrate deploy` is normally used, the Supabase equivalent in this codebase is:

```bash
npx supabase db push
```

## Seed realistic group sessions data

```bash
npm run seed:groups
```

