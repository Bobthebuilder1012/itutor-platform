import { randomBytes } from 'crypto';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import {
  getLiveCampaign,
  getSubmissionByToken,
  upsertSubmission,
} from '@/lib/classMatchWeek/portalData';
import { runMatch } from '@/lib/classMatchWeek/matching';
import { QUESTIONNAIRE_LEVELS, type CanonicalLevel } from '@/lib/classMatchWeek/levels';
import { AVAILABILITY_BLOCKS, type AvailabilityBlock } from '@/lib/classMatchWeek/types';

// This exists as a Route Handler because a Server Component cannot set cookies
// in Next 14 — getServerClient() only implements a `get` adapter, and the repo
// has hit that wall twice. Reading cookies also opts the route into dynamic
// rendering; a cached response could not carry a per-visitor Set-Cookie anyway.
export const dynamic = 'force-dynamic';

const COOKIE_NAME = 'cmw_token';
const LEVEL_VALUES = new Set<string>(QUESTIONNAIRE_LEVELS.map((l) => l.value));
const BLOCK_VALUES = new Set<string>(AVAILABILITY_BLOCKS.map((b) => b.value));

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function invalid(field: string) {
  return NextResponse.json({ error: 'invalid_field', field }, { status: 400 });
}

// GET /api/class-match/submission — the visitor's stored answers, keyed on
// their cookie token. No token means a first visit, not an error.
export async function GET() {
  try {
    const token = cookies().get(COOKIE_NAME)?.value;
    if (!token) return NextResponse.json({ submission: null });

    const submission = await getSubmissionByToken(getServiceClient(), token);
    return NextResponse.json({ submission: submission ?? null });
  } catch (err) {
    console.error('[GET class-match/submission]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/class-match/submission — partial upsert as the questionnaire
// advances, one call per answered screen. Anonymous by design: the form
// completes before any account exists, so answers key on a server-set token
// rather than a user id. Phase 3's signup handoff adopts the token row.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
    }

    const { role, level, subjects, availability, support_needed, teacher_preferences } = body as
      Record<string, unknown>;

    // Validate everything server-side. The questionnaire UI constrains these
    // too, but this endpoint is anonymous and public — it sees whatever
    // arrives, not what the form intended to send.
    if (role !== 'parent' && role !== 'student') return invalid('role');
    if (level !== undefined && level !== null && !LEVEL_VALUES.has(String(level))) {
      return invalid('level');
    }
    if (subjects !== undefined && !isStringArray(subjects)) return invalid('subjects');
    if (availability !== undefined) {
      if (!isStringArray(availability) || availability.some((v) => !BLOCK_VALUES.has(v))) {
        return invalid('availability');
      }
    }
    if (support_needed !== undefined && !isStringArray(support_needed)) {
      return invalid('support_needed');
    }
    if (teacher_preferences !== undefined && !isStringArray(teacher_preferences)) {
      return invalid('teacher_preferences');
    }

    const admin = getServiceClient();

    const campaign = await getLiveCampaign(admin);
    if (!campaign) {
      return NextResponse.json({ error: 'no_live_campaign' }, { status: 409 });
    }

    // Reuse the visitor's existing token so repeat visits update one row
    // instead of fanning out into duplicates the export would double-count.
    const token =
      cookies().get(COOKIE_NAME)?.value ?? randomBytes(32).toString('base64url');

    let submission = await upsertSubmission(admin, {
      campaignId: campaign.id,
      token,
      role,
      ...(level !== undefined && level !== null ? { level: level as CanonicalLevel } : {}),
      ...(subjects !== undefined ? { subjects } : {}),
      ...(availability !== undefined ? { availability } : {}),
      ...(support_needed !== undefined ? { supportNeeded: support_needed } : {}),
      ...(teacher_preferences !== undefined ? { teacherPreferences: teacher_preferences } : {}),
    });

    // Once the three matching inputs are all stored, run the match here and
    // persist the outcome. The match NEVER comes from the client — an
    // anonymous endpoint that trusted a posted result would let anyone write
    // arbitrary session ids into the export.
    let match: Awaited<ReturnType<typeof runMatch>> | undefined;
    if (submission?.level && submission.subjects?.length && submission.availability?.length) {
      // Stored as plain string[]; every write path above validates entries
      // against the six blocks, so this narrow drops nothing in practice.
      const availability = submission.availability.filter(
        (v): v is AvailabilityBlock => BLOCK_VALUES.has(v)
      );
      match = await runMatch(admin, {
        level: submission.level,
        subjects: submission.subjects,
        availability,
      });
      submission = await upsertSubmission(admin, {
        campaignId: campaign.id,
        token,
        role,
        matchOutcome: match.outcome,
        recommendedSessionIds: match.recommendedSessionIds,
      });
    }

    // Server-set and HttpOnly deliberately: Safari ITP caps script-written
    // cookies at 24 hours after a cross-site navigation — exactly the
    // WhatsApp-to-iOS path this campaign runs on. HttpOnly server cookies are
    // exempt. Max-Age covers the campaign window plus the redemption tail.
    cookies().set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 60,
    });

    return NextResponse.json({ token: true, submission, ...(match ? { match } : {}) });
  } catch (err) {
    console.error('[POST class-match/submission]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
