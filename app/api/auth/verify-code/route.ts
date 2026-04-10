import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import { createHash } from 'crypto';

export const dynamic = 'force-dynamic';

const MAX_ATTEMPTS = 5;

export async function POST(req: Request) {
  try {
    const { email, code } = await req.json();

    if (!email || !code) {
      return NextResponse.json({ error: 'Email and code are required' }, { status: 400 });
    }

    const supabase = getServiceClient();

    const { data: row, error } = await supabase
      .from('verification_codes')
      .select('id, code_hash, attempts, expires_at')
      .eq('email', email)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !row) {
      return NextResponse.json({ valid: false, expired: true });
    }

    const inputHash = createHash('sha256').update(String(code)).digest('hex');

    if (inputHash === row.code_hash) {
      return NextResponse.json({ valid: true });
    }

    const attempts = (row.attempts || 0) + 1;

    if (attempts >= MAX_ATTEMPTS) {
      await supabase.from('verification_codes').delete().eq('id', row.id);
      return NextResponse.json({ valid: false, expired: true });
    }

    await supabase
      .from('verification_codes')
      .update({ attempts })
      .eq('id', row.id);

    return NextResponse.json({ valid: false, attemptsRemaining: MAX_ATTEMPTS - attempts });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
