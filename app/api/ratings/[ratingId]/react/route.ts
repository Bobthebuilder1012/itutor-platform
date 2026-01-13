import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function POST(
  request: NextRequest,
  { params }: { params: { ratingId: string } }
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

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { reactionType } = await request.json();

    if (!reactionType || !['like', 'dislike'].includes(reactionType)) {
      return NextResponse.json({ error: 'Invalid reaction type' }, { status: 400 });
    }

    // Check if user already reacted to this rating
    const { data: existingReaction } = await supabase
      .from('rating_reactions')
      .select('*')
      .eq('rating_id', params.ratingId)
      .eq('user_id', user.id)
      .single();

    if (existingReaction) {
      // If same reaction, remove it (toggle off)
      if (existingReaction.reaction_type === reactionType) {
        const { error: deleteError } = await supabase
          .from('rating_reactions')
          .delete()
          .eq('id', existingReaction.id);

        if (deleteError) throw deleteError;

        return NextResponse.json({ message: 'Reaction removed' });
      } else {
        // If different reaction, update it
        const { error: updateError } = await supabase
          .from('rating_reactions')
          .update({ reaction_type: reactionType, updated_at: new Date().toISOString() })
          .eq('id', existingReaction.id);

        if (updateError) throw updateError;

        return NextResponse.json({ message: 'Reaction updated' });
      }
    } else {
      // Create new reaction
      const { error: insertError } = await supabase
        .from('rating_reactions')
        .insert({
          rating_id: params.ratingId,
          user_id: user.id,
          reaction_type: reactionType
        });

      if (insertError) throw insertError;

      return NextResponse.json({ message: 'Reaction added' });
    }
  } catch (error) {
    console.error('Error handling reaction:', error);
    return NextResponse.json(
      { error: 'Failed to process reaction' },
      { status: 500 }
    );
  }
}












