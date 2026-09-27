import MarketingShell from '@/components/landing/MarketingShell';
import {
  Video,
  Plug,
  CalendarCheck,
  RefreshCw,
  Unplug,
  ShieldCheck,
  LifeBuoy,
  AlertTriangle,
} from 'lucide-react';

export const metadata = {
  title: 'Using Zoom with iTutor — Setup, Use and Removal',
  description:
    'How to connect your Zoom account to iTutor, how Zoom meetings are created for your tutoring sessions, and how to disconnect or remove the integration.',
};

/**
 * Zoom integration documentation.
 *
 * This page is the documentation URL for the iTutor listing on the Zoom App
 * Marketplace, which requires a Zoom-specific guide on our own domain covering
 * add / use / remove. Every step below is written against the actual
 * implementation — /api/auth/zoom/connect, the callback's token exchange and
 * session migration, videoProviders.ts meeting creation, and the disconnect
 * confirmation in /tutor/video-setup. If any of those change, change this page
 * with them: a documentation page that no longer matches the product is grounds
 * for the listing being pulled.
 */

const GREEN = '#199356';

interface Step {
  n: number;
  title: string;
  body: string;
}

const CONNECT_STEPS: Step[] = [
  {
    n: 1,
    title: 'Log in to your iTutor tutor account',
    body: 'The Zoom integration is available to tutor accounts only. Students and parents do not connect Zoom — they simply join the link their tutor\'s session generates.',
  },
  {
    n: 2,
    title: 'Open Video Setup',
    body: 'From your tutor dashboard, go to Video Setup (myitutor.com/tutor/video-setup). This page shows your current video provider and its connection status.',
  },
  {
    n: 3,
    title: 'Select Connect Zoom',
    body: 'You are redirected to Zoom\'s own authorisation screen at zoom.us. iTutor never sees or stores your Zoom password — authorisation happens entirely on Zoom\'s side.',
  },
  {
    n: 4,
    title: 'Approve the requested permissions',
    body: 'Review what the app is asking for and select Allow. Zoom then returns you to iTutor automatically.',
  },
  {
    n: 5,
    title: 'Confirm the connection',
    body: 'Video Setup now shows Zoom as Currently Connected, along with the date it was connected. No further setup is needed — your next confirmed booking will use Zoom.',
  },
];

const USE_POINTS: Step[] = [
  {
    n: 1,
    title: 'A meeting is created per confirmed booking',
    body: 'You do not create meetings by hand. When a booking is confirmed, iTutor creates a scheduled meeting in your own Zoom account for that session\'s date, time and length. One booking produces one meeting.',
  },
  {
    n: 2,
    title: 'The join link is shared automatically',
    body: 'The meeting\'s join link is attached to the session and appears in your dashboard and your student\'s dashboard, and is included in booking confirmation and reminder emails. Nobody has to copy a link across manually.',
  },
  {
    n: 3,
    title: 'How the meetings are configured',
    body: 'Meetings are created as scheduled meetings titled "iTutor Session", with join-before-host enabled, no waiting room, and participants unmuted on entry — so a student is never left stuck outside a room waiting to be admitted. The duration matches the booked session length.',
  },
  {
    n: 4,
    title: 'Joining the session',
    body: 'At the scheduled time, you and your student open the session from your iTutor dashboard, or from the link in your confirmation email. It opens in Zoom as a normal meeting.',
  },
  {
    n: 5,
    title: 'Staying connected',
    body: 'iTutor refreshes your Zoom authorisation in the background. If it ever expires or is revoked, Video Setup shows that your authorisation expired and prompts you to connect again. Until you do, new sessions cannot be given a Zoom link.',
  },
];

export default function ZoomHelpPage() {
  return (
    <MarketingShell>
      {/* Hero */}
      <section className="mx-auto max-w-4xl px-6 py-20 sm:py-28">
        <div
          className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide"
          style={{ backgroundColor: `${GREEN}1A`, color: GREEN }}
        >
          <Video className="h-3.5 w-3.5" />
          Zoom integration
        </div>
        <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          Using Zoom with iTutor
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-[#555555]">
          iTutor is a tutoring platform for Trinidad and Tobago. Connecting Zoom lets iTutor create
          a Zoom meeting automatically for every lesson you are booked for, so you never have to set
          one up or send a link by hand. This page covers how to add the integration, how it works
          day to day, and how to remove it.
        </p>
      </section>

      {/* Before you start */}
      <section className="border-y border-black/5 bg-[#F5F5F5] py-14">
        <div className="mx-auto max-w-4xl px-6">
          <h2 className="text-xl font-bold">Before you start</h2>
          <ul className="mt-4 space-y-2 text-[#555555]">
            <li className="flex gap-3">
              <span style={{ color: GREEN }} aria-hidden="true">
                •
              </span>
              A Zoom account. Any plan, including a free one, works.
            </li>
            <li className="flex gap-3">
              <span style={{ color: GREEN }} aria-hidden="true">
                •
              </span>
              An approved iTutor tutor account. Connecting a video provider is part of tutor setup.
            </li>
            <li className="flex gap-3">
              <span style={{ color: GREEN }} aria-hidden="true">
                •
              </span>
              One video provider is active at a time — either Zoom or Google Meet, not both.
            </li>
          </ul>
        </div>
      </section>

      {/* Add */}
      <Section
        icon={<Plug className="h-5 w-5" style={{ color: GREEN }} />}
        eyebrow="Add"
        title="Connecting your Zoom account"
      >
        <Steps steps={CONNECT_STEPS} />
      </Section>

      {/* Use */}
      <Section
        icon={<CalendarCheck className="h-5 w-5" style={{ color: GREEN }} />}
        eyebrow="Use"
        title="How Zoom is used for your sessions"
        muted
      >
        <Steps steps={USE_POINTS} />
      </Section>

      {/* Switching */}
      <Section
        icon={<RefreshCw className="h-5 w-5" style={{ color: GREEN }} />}
        eyebrow="Switching"
        title="Changing between Zoom and Google Meet"
      >
        <p className="text-[#555555] leading-relaxed">
          You can move between providers at any time from Video Setup. Selecting the other provider
          asks you to confirm, because your existing connection is replaced rather than kept
          alongside the new one.
        </p>
        <p className="mt-4 text-[#555555] leading-relaxed">
          When you switch, iTutor re-creates the meeting links for your upcoming sessions with the
          new provider automatically, so nothing you have already been booked for is left pointing
          at a provider you are no longer connected to. Only future sessions that are still
          scheduled are moved — sessions that have already happened keep their original links as a
          record.
        </p>
        <Callout>
          Tell your students if you switch close to a lesson. Their dashboard and any newly sent
          email will carry the new link, but a confirmation email they received earlier will still
          show the old one.
        </Callout>
      </Section>

      {/* Remove */}
      <Section
        icon={<Unplug className="h-5 w-5" style={{ color: GREEN }} />}
        eyebrow="Remove"
        title="Disconnecting or removing Zoom"
        muted
      >
        <p className="text-[#555555] leading-relaxed">
          There are two ways to remove the integration. Either one stops iTutor from being able to
          create new Zoom meetings for you.
        </p>

        <h3 className="mt-8 text-lg font-semibold">Option 1 — Disconnect from within iTutor</h3>
        <ol className="mt-3 space-y-2 text-[#555555]">
          <li>1. Go to Video Setup (myitutor.com/tutor/video-setup).</li>
          <li>2. Select Disconnect.</li>
          <li>3. Read the confirmation carefully, then confirm.</li>
        </ol>
        <p className="mt-4 text-[#555555] leading-relaxed">
          Your stored Zoom authorisation is deleted from iTutor at that point.
        </p>

        <div
          className="mt-6 rounded-2xl border p-5"
          style={{ borderColor: '#F0C36D', backgroundColor: '#FEF9EC' }}
        >
          <p className="flex items-center gap-2 font-semibold text-[#8A5A00]">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Disconnecting takes you out of search
          </p>
          <p className="mt-2 text-sm leading-relaxed text-[#6B4A00]">
            A video provider is required in order to tutor on iTutor, so while you have none
            connected:
          </p>
          <ul className="mt-2 space-y-1 text-sm text-[#6B4A00]">
            <li>• You will not be visible to students searching for tutors.</li>
            <li>• You cannot accept booking requests.</li>
            <li>• You cannot send lesson offers.</li>
          </ul>
          <p className="mt-2 text-sm leading-relaxed text-[#6B4A00]">
            Connect Zoom or Google Meet again to resume tutoring. This is the same warning shown in
            the app before you confirm.
          </p>
        </div>

        <h3 className="mt-10 text-lg font-semibold">
          Option 2 — Remove the app from the Zoom Marketplace
        </h3>
        <ol className="mt-3 space-y-2 text-[#555555]">
          <li>1. Sign in at marketplace.zoom.us.</li>
          <li>2. Open Manage, then Added Apps — or search for the iTutor app by name.</li>
          <li>3. Select iTutor, then select Remove.</li>
        </ol>
        <p className="mt-4 text-[#555555] leading-relaxed">
          This revokes iTutor&apos;s access from Zoom&apos;s side. Afterwards, open Video Setup in
          iTutor and connect a provider again before taking further bookings — otherwise your
          profile stays hidden from search for the reasons above.
        </p>

        <h3 className="mt-10 text-lg font-semibold">What happens to your data and meetings</h3>
        <ul className="mt-3 space-y-2 text-[#555555]">
          <li className="flex gap-3">
            <span style={{ color: GREEN }} aria-hidden="true">
              •
            </span>
            The access and refresh tokens iTutor held for your Zoom account are deleted. iTutor can
            no longer act on your Zoom account.
          </li>
          <li className="flex gap-3">
            <span style={{ color: GREEN }} aria-hidden="true">
              •
            </span>
            Zoom meetings that were already created stay in your own Zoom account. Delete them in
            Zoom if you no longer want them.
          </li>
          <li className="flex gap-3">
            <span style={{ color: GREEN }} aria-hidden="true">
              •
            </span>
            Your iTutor account, profile, past sessions and earnings history are unaffected.
            Removing Zoom is not the same as closing your iTutor account.
          </li>
        </ul>
      </Section>

      {/* Data */}
      <Section
        icon={<ShieldCheck className="h-5 w-5" style={{ color: GREEN }} />}
        eyebrow="Data"
        title="What iTutor accesses, and what it stores"
      >
        <p className="text-[#555555] leading-relaxed">
          iTutor uses your Zoom authorisation for one purpose: creating and managing the meetings
          for lessons you are booked for. It is used to create a scheduled meeting per confirmed
          booking and to read back that meeting&apos;s join link so it can be shown to you and your
          student.
        </p>
        <p className="mt-4 text-[#555555] leading-relaxed">
          Access and refresh tokens are stored encrypted, and are deleted when you disconnect.
          iTutor does not access your Zoom password, and does not record, store or process the
          contents of your meetings. For full details see our{' '}
          <a href="/privacy" className="font-medium underline" style={{ color: GREEN }}>
            Privacy Policy
          </a>
          .
        </p>
      </Section>

      {/* Troubleshooting */}
      <Section
        icon={<LifeBuoy className="h-5 w-5" style={{ color: GREEN }} />}
        eyebrow="Troubleshooting"
        title="If something is not working"
        muted
      >
        <Faq
          q="Video Setup says my authorisation expired"
          a="Select Connect Zoom Again on that page to re-authorise. This can happen if you changed your Zoom password, removed the app from the Zoom Marketplace, or your organisation's Zoom admin revoked access."
        />
        <Faq
          q="A session has no Zoom link"
          a="This usually means the meeting could not be created — most often because the Zoom authorisation expired between the booking being made and the meeting being created. Reconnect Zoom in Video Setup; if the session still has no link, contact support and we will generate it."
        />
        <Faq
          q="Can I use my own Zoom link instead?"
          a="No. Links are created through the connected account so that both you and your student always see the same link for a session, and so reminders can include it."
        />
        <Faq
          q="Do my students need a Zoom account?"
          a="No. Students join through the link, which opens in the Zoom app or in a browser. Because join-before-host is enabled and there is no waiting room, they can enter even if you are a moment behind."
        />
        <Faq
          q="Can I connect Zoom and Google Meet at once?"
          a="No. One provider is active at a time. Switching replaces the other, and re-creates the links for your upcoming sessions."
        />
      </Section>

      {/* Support */}
      <section className="border-t border-black/5 bg-[#F5F5F5] py-20 text-center">
        <h2 className="text-2xl font-bold sm:text-3xl">Still need help?</h2>
        <p className="mt-3 text-[#555555]">
          Our support team is available Monday – Friday, 8 AM – 6 PM AST.
        </p>
        <a
          href="mailto:support@myitutor.com"
          className="mt-6 inline-block text-lg font-semibold hover:underline"
          style={{ color: GREEN }}
        >
          support@myitutor.com
        </a>
        <p className="mt-8 text-sm text-[#555555]">
          <a href="/help" className="underline">
            Back to all help articles
          </a>
        </p>
      </section>
    </MarketingShell>
  );
}

/* ---------------------------------------------------------------- */

function Section({
  icon,
  eyebrow,
  title,
  children,
  muted = false,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <section className={muted ? 'border-y border-black/5 bg-[#F5F5F5] py-16' : 'py-16'}>
      <div className="mx-auto max-w-4xl px-6">
        <div className="flex items-center gap-2">
          {icon}
          <span
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: GREEN }}
          >
            {eyebrow}
          </span>
        </div>
        <h2 className="mt-3 text-2xl font-bold sm:text-3xl">{title}</h2>
        <div className="mt-6">{children}</div>
      </div>
    </section>
  );
}

function Steps({ steps }: { steps: Step[] }) {
  return (
    <ol className="space-y-6">
      {steps.map(step => (
        <li key={step.n} className="flex gap-4">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
            style={{ backgroundColor: GREEN }}
            aria-hidden="true"
          >
            {step.n}
          </span>
          <div>
            <p className="font-semibold text-black">{step.title}</p>
            <p className="mt-1 leading-relaxed text-[#555555]">{step.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mt-6 rounded-2xl border-l-4 bg-white p-5 text-[#555555]"
      style={{ borderLeftColor: GREEN }}
    >
      {children}
    </div>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <div className="border-b border-black/10 py-5 last:border-0">
      <p className="font-semibold text-black">{q}</p>
      <p className="mt-2 leading-relaxed text-[#555555]">{a}</p>
    </div>
  );
}
