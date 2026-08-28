-- 250 — a parent who paid for a group class can SEE that they paid for it.
--
-- THE BUG THIS FIXES
--
-- A parent enrolling a child in a class paid successfully and was then told
-- "Your payment went through but is still being confirmed." Nothing was wrong
-- with the money: subscription_payments was PAID, paid_at was set, and the
-- enrolment was SECURED. The message is a 40-second timeout in
-- StripePaymentForm, which polls /api/payments/stripe/[id]/status until OUR
-- database confirms the payment.
--
-- That route reads with the CALLER'S client, on purpose, and leans on RLS for
-- authorisation — an earlier explicit `payer_id = user.id` check was removed
-- because it broke billing_mode='parent_required'. But the only SELECT policies
-- on subscription_payments were student_id = auth.uid() and "tutor of the
-- group". A parent is neither, so the row was invisible, the route fell through
-- to its `status: 'pending'` branch, and the client polled a row it would never
-- be allowed to see until the clock ran out.
--
-- The 1:1 payments table already has "Payers can view their payments" and
-- "Parents can view their children's payments". The group tables never got the
-- equivalent. That asymmetry is the whole bug.
--
-- WHY THIS KEYS ON THE PAYER AND NOT ON parent_child_links
--
-- The obvious mirror of the payments-table policy is an EXISTS against
-- parent_child_links. Do not do that. That table's INSERT policy is
--
--     (parent_id = auth.uid()) OR (child_id = auth.uid() AND ...)
--
-- so ANY authenticated user can insert a row claiming any student as their
-- child, with no consent check at all — consent is enforced in the application
-- (parent_child_invites), never in the database. A link-keyed read policy would
-- therefore be self-granting: claim the link, read the billing. That hole
-- already exists on payments; it is not widened here.
--
-- payer_id cannot be self-granted. It is written only by service-role checkout
-- code from the session of the person actually paying, and migration 230's
-- group_enrollment_payer_guard trigger rejects a payer who is not linked to the
-- student. You cannot make yourself the payer of someone else's enrolment.

-- ---------------------------------------------------------------------------
-- group_enrollments — the payer can read the enrolment they are paying for.
-- ---------------------------------------------------------------------------
-- No subquery needed, so no definer function: payer_id is on the row.
drop policy if exists "payer_read_enrollment" on public.group_enrollments;
create policy "payer_read_enrollment"
  on public.group_enrollments for select to authenticated
  using (payer_id = auth.uid());

-- ---------------------------------------------------------------------------
-- subscription_payments — the payer can read the payment.
-- ---------------------------------------------------------------------------
-- Two routes to the same fact, because the payer is recorded inconsistently.
-- subscription_payments.payer_id exists (migration 230) but nothing populates
-- it: secure_spot_claim predates parents and takes no payer, and the patch-up in
-- secureSpotCheckout.ts updates ONLY group_enrollments.payer_id. So on every
-- parent-paid row today the payment's own payer_id is NULL while the
-- enrolment's is correct — which is exactly why a policy of just
-- `payer_id = auth.uid()` would have looked right and fixed nothing.
--
-- The backfill below and the accompanying code change fill the column in, but
-- the enrolment fallback stays: it is the authoritative record, and a payment
-- row written by some future path that forgets the payer again should still be
-- readable by the person who was charged.
--
-- SECURITY DEFINER because RLS applies to tables referenced inside a policy
-- expression too: the payer cannot read group_enrollments except through the
-- policy above, and depending on policy evaluation order to rescue a subquery
-- inside another policy is not something to build on. Explicit search_path —
-- an unqualified one on a definer function is how a writable schema becomes a
-- privilege escalation (same reasoning as 230's guard).
create or replace function public.is_group_enrollment_payer(p_enrollment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.group_enrollments e
     where e.id = p_enrollment_id
       and e.payer_id = auth.uid()
  );
$$;

comment on function public.is_group_enrollment_payer(uuid) is
  'True when the caller is the recorded payer of the given enrolment. Used by '
  'subscription_payments RLS, where the payment row''s own payer_id is often NULL.';

revoke all on function public.is_group_enrollment_payer(uuid) from public;
grant execute on function public.is_group_enrollment_payer(uuid) to authenticated;

drop policy if exists "payer_read_subscription_payments" on public.subscription_payments;
create policy "payer_read_subscription_payments"
  on public.subscription_payments for select to authenticated
  using (
    payer_id = auth.uid()
    or public.is_group_enrollment_payer(enrollment_id)
  );

-- ---------------------------------------------------------------------------
-- Backfill the payer onto the payment rows that already exist.
-- ---------------------------------------------------------------------------
-- Copied from group_enrollments, which is the column that was actually being
-- written, and which 230's trigger has already validated against a real link —
-- so this asserts nothing the database did not already believe.
--
-- Guarded on `<> student_id` for the same reason 230 collapses that case to
-- NULL: paying for yourself is not a "payer", and there should be exactly one
-- representation of the ordinary case.
--
-- This is not only cosmetic. Per 230's own rationale, a refund goes to the card
-- that was charged and a receipt to the person who paid; with payer_id NULL,
-- both are aimed at the child, whose card was never touched.
update public.subscription_payments sp
   set payer_id = e.payer_id
  from public.group_enrollments e
 where e.id = sp.enrollment_id
   and sp.payer_id is null
   and e.payer_id is not null
   and e.payer_id <> sp.student_id;
