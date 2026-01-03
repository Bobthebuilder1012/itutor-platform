import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createAnswer } from '@/lib/supabase/community';
import { checkAnswerLimit, checkPostPermission } from '@/lib/utils/rateLimits';
import type { CreateAnswerData } from '@/lib/types/community';

export async function POST(
  request: NextRequest,
  { params }: { params: { communityId: string; questionId: string } }
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
    const rateLimit = await checkAnswerLimit(user.id, params.communityId);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: `You have reached the daily limit of ${rateLimit.limit} answers`,
          rate_limit: rateLimit,
        },
        { status: 429 }
      );
    }

    const body: Omit<CreateAnswerData, 'question_id'> = await request.json();

    // Validate required fields
    if (!body.body) {
      return NextResponse.json(
        { error: 'Answer body is required' },
        { status: 400 }
      );
    }

    const answerData: CreateAnswerData = {
      ...body,
      question_id: params.questionId,
    };

    const answer = await createAnswer(answerData);

    return NextResponse.json({
      answer,
      rate_limit: {
        ...rateLimit,
        remaining: rateLimit.remaining - 1,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating answer:', error);
    return NextResponse.json(
      { error: 'Failed to create answer' },
      { status: 500 }
    );
  }
}





