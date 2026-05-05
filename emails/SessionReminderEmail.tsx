import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';

export type SessionReminderRecipientType = 'student' | 'tutor';
export type SessionReminderType = '24h' | '1h';

export interface SessionReminderEmailProps {
  recipientType: SessionReminderRecipientType;
  reminderType: SessionReminderType;
  subjectName: string;
  tutorName: string;
  studentName: string;
  sessionStartAt: string;
  durationMinutes: number;
  joinUrl: string;
  cancelOrRescheduleUrl: string;
}

function formatReminderLead(reminderType: SessionReminderType): string {
  return reminderType === '24h' ? '24 hours' : '1 hour';
}

function formatSessionDate(date: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(date));
}

/**
 * React Email template for iTutor session reminders.
 */
export function SessionReminderEmail({
  recipientType,
  reminderType,
  subjectName,
  tutorName,
  studentName,
  sessionStartAt,
  durationMinutes,
  joinUrl,
  cancelOrRescheduleUrl,
}: SessionReminderEmailProps) {
  const leadTime = formatReminderLead(reminderType);
  const counterpartLabel = recipientType === 'student' ? 'Tutor' : 'Student';
  const counterpartName = recipientType === 'student' ? tutorName : studentName;

  return (
    <Html>
      <Head />
      <Preview>
        Your iTutor {subjectName} session starts in {leadTime}.
      </Preview>
      <Body style={body}>
        <Container style={container}>
          <Section style={brandSection}>
            <Text style={brandBadge}>iTutor</Text>
          </Section>

          <Heading style={heading}>Your session is coming up in {leadTime}</Heading>
          <Text style={intro}>
            This is a quick reminder that your upcoming iTutor session is almost here.
          </Text>

          <Section style={detailsCard}>
            <Text style={cardLabel}>{counterpartLabel}</Text>
            <Text style={cardValue}>{counterpartName}</Text>

            <Text style={cardLabel}>Subject</Text>
            <Text style={cardValue}>{subjectName}</Text>

            <Text style={cardLabel}>Date & time</Text>
            <Text style={cardValue}>{formatSessionDate(sessionStartAt)}</Text>

            <Text style={cardLabel}>Duration</Text>
            <Text style={cardValue}>{durationMinutes} minutes</Text>
          </Section>

          <Section style={ctaSection}>
            <Button href={joinUrl} style={primaryButton}>
              Join Session
            </Button>
          </Section>

          <Text style={secondaryText}>
            Need to make a change?{' '}
            <Link href={cancelOrRescheduleUrl} style={secondaryLink}>
              Cancel or reschedule
            </Link>
          </Text>

          <Hr style={divider} />

          <Text style={footer}>
            iTutor helps students and tutors stay connected with clear, reliable session reminders.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default SessionReminderEmail;

const body = {
  backgroundColor: '#f4f7fb',
  fontFamily: 'Arial, sans-serif',
  margin: '0',
  padding: '24px 12px',
};

const container = {
  backgroundColor: '#ffffff',
  border: '1px solid #dce6f2',
  borderRadius: '16px',
  margin: '0 auto',
  maxWidth: '560px',
  padding: '32px',
};

const brandSection = {
  marginBottom: '24px',
};

const brandBadge = {
  color: '#0f766e',
  fontSize: '22px',
  fontWeight: '700',
  margin: '0',
};

const heading = {
  color: '#0f172a',
  fontSize: '28px',
  fontWeight: '700',
  lineHeight: '1.3',
  margin: '0 0 12px',
};

const intro = {
  color: '#475569',
  fontSize: '15px',
  lineHeight: '1.6',
  margin: '0 0 24px',
};

const detailsCard = {
  backgroundColor: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: '12px',
  padding: '20px',
};

const cardLabel = {
  color: '#64748b',
  fontSize: '12px',
  fontWeight: '700',
  letterSpacing: '0.04em',
  margin: '0 0 4px',
  textTransform: 'uppercase' as const,
};

const cardValue = {
  color: '#0f172a',
  fontSize: '16px',
  lineHeight: '1.5',
  margin: '0 0 16px',
};

const ctaSection = {
  margin: '28px 0 18px',
  textAlign: 'center' as const,
};

const primaryButton = {
  backgroundColor: '#0f766e',
  borderRadius: '10px',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: '700',
  padding: '14px 24px',
  textDecoration: 'none',
};

const secondaryText = {
  color: '#475569',
  fontSize: '14px',
  lineHeight: '1.6',
  margin: '0 0 24px',
  textAlign: 'center' as const,
};

const secondaryLink = {
  color: '#0f766e',
  textDecoration: 'underline',
};

const divider = {
  borderColor: '#e2e8f0',
  margin: '24px 0',
};

const footer = {
  color: '#64748b',
  fontSize: '12px',
  lineHeight: '1.6',
  margin: '0',
  textAlign: 'center' as const,
};
