'use client';

import { useEffect, useState } from "react";
import { Check, Star, X, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase/client";

export function ClassRatingModal({
  open,
  onClose,
  groupId,
  paymentId,
  className,
  tutorName,
  tutorAvatar,
}: {
  open: boolean;
  onClose: () => void;
  groupId: string;
  paymentId: string;
  className: string;
  tutorName: string;
  tutorAvatar?: string;
}) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [eligible, setEligible] = useState<boolean | null>(null); // null = checking
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) {
      setRating(0); setHover(0); setComment(""); setSubmitted(false); setErr(""); setEligible(null);
    }
  }, [open]);

  // Verify eligibility on open
  useEffect(() => {
    if (!open || !paymentId || !groupId) return;
    verify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, paymentId, groupId]);

  async function verify() {
    setEligible(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setEligible(false); return; }

      // Check payment exists and is within 24h
      const { data: payment } = await supabase
        .from('subscription_payments')
        .select('id, student_id, payer_id, enrollment_id, status, created_at')
        .eq('id', paymentId)
        .eq('status', 'SUCCESS')
        .maybeSingle();

      if (!payment) { setEligible(false); return; }

      // Student or payer can rate
      const isAllowed = payment.student_id === user.id || payment.payer_id === user.id;
      if (!isAllowed) { setEligible(false); return; }

      // Within 24 hours
      const age = Date.now() - new Date(payment.created_at).getTime();
      if (age > 86400000) { setEligible(false); return; }

      // No existing rating for this payment + student
      const { data: existing } = await supabase
        .from('class_ratings')
        .select('id')
        .eq('payment_id', paymentId)
        .eq('student_id', payment.student_id)
        .maybeSingle();

      if (existing) { setEligible(false); return; }

      setEligible(true);
    } catch {
      setEligible(false);
    }
  }

  async function submit() {
    if (rating === 0 || submitting) return;
    setSubmitting(true); setErr('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: payment } = await supabase
        .from('subscription_payments')
        .select('student_id, enrollment_id')
        .eq('id', paymentId)
        .single();

      const { data: group } = await supabase
        .from('groups')
        .select('tutor_id')
        .eq('id', groupId)
        .single();

      const { error } = await supabase.from('class_ratings').insert({
        group_id: groupId,
        subscription_id: payment?.enrollment_id ?? null,
        payment_id: paymentId,
        student_id: payment?.student_id ?? user.id,
        tutor_id: group?.tutor_id ?? '',
        stars: rating,
        comment: comment.trim() || null,
      });
      if (error) throw error;

      // Mark notification read
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('metadata->>paymentId', paymentId)
        .eq('type', 'class_renewal_rate_prompt');

      setSubmitted(true);
      setTimeout(onClose, 2000);
    } catch (e: any) {
      setErr(e.message ?? 'Failed to submit. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full sm:max-w-[480px] rounded-t-2xl sm:rounded-2xl border border-[#1F1F1F] bg-[#111111] p-6 sm:p-7 text-white"
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 grid size-8 place-items-center rounded-full text-[#A0A0A0] hover:bg-white/5 hover:text-white"
        >
          <X className="size-4" />
        </button>

        {eligible === null ? (
          <div className="py-12 flex items-center justify-center">
            <Loader2 className="size-8 animate-spin text-[#32CC6F]" />
          </div>
        ) : eligible === false ? (
          <div className="py-8 text-center">
            <div className="text-lg font-bold">Rating window expired</div>
            <div className="mt-1 text-sm text-[#A0A0A0]">This rating link is no longer valid or has already been used.</div>
            <button onClick={onClose} className="mt-5 rounded-full border border-[#1F1F1F] px-5 py-2.5 text-sm font-medium text-white hover:bg-white/5">
              Close
            </button>
          </div>
        ) : submitted ? (
          <div className="py-8 text-center">
            <div className="mx-auto grid size-16 place-items-center rounded-full bg-[#32CC6F]/15">
              <Check className="size-9 text-[#32CC6F]" strokeWidth={3} />
            </div>
            <div className="mt-4 text-lg font-bold">Thanks for your rating!</div>
            <div className="mt-1 text-sm text-[#A0A0A0]">Your feedback helps improve the class.</div>
          </div>
        ) : (
          <>
            <div className="text-center">
              <div className="text-lg font-bold">{className}</div>
              <div className="text-xs uppercase tracking-wider text-[#A0A0A0] mt-1">Monthly Rating</div>
              <div className="mt-4 flex flex-col items-center gap-2">
                <div className="size-14 rounded-full bg-[#1F1F1F] overflow-hidden grid place-items-center text-sm font-bold text-white/80">
                  {tutorAvatar ? (
                    <img src={tutorAvatar} alt={tutorName} className="size-full object-cover" />
                  ) : (
                    tutorName.split(" ").map((s) => s[0]).slice(0, 2).join("")
                  )}
                </div>
                <div className="text-sm font-medium">{tutorName}</div>
              </div>
            </div>

            <div className="my-5 h-px bg-[#1F1F1F]" />

            <div className="space-y-3">
              <div className="text-sm font-medium">How was the class this month?</div>
              <div className="flex items-center justify-between px-2">
                {[1, 2, 3, 4, 5].map((i) => {
                  const active = (hover || rating) >= i;
                  return (
                    <button
                      key={i}
                      onMouseEnter={() => setHover(i)}
                      onMouseLeave={() => setHover(0)}
                      onClick={() => setRating(i)}
                      aria-label={`${i} stars`}
                      className="p-1 transition-transform hover:scale-110 active:scale-95"
                    >
                      <Star
                        className={`size-10 transition-colors ${
                          active ? "fill-[#32CC6F] text-[#32CC6F]" : "text-white/30"
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-5 space-y-2">
              <label className="text-sm font-medium">Leave a comment (optional)</label>
              <textarea
                rows={3}
                maxLength={500}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="How has the class been this month?"
                className="w-full resize-none rounded-xl border border-[#1F1F1F] bg-black/40 p-3 text-sm text-white placeholder:text-[#A0A0A0] focus:outline-none focus:border-[#32CC6F]/60"
              />
              <div className="text-right text-xs text-[#A0A0A0]">{comment.length} / 500</div>
            </div>

            {err && <p className="text-xs text-red-400 mt-2">{err}</p>}

            <div className="mt-5 space-y-3">
              <button
                disabled={rating === 0 || submitting}
                onClick={submit}
                className="w-full rounded-full bg-[#32CC6F] px-4 py-3 text-sm font-bold text-black transition hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? 'Submitting…' : 'Submit Rating'}
              </button>
              <button onClick={onClose} className="block w-full text-center text-sm text-[#A0A0A0] hover:text-white">
                Skip for now
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
