export interface EmailTemplateProps {
  firstName: string;
  ctaUrl: string;
}

export interface EmailTemplate {
  subject: string;
  html: string;
}

export type UserType = 'student' | 'tutor' | 'parent';
export type EmailStage = 0 | 1 | 2 | 3 | 4 | 5 | 7;
