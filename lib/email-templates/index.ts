import * as studentTemplates from './student';
import * as tutorTemplates from './tutor';
import { EmailTemplateProps, EmailTemplate, UserType, EmailStage } from './types';

export function getEmailForStage(
  userType: UserType,
  stage: EmailStage,
  props: EmailTemplateProps
): EmailTemplate {
  const templates = userType === 'tutor' ? tutorTemplates : studentTemplates;
  
  switch (stage) {
    case 0:
      return templates.welcomeEmail(props);
    case 1:
      return templates.day1Email(props);
    case 2:
      return templates.day3Email(props);
    case 3:
      return templates.day5Email(props);
    case 4:
      return templates.day7Email(props);
    default:
      throw new Error(`Invalid email stage: ${stage}`);
  }
}

export function getCtaUrl(userType: UserType, stage: EmailStage): string {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://myitutor.com';
  
  if (userType === 'student' || userType === 'parent') {
    switch (stage) {
      case 0:
      case 1:
        return `${baseUrl}/student/find-tutors`;
      case 2:
        return `${baseUrl}/help`;
      case 3:
        return `${baseUrl}/tutors`;
      case 4:
        return `${baseUrl}/student/find-tutors`;
      default:
        return `${baseUrl}/student/dashboard`;
    }
  }
  
  if (userType === 'tutor') {
    switch (stage) {
      case 0:
      case 1:
      case 4:
        return `${baseUrl}/onboarding/tutor`;
      case 2:
      case 3:
        return `${baseUrl}/tutor/dashboard`;
      default:
        return `${baseUrl}/tutor/dashboard`;
    }
  }
  
  return `${baseUrl}/dashboard`;
}

export * from './types';
