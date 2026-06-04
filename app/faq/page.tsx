'use client';
import { useState } from 'react';
import MarketingShell from '@/components/landing/MarketingShell';
import { Search } from 'lucide-react';

const FAQ=[
  {id:'about',label:'About iTutor',questions:[
    {q:'What is iTutor?',a:"iTutor is a Caribbean tutoring marketplace that connects students with verified tutors across SEA, CSEC and CAPE subjects. Built by Form 4 students in Trinidad and Tobago, the platform is aligned to CXC syllabuses across 15+ Caribbean territories. Students find and book tutors directly, pay securely through the platform and track their progress through a personal dashboard. Parents get a separate dashboard with full visibility into their child's sessions and progress. Tutors manage their schedule, rates, reviews and earnings through an agentic CRM built specifically for Caribbean educators. iTutor is operated by Astronova Technologies Ltd."},
    {q:'Where is iTutor available?',a:"iTutor is live and serving students in Trinidad and Tobago, with tutors available across CSEC and CAPE subjects. The platform is designed for the wider Caribbean covering 15+ territories where CXC-aligned syllabuses are used and will expand territory by territory."},
    {q:'Is iTutor free to use?',a:"Creating an account on iTutor is free for both students and tutors. Students pay only for the sessions they book — there is no subscription or registration fee required to access the core platform. Tutors earn from completed sessions with a transparent platform commission disclosed at onboarding."},
    {q:'Who built iTutor?',a:"iTutor was built by a team of Form 4 students from Presentation College Chaguanas in Trinidad and Tobago, aged 15 to 16 at the time of launch. The platform is operated by Astronova Technologies Ltd, incorporated in Trinidad and Tobago. The founding team — Liam Rampersad (Founder and CEO), Jovan Goodluck (CTO and Co-Founder), Arjun Rambally (CFO and Co-Founder) and Bradley Ramlochan (Marketing Manager) — built the platform after experiencing firsthand the lack of accountability and access in the Caribbean tutoring market."},
    {q:'Is iTutor aligned to the CXC syllabus?',a:"Yes. iTutor is built specifically for Caribbean students sitting CXC examinations including CSEC, CAPE and SEA. Tutors are verified against specific programme levels and subjects. The platform covers 15+ Caribbean territories where CXC-aligned syllabuses are used."},
  ]},
  {id:'safety',label:'Safety & Verification',questions:[
    {q:'Is iTutor safe for students?',a:"Yes. Tutor verification, public reviews, parent visibility and a dedicated reporting and investigation process are all designed with student safety at the centre. Every tutor has completed our verification process. Parents can monitor all session activity through their dashboard. Any concern about student safety is escalated immediately to our senior team. Tutors found to have behaved inappropriately are suspended immediately pending investigation and permanently removed if the concern is substantiated."},
    {q:'Who are the tutors on iTutor?',a:"iTutors are verified Caribbean educators including experienced schoolteachers, university students, retired teachers and subject specialists from across the region. Every tutor completes a verification process before their profile is published. Verification includes identity confirmation, qualification review and profile quality assessment. Tutors are approved only for the specific subjects and levels they demonstrate knowledge of."},
    {q:'How does iTutor verify tutors?',a:"All tutors go through an application and verification process before they are approved to take bookings. Verification includes identity confirmation, review of stated qualifications and subject expertise and an assessment of profile quality and professionalism. Tutors are only approved for subjects and levels they have demonstrated knowledge of. Once verified, tutors receive a badge on their profile visible to all students and parents."},
    {q:'What happens if a tutor behaves inappropriately?',a:"Any tutor found to have behaved inappropriately is suspended from the platform immediately pending investigation and permanently removed if the concern is substantiated. If a concern involves potential criminal conduct, we co-operate fully with the relevant authorities. To report a concern, go to the session in your booking history and select Report an Issue, or email support@myitutor.com with the subject line URGENT: Safety Concern."},
  ]},
  {id:'finding-a-tutor',label:'Finding a Tutor',questions:[
    {q:'How do I find the right tutor for my subject?',a:"Go to the search page and filter by subject, programme level (SEA, CSEC or CAPE), availability and rating. Every tutor profile shows their verified subjects and levels, completed session count and reviews from real students. Filter by your specific examination — for example, CSEC Chemistry rather than just Chemistry. When reading reviews, look specifically for reviews from students sitting the same examination as you. If unsure, book a single trial session with two or three tutors before committing to a regular arrangement."},
    {q:'Can I switch tutors if it is not working?',a:"Yes. You are never locked in to a specific tutor on iTutor. If a tutor is not the right fit — whether due to teaching style, personality or scheduling — you can stop booking with them and find another tutor on the platform at any time."},
    {q:'Can I request a specific tutor I have heard about?',a:"Yes. If you know a tutor's name or profile, you can search for them directly. You can also follow a direct booking link shared by the tutor. Returning students can rebook previous tutors directly from their session history."},
    {q:'How many sessions should I book to see results?',a:"For general subject improvement, consistent weekly sessions over a term tend to produce the most measurable results. For exam prep in the six to eight weeks before examinations, more frequent sessions — two to three per week focused on past papers and exam technique — are typically most effective. Your tutor will advise on a session cadence based on your specific needs."},
  ]},
  {id:'sessions',label:'Sessions & Formats',questions:[
    {q:'What session formats does iTutor support?',a:"iTutor supports sessions via Zoom, Google Meet, WhatsApp and Google Classroom. All four platforms are supported natively. Your booking confirmation includes the session link or joining details automatically. Students and tutors choose their preferred format at the time of booking."},
    {q:'What happens if my tutor does not show up?',a:"If your tutor does not show up for a scheduled session, you will receive a full automatic refund. Tutor no-shows are tracked by the platform and directly affect the tutor's standing. Repeated no-shows result in review and potential removal. If your automatic refund has not processed within 24 hours of the scheduled session time, contact support@myitutor.com with your booking reference."},
    {q:'What if I have connection issues during a session?',a:"Contact your tutor through the iTutor messaging system immediately to let them know. If the session was materially disrupted by technical issues on the platform's side, contact support@myitutor.com with your booking reference within 24 hours. We review all reported technical disruptions."},
  ]},
  {id:'payments',label:'Payments & Refunds',questions:[
    {q:'How do payments work on iTutor?',a:"Students pay at the time of booking. Payment is held by the platform and not released to the tutor until the session is completed — protecting students from paying for sessions that do not happen. iTutor supports WiPay and local TTD payment methods. No international card required. The price shown at booking is the total price paid — no hidden fees."},
    {q:'When do tutors get paid?',a:"Tutors are paid in weekly payouts processed at the end of each week. Once a session is confirmed as completed, earnings for that session are queued for the next weekly payout. No invoicing, no chasing, no delays. Tutors can view pending and completed earnings at any time in the Tutor Dashboard."},
    {q:'What payment methods are accepted?',a:"iTutor accepts payments through WiPay, which supports local Caribbean debit cards and bank transfers. No international credit card is required."},
    {q:'What if I want a refund?',a:"If a session did not take place due to a tutor no-show or platform error, a refund is issued automatically. Cancellations with adequate advance notice receive a full refund within 3–5 business days. Session quality disputes can be raised within 24 hours of the session ending through the platform. Contact support@myitutor.com with your booking reference for any payment issue."},
    {q:'Are there any hidden fees?',a:"No. The price displayed at the time of booking is the total amount charged. There are no booking fees, administration fees or platform surcharges added at checkout."},
  ]},
  {id:'for-tutors',label:'For Tutors',questions:[
    {q:'How do I join iTutor as a tutor?',a:"Go to myitutor.com and select Become a Tutor. Complete the tutor application form with your qualifications, the subjects you teach and the levels you are qualified for. Our team reviews applications within two to five business days. Once approved, your profile is live and you can begin accepting bookings."},
    {q:'What commission does iTutor take?',a:"iTutor takes a transparent platform commission from each completed session. The commission rate is clearly disclosed at onboarding before you set your rates. Once your rate is set, we do not reduce what tutors take home — that is a platform commitment."},
    {q:'Can I set my own rates?',a:"Yes. Tutors set their own session rates. You can adjust your rate at any time. The platform commission is fixed at onboarding and does not change — your take-home percentage is stable."},
  ]},
  {id:'ai',label:'AI on iTutor',questions:[
    {q:'How does iTutor use AI?',a:"iTutor uses AI to generate session summaries and progress reports for students and parents, help tutors write profile bios and session notes, provide students with subject gap analysis based on their session history and surface past paper recommendations before examinations. AI on iTutor supports human tutors — it does not conduct sessions or replace the tutoring relationship. All AI-generated content on the platform is clearly marked as such."},
    {q:'Does AI replace tutors on iTutor?',a:"No. Tutors are the core of the iTutor platform. AI tools are designed to make tutors more effective and students more prepared — not to substitute for the tutoring relationship. The learning happens between a student and their tutor. AI makes that relationship more informed and more trackable."},
    {q:'Can AI complete my SBA for me on iTutor?',a:"No. iTutor does not facilitate academic dishonesty of any kind. Our AI tools support students in understanding SBA requirements and structuring their own work — they do not generate SBA content for submission. Tutors on the platform are bound by academic integrity standards."},
    {q:'Is my data safe when iTutor uses AI?',a:"Yes. Data used for AI features on iTutor is processed in accordance with our Privacy Policy. Student data is never used to train external AI models without explicit consent. Session data is handled securely and is accessible only to the parties involved in that session."},
  ]},
];

const slug=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]+/g,'-');

function Highlight({text,term}:{text:string;term:string}){
  if(!term)return<>{text}</>;
  const parts=text.split(new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi'));
  return<>{parts.map((p,i)=>p.toLowerCase()===term.toLowerCase()?<mark key={i} className="bg-amber-200 text-black rounded px-0.5">{p}</mark>:<span key={i}>{p}</span>)}</>;
}

export default function FaqPage(){
  const[query,setQuery]=useState('');
  const lower=query.trim().toLowerCase();
  const filtered=lower?FAQ.filter(c=>c.label.toLowerCase().includes(lower)||c.questions.some(q=>q.q.toLowerCase().includes(lower)||q.a.toLowerCase().includes(lower))):FAQ;

  return(
    <MarketingShell>
      {/* JSON-LD for SEO */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify({
        "@context":"https://schema.org","@type":"FAQPage",
        mainEntity:FAQ.flatMap(c=>c.questions.map(q=>({
          "@type":"Question","name":q.q,
          acceptedAnswer:{"@type":"Answer","text":q.a}
        })))
      })}} />

      <section className="mx-auto max-w-6xl px-6 py-24 sm:py-28">
        <h1 className="text-5xl font-bold leading-tight tracking-tight sm:text-6xl lg:text-7xl">Every question, answered properly.</h1>
        <p className="mt-6 max-w-2xl text-lg text-[#555555]">If the answer isn&apos;t here, email us at <a href="mailto:support@myitutor.com" className="text-[#199356] underline-offset-4 hover:underline">support@myitutor.com</a> and we&apos;ll get back to you.</p>
        <div className="mx-auto mt-10 flex max-w-2xl items-center gap-3 rounded-full border border-black/15 bg-[#F5F5F5] px-5 py-4">
          <Search className="h-5 w-5 text-black/50 shrink-0"/>
          <input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search questions…" className="w-full bg-transparent text-base text-black placeholder:text-black/40 focus:outline-none"/>
        </div>
        <nav className="mt-8 flex flex-wrap gap-2">
          {FAQ.map(c=>(
            <a key={c.id} href={`#${c.id}`} className="rounded-full border border-black/15 px-4 py-2 text-sm text-black/80 transition-colors hover:border-[#199356] hover:text-[#199356]">{c.label}</a>
          ))}
        </nav>
      </section>

      {/* All answers visible in DOM — no display:none — for full SEO indexing */}
      <div className="mx-auto max-w-4xl px-6 pb-32">
        {lower&&(<p className="mb-2 text-sm text-[#555555]">{filtered.reduce((n,c)=>n+(lower?c.questions.filter(q=>q.q.toLowerCase().includes(lower)||q.a.toLowerCase().includes(lower)).length:c.questions.length),0)} result{filtered.reduce((n,c)=>n+(lower?c.questions.filter(q=>q.q.toLowerCase().includes(lower)||q.a.toLowerCase().includes(lower)).length:c.questions.length),0)!==1?'s':''} for &ldquo;{query}&rdquo;</p>)}
        {filtered.length===0&&<p className="py-12 text-center text-[#555555]">No questions match your search.</p>}
        {filtered.map(cat=>{
          const qs=lower?cat.questions.filter(q=>q.q.toLowerCase().includes(lower)||q.a.toLowerCase().includes(lower)):cat.questions;
          if(lower&&qs.length===0)return null;
          return(
            <section key={cat.id} id={cat.id} className={lower ? "pt-10" : "pt-24 first:pt-0"}>
              <h2 className="text-3xl font-bold sm:text-4xl">{cat.label}</h2>
              <div className="mt-8 divide-y divide-black/10">
                {qs.map((q,i)=>(
                  <div key={i} className="py-8">
                    <h3 className="text-lg font-semibold text-black"><Highlight text={q.q} term={lower}/></h3>
                    <p className="mt-3 leading-relaxed text-[#555555]"><Highlight text={q.a} term={lower}/></p>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </MarketingShell>
  );
}
