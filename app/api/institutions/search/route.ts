import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim() || '';
  if (!q) {
    return NextResponse.json({ institutions: [] });
  }

  try {
    const supabase = getServiceClient();
    let query = supabase
      .from('institutions')
      .select('id, name, institution_level, institution_type, country_code, is_active')
      .eq('is_active', true)
      .ilike('name', `%${q.replace(/[%_\\]/g, '\\$&')}%`)
      .order('name', { ascending: true })
      .limit(20);

    const { data, error } = await query;

    if (error) {
      console.error('Institutions search error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ institutions: data || [] });
  } catch (err) {
    console.error('Institutions search exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
