'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Rocket, Lock, Share2, QrCode, Copy, Check, Star, Users, Eye, MessageSquare, ArrowLeft } from 'lucide-react';
import { useProfile } from '@/lib/hooks/useProfile';
import { useTutorCompletion } from '@/lib/hooks/useTutorCompletion';
import TutorShell from '@/components/tutor/TutorShell';

export default function TutorGrowthPage() {
  return (
    <TutorShell>
      <GrowthContent />
    </TutorShell>
  );
}

type View = 'home' | 'profileLink' | 'social' | 'insights';

function GrowthContent() {
  const router = useRouter();
  const { profile, loading } = useProfile();
  const completion = useTutorCompletion(profile);
  const [view, setView] = useState<View>('home');

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'tutor')) router.push('/login');
  }, [loading, profile, router]);

  if (completion.loading) {
    return <div className="min-h-[400px] flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand" /></div>;
  }

  if (!completion.listed) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="rounded-2xl border border-border bg-card p-12 text-center">
          <Lock className="size-10 mx-auto text-muted-foreground/40" />
          <h2 className="mt-3 text-xl font-bold text-ink">Growth tools are locked</h2>
          <p className="mt-2 text-sm text-muted-foreground">Get listed first to share your profile, send referrals, and grow your student base.</p>
          <Link href="/tutor/get-listed" className="mt-5 inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-brand text-white font-semibold hover:bg-brand-deep">
            Complete profile
          </Link>
        </div>
      </div>
    );
  }

  if (view !== 'home') {
    return <DetailWrapper title={titleFor(view)} onBack={() => setView('home')}>{viewBody(view, profile)}</DetailWrapper>;
  }

  return (
    <div className="max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl lg:text-3xl font-bold text-ink">Grow your reach</h1>
        <p className="text-sm text-muted-foreground mt-1">Share your profile, attract new students, and build your reputation.</p>
      </header>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat icon={Eye} label="Profile views (30d)" value="—" />
        <Stat icon={MessageSquare} label="Inquiries" value="—" />
        <Stat icon={Users} label="New students" value="—" />
        <Stat icon={Star} label="Reviews" value="—" />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <CategoryButton icon={Share2} label="Share your profile" desc="Get a shareable link and QR code" onClick={() => setView('profileLink')} />
        <CategoryButton icon={Rocket} label="Social templates" desc="Ready-to-post templates for IG, FB, WhatsApp" onClick={() => setView('social')} />
        <CategoryButton icon={Star} label="Insights & tips" desc="Best practices to grow your tutoring business" onClick={() => setView('insights')} />
        <CategoryButton icon={QrCode} label="Boost listing" desc="Coming soon — promoted profile placement" onClick={() => {}} disabled />
      </div>
    </div>
  );
}

function titleFor(v: View): string {
  switch (v) {
    case 'profileLink': return 'Share your profile';
    case 'social': return 'Social media templates';
    case 'insights': return 'Insights & tips';
    default: return '';
  }
}

function viewBody(v: View, profile: any) {
  if (v === 'profileLink') return <ProfileLinkView profile={profile} />;
  if (v === 'social') return <SocialView profile={profile} />;
  if (v === 'insights') return <InsightsView />;
  return null;
}

function DetailWrapper({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <div className="max-w-4xl space-y-6">
      <header>
        <button onClick={onBack} className="text-xs text-muted-foreground hover:text-ink inline-flex items-center gap-1">
          <ArrowLeft className="size-3" /> Back to growth
        </button>
        <h1 className="mt-2 text-2xl lg:text-3xl font-bold text-ink">{title}</h1>
      </header>
      {children}
    </div>
  );
}

function CategoryButton({ icon: Icon, label, desc, onClick, disabled }: { icon: typeof Rocket; label: string; desc: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="text-left rounded-2xl border border-border bg-card p-5 hover:shadow-card transition disabled:opacity-50 disabled:cursor-not-allowed">
      <div className="size-10 rounded-lg bg-brand/10 text-brand-deep grid place-items-center">
        <Icon className="size-5" />
      </div>
      <div className="mt-3 font-semibold text-ink">{label}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
    </button>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Rocket; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <Icon className="size-4 text-brand-deep" />
      </div>
      <div className="mt-2 text-xl font-bold tabular-nums text-ink">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function ProfileLinkView({ profile }: { profile: any }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== 'undefined' ? `${window.location.origin}/tutors/${profile?.username || profile?.id}` : '';
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="text-sm font-semibold text-ink mb-2">Your public profile URL</div>
      <div className="flex flex-col sm:flex-row gap-2">
        <input value={url} readOnly className="flex-1 px-3 py-2.5 rounded-xl border border-border bg-background text-sm font-mono" />
        <button onClick={() => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-deep">
          {copied ? <><Check className="size-4" /> Copied</> : <><Copy className="size-4" /> Copy link</>}
        </button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Share this link in WhatsApp messages, social media bios, or anywhere students can find you.</p>
    </div>
  );
}

function SocialView({ profile }: { profile: any }) {
  const name = profile?.display_name || profile?.full_name || 'I';
  const templates = [
    `Hi! I'm ${name} and I'm now tutoring on iTutor. Book your first session here: ${typeof window !== 'undefined' ? window.location.origin + '/tutors/' + (profile?.username || profile?.id) : ''}`,
    `📚 Need help with CSEC or CAPE? I offer 1:1 sessions on iTutor. DM me or check out my profile.`,
    `New to tutoring with iTutor — first 5 students get a free intro consultation. Book on my profile.`,
  ];
  return (
    <div className="space-y-3">
      {templates.map((t, i) => (
        <div key={i} className="rounded-2xl border border-border bg-card p-4">
          <p className="text-sm text-ink whitespace-pre-line">{t}</p>
          <button onClick={() => navigator.clipboard.writeText(t)}
            className="mt-2 text-xs font-semibold text-brand-deep hover:underline">Copy template</button>
        </div>
      ))}
    </div>
  );
}

function InsightsView() {
  const tips = [
    { title: 'Reply quickly', body: 'Tutors who reply within 1 hour have a 3x higher booking conversion.' },
    { title: 'Add a clear bio', body: 'Bios with specific subjects, experience years, and credentials get more views.' },
    { title: 'Set fair pricing', body: 'Look at the average rate for your subjects in Trinidad and aim slightly below to attract first students.' },
    { title: 'Encourage reviews', body: 'After each successful session, gently ask students to rate you — reviews are the #1 factor in booking decisions.' },
  ];
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {tips.map((t) => (
        <div key={t.title} className="rounded-2xl border border-border bg-card p-5">
          <div className="font-semibold text-ink">{t.title}</div>
          <p className="mt-1 text-sm text-muted-foreground">{t.body}</p>
        </div>
      ))}
    </div>
  );
}
