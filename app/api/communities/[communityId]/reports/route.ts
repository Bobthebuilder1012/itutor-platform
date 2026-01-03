import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createReport, getReports, updateReportStatus } from '@/lib/supabase/community';
import { checkModeratorPermission } from '@/lib/utils/rateLimits';
import type { CreateReportData } from '@/lib/types/community';

export async function GET(
  request: NextRequest,
  { params }: { params: { communityId: string } }
) {
  try {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
        },
      }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is moderator/admin
    const isModerator = await checkModeratorPermission(user.id, params.communityId);
    if (!isModerator) {
      return NextResponse.json(
        { error: 'Only moderators and admins can view reports' },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status') || undefined;

    const reports = await getReports(params.communityId, status);

    return NextResponse.json({ reports });
  } catch (error) {
    console.error('Error fetching reports:', error);
    return NextResponse.json(
      { error: 'Failed to fetch reports' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { communityId: string } }
) {
  try {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
        },
      }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: Omit<CreateReportData, 'community_id'> = await request.json();

    // Validate required fields
    if (!body.target_type || !body.target_id || !body.reason) {
      return NextResponse.json(
        { error: 'target_type, target_id, and reason are required' },
        { status: 400 }
      );
    }

    const reportData: CreateReportData = {
      ...body,
      community_id: params.communityId,
    };

    const report = await createReport(reportData);

    return NextResponse.json(report, { status: 201 });
  } catch (error: any) {
    console.error('Error creating report:', error);
    
    // Handle duplicate report error
    if (error?.code === '23505') {
      return NextResponse.json(
        { error: 'You have already reported this content' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create report' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { communityId: string } }
) {
  try {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
        },
      }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is moderator/admin
    const isModerator = await checkModeratorPermission(user.id, params.communityId);
    if (!isModerator) {
      return NextResponse.json(
        { error: 'Only moderators and admins can review reports' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { report_id, status } = body;

    if (!report_id || !status) {
      return NextResponse.json(
        { error: 'report_id and status are required' },
        { status: 400 }
      );
    }

    await updateReportStatus(report_id, status, user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating report:', error);
    return NextResponse.json(
      { error: 'Failed to update report' },
      { status: 500 }
    );
  }
}





