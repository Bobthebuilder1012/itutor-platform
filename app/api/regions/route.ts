// GET /api/regions — the areas a class can meet in.
//
// Public and unauthenticated. It is a seeded list of Trinidad and Tobago
// regional corporations — the same names printed on a map — so there is nothing
// to protect, and the location filter it feeds sits on a marketplace that
// anonymous visitors can browse.
//
// Read through the SERVICE client. `regions` has RLS
// (`FOR SELECT TO authenticated USING (active)`), so an anonymous caller
// reading it directly would get zero rows WITH NO ERROR — and an empty region
// list makes the filter look like it simply has no options rather than like it
// is broken. That is the failure mode this whole feature keeps producing, so it
// is worth the explicit note.
//
// Cached hard: this list changes when a country is added, which is a migration.

import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { data, error } = await getServiceClient()
      .from('regions')
      .select('id, name, country_code')
      .eq('active', true)
      .order('sort_order', { ascending: true });

    if (error) {
      // Migration 242 not applied on this environment. An empty list rather
      // than a 500: the filter then renders with only "Anywhere", which is
      // honest, where an error would break the page around it.
      console.warn('[regions] read failed:', error.message);
      return NextResponse.json({ regions: [] });
    }

    return NextResponse.json(
      { regions: data ?? [] },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } }
    );
  } catch (err) {
    console.error('[GET /api/regions]', err);
    return NextResponse.json({ regions: [] });
  }
}
