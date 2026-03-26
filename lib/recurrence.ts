import { RRule, RRuleSet, Weekday } from 'rrule';
import { getServiceClient } from '@/lib/supabase/server';

type BuildRecurrenceType = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export function generateSessionDates(params: {
  rruleString: string;
  timezone: string;
  fromDate: Date;
  toDate: Date;
}): Date[] {
  const { rruleString, timezone, fromDate, toDate } = params;

  if (!(fromDate instanceof Date) || Number.isNaN(fromDate.getTime())) {
    throw new Error('Invalid fromDate');
  }
  if (!(toDate instanceof Date) || Number.isNaN(toDate.getTime())) {
    throw new Error('Invalid toDate');
  }
  if (fromDate > toDate) return [];

  try {
    const set = rrulestrToSet(rruleString, timezone);
    return set.between(fromDate, toDate, true);
  } catch (error) {
    throw new Error(`Invalid RRULE string: ${(error as Error).message}`);
  }
}

export function buildRruleString(params: {
  recurrenceType: BuildRecurrenceType;
  daysOfWeek?: number[];
  dayOfMonth?: number;
  startDate: Date;
  endDate?: Date;
  count?: number;
}): string {
  const { recurrenceType, daysOfWeek = [], dayOfMonth, startDate, endDate, count } = params;
  const freq =
    recurrenceType === 'DAILY'
      ? RRule.DAILY
      : recurrenceType === 'WEEKLY'
      ? RRule.WEEKLY
      : RRule.MONTHLY;

  const byweekday: Weekday[] | undefined =
    recurrenceType === 'WEEKLY'
      ? daysOfWeek
          .filter((d) => d >= 0 && d <= 6)
          .map((d) => [RRule.SU, RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR, RRule.SA][d]!)
      : undefined;

  const rule = new RRule({
    freq,
    dtstart: startDate,
    until: endDate,
    count,
    byweekday: byweekday && byweekday.length > 0 ? byweekday : undefined,
    bymonthday: recurrenceType === 'MONTHLY' && dayOfMonth ? dayOfMonth : undefined,
  });

  return rule.toString().replace(/^RRULE:/, '');
}

export async function generateUpcomingSessions(groupId: string, daysAhead: number): Promise<void> {
  const service = getServiceClient();
  const now = new Date();
  const toDate = new Date(now.getTime() + Math.max(daysAhead, 1) * 24 * 60 * 60 * 1000);

  const { data: sessions, error: sessionsError } = await service
    .from('group_sessions')
    .select('id, title, recurrence_type, recurrence_rule, recurrence_days, start_time, duration_minutes, starts_on, ends_on, timezone')
    .eq('group_id', groupId);

  if (sessionsError) {
    throw new Error(`Failed to fetch group sessions: ${sessionsError.message}`);
  }

  for (const session of sessions ?? []) {
    let dates: Date[] = [];
    const timezone = session.timezone ?? 'UTC';

    try {
      if (session.recurrence_rule) {
        dates = generateSessionDates({
          rruleString: session.recurrence_rule,
          timezone,
          fromDate: now,
          toDate,
        });
      } else {
        const startsOn = new Date(`${session.starts_on}T${session.start_time}`);
        const recurrenceType = (session.recurrence_type ?? 'none').toUpperCase();
        if (recurrenceType === 'NONE') {
          if (startsOn >= now && startsOn <= toDate) dates = [startsOn];
        } else {
          const builtRrule = buildRruleString({
            recurrenceType: (recurrenceType === 'WEEKLY' || recurrenceType === 'MONTHLY' || recurrenceType === 'DAILY'
              ? recurrenceType
              : 'DAILY') as BuildRecurrenceType,
            daysOfWeek: session.recurrence_days ?? [],
            startDate: startsOn,
            endDate: session.ends_on ? new Date(`${session.ends_on}T23:59:59`) : toDate,
          });
          dates = generateSessionDates({
            rruleString: builtRrule,
            timezone,
            fromDate: now,
            toDate,
          });
        }
      }
    } catch {
      continue;
    }

    let occurrenceIndex = 0;
    for (const scheduledStart of dates) {
      const scheduledEnd = new Date(scheduledStart.getTime() + (session.duration_minutes ?? 60) * 60 * 1000);
      const { data: existing } = await service
        .from('group_session_occurrences')
        .select('id')
        .eq('group_session_id', session.id)
        .eq('scheduled_start_at', scheduledStart.toISOString())
        .maybeSingle();

      if (!existing) {
        await service.from('group_session_occurrences').insert({
          group_session_id: session.id,
          scheduled_start_at: scheduledStart.toISOString(),
          scheduled_end_at: scheduledEnd.toISOString(),
          status: 'upcoming',
          timezone,
          occurrence_index: occurrenceIndex,
          is_cancelled: false,
        });
      }
      occurrenceIndex += 1;
    }
  }
}

export async function refreshAllGroupSessions(): Promise<void> {
  const service = getServiceClient();
  const { data: groups, error } = await service
    .from('groups')
    .select('id')
    .eq('status', 'PUBLISHED')
    .is('archived_at', null);

  if (error) {
    throw new Error(`Failed to fetch groups: ${error.message}`);
  }

  for (const group of groups ?? []) {
    await generateUpcomingSessions(group.id, 60);
  }
}

function rrulestrToSet(rruleString: string, timezone: string): RRuleSet {
  const normalized = rruleString.startsWith('RRULE:') ? rruleString : `RRULE:${rruleString}`;
  const parsed = RRule.fromString(normalized.replace(/^RRULE:/, ''));
  const rule = new RRule({
    ...parsed.origOptions,
    tzid: timezone,
  });
  const set = new RRuleSet();
  set.rrule(rule);
  return set;
}

