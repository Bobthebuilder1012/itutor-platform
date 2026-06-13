// GET /api/admin/payouts/csv-history?type=lesson|one_on_one
//
// The real record of an exported payout is a payout_batches row (it has
// generated_at, paid_at, total_amount_ttd, line_count, status,
// csv_filename + the retained csv_body). The old implementation read
// tutor_deductions, which only captures clawbacks — a clean batch with no
// deductions wrote nothing there, so history looked empty after a clean
// export. This sources from payout_batches and groups batches into weekly
// folders (Mon–Sun), matching the "This Week's Batch" lifecycle (mig 186).

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Monday 00:00 (UTC) of the week containing `d`. */
function weekStart(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (x.getUTCDay() + 6) % 7; // 0 = Monday
  x.setUTCDate(x.getUTCDate() - dow);
  return x;
}

function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function weekLabel(start: Date, end: Date): string {
  const sameMonth = start.getUTCMonth() === end.getUTCMonth();
  const sameYear  = start.getUTCFullYear() === end.getUTCFullYear();
  const s = `${MONTHS[start.getUTCMonth()]} ${start.getUTCDate()}`;
  const e = sameMonth
    ? `${end.getUTCDate()}`
    : `${MONTHS[end.getUTCMonth()]} ${end.getUTCDate()}`;
  return sameYear
    ? `Week of ${s}–${e}, ${end.getUTCFullYear()}`
    : `Week of ${s}, ${start.getUTCFullYear()} – ${MONTHS[end.getUTCMonth()]} ${end.getUTCDate()}, ${end.getUTCFullYear()}`;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin('full');
  if (auth.error) return auth.error;

  const type = req.nextUrl.searchParams.get('type') === 'lesson' ? 'lesson' : 'one_on_one';
  const admin = getServiceClient();

  // Batches that have actually produced a file (exported) or been paid.
  // pending_download (not yet downloaded) and cancelled are excluded.
  const { data, error } = await admin
    .from('payout_batches')
    .select('id, generated_at, paid_at, total_amount_ttd, line_count, status, csv_filename, csv_generated_at, window_start, window_end, batch_type')
    .eq('batch_type', type)
    .in('status', ['exported', 'paid'])
    .order('generated_at', { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type Folder = {
    week_start: string;
    week_end: string;
    label: string;
    total_ttd: number;
    batch_count: number;
    batches: any[];
  };
  const byWeek = new Map<string, Folder>();

  for (const b of data ?? []) {
    // Prefer the explicit batch window; fall back to generated_at.
    const anchor = b.window_start ? new Date(b.window_start) : new Date(b.generated_at);
    const start = weekStart(anchor);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    const key = ymd(start);

    let folder = byWeek.get(key);
    if (!folder) {
      folder = { week_start: key, week_end: ymd(end), label: weekLabel(start, end), total_ttd: 0, batch_count: 0, batches: [] };
      byWeek.set(key, folder);
    }
    folder.total_ttd += Number(b.total_amount_ttd ?? 0);
    folder.batch_count += 1;
    folder.batches.push({
      batch_id:         b.id,
      generated_at:     b.generated_at,
      paid_at:          b.paid_at ?? null,
      status:           b.status,
      total_amount_ttd: Math.round(Number(b.total_amount_ttd ?? 0) * 100) / 100,
      line_count:       b.line_count ?? 0,
      csv_filename:     b.csv_filename ?? null,
      csv_available:    !!b.csv_generated_at,
    });
  }

  const weeks = Array.from(byWeek.values())
    .map((f) => ({ ...f, total_ttd: Math.round(f.total_ttd * 100) / 100 }))
    .sort((a, b) => b.week_start.localeCompare(a.week_start));

  return NextResponse.json({ weeks });
}
