import { getEmailForStage, getCtaUrl } from '@/lib/email-templates';
import { UserType, EmailStage } from '@/lib/email-templates/types';

interface SendOnboardingEmailParams {
  userId: string;
  userType: UserType;
  stage: EmailStage;
  firstName: string;
  email: string;
}

interface ResendResponse {
  id: string;
  from: string;
  to: string;
  created_at: string;
}

export async function sendOnboardingEmail(
  params: SendOnboardingEmailParams
): Promise<ResendResponse> {
  const { userType, stage, firstName, email } = params;

  const ctaUrl = getCtaUrl(userType, stage);
  const { html, subject } = getEmailForStage(userType, stage, {
    firstName,
    ctaUrl
  });

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'iTutor <noreply@myitutor.com>',
      to: email,
      subject,
      html
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Resend API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data;
}

export function calculateNextSendTime(currentStage: EmailStage): Date {
  const now = Date.now();
  let daysToAdd = 0;

  switch (currentStage) {
    case 0:
      daysToAdd = 1; // Day 1 after welcome
      break;
    case 1:
      daysToAdd = 2; // Day 3 total
      break;
    case 2:
      daysToAdd = 2; // Day 5 total
      break;
    case 3:
      daysToAdd = 2; // Day 7 total
      break;
    default:
      daysToAdd = 0;
  }

  return new Date(now + daysToAdd * 24 * 60 * 60 * 1000);
}
