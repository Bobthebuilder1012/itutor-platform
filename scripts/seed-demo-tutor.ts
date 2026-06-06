/**
 * DEMO SEED SCRIPT — STAGING / LOCAL ONLY
 * =========================================
 * Clears and repopulates a specified tutor account with realistic demo data
 * so the dashboard looks like an active tutor business.
 *
 * Usage:
 *   SEED_SUPABASE_URL=https://thjsdcbzlvjradczhgso.supabase.co \
 *   SEED_SUPABASE_SERVICE_KEY=<staging-service-role-key> \
 *   SEED_TUTOR_EMAIL=jovangoodluck@myitutor.com \
 *   npx ts-node scripts/seed-demo-tutor.ts
 *
 * Or set SEED_TUTOR_ID instead of SEED_TUTOR_EMAIL.
 *
 * SAFETY: Will REFUSE to run unless the Supabase URL matches the known
 * staging project (thjsdcbzlvjradczhgso). Pass --allow-any-env to override
 * for local development only.
 *
 * All generated data is fake. No real payments are triggered.
 * This script is idempotent — safe to run multiple times.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// ─── Safety constants ──────────────────────────────────────────────────────────
const STAGING_SUPABASE_ID = 'thjsdcbzlvjradczhgso';
const DEMO_EMAIL_DOMAIN = 'demo.itutor.test'; // clearly-fake domain, no real emails
const ALLOW_ANY_ENV = process.argv.includes('--allow-any-env');

// ─── Load env ─────────────────────────────────────────────────────────────────
function loadEnv(): Record<string, string> {
  const env: Record<string, string> = { ...process.env as Record<string, string> };
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split(/\r?\n/);
    for (const line of lines) {
      const t = line.trim();
      if (!t || t.startsWith('#') || !t.includes('=')) continue;
      const idx = t.indexOf('=');
      const k = t.slice(0, idx).trim();
      const v = t.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
      if (k && !env[k]) env[k] = v;
    }
  }
  return env;
}

const E = loadEnv();
const SUPABASE_URL = E.SEED_SUPABASE_URL || E.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = E.SEED_SUPABASE_SERVICE_KEY || E.SUPABASE_SERVICE_ROLE_KEY || '';
const TUTOR_EMAIL = E.SEED_TUTOR_EMAIL || '';
const TUTOR_ID = E.SEED_TUTOR_ID || '';

// ─── Safety check ─────────────────────────────────────────────────────────────
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌  Set SEED_SUPABASE_URL and SEED_SUPABASE_SERVICE_KEY');
  process.exit(1);
}
if (!TUTOR_EMAIL && !TUTOR_ID) {
  console.error('❌  Set SEED_TUTOR_EMAIL or SEED_TUTOR_ID');
  process.exit(1);
}
if (!ALLOW_ANY_ENV && !SUPABASE_URL.includes(STAGING_SUPABASE_ID)) {
  console.error('🚨  REFUSED: This script only runs against the staging Supabase project.');
  console.error(`    URL must contain "${STAGING_SUPABASE_ID}"`);
  console.error('    Pass --allow-any-env to override (local dev only).');
  process.exit(1);
}

const admin: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Demo data definitions ────────────────────────────────────────────────────

const DEMO_GROUPS = [
  {
    name: 'Algebra Foundations',
    subject: 'Mathematics',
    subjectCode: 'MATH',
    form_level: 'CSEC (14–16)',
    description: 'Master CSEC Mathematics from first principles. We cover algebra, quadratics, and number theory with weekly problem sets and exam drills.',
    price_monthly: 75,
    tutor_payout_per_student: 20,  // per student per payment
    max_students: 15,
    schedule_display: 'Mon & Wed · 4:00 PM – 5:00 PM',
    day_of_week: 1, // Monday
    start_hour: 16,
  },
  {
    name: 'Creative Writing Club',
    subject: 'English A',
    subjectCode: 'ENGA',
    form_level: 'CSEC (14–16)',
    description: 'Develop your voice and conquer CSEC English writing. Weekly sessions on composition, comprehension, and literature analysis.',
    price_monthly: 93,
    tutor_payout_per_student: 25,
    max_students: 12,
    schedule_display: 'Tue & Thu · 3:30 PM – 4:30 PM',
    day_of_week: 2, // Tuesday
    start_hour: 15,
  },
  {
    name: 'Junior Science Lab',
    subject: 'Integrated Science',
    subjectCode: 'ISCI',
    form_level: 'CSEC (14–16)',
    description: 'Hands-on virtual science experiments and theory for CSEC Integrated Science. Covers biology, chemistry, and physics basics.',
    price_monthly: 56,
    tutor_payout_per_student: 15,
    max_students: 18,
    schedule_display: 'Wed · 5:00 PM – 6:00 PM',
    day_of_week: 3, // Wednesday
    start_hour: 17,
  },
  {
    name: 'Caribbean History Prep',
    subject: 'History',
    subjectCode: 'HIST',
    form_level: 'CSEC (14–16)',
    description: 'Deep dives into Caribbean History from colonisation to independence. Structured essay writing and source analysis for CSEC success.',
    price_monthly: 63,
    tutor_payout_per_student: 17,
    max_students: 15,
    schedule_display: 'Thu · 4:00 PM – 5:30 PM',
    day_of_week: 4, // Thursday
    start_hour: 16,
  },
  {
    name: 'SEA Exam Strategy Group',
    subject: 'Mathematics',
    subjectCode: 'MATH',
    form_level: 'SEA (10–12)',
    description: 'Targeted SEA preparation with timed practice papers, maths drills, and English comprehension strategies for Primary 5 & 6 students.',
    price_monthly: 88,
    tutor_payout_per_student: 23,
    max_students: 10,
    schedule_display: 'Sat · 9:00 AM – 11:00 AM',
    day_of_week: 6, // Saturday
    start_hour: 9,
  },
];

const DEMO_STUDENTS: Array<{ name: string; email: string; username: string }> = [
  { name: 'Amara Singh',       email: `amara.singh@${DEMO_EMAIL_DOMAIN}`,       username: 'amara_singh_demo' },
  { name: 'Ethan Joseph',      email: `ethan.joseph@${DEMO_EMAIL_DOMAIN}`,      username: 'ethan_joseph_demo' },
  { name: 'Maya Rampersad',    email: `maya.rampersad@${DEMO_EMAIL_DOMAIN}`,    username: 'maya_rampersad_demo' },
  { name: 'Caleb Williams',    email: `caleb.williams@${DEMO_EMAIL_DOMAIN}`,    username: 'caleb_williams_demo' },
  { name: 'Sofia Mohammed',    email: `sofia.mohammed@${DEMO_EMAIL_DOMAIN}`,    username: 'sofia_mohammed_demo' },
  { name: 'Jordan Carter',     email: `jordan.carter@${DEMO_EMAIL_DOMAIN}`,     username: 'jordan_carter_demo' },
  { name: 'Aisha Noel',        email: `aisha.noel@${DEMO_EMAIL_DOMAIN}`,        username: 'aisha_noel_demo' },
  { name: 'Marcus Charles',    email: `marcus.charles@${DEMO_EMAIL_DOMAIN}`,    username: 'marcus_charles_demo' },
  { name: 'Priya Gopaulsingh', email: `priya.gopaulsingh@${DEMO_EMAIL_DOMAIN}`, username: 'priya_gopa_demo' },
  { name: 'Liam Beckles',      email: `liam.beckles@${DEMO_EMAIL_DOMAIN}`,      username: 'liam_beckles_demo' },
];

// Which students go in which group (by index into DEMO_STUDENTS)
const GROUP_STUDENT_MAP: number[][] = [
  [0, 1, 2],    // Algebra:  Amara, Ethan, Maya
  [3, 4, 5],    // Writing:  Caleb, Sofia, Jordan
  [6, 7, 8],    // Science:  Aisha, Marcus, Priya
  [9, 0, 3],    // History:  Liam, Amara, Caleb
  [5, 2, 7],    // SEA Exam: Jordan, Maya, Marcus
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}
function withHour(d: Date, h: number): Date {
  const c = new Date(d);
  c.setUTCHours(h, 0, 0, 0);
  return c;
}

function ok<T>(result: { data: T; error: unknown }, label: string): T {
  if (result.error) {
    console.error(`  ❌ ${label}:`, result.error);
    throw result.error;
  }
  return result.data;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🌱  iTutor Demo Seed Script');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`   Target DB : ${SUPABASE_URL}`);
  console.log(`   Tutor     : ${TUTOR_EMAIL || TUTOR_ID}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // ── 1. Find the tutor ──────────────────────────────────────────────────────
  let tutorId = TUTOR_ID;
  if (!tutorId) {
    const { data: profile, error } = await admin
      .from('profiles')
      .select('id, full_name, role')
      .eq('email', TUTOR_EMAIL)
      .single();
    if (error || !profile) {
      console.error('❌  Tutor profile not found for email:', TUTOR_EMAIL);
      process.exit(1);
    }
    if (profile.role !== 'tutor') {
      console.error(`❌  Profile role is "${profile.role}", expected "tutor"`);
      process.exit(1);
    }
    tutorId = profile.id;
    console.log(`✅  Found tutor: ${profile.full_name} (${tutorId})`);
  }

  // ── 2. CLEAR ───────────────────────────────────────────────────────────────
  console.log('\n🗑️   Clearing existing demo data…');
  await clearTutorDemoData(tutorId);
  console.log('    Done clearing.\n');

  // ── 3. Find subjects ───────────────────────────────────────────────────────
  const subjectNames = [...new Set(DEMO_GROUPS.map(g => g.subject))];
  const { data: foundSubjects } = await admin
    .from('subjects')
    .select('id, name')
    .in('name', subjectNames);

  const subjectByName: Record<string, string> = {};
  for (const s of foundSubjects ?? []) subjectByName[s.name] = s.id;

  // Create any missing subjects
  for (const g of DEMO_GROUPS) {
    if (!subjectByName[g.subject]) {
      const { data: newSub } = await admin
        .from('subjects')
        .upsert({ name: g.subject, curriculum: 'CSEC', level: 'Form 4-5', code: g.subjectCode },
          { onConflict: 'name,curriculum,level', ignoreDuplicates: false })
        .select('id, name')
        .single();
      if (newSub) subjectByName[newSub.name] = newSub.id;
    }
  }
  console.log(`📚  Subjects resolved: ${Object.keys(subjectByName).join(', ')}`);

  // ── 4. Tutor subjects ──────────────────────────────────────────────────────
  const tutorSubjectRows = Object.entries(subjectByName).map(([, subject_id]) => ({
    tutor_id: tutorId, subject_id, price_per_hour_ttd: 100, mode: 'online',
  }));
  await admin.from('tutor_subjects').upsert(tutorSubjectRows, { onConflict: 'tutor_id,subject_id' });
  console.log(`🎓  Tutor subjects upserted: ${tutorSubjectRows.length}`);

  // ── 5. Create fake student auth accounts ──────────────────────────────────
  console.log('\n👥  Creating demo student accounts…');
  const studentIds: string[] = [];
  for (const s of DEMO_STUDENTS) {
    let uid: string;
    // Try to find existing auth user
    const { data: existing } = await admin.from('profiles').select('id').eq('email', s.email).maybeSingle();
    if (existing) {
      uid = existing.id;
      console.log(`    ↩  Reusing: ${s.name}`);
    } else {
      const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
        email: s.email,
        password: 'DemoPass123!',
        email_confirm: true,
        user_metadata: { full_name: s.name },
      });
      if (authErr) {
        console.warn(`    ⚠️  Auth create failed for ${s.name}: ${(authErr as any).message} — skipping`);
        studentIds.push(''); continue;
      }
      uid = authUser.user.id;
      // Upsert profile (trigger may have created it already)
      await admin.from('profiles').upsert({
        id: uid,
        full_name: s.name,
        email: s.email,
        username: s.username,
        role: 'student',
        billing_mode: 'self_allowed',
        country: 'Trinidad and Tobago',
      }, { onConflict: 'id' });
      console.log(`    ✅  Created: ${s.name}`);
    }
    studentIds.push(uid);
  }

  // ── 6. Create 5 groups + sessions + enrollments ───────────────────────────
  console.log('\n📚  Creating groups, sessions, and enrollments…');

  let totalPayoutTtd = 0;
  const payoutLedgerRows: Array<Record<string, unknown>> = [];

  for (let gi = 0; gi < DEMO_GROUPS.length; gi++) {
    const g = DEMO_GROUPS[gi];
    const subjectId = subjectByName[g.subject];

    // Create group
    const { data: group } = await admin.from('groups').insert({
      tutor_id: tutorId,
      name: g.name,
      description: g.description,
      subject: g.subject,
      form_level: g.form_level,
      pricing_model: 'MONTHLY',
      price_monthly: g.price_monthly,
      max_students: g.max_students,
      status: 'PUBLISHED',
      visibility: 'public',
      require_join_requests: false,
      grace_period_days: 7,
      schedule_display: g.schedule_display,
    }).select('id').single();
    if (!group) { console.error(`  ❌ Failed to create group ${g.name}`); continue; }
    console.log(`  ✅  Group: "${g.name}" (${group.id})`);

    // Create recurring session template
    const templateStartDate = daysAgo(21); // started 3 weeks ago
    const { data: sessionTemplate } = await admin.from('group_sessions').insert({
      group_id: group.id,
      title: `${g.name} — Weekly Session`,
      recurrence_type: 'weekly',
      recurrence_days: [g.day_of_week],
      start_time: `${String(g.start_hour).padStart(2, '0')}:00:00`,
      duration_minutes: 60,
      starts_on: templateStartDate.toISOString().split('T')[0],
    }).select('id').single();

    // Create 6 occurrences: 3 past, 3 upcoming
    if (sessionTemplate) {
      const occurrences: Array<Record<string, unknown>> = [];
      for (let week = -3; week <= 3; week++) {
        if (week === 0) continue; // skip current week for clarity
        const oDate = week < 0 ? daysAgo(Math.abs(week) * 7) : daysFromNow(week * 7);
        const start = withHour(oDate, g.start_hour);
        const end = new Date(start.getTime() + 60 * 60 * 1000);
        occurrences.push({
          group_session_id: sessionTemplate.id,
          group_id: group.id,
          scheduled_start_at: start.toISOString(),
          scheduled_end_at: end.toISOString(),
          status: 'upcoming',
        });
      }
      await admin.from('group_session_occurrences').insert(occurrences);
    }

    // Enroll students
    const enrolledIndexes = GROUP_STUDENT_MAP[gi];
    for (const si of enrolledIndexes) {
      const studentId = studentIds[si];
      if (!studentId) continue;

      // group_members (approved membership)
      await admin.from('group_members').upsert({
        group_id: group.id,
        user_id: studentId,
        status: 'approved',
        joined_at: daysAgo(14).toISOString(),
      }, { onConflict: 'group_id,user_id' });

      // group_enrollment
      const periodStart = daysAgo(14);
      const periodEnd = daysFromNow(16);
      const { data: enrollment } = await admin.from('group_enrollments').insert({
        student_id: studentId,
        group_id: group.id,
        status: 'ACTIVE',
        payment_status: 'PAID',
        plan_price_ttd: g.price_monthly,
        last_paid_at: daysAgo(14).toISOString(),
        expires_at: periodEnd.toISOString(),
      }).select('id').single();
      if (!enrollment) continue;

      // subscription_payment (PAID)
      const platformFee = Math.round(g.price_monthly * 0.2 * 100) / 100;
      const tutorPayout = Math.round((g.price_monthly - platformFee) * 100) / 100;
      const { data: subPayment } = await admin.from('subscription_payments').insert({
        enrollment_id: enrollment.id,
        group_id: group.id,
        student_id: studentId,
        type: 'subscription_initial',
        amount_ttd: g.price_monthly,
        original_amount_ttd: g.price_monthly,
        platform_fee_ttd: platformFee,
        tutor_payout_ttd: g.tutor_payout_per_student,
        status: 'PAID',
        period_start: periodStart.toISOString(),
        period_end: periodEnd.toISOString(),
        paid_at: daysAgo(14).toISOString(),
      }).select('id').single();

      if (subPayment) {
        // payout_ledger entry (released = already counted in lifetime earnings)
        payoutLedgerRows.push({
          tutor_id: tutorId,
          subscription_payment_id: subPayment.id,
          amount_ttd: g.tutor_payout_per_student,
          status: 'released',
        });
        totalPayoutTtd += g.tutor_payout_per_student;
      }

      // User subject link
      if (subjectId) {
        await admin.from('user_subjects').upsert(
          { user_id: studentId, subject_id: subjectId },
          { onConflict: 'user_id,subject_id' }
        );
      }
    }

    console.log(`     └ ${enrolledIndexes.length} students enrolled`);
  }

  // ── 7. Insert payout ledger entries ───────────────────────────────────────
  if (payoutLedgerRows.length > 0) {
    await admin.from('payout_ledger').insert(payoutLedgerRows);
    console.log(`\n💰  Payout ledger: ${payoutLedgerRows.length} entries inserted`);
  }

  // ── 8. Update tutor balance ────────────────────────────────────────────────
  await admin.from('tutor_balances').upsert({
    tutor_id: tutorId,
    available_ttd: 0,           // already released in demo
    pending_ttd: Math.round(totalPayoutTtd * 0.3 * 100) / 100, // ~30% still pending
    last_updated: new Date().toISOString(),
  }, { onConflict: 'tutor_id' });

  // ── 9. Update tutor profile stats ─────────────────────────────────────────
  const totalEnrolled = GROUP_STUDENT_MAP.flat().filter(Boolean).length;
  await admin.from('profiles').update({
    rating_average: 4.8,
    rating_count: 14,
    attendance_rate: 0.92,
  }).eq('id', tutorId);

  // ── 10. Summary ────────────────────────────────────────────────────────────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅  DEMO SEED COMPLETE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`   Groups created   : ${DEMO_GROUPS.length}`);
  console.log(`   Students created : ${studentIds.filter(Boolean).length}`);
  console.log(`   Total enrollments: ${payoutLedgerRows.length}`);
  console.log(`   Lifetime payout  : TT$ ${totalPayoutTtd.toFixed(2)}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const byGroup = DEMO_GROUPS.map((g, i) => {
    const count = GROUP_STUDENT_MAP[i].filter(Boolean).length;
    const payout = count * g.tutor_payout_per_student;
    return `   ${g.name.padEnd(28)} ${count} students  TT$ ${payout}`;
  });
  console.log('   Earnings breakdown:');
  byGroup.forEach(l => console.log(l));
  console.log(`   ${'TOTAL'.padEnd(36)} TT$ ${totalPayoutTtd.toFixed(2)}`);
  console.log('\n🎉  Dashboard should now look fully populated.\n');
}

// ─── Clear helper ─────────────────────────────────────────────────────────────
async function clearTutorDemoData(tutorId: string) {
  // Find tutor's existing groups
  const { data: groups } = await admin.from('groups').select('id').eq('tutor_id', tutorId);
  const groupIds = (groups ?? []).map(g => g.id);

  if (groupIds.length > 0) {
    // Find subscription_payments for those groups
    const { data: subPayments } = await admin
      .from('subscription_payments').select('id').in('group_id', groupIds);
    const spIds = (subPayments ?? []).map(p => p.id);

    // payout_ledger → subscription_payments
    if (spIds.length > 0) {
      await admin.from('payout_ledger').delete().in('subscription_payment_id', spIds);
    }

    // payout_ledger → tutor_id (catch anything else)
    await admin.from('payout_ledger').delete().eq('tutor_id', tutorId);

    // subscription payments
    await admin.from('subscription_payments').delete().in('group_id', groupIds);

    // group_enrollments
    await admin.from('group_enrollments').delete().in('group_id', groupIds);

    // group_members
    await admin.from('group_members').delete().in('group_id', groupIds);

    // group_session_occurrences
    await admin.from('group_session_occurrences').delete().in('group_id', groupIds);

    // group_sessions templates
    await admin.from('group_sessions').delete().in('group_id', groupIds);

    // groups themselves
    await admin.from('groups').delete().in('id', groupIds);

    console.log(`    Deleted ${groupIds.length} groups and all related data`);
  } else {
    console.log('    No existing groups found');
  }

  // tutor_subjects
  await admin.from('tutor_subjects').delete().eq('tutor_id', tutorId);

  // tutor_balances
  await admin.from('tutor_balances').delete().eq('tutor_id', tutorId);

  // Delete demo student accounts (identified by email domain)
  const { data: demoProfiles } = await admin
    .from('profiles')
    .select('id, email')
    .like('email', `%@${DEMO_EMAIL_DOMAIN}`);

  if (demoProfiles && demoProfiles.length > 0) {
    const demoIds = demoProfiles.map(p => p.id);

    // Clean up demo student data
    await admin.from('user_subjects').delete().in('user_id', demoIds);
    await admin.from('group_members').delete().in('user_id', demoIds);
    await admin.from('group_enrollments').delete().in('student_id', demoIds);
    await admin.from('notifications').delete().in('user_id', demoIds);
    await admin.from('profiles').delete().in('id', demoIds);

    // Delete auth users
    for (const id of demoIds) {
      await admin.auth.admin.deleteUser(id);
    }
    console.log(`    Deleted ${demoIds.length} demo student accounts`);
  }
}

// ─── Run ──────────────────────────────────────────────────────────────────────
main().catch(err => {
  console.error('\n💥  Unexpected error:', err);
  process.exit(1);
});
