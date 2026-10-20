'use client';

// DEV ONLY. Admin queue and review states, every badge variant and the click panel.

import { QueueTable } from '@/components/admin/verificationV2/AdminV2Queue';
import { ReviewView } from '@/components/admin/verificationV2/AdminV2Review';
import { BadgeRow } from '@/components/verification/VerificationBadges';
import { PanelBody, PanelFrame } from '@/components/verification/VerificationPanel';
import type { ProviderName } from '@/lib/identity/types';
import { Cell, Section } from './GalleryParts';
import { PANEL_DETAIL, QUEUE_ITEMS, mkDetail } from './galleryData';

const QUEUE_STATUSES = ['IN_REVIEW', 'REVERIFICATION_REQUIRED', 'REJECTED', 'VERIFIED', 'REVOKED'] as const;

export default function AdminAndBadges({ provider, onAction }: { provider: ProviderName; onAction: (t: string) => void }) {
  const all = { idChecked: true, credentialsReviewed: true, hasExtras: true };
  return (
    <>
      <Section id="admin" title="Admin" note={`Queue and review states. The identity section shows the selected provider (${provider}).`}>
        {QUEUE_STATUSES.map((s) => (
          <Cell key={s} label={`Queue: ${s}`}>
            <QueueTable status={s} items={QUEUE_ITEMS.map((i) => ({ ...i, status: s, decidedAt: s === 'IN_REVIEW' ? null : '2026-10-04T10:00:00.000Z' }))} />
          </Cell>
        ))}
        <Cell label="Queue: empty"><QueueTable status="IN_REVIEW" items={[]} /></Cell>
        <Cell label="Review: IN_REVIEW (approve / reject)" wide>
          <ReviewView detail={mkDetail({}, provider)} isAdmin reason="" onReason={() => {}} busy={false} onAct={(a) => onAction(`Admin pressed ${a}`)} />
        </Cell>
        <Cell label="Review: VERIFIED (admin can revoke, with history)" wide>
          <ReviewView
            detail={mkDetail({ status: 'VERIFIED', decidedAt: '2026-10-04T10:00:00.000Z' }, provider, [
              { id: 'd1', actorRole: 'reviewer', action: 'APPROVE', from: 'IN_REVIEW', to: 'VERIFIED', profileFrom: 'PENDING', profileTo: 'VERIFIED', reason: null, at: '2026-10-04T10:00:00.000Z' },
            ])}
            isAdmin reason="" onReason={() => {}} busy={false} onAct={() => {}}
          />
        </Cell>
        <Cell label="Review: VERIFIED (a reviewer sees no revoke)">
          <ReviewView detail={mkDetail({ status: 'VERIFIED' }, provider)} isAdmin={false} reason="" onReason={() => {}} busy={false} onAct={() => {}} />
        </Cell>
        <Cell label="Review: REVOKED with history">
          <ReviewView
            detail={mkDetail({ status: 'REVOKED', decisionReason: 'Misrepresented qualifications' }, provider, [
              { id: 'd3', actorRole: 'admin', action: 'REVOKE', from: 'VERIFIED', to: 'REVOKED', profileFrom: 'VERIFIED', profileTo: 'REVOKED', reason: 'Misrepresented qualifications', at: '2026-10-06T10:00:00.000Z' },
              { id: 'd2', actorRole: 'admin', action: 'REQUIRE_REVERIFICATION', from: 'VERIFIED', to: 'REVERIFICATION_REQUIRED', profileFrom: 'VERIFIED', profileTo: 'REVERIFICATION_REQUIRED', reason: 'New ID check policy', at: '2026-10-05T10:00:00.000Z' },
            ])}
            isAdmin reason="" onReason={() => {}} busy={false} onAct={() => {}}
          />
        </Cell>
        <Cell label="Review: identity not supported (with the provider's raw code)">
          {(() => {
            const d = mkDetail({ status: 'IN_PROGRESS' }, provider);
            d.application.identity = { status: 'not_supported', errorCode: 'country', provider, providerCode: 'RAW_PROVIDER_CODE', country: 'GY', attempts: 1, verifiedAt: null, redacted: false };
            return <ReviewView detail={d} isAdmin reason="" onReason={() => {}} busy={false} onAct={() => {}} />;
          })()}
        </Cell>
      </Section>

      <Section id="badges" title="Badges and the click panel" note="Three separate labels. They appear only for teachers verified in the v2 flow.">
        <Cell label="All three, full size"><BadgeRow summary={all} /></Cell>
        <Cell label="All three, compact (class cards)"><BadgeRow compact summary={all} /></Cell>
        <Cell label="No extras"><BadgeRow summary={{ ...all, hasExtras: false }} /></Cell>
        <Cell label="Credentials reviewed only (ID not checked)"><BadgeRow summary={{ idChecked: false, credentialsReviewed: true, hasExtras: false }} /></Cell>
        <Cell label="Nothing (an unverified teacher renders nothing)">
          <div className="rounded border border-dashed border-gray-300 p-3 text-sm text-gray-500"><BadgeRow summary={{ idChecked: false, credentialsReviewed: false, hasExtras: false }} />(empty)</div>
        </Cell>
        <Cell label="As on a class card (dark)">
          <div className="rounded-2xl bg-[#111111] p-4"><p className="mb-2 text-sm text-white">Mathematics for CSEC · by Tia Tutor</p><BadgeRow compact summary={all} /></div>
        </Cell>
        <Cell label="Click panel (with extras)"><PanelFrame inline onClose={() => {}}><PanelBody detail={PANEL_DETAIL} /></PanelFrame></Cell>
        <Cell label="Click panel (no extras)"><PanelFrame inline><PanelBody detail={{ ...PANEL_DETAIL, hasExtras: false, extras: [] }} /></PanelFrame></Cell>
      </Section>
    </>
  );
}
