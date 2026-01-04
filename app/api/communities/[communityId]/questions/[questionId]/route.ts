import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getQuestionById, pinQuestion, unpinQuestion, lockQuestion, unlockQuestion, deleteQuestion, markBestAnswer } from '@/lib/supabase/community';
import { checkModeratorPermission } from '@/lib/utils/rateLimits';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { communityId: string; questionId: string } }
) {
  try {
    const result = await getQuestionById(params.questionId);

    if (!result) {
      return NextResponse.json(
        { error: 'Question not found' },
        { status: 404 }
      );
    }

    // Check if user is authenticated and get their membership
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

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: membership } = await supabase
        .from('community_memberships')
        .select('role, status')
        .eq('community_id', params.communityId)
        .eq('user_id', user.id)
        .single();

      return NextResponse.json({
        ...result,
        user_membership: membership,
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching question:', error);
    return NextResponse.json(
      { error: 'Failed to fetch question' },
      { status: 500 }
    );
  }
}

export async function PATCH(
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

    // Check if user is moderator/admin
    const isModerator = await checkModeratorPermission(user.id, params.communityId);
    if (!isModerator) {
      return NextResponse.json(
        { error: 'Only moderators and admins can update questions' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { action, answer_id } = body;

    switch (action) {
      case 'pin':
        await pinQuestion(params.questionId);
        break;
      case 'unpin':
        await unpinQuestion(params.questionId);
        break;
      case 'lock':
        await lockQuestion(params.questionId);
        break;
      case 'unlock':
        await unlockQuestion(params.questionId);
        break;
      case 'mark_best_answer':
        if (!answer_id) {
          return NextResponse.json(
            { error: 'answer_id is required' },
            { status: 400 }
          );
        }
        await markBestAnswer(params.questionId, answer_id);
        break;
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating question:', error);
    return NextResponse.json(
      { error: 'Failed to update question' },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

    // Check if user is author or moderator
    const { data: question } = await supabase
      .from('messages')
      .select('sender_id')
      .eq('id', params.questionId)
      .single();

    const isAuthor = question?.sender_id === user.id;
    const isModerator = await checkModeratorPermission(user.id, params.communityId);

    if (!isAuthor && !isModerator) {
      return NextResponse.json(
        { error: 'You can only delete your own questions or moderate as admin' },
        { status: 403 }
      );
    }

    await deleteQuestion(params.questionId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting question:', error);
    return NextResponse.json(
      { error: 'Failed to delete question' },
      { status: 500 }
    );
  }
}






