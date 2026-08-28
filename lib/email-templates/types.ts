export interface EmailTemplateProps {
  firstName: string;
  ctaUrl: string;
}

export interface EmailTemplate {
  subject: string;
  html: string;
  /**
   * The plain-text alternative. Present on everything rendered by
   * lib/email/design, which is now all of them — pass it to sendEmail so
   * text-only readers get a body and the send does not lose deliverability
   * points for having no text part.
   */
  text?: string;
}

export type UserType = 'student' | 'tutor' | 'parent';
export type EmailStage = 0 | 1 | 2 | 3 | 4 | 5 | 7;
