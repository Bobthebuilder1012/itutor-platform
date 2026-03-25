import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';

const SEA_ROWS = [
  { name: 'SEA Mathematics', label: 'SEA Maths', curriculum: 'SEA', level: 'SEA', code: null as string | null },
  { name: 'SEA English', label: 'SEA English', curriculum: 'SEA', level: 'SEA', code: null },
  { name: 'SEA Creative Writing', label: 'SEA Creative Writing', curriculum: 'SEA', level: 'SEA', code: null },
];

/**
 * Idempotent: ensures SEA subject rows exist (service role, fixed data only).
 * Requires SUPABASE_SERVICE_ROLE_KEY. Curriculum CHECK must allow 'SEA' (migration 095).
 */
export async function POST() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { ok: false, error: 'SUPABASE_SERVICE_ROLE_KEY is not set on the server.' },
      { status: 500 }
    );
  }

  const admin = getServiceClient();

  const { count, error: countError } = await admin
    .from('subjects')
    .select('id', { count: 'exact', head: true })
    .eq('curriculum', 'SEA');

  if (countError) {
    return NextResponse.json({ ok: false, error: countError.message, needMigration: true }, { status: 422 });
  }

  if (count != null && count >= SEA_ROWS.length) {
    return NextResponse.json({ ok: true, alreadyPresent: true });
  }

  let upsertError = (await admin.from('subjects').upsert(SEA_ROWS, { onConflict: 'name,curriculum,level' })).error;

  if (upsertError) {
    for (const row of SEA_ROWS) {
      const { error: insErr } = await admin.from('subjects').insert(row);
      if (insErr && insErr.code !== '23505') {
        upsertError = insErr;
        break;
      }
      upsertError = null;
    }
  }

  if (upsertError) {
    return NextResponse.json(
      {
        ok: false,
        error: upsertError.message,
        needMigration: true,
        hint:
          'Open Supabase → SQL → paste and run src/supabase/migrations/095_sea_subjects.sql (allows curriculum SEA and creates the three SEA subject rows).',
      },
      { status: 422 }
    );
  }

  return NextResponse.json({ ok: true, seeded: true });
}
