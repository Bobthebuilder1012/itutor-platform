-- =====================================================
-- CREDIT REFUND LIABILITIES
-- =====================================================
-- Temporary holding table for refunds that cannot be
-- processed through LuniPay due to API limitations.
-- Once the credit system is live, rows here drive
-- credit issuance.
-- =====================================================

create table if not exists public.credit_refund_liabilities (
  id                              uuid primary key default gen_random_uuid(),

  user_id                         uuid not null references public.profiles(id) on delete cascade,
  user_role                       text not null check (user_role in ('student', 'tutor')),

  class_id                        uuid,
  session_id                      uuid,
  booking_id                      uuid,

  scenario                        text not null,
  reason                          text,

  original_payment_id             uuid,
  original_lunipay_transaction_id text,

  currency                        text not null default 'TTD',
  original_amount                 numeric(10,2),
  credit_amount                   numeric(10,2) not null,

  tutor_cash_payout_amount        numeric(10,2) default 0,

  status                          text not null default 'pending'
    check (status in ('pending', 'credited', 'cancelled', 'failed')),

  source                          text not null default 'refund_policy_pause',

  metadata                        jsonb default '{}'::jsonb,

  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);

-- Index for looking up a user's credits
create index if not exists credit_refund_liabilities_user_id_idx
  on public.credit_refund_liabilities(user_id);

-- Index for looking up by booking
create index if not exists credit_refund_liabilities_booking_id_idx
  on public.credit_refund_liabilities(booking_id)
  where booking_id is not null;

-- RLS: users can see their own liabilities; admins see all
alter table public.credit_refund_liabilities enable row level security;

create policy "Users see own credit liabilities"
  on public.credit_refund_liabilities
  for select
  using (auth.uid() = user_id);

create policy "Service role full access"
  on public.credit_refund_liabilities
  for all
  using (true)
  with check (true);

comment on table public.credit_refund_liabilities is
  'Holds refund amounts owed to users as credits while LuniPay refund API is unavailable.';
