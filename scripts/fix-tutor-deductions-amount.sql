-- Fix tutor_deductions where amount_ttd was incorrectly set to the full
-- subscription price instead of the tutor's payout share.
--
-- This corrects records created before the tutor_payout_ttd fix was deployed.
-- Safe to re-run — only updates rows where amounts actually differ.
--
-- Run in: Supabase Dashboard → SQL Editor

UPDATE public.tutor_deductions td
SET    amount_ttd = sp.tutor_payout_ttd,
       -- keep resolved_at NULL so the deduction is still pending
       resolved_at = NULL
FROM   public.subscription_payments sp
WHERE  td.source_subscription_payment_id = sp.id
  AND  td.status      = 'pending'
  AND  td.reason      = 'student_removal_refund'
  AND  sp.tutor_payout_ttd IS NOT NULL
  AND  sp.tutor_payout_ttd > 0
  AND  td.amount_ttd != sp.tutor_payout_ttd;
