import { NextRequest, NextResponse } from 'next/server';
import { getEmailForStage, getCtaUrl } from '@/lib/email-templates';
import { UserType, EmailStage } from '@/lib/email-templates/types';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userType = (searchParams.get('userType') || 'student') as UserType;
    const stage = parseInt(searchParams.get('stage') || '0') as EmailStage;
    const firstName = searchParams.get('firstName') || 'Alex';

    const ctaUrl = getCtaUrl(userType, stage);
    const { html, subject } = getEmailForStage(userType, stage, {
      firstName,
      ctaUrl
    });

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html',
      },
    });
  } catch (error) {
    console.error('Error generating email preview:', error);
    return NextResponse.json(
      { error: 'Failed to generate email preview' },
      { status: 500 }
    );
  }
}
