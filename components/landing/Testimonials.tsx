'use client';

import { motion } from 'framer-motion';
import { Star } from 'lucide-react';
import { Avatar } from './Avatar';

type Testimonial = { name: string; role: string; quote: string; hue: number };

const testimonials: Testimonial[] = [
  { name: 'Dexter Cummings', role: 'CSEC student · Arima', hue: 12, quote: 'Maths CSEC paper 2 was my nightmare. Spent two weeks on iTutor doing past papers every night. PASSED with a Grade I.' },
  { name: 'Renee Marcano', role: 'Parent · San Fernando', hue: 320, quote: 'How yuh mean this app free to try?? The quality of teaching is better than tutors charging $300 an hour. Trinis need to know about this.' },
  { name: 'Keston Andrews', role: 'CSEC retake', hue: 200, quote: 'Failed CSEC twice. Started using iTutor seriously for third attempt. PASSED. Crying actual tears right now.' },
  { name: 'Vandana Persad', role: 'Parent · Chaguanas', hue: 280, quote: 'My daughter was getting lost about Pure Maths CAPE. Three weeks on iTutor and she actually smiling when she does maths now.' },
  { name: 'Sherese Roberts', role: 'SEA parent', hue: 145, quote: 'Integrated Science was holding back my child whole SEA score. iTutor explain every topic so clearly. She ready now.' },
  { name: 'Sunita Ramsaran', role: 'Parent · Couva', hue: 35, quote: 'My twin boys both using iTutor for CSEC. One doing sciences, one doing business subjects. App handle both no problem.' },
  { name: 'Marlon Ifill', role: 'CSEC student · Tobago', hue: 100, quote: 'Agricultural Science CSEC — try find a tutor for THAT in Trinidad. iTutor saved me completely.' },
  { name: 'Geeta Maharaj', role: 'CSEC student', hue: 60, quote: 'History CSEC essay structure was confusing meh bad. iTutor break down EXACTLY how to structure arguments.' },
  { name: 'Dane Alexis', role: 'CAPE student', hue: 250, quote: 'From failing every Chemistry test to actually understanding mol calculations. If I could reach, anybody could reach.' },
  { name: 'Latoya Ferguson', role: 'SEA parent', hue: 15, quote: 'Not going to lie I was skeptical at first. But my daughter results speak for themselves. SEA prep done differently.' },
  { name: 'Lystra Thomas', role: 'Parent · Diego Martin', hue: 330, quote: 'We didn\'t have money for a private lessons tutor this year. iTutor step in and fill that gap completely. My son ready for SEA.' },
  { name: 'Omari Thomas', role: 'CSEC student', hue: 175, quote: 'Chemistry CSEC redox reactions explanation on iTutor is clearer than anything on YouTube. This is what learning should feel like.' },
  { name: 'Priya Ramkhelawan', role: 'Parent · Princes Town', hue: 290, quote: 'Second time using iTutor for my younger one after it worked for my first child. Absolute trust in this platform.' },
  { name: 'Akeem Joseph', role: 'Parent · Port of Spain', hue: 220, quote: 'If you have SEA coming up and you ain\'t on iTutor yet, wham is wrong with you? Best decision we made this whole year.' },
  { name: 'Farouk Mohammed', role: 'CAPE Physics', hue: 45, quote: 'Physics mechanics had my head spinning. iTutor walked me through it step by step. Grade I on the cards.' },
  { name: 'Anika Singh', role: 'CSEC English', hue: 130, quote: 'English A SBA was killing me. The structure tips alone were worth it. Pulled up to a Grade II from a fail.' },
];

function Card({ t }: { t: Testimonial }) {
  return (
    <article className="mx-3 flex w-[320px] shrink-0 flex-col gap-3 rounded-2xl border border-border bg-white p-5 shadow-card transition-transform hover:-translate-y-1 sm:w-[360px]">
      <div className="flex items-center gap-3">
        <Avatar name={t.name} hue={t.hue} size={42} />
        <div>
          <p className="text-sm font-semibold text-ink">{t.name}</p>
          <p className="text-xs text-ink-muted">{t.role}</p>
        </div>
        <div className="ml-auto flex">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} className="h-3.5 w-3.5 fill-coral text-coral" />
          ))}
        </div>
      </div>
      <p className="text-sm leading-relaxed text-ink/80">{t.quote}</p>
    </article>
  );
}

function Row({ items, reverse = false }: { items: Testimonial[]; reverse?: boolean }) {
  const dup = [...items, ...items];
  return (
    <div className="marquee-mask group overflow-hidden">
      <div
        className="flex w-max"
        style={{
          animation: `${reverse ? 'marquee-reverse' : 'marquee'} ${reverse ? 60 : 55}s linear infinite`,
        }}
      >
        {dup.map((t, i) => (
          <Card key={i} t={t} />
        ))}
      </div>
    </div>
  );
}

export default function Testimonials() {
  const half = Math.ceil(testimonials.length / 2);
  const row1 = testimonials.slice(0, half);
  const row2 = testimonials.slice(half);

  return (
    <section id="testimonials" className="relative bg-mint py-20 sm:py-28">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-white to-transparent" />
      <div className="mx-auto max-w-6xl px-5 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center"
        >
          <span className="inline-flex items-center rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold uppercase tracking-wider text-forest">
            Real reviews
          </span>
          <h2 className="mt-4 text-4xl font-bold text-ink sm:text-5xl lg:text-6xl">
            What Real Students &amp;<br />
            Parents Are <span className="text-gradient-brand">Saying</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-ink-muted">
            SEA · CSEC · CAPE — real voices, real results from across Trinidad &amp; Tobago.
          </p>
        </motion.div>
      </div>

      <div className="mt-12 space-y-5">
        <Row items={row1} />
        <Row items={row2} reverse />
      </div>
    </section>
  );
}
