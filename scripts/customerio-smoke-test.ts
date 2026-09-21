/**
 * Exercises the activation event path against the CURRENT database.
 *
 * Run: npm run customerio:smoke
 *
 * WHY THIS EXISTS. The SQL side of the activation work could be verified by
 * querying it. The TypeScript side could not: `class_created`, `class_joined`
 * and `class_viewed` are emitted from ten call sites that typecheck but had
 * never once fired. The failures that survive a typecheck are the ones worth
 * catching here — a dedupe key that does not actually dedupe, an event name
 * that never reaches the forwarding allowlist, a prop the view's LATERAL join
 * cannot read back.
 *
 * It calls the real `track()` — not a copy of it — so the thing under test is
 * the code the routes call. `track()` imports next/headers, whose cookies()
 * throws outside a request; getRequestAttribution already catches that and
 * returns nulls, which is exactly the webhook/cron path, so this runs fine
 * under ts-node.
 *
 * SAFE ON ANY DATABASE. It writes only `product_events` rows for one existing
 * profile, and deletes every row it wrote in a finally block. It never touches
 * groups, memberships, enrolments or profiles. It refuses to run if
 * CUSTOMERIO_ENABLED is true, so a smoke test cannot mail anyone.
 */
import './_alias';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadDotEnv(path: string) {
  try {
    const raw = readFileSync(path, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    /* no-op */
  }
}
loadDotEnv(resolve(process.cwd(), '.env.local'));

/* eslint-disable @typescript-eslint/no-var-requires */
const { track } = require('../lib/analytics/track') as typeof import('../lib/analytics/track');
const { PRODUCT_EVENTS } = require('../lib/analytics/events') as typeof import('../lib/analytics/events');
const { getServiceClient } = require('../lib/supabase/server') as typeof import('../lib/supabase/server');

const PRODUCTION_REF = 'nfkrfciozjxrodkusrhh';
const ref = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/^https?:\/\//, '').split('.')[0];

type Check = { name: string; pass: boolean; detail: string };
const checks: Check[] = [];
const record = (name: string, pass: boolean, detail: string) => {
  checks.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

async function main(): Promise<void> {
  // A smoke test must never be able to send email.
  if (process.env.CUSTOMERIO_ENABLED === 'true') {
    console.error(
      'Refusing to run with CUSTOMERIO_ENABLED=true. This writes events that would\n' +
        'forward to Customer.io and could trigger a live campaign. Unset it first.'
    );
    process.exitCode = 1;
    return;
  }

  console.log(`Smoke-testing the activation event path against ${ref}` +
    `${ref === PRODUCTION_REF ? '  *** PRODUCTION ***' : ''}\n`);

  const service = getServiceClient();

  // Borrow a real profile rather than creating one: product_events.user_id is a
  // foreign key, and inventing a user would mean writing to profiles.
  const { data: subject, error: subjectErr } = await service
    .from('profiles')
    .select('id, email')
    .not('email', 'is', null)
    .limit(1)
    .maybeSingle();

  if (subjectErr || !subject) {
    console.error('Could not read a profile to test against:', subjectErr?.message);
    process.exitCode = 1;
    return;
  }

  const userId = (subject as { id: string }).id;
  const groupId = '00000000-0000-4000-8000-00000000d00d'; // deliberately not a real class
  const bucket = Math.floor(Date.now() / 1_800_000);

  try {
    // ---- 1. an event is written at all -----------------------------------
    await track(
      PRODUCT_EVENTS.CLASS_VIEWED,
      { group_id: groupId, tutor_id: null, subject: 'Smoke Test' },
      { userId, dedupeKey: `cv:${groupId}:${bucket}` }
    );

    const countViewed = async () => {
      const { count } = await service
        .from('product_events')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('event', PRODUCT_EVENTS.CLASS_VIEWED)
        .contains('props', { group_id: groupId });
      return count ?? 0;
    };

    const afterFirst = await countViewed();
    record('class_viewed is written', afterFirst === 1, `${afterFirst} row(s)`);

    // ---- 2. the dedupe key actually dedupes ------------------------------
    // The real defect this guards: a refreshed class page re-triggering the
    // campaign. Same bucket must collapse.
    await track(
      PRODUCT_EVENTS.CLASS_VIEWED,
      { group_id: groupId, tutor_id: null, subject: 'Smoke Test' },
      { userId, dedupeKey: `cv:${groupId}:${bucket}` }
    );
    const afterRepeat = await countViewed();
    record('a repeat view in the same 30-min bucket is suppressed', afterRepeat === 1, `${afterRepeat} row(s)`);

    // ---- 3. a new bucket is allowed through ------------------------------
    await track(
      PRODUCT_EVENTS.CLASS_VIEWED,
      { group_id: groupId, tutor_id: null, subject: 'Smoke Test' },
      { userId, dedupeKey: `cv:${groupId}:${bucket + 1}` }
    );
    const afterNextBucket = await countViewed();
    record('a later bucket records a new view', afterNextBucket === 2, `${afterNextBucket} row(s)`);

    // ---- 4. props survive the round trip ---------------------------------
    const { data: row } = await service
      .from('product_events')
      .select('props')
      .eq('user_id', userId)
      .eq('event', PRODUCT_EVENTS.CLASS_VIEWED)
      .contains('props', { group_id: groupId })
      .limit(1)
      .maybeSingle();
    const props = (row as { props?: Record<string, unknown> } | null)?.props ?? {};
    record(
      'props round-trip with the dedupe key attached',
      props.group_id === groupId && props.subject === 'Smoke Test' && typeof props.dedupe_key === 'string',
      JSON.stringify(props)
    );

    // ---- 5. the other two events are emittable ---------------------------
    await track(
      PRODUCT_EVENTS.CLASS_CREATED,
      { group_id: groupId, subject: 'Smoke Test', pricing_model: 'FREE', status: 'DRAFT' },
      { userId, dedupeKey: `class:${groupId}` }
    );
    await track(
      PRODUCT_EVENTS.CLASS_JOINED,
      {
        group_id: groupId,
        tutor_id: null,
        subject: 'Smoke Test',
        membership: 'enrolled',
        seat_source: 'free_join',
        is_paid: false,
      },
      { userId, dedupeKey: `join:${groupId}:${userId}` }
    );

    const { count: createdCount } = await service
      .from('product_events')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('event', PRODUCT_EVENTS.CLASS_CREATED)
      .contains('props', { group_id: groupId });
    const { count: joinedCount } = await service
      .from('product_events')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('event', PRODUCT_EVENTS.CLASS_JOINED)
      .contains('props', { group_id: groupId });

    record('class_created is written', (createdCount ?? 0) === 1, `${createdCount ?? 0} row(s)`);
    record('class_joined is written', (joinedCount ?? 0) === 1, `${joinedCount ?? 0} row(s)`);

    // ---- 6. the view reads the view back ---------------------------------
    // Proves the LATERAL join's uuid guard and its join to groups behave when
    // the recorded group_id does not resolve to a real class.
    const { data: viewRow, error: viewErr } = await service
      .from('customerio_profiles_v1')
      .select('customer_id, last_viewed_class_id, last_class_viewed_at, activation_updated_at')
      .eq('customer_id', userId)
      .maybeSingle();

    if (viewErr) {
      record('activation view still reads after the event', false, viewErr.message);
    } else {
      const v = viewRow as Record<string, unknown> | null;
      record(
        'activation view picks the event up',
        !!v && v.last_viewed_class_id === groupId,
        `last_viewed_class_id=${String(v?.last_viewed_class_id)}`
      );
      record(
        'the view survives a group_id that matches no class',
        !!v && v.last_class_viewed_at !== null,
        'no error, row still returned'
      );
    }
  } finally {
    // Always clean up, including on an assertion failure above.
    const { error: cleanupErr } = await service
      .from('product_events')
      .delete()
      .eq('user_id', userId)
      .in('event', [
        PRODUCT_EVENTS.CLASS_VIEWED,
        PRODUCT_EVENTS.CLASS_CREATED,
        PRODUCT_EVENTS.CLASS_JOINED,
      ])
      .contains('props', { group_id: groupId });
    console.log(
      cleanupErr
        ? `\nCLEANUP FAILED — remove product_events rows with props.group_id = ${groupId}: ${cleanupErr.message}`
        : `\nCleaned up every row written by this run.`
    );
  }

  const failed = checks.filter(c => !c.pass);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
