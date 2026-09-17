// Social preview for a shared class link.
//
// This layout exists only to carry generateMetadata. The page it wraps is a
// client component, and Next forbids a 'use client' module from exporting
// metadata — so without this file every class shared to WhatsApp, Facebook or
// iMessage unfurled as the generic "iTutor — Caribbean Education Platform"
// card, with no class name and no artwork. Facebook's sharer sends the URL and
// nothing else, so there the unfurl is the entire message.

import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getServiceClient } from '@/lib/supabase/server';

export async function generateMetadata(
  { params }: { params: { groupId: string } },
): Promise<Metadata> {
  try {
    const supabase = getServiceClient();
    // select('*') on purpose: the optional art and level columns have moved
    // around between migrations, and naming a column that is not there fails
    // the whole query rather than returning a null.
    const { data: group } = await supabase
      .from('groups')
      .select('*')
      .eq('id', params.groupId)
      .maybeSingle();

    if (!group) return {};

    // Never leak a private or archived class into an unfurl. The API already
    // 404s these for anonymous readers; the preview has to agree with it.
    const isPublic = String(group.visibility ?? 'public').toLowerCase() === 'public';
    if (!isPublic || group.archived_at) return {};

    const name: string = group.name ?? 'A class';
    const subject: string | null = group.subject ?? null;
    const title = subject ? `${name} — ${subject} on iTutor` : `${name} on iTutor`;

    const description: string =
      (typeof group.description === 'string' && group.description.trim())
        ? group.description.trim().slice(0, 200)
        : `Join ${name} on iTutor — live online classes with a Caribbean tutor.`;

    const image: string = group.cover_image ?? group.header_image ?? '/og-image-v4.png';

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        images: [image],
        type: 'website',
        url: `/student/explore/${params.groupId}`,
      },
      twitter: { card: 'summary_large_image', title, description, images: [image] },
    };
  } catch {
    // A preview is never worth failing a page render over — fall back to the
    // site-wide card from app/layout.tsx.
    return {};
  }
}

export default function ClassDetailLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
