import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getQuestions, createQuestion } from '@/lib/supabase/community';
import { checkQuestionLimit, checkPostPermission } from '@/lib/utils/rateLimits';
import type { CreateQuestionData, QuestionFilters } from '@/lib/types/community';

export async function GET(
  request: NextRequest,
  { params }: { params: { communityId: string } }
) {
  try {
    const searchParams = request.nextUrl.searchParams;

    const filters: QuestionFilters = {
      status: searchParams.get('status') as any,
      topic_tag: searchParams.get('topic_tag') || undefined,
      author_institution_id: searchParams.get('author_institution_id') || undefined,
      is_pinned: searchParams.get('is_pinned') === 'true' ? true : undefined,
      sort: searchParams.get('sort') as any || 'new',
    };

    const pagination = {
      page: parseInt(searchParams.get('page') || '1'),
      limit: parseInt(searchParams.get('limit') || '50'),
    };

    const result = await getQuestions(params.communityId, filters, pagination);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching questions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch questions' },
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

    // Check post permission (not restricted/timed out/banned)
    const permission = await checkPostPermission(user.id, params.communityId);
    if (!permission.allowed) {
      return NextResponse.json(
        { error: permission.reason || 'You cannot post in this community' },
        { status: 403 }
      );
    }

    // Check rate limit
    const rateLimit = await checkQuestionLimit(user.id, params.communityId);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: `You have reached the daily limit of ${rateLimit.limit} questions`,
          rate_limit: rateLimit,
        },
        { status: 429 }
      );
    }

    const body: Omit<CreateQuestionData, 'community_id'> = await request.json();

    // Validate required fields
    if (!body.title || !body.body) {
      return NextResponse.json(
        { error: 'Title and body are required' },
        { status: 400 }
      );
    }

    const questionData: CreateQuestionData = {
      ...body,
      community_id: params.communityId,
    };

    const question = await createQuestion(questionData);

    return NextResponse.json({
      question,
      rate_limit: {
        ...rateLimit,
        remaining: rateLimit.remaining - 1,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating question:', error);
    return NextResponse.json(
      { error: 'Failed to create question' },
      { status: 500 }
    );
  }
}





