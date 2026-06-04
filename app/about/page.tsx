import MarketingShell from '@/components/landing/MarketingShell';
import Link from 'next/link';
import Image from 'next/image';

export const metadata = {
  title: 'About iTutor — Built by Caribbean Students, for Caribbean Students',
  description: "iTutor is the Caribbean's tutoring marketplace. Built by Form 4 students who got tired of waiting for the system to fix itself. We connect students across 15+ territories with verified tutors, powered by AI and the people who actually know the curriculum.",
};

function S({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`mx-auto w-full max-w-6xl px-6 ${className}`}>{children}</section>;
}
function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-wider text-[#199356] mb-4">{children}</p>;
}

const TEAM = [
  { name: 'Liam Rampersad', role: 'Founder & Chief Executive Officer', image: '/assets/team/liam-rampersad.jpg', objectPosition: 'center 20%', bio: 'Liam is responsible for setting the overall vision, strategy and direction of the company. He leads the development of iTutor\'s platform, partnerships and growth initiatives while working closely with the executive team to expand access to quality education across the Caribbean. Liam founded iTutor as part of a mission to connect students, parents and tutors through a trusted digital marketplace and educational technology platform.' },
  { name: 'Jovan Goodluck', role: 'Chief Technology Officer & Co-Founder', image: '/assets/team/jovan-goodluck.jpg', objectPosition: 'center 40%', bio: 'Jovan leads the development of technology that helps make quality education more accessible, trusted, and effective across the region. His work is focused on solving one of education\'s most persistent challenges: the impact of geography on learning opportunity. At iTutor, he builds the systems, processes, and technical foundation needed to connect students and tutors regardless of location. Jovan believes AI should be used as a tool for improvement, not replacement — his approach centres on strengthening the learning experience, supporting tutors, and preparing iTutor for future growth.' },
  { name: 'Arjun Rambally', role: 'Chief Financial Officer & Co-Founder', image: '/assets/team/arjun-rambally.jpg', objectPosition: 'center 20%', bio: 'Arjun leads iTutor\'s financial strategy, budgeting, and operations. He oversees financial planning, forecasting, and resource allocation, helping ensure iTutor is built on a strong and sustainable economic foundation as it scales across Trinidad and Tobago and the wider Caribbean region. Working closely with the executive team, he supports key business decisions and long-term growth initiatives that advance the company\'s mission of making quality education more accessible.' },
];

export default function AboutPage() {
  return (
    <MarketingShell>
      {/* Hero */}
      <S className="py-24 sm:py-32">
        <h1 className="max-w-4xl text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
          We got tired of waiting for the system to fix itself. So we built the solution.
        </h1>
        <p className="mt-8 max-w-2xl text-lg text-[#555555]">
          iTutor is the Caribbean&apos;s tutoring marketplace connecting students across 15+ CXC-aligned territories with verified, reviewed tutors. We&apos;re not a global platform retrofitted for our region. We were built here, for here, by students who lived the problem firsthand.
        </p>
      </S>

      {/* Origin story */}
      <section className="bg-[#F5F5F5] py-24 border-y border-black/5">
        <div className="mx-auto grid max-w-6xl gap-12 px-6 lg:grid-cols-2 lg:gap-20">
          <div className="flex flex-col gap-8">
            <div>
              <Label>Where it started</Label>
              <p className="text-3xl font-semibold leading-tight sm:text-4xl">
                &ldquo;This started because a teacher didn&apos;t show up.&rdquo;
              </p>
            </div>
            <div className="relative w-full overflow-hidden rounded-2xl" style={{aspectRatio:'4/3'}}>
              <Image src="/assets/about/classroom.jpg" alt="Students in a classroom" fill className="object-cover" sizes="(max-width: 1024px) 100vw, 50vw" />
            </div>
          </div>
          <div className="space-y-4 text-[#555555]">
            <p>Not once. For an entire term.</p>
            <p>We were Form 4 students at Presentation College Chaguanas. A teacher stopped coming to class and nothing was done about it. No accountability. No alternative offered. Just students sitting in a room falling behind on a syllabus that doesn&apos;t slow down for anyone — least of all for institutional failure.</p>
            <p>We didn&apos;t wait to be rescued. We took it into our own hands.</p>
            <p>We asked the obvious question: why is it still this hard to find a qualified tutor in the Caribbean? Why is the answer still a WhatsApp group, a Facebook post or word-of-mouth from someone&apos;s aunt? Why are students paying for lessons with no way to verify who they&apos;re paying, no reviews, no recourse and no visibility for their parents?</p>
            <p>No one had built the answer. So we did. iTutor launched in 2026. By our Form 4 year. We were 15 and 16 years old.</p>
          </div>
        </div>
      </section>

      {/* What iTutor is */}
      <S className="py-24">
        <div className="grid gap-12 lg:grid-cols-[1fr_2fr] lg:gap-20">
          <div>
            <Label>What we built</Label>
            <h2 className="text-3xl font-bold leading-tight sm:text-4xl">A marketplace, a CRM and an AI co-pilot built for Caribbean educators and students.</h2>
          </div>
          <div className="space-y-5 text-[#555555]">
            <p>Most people hear &ldquo;tutoring platform&rdquo; and picture a simple directory. iTutor is not that.</p>
            <p>Under the hood, iTutor is an agentic CRM for educators — giving tutors the tools to run, grow and manage their tutoring business professionally. Scheduling, payments, client history, reviews, performance analytics, session notes — everything a tutor needs to operate like the small business owner they are.</p>
            <p>For students, iTutor is the fastest way to find a verified Caribbean tutor, book a session in minutes and access a platform that knows their syllabus — CSEC, CAPE or SEA — not a generic global curriculum that was never designed with CXC in mind.</p>
            <p>For parents, it&apos;s the visibility they&apos;ve never had: a dashboard that shows them exactly what their child is working on, who they&apos;re working with and how they&apos;re progressing — without interrupting the learning.</p>
            <p>And layered through all of it, AI tools that make tutors more effective, sessions more productive and progress more measurable. Not AI replacing teachers. AI making the teacher better.</p>
          </div>
        </div>
      </S>

      {/* Mission */}
      <section className="py-32 text-center border-t border-black/5">
        <div className="mx-auto max-w-5xl px-6">
          <Label>Our mission</Label>
          <p className="text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
            Every Caribbean student should have access to a great teacher — regardless of where they live, what school they attend or what resources their family has.
          </p>
          <div className="mt-10 max-w-3xl mx-auto text-left space-y-4 text-[#555555]">
            <p>That&apos;s it. That&apos;s the whole thing.</p>
            <p>The Caribbean has no shortage of brilliant students or talented teachers. What it&apos;s always lacked is the infrastructure to connect them reliably, transparently and affordably at scale. That&apos;s what we&apos;re building. Not a homework tool. Not an AI chatbot dressed up as a tutor. Infrastructure for the 4 million secondary and primary students across 15+ CXC-aligned territories who deserve better than what the current system offers them by default.</p>
          </div>
        </div>
      </section>

      {/* AI + humans */}
      <section className="bg-[#F5F5F5] py-24 border-y border-black/5">
        <div className="mx-auto grid max-w-6xl gap-12 px-6 lg:grid-cols-2 lg:gap-20">
          <div className="space-y-4 text-[#555555]">
            <Label>Our take on AI</Label>
            <p>Human tutors do things no AI does. They notice when a student is anxious before an exam. They recognise the difference between a student who doesn&apos;t understand and a student who understands but doesn&apos;t believe they can do it. They adapt in real time to a face, a mood, a moment. That relationship between a great tutor and a student they know is irreplaceable.</p>
            <p>AI does things no human tutor can do at scale. It never forgets what a student struggled with three sessions ago. It can generate a practice set at exactly the right difficulty level in seconds. It can summarise a session, flag a knowledge gap and deliver a progress report to a parent in plain English before the student even logs off.</p>
            <p>On iTutor, both things are true at once. Tutors use AI tools to prepare better sessions, track progress more accurately and communicate more clearly. The tutor is still the tutor. The AI makes them better at it.</p>
          </div>
          <div className="flex flex-col gap-8">
            <h2 className="text-3xl font-semibold leading-tight sm:text-4xl">
              On AI and human teachers — we don&apos;t think they&apos;re at war.
            </h2>
            <div className="relative w-full overflow-hidden rounded-2xl" style={{aspectRatio:'4/3'}}>
              <Image src="/assets/about/online-tutoring.jpg" alt="Online tutoring session" fill className="object-cover" sizes="(max-width: 1024px) 100vw, 50vw" />
            </div>
          </div>
        </div>
      </section>

      {/* Tutor philosophy */}
      <S className="py-24">
        <div className="max-w-3xl">
          <Label>How we see tutors</Label>
          <h2 className="text-3xl font-bold sm:text-4xl">We think tutors are small business owners. Most platforms don&apos;t.</h2>
          <div className="mt-6 space-y-4 pl-6 border-l-4 border-[#199356] text-[#555555]">
            <p>The average tutoring platform treats tutors like gig workers — interchangeable, replaceable, kept at arm&apos;s length from their own clients and their own earnings.</p>
            <p>We built iTutor on a different premise: a great tutor is building something. A reputation. A client base. A livelihood. Our job is to give them the infrastructure to do that professionally.</p>
            <p>On iTutor, tutors control their rates, their availability and their relationships. The platform handles scheduling, payment processing, reviews and performance analytics. Tutors keep the lion&apos;s share of what they earn. And once we set a commission rate, we never reduce what tutors take home. That&apos;s a commitment, not a marketing line.</p>
          </div>
        </div>
      </S>

      {/* Stats */}
      <S className="pb-24">
        <div className="grid gap-5 sm:grid-cols-3">
          {[
            { number: '15+', descriptor: 'Caribbean territories reached by CXC-aligned tutors on the platform' },
            { number: 'Form 4', descriptor: 'The school year in which iTutor was built, launched and taken to market' },
            { number: '15–16', descriptor: 'The age of the founding team when iTutor went live' },
          ].map((s) => (
            <div key={s.number} className="rounded-2xl border border-black/10 bg-[#F5F5F5] p-8">
              <div className="text-5xl font-bold text-[#199356]">{s.number}</div>
              <p className="mt-3 text-sm text-[#555555]">{s.descriptor}</p>
            </div>
          ))}
        </div>
      </S>

      {/* Team */}
      <S className="pb-24">
        <Label>The team</Label>
        <h2 className="text-3xl font-bold sm:text-4xl">We&apos;re the students who stopped waiting.</h2>
        <p className="mt-4 max-w-2xl text-[#555555]">iTutor was built by a team of 16 year old students from Presentation College Chaguanas in Trinidad and Tobago who turned a real frustration into a real company.</p>
        <div className="mt-10 grid gap-5 sm:grid-cols-3">
          {TEAM.map((m) => (
            <div key={m.name} className="rounded-2xl border border-black/10 bg-[#F5F5F5] p-6">
              <div className="relative aspect-square w-full rounded-xl bg-black/5 mb-4 overflow-hidden">
                {m.image ? (
                  <Image
                    src={m.image}
                    alt={m.name}
                    fill
                    className="object-cover"
                    style={{ objectPosition: m.objectPosition }}
                    sizes="(max-width: 768px) 100vw, 33vw"
                  />
                ) : null}
              </div>
              <p className="text-lg font-semibold">{m.name}</p>
              <p className="text-sm text-[#199356] mt-0.5">{m.role}</p>
              <p className="mt-3 text-sm text-[#555555]">{m.bio}</p>
            </div>
          ))}
        </div>
      </S>

      {/* CTA */}
      <section className="pb-32 text-center border-t border-black/5 pt-16">
        <div className="mx-auto max-w-3xl px-6">
          <h2 className="text-3xl font-bold sm:text-4xl">The platform is live. The tutors are ready.</h2>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/student/find-tutors" className="rounded-full bg-[#199356] px-7 py-3.5 text-base font-semibold text-white transition-transform hover:scale-[1.03]">
              Find your tutor
            </Link>
            <Link href="/signup" className="rounded-full border border-black/25 px-7 py-3.5 text-base font-semibold text-black transition-colors hover:bg-black/5">
              Join as a tutor
            </Link>
          </div>
          <p className="mt-6 text-sm text-[#555555]">
            Press enquiries → <a href="mailto:press@myitutor.com" className="text-[#199356] hover:underline">press@myitutor.com</a>
            <span className="mx-3">·</span>
            Investor enquiries → <a href="mailto:invest@myitutor.com" className="text-[#199356] hover:underline">invest@myitutor.com</a>
          </p>
        </div>
      </section>
    </MarketingShell>
  );
}
