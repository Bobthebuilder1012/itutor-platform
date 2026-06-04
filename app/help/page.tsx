'use client';
import { useState } from 'react';
import MarketingShell from '@/components/landing/MarketingShell';
import { ChevronRight, ChevronDown, Search } from 'lucide-react';

const CATS=[
  {id:'getting-started',label:'Getting Started',desc:'Create your account, verify as a tutor, link a child\'s profile',articles:[
    {title:'How to create a student account',body:"1. Go to myitutor.com and select Sign Up.\n2. Choose Student as your account type.\n3. Enter your full name, email address and create a password.\n4. Verify your email address using the link sent to your inbox. Check your spam folder if it does not arrive within two minutes.\n5. Complete your profile: add your school year, the subjects you need help with and your general location.\n6. Your account is active. You can search for tutors immediately.\n\nCompleting your profile in full — including your examination level (SEA, CSEC or CAPE) — helps tutors understand your needs before your first session and improves the accuracy of your search results."},
    {title:'How to create a tutor account',body:"Tutor accounts require an application and a verification step before your profile is published.\n\n1. Go to myitutor.com and select Become a Tutor.\n2. Complete the tutor application form. Include your qualifications, the subjects you teach and the programme levels you are qualified to cover (SEA, CSEC, CAPE).\n3. Submit your application. Our team will review your details within two to five business days.\n4. You will receive an email confirming whether your application has been approved.\n5. Once approved, your profile is live and visible to students in search results.\n6. Set your availability in the Tutor Dashboard to begin receiving bookings.\n\nTutors with complete profiles — including a professional photo, detailed bio and specific subject listings — are booked significantly more often than incomplete profiles."},
    {title:'What is the tutor verification process?',body:"The tutor verification process is designed to protect students and maintain the quality standard of the iTutor platform.\n\nIdentity check: Confirming you are who you say you are, using a recognised form of identification.\n\nQualification review: Checking that your stated academic qualifications and teaching experience are accurate.\n\nProfile assessment: Reviewing your tutor bio, subject listings and overall profile presentation for quality and professionalism.\n\nSubject competency: For some subjects and levels, a brief subject knowledge assessment is required before approval is granted.\n\nAfter verification: Your profile is published with a verified badge visible to all students and parents."},
  ]},
  {id:'booking',label:'Booking Sessions',desc:'Search, book, reschedule, cancel and join sessions',articles:[
    {title:'How to search for a tutor',body:"1. Select Find a Tutor from the navigation or the homepage.\n2. Use the filters to narrow your results: Subject, Programme (SEA, CSEC, CAPE), Level, Availability, Rating and Session Format.\n3. Browse tutor profiles. Each profile displays the tutor's verified subjects, completed session count, rating and reviews.\n4. Select Book a Session on any tutor profile to proceed.\n\nSearch by your specific examination — for example, CSEC Chemistry rather than just Chemistry. If uncertain, shortlist two or three tutors and book a single trial session with each before committing."},
    {title:'How to book a session',body:"1. On a tutor's profile, select Book a Session.\n2. Choose your preferred date and time from the tutor's live availability calendar.\n3. Select your session format: Zoom, Google Meet, WhatsApp or Google Classroom.\n4. Add a note for the tutor. Include what you want to cover, where you are in the syllabus, any past papers or topics you want to focus on and your examination timeline.\n5. Review the session details and total price.\n6. Complete payment. Payment is held by the platform until your session is confirmed as completed.\n7. A booking confirmation is sent to your registered email address."},
    {title:'How to cancel a session',body:"To cancel a booking, go to your upcoming sessions in your student dashboard, select the session you wish to cancel and select Cancel Session. Cancellations made with adequate advance notice receive a full refund within 3–5 business days. Cancellations made within 24 hours of the session start time may be subject to the tutor's cancellation policy as listed on their profile.\n\nIf a tutor cancels your session, you receive a full automatic refund regardless of timing."},
    {title:'What happens if my tutor does not show up?',body:"If your tutor does not show up for a scheduled session, you will receive a full automatic refund. Tutor no-shows are tracked by the platform and directly affect the tutor's standing. Repeated no-shows result in review and potential removal from the platform.\n\nIf your automatic refund has not processed within 24 hours of the scheduled session time, contact support@myitutor.com with your booking reference."},
  ]},
  {id:'payments',label:'Payments & Refunds',desc:'How payments work, refund requests and billing',articles:[
    {title:'How payments work on iTutor',body:"Students pay at the time of booking. Payment is held by the platform and not released to the tutor until the session is completed — protecting students from paying for sessions that do not happen. iTutor supports WiPay and local TTD payment methods. No international card required. The price shown at booking is the total price paid — no hidden fees."},
    {title:'How to request a refund',body:"If a session did not take place due to a tutor no-show or platform error, a refund is issued automatically within 24 hours.\n\nFor cancellations with adequate advance notice, refunds are processed within 3–5 business days.\n\nFor session quality disputes, raise a complaint within 24 hours of the session ending through the platform's reporting feature or by emailing support@myitutor.com with your booking reference.\n\nAll refund requests are reviewed within two business days."},
    {title:'When do tutors get paid?',body:"Tutors are paid in weekly payouts processed at the end of each week. Once a session is confirmed as completed, earnings for that session are queued for the next weekly payout. There is no invoicing, no manual chasing and no delays beyond the weekly cycle. Tutors can view pending and completed earnings at any time in the Tutor Dashboard."},
  ]},
  {id:'for-tutors',label:'For Tutors',desc:'Profile setup, payouts, obligations and verification',articles:[
    {title:'How to set up your tutor profile',body:"Once your application is approved, log in to the Tutor Dashboard. Your profile has several sections to complete:\n\nBasic info: Your full name, profile photo and location.\n\nBio: A description of your teaching background, approach and specialisations. Use the AI bio assistant in the dashboard to help write this.\n\nSubjects and levels: List every subject and programme level you are approved to teach.\n\nRates: Set your session rate in TTD. You control your own pricing.\n\nAvailability: Set your weekly availability. Tutors with up-to-date calendars are booked immediately rather than waiting for back-and-forth."},
    {title:'How to manage your availability',body:"In the Tutor Dashboard, navigate to Availability. From there you can set your weekly recurring available hours, block specific dates or times when you are unavailable and update your availability at any time.\n\nKeep your availability current. Tutors with live, accurate availability calendars receive significantly more bookings than those who require students to message them before confirming a time."},
    {title:'What tutors are expected to deliver',body:"All tutors on iTutor are expected to: arrive on time for every session, prepare for each session based on the student's notes and syllabus requirements, communicate promptly with students through the platform and maintain a professional standard of conduct at all times.\n\nTutors who fall below the platform's minimum rating threshold, accumulate unresolved complaints or are found to have provided inaccurate qualification information are subject to re-review and potential removal."},
  ]},
  {id:'account',label:'Account & Profile',desc:'Password reset, profile updates and account deletion',articles:[
    {title:'How to reset your password',body:"1. Go to the login page at myitutor.com/login.\n2. Select Forgot password.\n3. Enter the email address associated with your account.\n4. A password reset link will be sent to that address within two minutes. Check your spam folder if it does not arrive.\n5. Follow the link and set a new password.\n\nIf you no longer have access to the email address on your account, contact support@myitutor.com with your name, your original email address and a description of the issue."},
    {title:'How to update your profile',body:"Log in to your account and go to Settings. From there you can update your display name and contact details, change your profile photo, edit your bio (tutors) or subject preferences (students) and update your password.\n\nChanges to your profile are saved immediately. Tutor profile updates that affect your verified subjects or qualifications require re-review before going live."},
    {title:'How to delete your account',body:"To delete your account, go to Settings → Account → Delete Account. You will be asked to confirm with your password. Account deletion is permanent — all profile data, session history and reviews are removed within 30 days, except payment records which are retained for legal and financial compliance purposes.\n\nIf you are a tutor with pending payouts, those will be processed before your account is closed. Contact support@myitutor.com if you have questions before deleting."},
  ]},
  {id:'technical',label:'Technical Issues',desc:'Meeting links, platform loading and email delivery',articles:[
    {title:'I am not receiving confirmation emails',body:"Check your spam or junk folder first — iTutor emails occasionally land there depending on your email provider's filters.\n\nIf the email is not in spam, verify that the email address on your account is correct in Settings → Account.\n\nIf you continue to have issues receiving emails, contact support@myitutor.com from your registered email address and we will resend the confirmation manually."},
    {title:'My meeting link is not working',body:"If your meeting link is not working: check that you are joining at the correct scheduled time, ensure the session has not been cancelled or rescheduled (check your dashboard), try copying the link directly from your booking confirmation email rather than clicking it and ensure Google Meet, Zoom or WhatsApp is installed and up to date if you are joining from a mobile device.\n\nIf the link still does not work, contact your tutor through the iTutor messaging system immediately and contact support@myitutor.com if the session is disrupted as a result."},
    {title:'The platform is not loading correctly',body:"Try refreshing the page (Ctrl+R or Cmd+R). Clear your browser cache and cookies. Try a different browser — iTutor is fully supported on Chrome, Firefox, Safari and Edge. Disable browser extensions that may interfere with the platform (ad blockers, privacy tools) and try again.\n\nIf the issue persists, email support@myitutor.com with a description of what you see and the browser and device you are using."},
  ]},
  {id:'safety',label:'Safety & Reporting',desc:'Report a concern, block a tutor, safeguarding',articles:[
    {title:'How to report a concern about a tutor or student',body:"To report a concern: go to the session in your booking history, select Report an Issue and complete the report form. For urgent safety concerns, email support@myitutor.com with the subject line URGENT: Safety Concern.\n\nAll reports are reviewed by a member of the senior team. If a report relates to the safety or welfare of a student, it is escalated immediately. Tutors subject to an active investigation are suspended from accepting new bookings until the investigation is resolved."},
    {title:'How to block a user',body:"To block a user on iTutor, go to their profile or your message thread with them and select Block. A blocked user cannot send you messages, view your profile or book sessions with you.\n\nBlocking a user does not cancel any existing upcoming sessions. If you need to cancel a session with a user you have blocked, do so through your bookings dashboard before blocking."},
    {title:'How iTutor handles safeguarding',body:"iTutor takes the safety of students very seriously. All tutors complete identity verification before their profile is published. Sessions run on reputable third-party platforms (Google Meet, Zoom) with no unmonitored one-to-one communication channels required.\n\nParents can view all session activity through the parent dashboard. Any tutor found to have behaved inappropriately with a student is permanently removed from the platform and, where appropriate, reported to the relevant authorities.\n\nIf you have a safeguarding concern, contact us immediately at support@myitutor.com."},
  ]},
];

const slug=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]+/g,'-');

function Article({title,body}:{title:string;body:string}){
  const[open,setOpen]=useState(false);
  return(
    <div className="border-b border-black/10">
      <button onClick={()=>setOpen(v=>!v)} className="flex w-full items-center justify-between py-4 text-left hover:text-[#199356] transition-colors">
        <span className="font-medium text-black">{title}</span>
        <ChevronDown className={`h-4 w-4 text-black/50 transition-transform ${open?'rotate-180':''}`}/>
      </button>
      {open&&<div className="pb-6 text-[#555555] leading-relaxed whitespace-pre-line">{body}</div>}
    </div>
  );
}

export default function HelpPage(){
  const[search,setSearch]=useState('');
  const lower=search.trim().toLowerCase();
  const filtered=lower?CATS.filter(c=>c.label.toLowerCase().includes(lower)||c.articles.some(a=>a.title.toLowerCase().includes(lower)||a.body.toLowerCase().includes(lower))):CATS;

  return(
    <MarketingShell>
      <section className="mx-auto max-w-5xl px-6 py-24 text-center sm:py-32">
        <h1 className="text-5xl font-bold leading-tight tracking-tight sm:text-6xl">How can we help you?</h1>
        <p className="mt-4 text-[#555555] max-w-xl mx-auto">Browse articles or search for answers. Can&apos;t find what you need? Email us directly.</p>
        <div className="mx-auto mt-8 flex max-w-2xl items-center gap-3 rounded-full border border-black/15 bg-[#F5F5F5] px-5 py-4">
          <Search className="h-5 w-5 text-black/50 shrink-0"/>
          <input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder='Search for answers… (e.g. "how do I book a session", "refund policy")' className="w-full bg-transparent text-base text-black placeholder:text-black/40 focus:outline-none"/>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-16">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CATS.map(c=>(
            <a key={c.id} href={`#${slug(c.label)}`} className="group flex items-start justify-between gap-3 rounded-2xl border border-black/10 bg-[#F5F5F5] p-6 transition-colors hover:border-[#199356]">
              <div><p className="font-semibold text-black">{c.label}</p><p className="mt-1 text-sm text-[#555555]">{c.desc}</p></div>
              <ChevronRight className="h-5 w-5 shrink-0 text-black/40 transition-transform group-hover:translate-x-1 group-hover:text-[#199356]"/>
            </a>
          ))}
        </div>
      </section>

      <div className="mx-auto max-w-4xl px-6 pb-24">
        {filtered.length===0&&<p className="py-12 text-center text-[#555555]">No articles match your search.</p>}
        {filtered.map(c=>(
          <section key={c.id} id={slug(c.label)} className="pt-16 first:pt-0">
            <h2 className="text-2xl font-bold sm:text-3xl">{c.label}</h2>
            <p className="mt-1 text-sm text-[#555555]">{c.desc}</p>
            <div className="mt-6">
              {c.articles.filter(a=>!lower||a.title.toLowerCase().includes(lower)||a.body.toLowerCase().includes(lower)).map((a,i)=><Article key={i} title={a.title} body={a.body}/>)}
            </div>
          </section>
        ))}
      </div>

      <section className="border-t border-black/5 bg-[#F5F5F5] py-20 text-center">
        <h2 className="text-2xl font-bold sm:text-3xl">Still need help?</h2>
        <p className="mt-3 text-[#555555]">Our support team is available Monday – Friday, 8 AM – 6 PM AST.</p>
        <a href="mailto:support@myitutor.com" className="mt-6 inline-block text-lg font-semibold text-[#199356] hover:underline">support@myitutor.com</a>
      </section>
    </MarketingShell>
  );
}
