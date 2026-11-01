'use client';

/**
 * The gallery itself. Each specimen below uses the same content as the
 * matching preview in the design system, so a visual diff is meaningful:
 * same labels, same prices, same names, same states, same order.
 */

import { useState, type ReactNode } from 'react';
import {
  AppHeader,
  BottomNav,
  Button,
  Card,
  ClassRow,
  Countdown,
  DsPortal,
  QuestProgress,
  SectionHeader,
  SubjectTile,
  Tag,
} from '@/components/ui';
import '@/components/ui/ds-tokens.css';

function Specimen({
  name,
  group,
  children,
}: {
  name: string;
  group: string;
  children: ReactNode;
}) {
  return (
    <section className="mb-ds-8">
      <div className="mb-ds-3 flex items-baseline gap-ds-2">
        <h2 className="font-display font-extrabold text-[22px] leading-6 text-ink">
          {name}
        </h2>
        <span className="font-extrabold text-[11px] uppercase tracking-[0.99px] text-ink-muted">
          {group}
        </span>
      </div>
      <div className="rounded-ds-card border-hair border-border bg-surface-card p-ds-3">
        {children}
      </div>
    </section>
  );
}

/**
 * Proof that a portalled surface still gets the tokens. This renders into
 * document.body, outside the gallery's own `.ds-root`, so if DsPortal were
 * missing the card would come back in the legacy palette rather than the
 * design system's.
 */
function PortalDemo() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-ds-card bg-surface-page p-ds-4">
      <Button variant="dark" onClick={() => setOpen(true)}>
        Open sheet
      </Button>

      {open ? (
        <DsPortal>
          {/* bg-ink/60 works because ink resolves to
              rgb(var(--ds-ink) / <alpha-value>). See the Opacity specimen. */}
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 p-ds-4">
            <div className="w-full max-w-[390px] rounded-ds-card bg-surface-card p-ds-card">
              <Card
                tone="feature"
                eyebrow="Portalled · outside .ds-root"
                title="Still on the new tokens"
                body="This sheet renders into document.body. It is brand #32cc6e and ink #0d2318 because DsPortal puts .ds-root on its host."
              >
                <Button variant="primary" size="lg" block onClick={() => setOpen(false)}>
                  Close
                </Button>
              </Card>
            </div>
          </div>
        </DsPortal>
      ) : null}
    </div>
  );
}

export default function UiGallery() {
  return (
    <div className="ds-root min-h-screen bg-surface-page">
      <div className="mx-auto w-full max-w-[920px] px-ds-4 py-ds-8">
        <header className="mb-ds-8">
          <h1 className="font-display font-extrabold text-[28px] leading-[29.4px] tracking-[-0.28px] text-ink">
            iTutor design system
          </h1>
          <p className="mt-ds-2 text-[15px] leading-[22.5px] text-ink-muted">
            Every component, with the same examples as the design system previews.
            Light-only; brand green is #32cc6e and text on it is always ink.
          </p>
        </header>

        <Specimen name="Button" group="Actions">
          <div className="grid gap-ds-3 rounded-ds-card bg-surface-page p-ds-4">
            <div className="flex flex-wrap gap-[10px]">
              <Button variant="primary" size="lg">
                View class
              </Button>
              <Button variant="primary">Review request</Button>
              <Button variant="danger" size="sm">
                Fix payment
              </Button>
            </div>
            <div className="flex flex-wrap gap-[10px]">
              <Button variant="dark">Create squad</Button>
              <Button variant="outline">Join with invite</Button>
              <Button variant="primary" icon="play">
                Start studying
              </Button>
              <Button variant="primary" disabled>
                Disabled
              </Button>
            </div>
          </div>
        </Specimen>

        <Specimen name="Tag" group="Status">
          <div className="flex flex-wrap gap-ds-2 rounded-ds-card bg-surface-page p-ds-4">
            <Tag tone="danger">Needs action</Tag>
            <Tag tone="outline">Droove asks to join</Tag>
            <Tag tone="warning">Done</Tag>
            <Tag tone="orange">Geo</Tag>
            <Tag tone="brand">Paid</Tag>
            <Tag tone="dark">S01-1</Tag>
          </div>
        </Specimen>

        <Specimen name="Card" group="Containers">
          <div className="grid max-w-[390px] gap-ds-3 rounded-ds-card bg-surface-page p-ds-4">
            <Card
              tone="alert"
              tag={<Tag tone="danger">Needs action</Tag>}
              title="Payment failed · CSEC Mathematics"
              body="TT$180 could not be charged on Fri 23 Oct"
            >
              <Button variant="danger" size="sm" block>
                Fix payment
              </Button>
            </Card>

            <Card
              tone="feature"
              eyebrow="Up next · today"
              title="CSEC Mathematics Form 5"
              body="Rishi Persad · Mon 26 Oct · 4:30 PM"
            >
              <Button variant="primary" size="lg" block>
                View class
              </Button>
            </Card>

            <Card
              title="Study with friends"
              body="Squads plan sessions, chat and earn a crest together."
            />
          </div>
        </Specimen>

        <Specimen name="SubjectTile" group="Data display">
          <div className="flex items-center gap-ds-3 rounded-ds-card bg-surface-page p-ds-4">
            <SubjectTile code="MA" color="green" />
            <SubjectTile code="ES" color="yellow" />
            <SubjectTile code="PH" color="orange" />
            <SubjectTile code="PB" color="sage" />
            <SubjectTile code="GE" color="orange" size={40} />
          </div>
        </Specimen>

        <Specimen name="ClassRow" group="Data display">
          <div className="grid max-w-[390px] gap-ds-3 rounded-ds-card bg-surface-page p-ds-4">
            <ClassRow
              code="MA"
              color="green"
              title="CSEC Mathematics Form 5"
              meta="Rishi Persad · Mon, Wed & Fri · 4:30 PM"
              price="TT$180"
              onClick={() => {}}
            />
            <ClassRow
              code="PH"
              color="orange"
              title="CSEC Physics Form 5"
              meta="Ms. Charles · Mondays · 5:30 PM"
              price="TT$170"
              onClick={() => {}}
            />
            <ClassRow
              code="PB"
              color="sage"
              title="CSEC Principles of Business Form 4"
              meta="Tamara Rampersad · Wednesdays · 4:30 PM"
            />
          </div>
        </Specimen>

        <Specimen name="SectionHeader" group="Layout">
          <div className="max-w-[390px] rounded-ds-card bg-surface-page p-ds-4">
            <SectionHeader title="Classes for Droove" action="See all" />
          </div>
        </Specimen>

        <Specimen name="AppHeader" group="Navigation">
          <div className="grid max-w-[390px] gap-ds-3">
            <AppHeader
              tone="dark"
              unread
              initials="AR"
              logo={
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src="/brand/itutor-logo-on-dark.png"
                  alt="iTutor"
                  className="block h-6 w-auto"
                />
              }
            />
            <AppHeader
              tone="light"
              unread
              initials="AL"
              actions={['search', 'bell']}
              logo={
                <span className="font-display font-extrabold text-[15px] text-ink">
                  Logo slot
                </span>
              }
            />
          </div>
        </Specimen>

        <Specimen name="BottomNav" group="Navigation">
          <div className="max-w-[390px]">
            <BottomNav
              active="home"
              items={[
                { id: 'home', label: 'Home', icon: 'home' },
                { id: 'explore', label: 'Explore', icon: 'explore' },
                { id: 'classes', label: 'Classes', icon: 'classes' },
                { id: 'billing', label: 'Billing', icon: 'billing', badge: true },
                { id: 'profile', label: 'Profile', icon: 'profile' },
              ]}
            />
          </div>
        </Specimen>

        <Specimen name="Countdown" group="Data display">
          <div className="max-w-[358px] rounded-ds-card bg-ink p-ds-4">
            <Countdown days={4} hours={6} minutes={40} />
          </div>
        </Specimen>

        <Specimen name="Opacity" group="Tokens">
          {/*
           * A REGRESSION CANARY, NOT DECORATION. brand, ink, ink-muted and
           * border are the four colour names the new UI shares with the
           * legacy palette, so they resolve through a CSS variable. If anyone
           * puts a bare var() back into those four Tailwind keys, the alpha
           * modifier stops working SILENTLY — no error, no warning, every
           * swatch below simply goes solid. Three steps per colour make that
           * obvious at a glance.
           */}
          <div className="grid gap-ds-3 rounded-ds-card bg-surface-page p-ds-4">
            {(
              [
                ['brand', ['bg-brand/10', 'bg-brand/50', 'bg-brand']],
                ['ink', ['bg-ink/10', 'bg-ink/50', 'bg-ink']],
                ['ink-muted', ['bg-ink-muted/10', 'bg-ink-muted/50', 'bg-ink-muted']],
                ['border', ['bg-border/10', 'bg-border/50', 'bg-border']],
              ] as const
            ).map(([token, steps]) => (
              <div key={token} className="flex items-center gap-ds-3">
                <span className="w-[76px] flex-none font-extrabold text-[12px] text-ink-muted">
                  {token}
                </span>
                {steps.map((cls, i) => (
                  <div key={cls} className="flex flex-1 flex-col gap-ds-1">
                    <div
                      className={`h-10 rounded-ds-sm border-hair border-border ${cls}`}
                    />
                    <span className="text-[11px] text-ink-muted">
                      {[10, 50, 100][i]}%
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Specimen>

        <Specimen name="DsPortal" group="Layout">
          <PortalDemo />
        </Specimen>

        <Specimen name="QuestProgress" group="Status">
          <div className="grid max-w-[358px] gap-[10px] rounded-ds-card bg-surface-card p-ds-4">
            <QuestProgress total={3} done={1} />
            <QuestProgress total={7} done={5} />
          </div>
        </Specimen>
      </div>
    </div>
  );
}
