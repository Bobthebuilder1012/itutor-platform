'use client';
import { useState } from 'react';
import MarketingShell from '@/components/landing/MarketingShell';
import Link from 'next/link';
import { Check, X } from 'lucide-react';

const STUDENTS=[{title:'Find your tutor',body:"Search by subject, level (SEA, CSEC, CAPE), availability and rating. Every tutor profile shows their verified subjects, completed session count and real student reviews. Read before you book."},{title:'Book your session',body:"Pick a time slot from the tutor's live calendar. Choose how you want to meet — Zoom, Google Meet, WhatsApp or Google Classroom. All four are supported natively."},{title:'Pay securely',body:"Payment is collected at the time of booking. Funds are held until your session is completed — you're never paying for a session that doesn't happen. We support WiPay and local TTD payment methods. No international card required."},{title:'Learn',body:"Your tutor knows your syllabus. Show up. Do the work. Your dashboard tracks every session, every subject and every topic covered."},{title:'Review and track progress',body:"After every session, rate your tutor and leave a review. Your progress dashboard shows what you've covered, what's coming up and where to focus next."}];
const TUTORS=[{title:'Apply and build your profile',body:"Submit your application with your subjects, levels and qualifications. Your profile is your storefront. Our AI bio tool helps you write it."},{title:'Get verified',body:"We review your qualifications and approve you for the specific subjects and levels you're qualified to teach. Verified tutors get a badge. Verification means trust. Trust means bookings."},{title:'Set your availability and rates',body:"You control everything: your schedule, your rates, your session limits. Keep your calendar updated — tutors with live availability get booked immediately."},{title:'Accept bookings and teach',body:"Students book directly. Sessions run on Zoom, Google Meet, WhatsApp or Google Classroom — whichever you and the student prefer."},{title:'Get paid weekly',body:"Once your session completes, your earnings are queued. Payouts go out at the end of every week. No invoicing, no chasing, no delays."}];
const COMPARISON=[{f:'Caribbean curriculum aligned',i:true,w:false,g:false},{f:'Verified tutor profiles',i:true,w:false,g:'sometimes'},{f:'Parent visibility dashboard',i:true,w:false,g:false},{f:'Zoom, Meet, WhatsApp, Classroom',i:true,w:'partial',g:false},{f:'AI-assisted progress tracking',i:true,w:false,g:false},{f:'Local TTD payments via WiPay',i:true,w:'cash only',g:false},{f:'CSEC / CAPE / SEA specific',i:true,w:'depends',g:false},{f:'Weekly tutor payouts',i:true,w:'manual',g:'varies'}];
type Tab='students'|'tutors';
function V({v}:{v:boolean|string}){if(v===true)return <Check className="h-5 w-5 text-[#199356]"/>;if(v===false)return <X className="h-5 w-5 text-black/30"/>;return<span className="text-xs text-amber-600 capitalize">{v}</span>;}
export default function HowItWorksPage(){
  const[tab,setTab]=useState<Tab>('students');
  const steps=tab==='students'?STUDENTS:TUTORS;
  return(
    <MarketingShell>
      <section className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
        <h1 className="max-w-4xl text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">From search to session in minutes.</h1>
        <p className="mt-6 max-w-2xl text-lg text-[#555555]">Find a verified Caribbean tutor, book your slot, pay securely and learn on the platform built for your syllabus.</p>
      </section>
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="inline-flex rounded-full bg-[#F5F5F5] p-1 mb-14">
          {(['students','tutors'] as Tab[]).map(t=>(
            <button key={t} onClick={()=>setTab(t)} className={`rounded-full px-6 py-2.5 text-sm font-semibold capitalize transition-all ${tab===t?'bg-white text-black shadow-sm':'text-[#555555] hover:text-black'}`}>For {t==='students'?'Students':'Tutors'}</button>
          ))}
        </div>
        <div className="space-y-10">
          {steps.map((s,i)=>(
            <div key={i} className="grid grid-cols-[auto_1fr] gap-6 sm:gap-10">
              <div className="text-5xl font-bold leading-none text-[#199356] sm:text-6xl">{String(i+1).padStart(2,'0')}</div>
              <div><h3 className="text-xl font-bold sm:text-2xl">{s.title}</h3><p className="mt-2 max-w-2xl text-[#555555]">{s.body}</p></div>
            </div>
          ))}
          <div className="mt-12 max-w-2xl border-l-2 border-[#199356] pl-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#199356]">AI tools for {tab}</p>
            <ul className="mt-3 space-y-2 text-[#555555]">
              {(tab==='students'?['Session summaries delivered after every lesson','Subject gap analysis based on your session history','Past paper recommendations before examinations','Progress tracking across all subjects and tutors']:['Automated session notes and student progress summaries','Calendar and availability management','Student performance insights across sessions','Review and reputation analytics','AI-assisted profile and bio writing']).map((t,i)=><li key={i}>{t}</li>)}
            </ul>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <h2 className="text-3xl font-bold sm:text-4xl">Other platforms list tutors. We build tutoring businesses.</h2>
        <div className="mt-8 overflow-x-auto rounded-2xl border border-black/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/5"><tr>
              <th className="px-5 py-4 font-semibold text-black">Feature</th>
              <th className="px-5 py-4 font-semibold text-[#199356]">iTutor</th>
              <th className="px-5 py-4 font-semibold text-black">WhatsApp / Facebook</th>
              <th className="px-5 py-4 font-semibold text-black">Generic platforms</th>
            </tr></thead>
            <tbody>
              {COMPARISON.map((r,i)=>(
                <tr key={i} className={i%2?'bg-black/[0.02]':''}>
                  <td className="px-5 py-4 font-medium text-black">{r.f}</td>
                  <td className="px-5 py-4"><V v={r.i}/></td>
                  <td className="px-5 py-4"><V v={r.w}/></td>
                  <td className="px-5 py-4"><V v={r.g}/></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-6 pb-32 text-center">
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/student/find-tutors" className="rounded-full bg-[#199356] px-7 py-3.5 text-sm font-semibold text-white hover:scale-[1.03] transition-transform">Find a tutor</Link>
          <Link href="/signup" className="rounded-full border border-black/25 px-7 py-3.5 text-sm font-semibold text-black hover:border-[#199356] hover:text-[#199356] transition-colors">Join the platform</Link>
        </div>
      </section>
    </MarketingShell>
  );
}
