'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, Search, GraduationCap, BookOpen, Sparkles,
  Sunrise, Sun, Sunset, Moon, Check,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase/client';

const SUBJECTS = {
  SEA: [
    'Mathematics', 'English Language Arts', 'Creative Writing', 'Science',
    'Social Studies', 'Comprehension', 'Grammar', 'Spelling',
  ],
  CSEC: [
    'Mathematics', 'Additional Mathematics', 'English A', 'English B', 'Physics',
    'Chemistry', 'Biology', 'Integrated Science', 'Human & Social Biology',
    'Geography', 'History', 'Information Technology', 'Principles of Business',
    'Principles of Accounts', 'Economics', 'Spanish', 'French', 'Social Studies',
    'Religious Education', 'Office Administration', 'Visual Arts', 'Music',
    'Physical Education', 'Agricultural Science', 'Food & Nutrition',
    'Technical Drawing', 'EDPM',
  ],
  CAPE: [
    'Pure Mathematics', 'Applied Mathematics', 'Physics', 'Chemistry', 'Biology',
    'Computer Science', 'Information Technology', 'Accounting', 'Economics',
    'Management of Business', 'Law', 'Sociology', 'Caribbean Studies',
    'Communication Studies', 'History', 'Geography', 'Literatures in English',
    'Spanish', 'French', 'Environmental Science', 'Agricultural Science',
    'Digital Media', 'Performing Arts', 'Visual Arts', 'Tourism',
    'Entrepreneurship', 'Physical Education & Sport',
  ],
} as const;

type Level = keyof typeof SUBJECTS;

const LEVELS: { key: Level; label: string; icon: any }[] = [
  { key: 'SEA', label: 'SEA', icon: Sparkles },
  { key: 'CSEC', label: 'CSEC', icon: BookOpen },
  { key: 'CAPE', label: 'CAPE', icon: GraduationCap },
];

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const TIME_GROUPS: {
  key: 'morning' | 'afternoon' | 'evening' | 'night';
  label: string;
  icon: any;
  bands: { key: string; label: string }[];
}[] = [
  { key: 'morning', label: 'Morning', icon: Sunrise, bands: [{ key: '6-9am', label: '6–9 AM' }, { key: '9-12am', label: '9 AM – 12 PM' }] },
  { key: 'afternoon', label: 'Afternoon', icon: Sun, bands: [{ key: '12-3pm', label: '12–3 PM' }, { key: '3-6pm', label: '3–6 PM' }] },
  { key: 'evening', label: 'Evening', icon: Sunset, bands: [{ key: '6-9pm', label: '6–9 PM' }, { key: '9-12pm', label: '9 PM – 12 AM' }] },
  { key: 'night', label: 'Late night', icon: Moon, bands: [{ key: '12-3am', label: '12–3 AM' }, { key: '3-6am', label: '3–6 AM' }] },
];

const INSPIRE_WORDS = ['inspire', 'challenge', 'support', 'uplift', 'guide', 'encourage', 'spark', 'elevate'];

const HIST = [2, 4, 7, 11, 16, 22, 30, 38, 44, 46, 42, 36, 28, 22, 16, 11, 8, 6, 4, 3, 2];

function DualRangeSlider({
  min, max, lo, hi, onChange,
}: {
  min: number; max: number; lo: number; hi: number;
  onChange: (lo: number, hi: number) => void;
}) {
  const pct = (v: number) => ((v - min) / (max - min)) * 100;

  return (
    <div className="relative h-8 select-none touch-none">
      {/* Track */}
      <div className="absolute inset-0 flex items-center px-0">
        <div className="relative w-full h-2 bg-gray-200 rounded-full">
          <div
            className="absolute h-full bg-gray-900 rounded-full"
            style={{ left: `${pct(lo)}%`, right: `${100 - pct(hi)}%` }}
          />
        </div>
      </div>

      {/* Overlaid inputs */}
      <input
        type="range" min={min} max={max} step={10} value={lo}
        onChange={(e) => { const v = Math.min(Number(e.target.value), hi - 10); onChange(v, hi); }}
        className="absolute inset-0 w-full opacity-0 cursor-pointer"
        style={{ zIndex: lo > max - 20 ? 5 : 3 }}
      />
      <input
        type="range" min={min} max={max} step={10} value={hi}
        onChange={(e) => { const v = Math.max(Number(e.target.value), lo + 10); onChange(lo, v); }}
        className="absolute inset-0 w-full opacity-0 cursor-pointer"
        style={{ zIndex: 4 }}
      />

      {/* Visual thumbs */}
      <div className="absolute inset-0 pointer-events-none flex items-center">
        <div className="relative w-full">
          <div
            className="absolute w-6 h-6 rounded-full bg-white border-2 border-gray-900 shadow -translate-x-1/2 -translate-y-1/2 top-1/2"
            style={{ left: `${pct(lo)}%` }}
          />
          <div
            className="absolute w-6 h-6 rounded-full bg-white border-2 border-gray-900 shadow -translate-x-1/2 -translate-y-1/2 top-1/2"
            style={{ left: `${pct(hi)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function BudgetSlider({ value, onChange }: { value: [number, number]; onChange: (v: [number, number]) => void }) {
  const MIN = 0, MAX = 1000;
  const [lo, hi] = value;
  return (
    <div>
      <div className="relative h-24 flex items-end gap-0.5">
        {HIST.map((h, i) => {
          const v = MIN + ((MAX - MIN) * i) / (HIST.length - 1);
          const inRange = v >= lo - 25 && v <= hi + 25;
          return (
            <div
              key={i}
              className={cn('flex-1 rounded-t-sm transition-colors', inRange ? 'bg-itutor-green' : 'bg-green-100')}
              style={{ height: `${h * 1.6}px` }}
            />
          );
        })}
      </div>
      <div className="mt-3">
        <DualRangeSlider min={MIN} max={MAX} lo={lo} hi={hi} onChange={(l, h) => onChange([l, h])} />
      </div>
      <div className="grid grid-cols-2 gap-6 mt-8">
        <div>
          <div className="text-xs text-gray-500 mb-1">Minimum</div>
          <div className="rounded-xl border border-gray-200 px-3 py-2.5 font-semibold text-gray-900">TTD ${lo}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">Maximum</div>
          <div className="rounded-xl border border-gray-200 px-3 py-2.5 font-semibold text-gray-900">TTD ${hi}{hi >= MAX ? '+' : ''}</div>
        </div>
      </div>
    </div>
  );
}

export default function StudentOnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<0 | 1 | 2 | 3 | 4>(0);
  const [level, setLevel] = useState<Level>('CSEC');
  const [subjects, setSubjects] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [budget, setBudget] = useState<[number, number]>([100, 600]);
  const [days, setDays] = useState<string[]>([]);
  const [openTimeGroup, setOpenTimeGroup] = useState<string | null>(null);
  const [timeBands, setTimeBands] = useState<string[]>([]);
  const [wordIdx, setWordIdx] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.replace('/login');
    });
  }, [router]);

  useEffect(() => {
    if (step !== 4) return;
    const interval = setInterval(() => setWordIdx(n => (n + 1) % INSPIRE_WORDS.length), 700);
    return () => clearInterval(interval);
  }, [step]);

  useEffect(() => {
    if (step === 4) {
      const t = setTimeout(() => {
        router.push('/student/find-tutors');
      }, 2400);
      return () => clearTimeout(t);
    }
  }, [step, router]);

  const toggle = <T extends string>(arr: T[], v: T, set: (a: T[]) => void) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const filteredSubjects = (SUBJECTS[level] as readonly string[]).filter(
    (s) => !search || s.toLowerCase().includes(search.toLowerCase())
  );

  const STEP_COUNT = 4;

  if (step === 4) {
    return (
      <div className="min-h-screen bg-itutor-green flex items-center justify-center px-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-5 max-w-3xl"
        >
          <motion.div
            animate={{ rotate: [0, 8, -6, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            className="shrink-0"
          >
            <img src="/assets/logo/itutor-logo-new.png" alt="iTutor" className="h-16 w-auto" />
          </motion.div>
          <h1 className="text-3xl sm:text-5xl font-bold text-white leading-tight">
            Finding tutors who will
            <br />
            <AnimatePresence mode="wait">
              <motion.span
                key={wordIdx}
                initial={{ y: 14, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -14, opacity: 0 }}
                transition={{ duration: 0.35 }}
                className="inline-block underline decoration-white/50 underline-offset-4"
              >
                {INSPIRE_WORDS[wordIdx]}
              </motion.span>
            </AnimatePresence>
            {' '}you.
          </h1>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="px-5 py-4 border-b border-gray-200 flex items-center justify-between max-w-3xl mx-auto w-full">
        {step > 0 ? (
          <button
            onClick={() => setStep((s) => (s - 1) as 0 | 1 | 2 | 3)}
            className="inline-flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-gray-900"
          >
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
        ) : (
          <Link href="/" className="inline-flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-gray-900">
            <ChevronLeft className="w-4 h-4" /> Home
          </Link>
        )}
        <img src="/assets/logo/itutor-logo-new.png" alt="iTutor" className="h-8 w-auto" />
        <div className="text-xs font-semibold text-gray-500">Step {step + 1} of {STEP_COUNT}</div>
      </header>

      {/* Progress bar */}
      <div className="h-1 bg-gray-100">
        <div
          className="h-full bg-itutor-green transition-all duration-500"
          style={{ width: `${((step + 1) / STEP_COUNT) * 100}%` }}
        />
      </div>

      <main className="flex-1 flex items-start justify-center px-5 py-10">
        <AnimatePresence mode="wait">

          {/* STEP 0 — subjects */}
          {step === 0 && (
            <motion.div
              key="s0"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              className="w-full max-w-2xl"
            >
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 text-center">
                What would you like to learn?
              </h2>
              <p className="text-center text-gray-500 mt-2">
                Pick your exam level, then choose one or more subjects.
              </p>

              {/* Level tabs */}
              <div className="mt-8 flex justify-center">
                <div className="inline-flex rounded-full bg-gray-100 p-1">
                  {LEVELS.map((l) => {
                    const Icon = l.icon;
                    const active = level === l.key;
                    return (
                      <button
                        key={l.key}
                        onClick={() => { setLevel(l.key); setSearch(''); }}
                        className={cn(
                          'inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold transition',
                          active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
                        )}
                      >
                        <Icon className="w-4 h-4" />{l.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Search */}
              <div className="relative mt-6">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={`Search ${level} subjects…`}
                  className="w-full pl-11 pr-4 py-3 rounded-2xl border border-gray-200 bg-white text-sm outline-none focus:border-itutor-green focus:ring-2 focus:ring-green-100"
                />
              </div>

              {/* Selected subjects chips */}
              {subjects.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {subjects.map((s) => (
                    <button
                      key={s}
                      onClick={() => toggle(subjects, s, setSubjects)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-green-100 text-green-800 text-xs font-bold px-3 py-1.5"
                    >
                      {s} <span className="opacity-60">✕</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Subject list */}
              <div className="mt-4 rounded-2xl border border-gray-200 max-h-[360px] overflow-y-auto divide-y divide-gray-100">
                {filteredSubjects.length === 0 ? (
                  <div className="p-6 text-center text-sm text-gray-500">
                    No subjects match &ldquo;{search}&rdquo;.
                  </div>
                ) : (
                  filteredSubjects.map((s) => {
                    const selected = subjects.includes(s);
                    return (
                      <button
                        key={s}
                        onClick={() => toggle(subjects, s, setSubjects)}
                        className={cn(
                          'w-full text-left px-5 py-3.5 text-sm font-medium hover:bg-gray-50 transition flex items-center justify-between',
                          selected && 'bg-green-50 text-gray-900'
                        )}
                      >
                        <span>{s}</span>
                        {selected && <Check className="w-4 h-4 text-itutor-green" />}
                      </button>
                    );
                  })
                )}
              </div>

              <button
                onClick={() => setStep(1)}
                disabled={subjects.length === 0}
                className={cn(
                  'mt-8 w-full py-4 rounded-full font-bold text-base transition',
                  subjects.length > 0
                    ? 'bg-itutor-green text-white hover:bg-emerald-700'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                )}
              >
                Continue{subjects.length > 0 && ` (${subjects.length} selected)`}
              </button>
            </motion.div>
          )}

          {/* STEP 1 — budget */}
          {step === 1 && (
            <motion.div
              key="s1"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              className="w-full max-w-2xl"
            >
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 text-center">
                What&apos;s your budget?
              </h2>
              <p className="text-center text-gray-500 mt-2">Hourly rate range in TTD (Trinidad & Tobago Dollars)</p>
              <div className="mt-10">
                <BudgetSlider value={budget} onChange={setBudget} />
              </div>
              <button
                onClick={() => setStep(2)}
                className="mt-10 w-full py-4 rounded-full bg-itutor-green text-white font-bold text-base hover:bg-emerald-700 transition"
              >
                Continue
              </button>
            </motion.div>
          )}

          {/* STEP 2 — availability */}
          {step === 2 && (
            <motion.div
              key="s2"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              className="w-full max-w-2xl"
            >
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 text-center">
                When can you take lessons?
              </h2>
              <p className="text-center text-gray-500 mt-2">
                Tap a time of day to see specific slots.
              </p>

              {/* Days */}
              <div className="mt-8">
                <div className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Days</div>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map((d) => {
                    const active = days.includes(d);
                    return (
                      <button
                        key={d}
                        onClick={() => toggle(days, d, setDays)}
                        className={cn(
                          'px-5 py-2.5 rounded-2xl border-2 text-sm font-semibold transition',
                          active
                            ? 'border-gray-900 bg-gray-900 text-white'
                            : 'border-gray-200 text-gray-900 hover:border-gray-400'
                        )}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Times */}
              <div className="mt-8">
                <div className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Times</div>
                <div className="grid grid-cols-2 gap-2">
                  {TIME_GROUPS.map((g) => {
                    const Icon = g.icon;
                    const groupActive = g.bands.some((b) => timeBands.includes(b.key));
                    const expanded = openTimeGroup === g.key;
                    return (
                      <div key={g.key} className="space-y-2">
                        <button
                          onClick={() => setOpenTimeGroup(expanded ? null : g.key)}
                          className={cn(
                            'w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border-2 text-sm font-semibold transition',
                            groupActive
                              ? 'border-gray-900 bg-gray-900 text-white'
                              : expanded
                                ? 'border-gray-900 bg-white text-gray-900'
                                : 'border-gray-200 text-gray-900 hover:border-gray-400'
                          )}
                        >
                          <Icon className="w-4 h-4" />{g.label}
                        </button>
                        <AnimatePresence>
                          {expanded && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              className="overflow-hidden space-y-1.5"
                            >
                              {g.bands.map((b) => {
                                const on = timeBands.includes(b.key);
                                return (
                                  <button
                                    key={b.key}
                                    onClick={() => toggle(timeBands, b.key, setTimeBands)}
                                    className={cn(
                                      'w-full px-3 py-2 rounded-xl border text-xs font-semibold transition',
                                      on
                                        ? 'border-itutor-green bg-green-50 text-itutor-green'
                                        : 'border-gray-200 text-gray-900 hover:border-gray-400'
                                    )}
                                  >
                                    {b.label}
                                  </button>
                                );
                              })}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={() => setStep(3)}
                className="mt-10 w-full py-4 rounded-full bg-itutor-green text-white font-bold text-base hover:bg-emerald-700 transition"
              >
                Continue
              </button>
              <button
                onClick={() => setStep(3)}
                className="mt-2 w-full py-2 text-sm font-semibold text-gray-400 hover:text-gray-700 transition"
              >
                Skip — any time works
              </button>
            </motion.div>
          )}

          {/* STEP 3 — ready */}
          {step === 3 && (
            <motion.div
              key="s3"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              className="w-full max-w-md text-center"
            >
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
                You&apos;re all set!
              </h2>
              <p className="text-gray-500 mt-2">
                We&apos;ll find tutors that match your subjects, budget, and schedule.
              </p>

              {/* Summary */}
              <div className="mt-8 rounded-2xl border border-gray-200 bg-gray-50 p-5 text-left space-y-3">
                <div>
                  <div className="text-xs text-gray-400 uppercase tracking-wider font-bold">Subjects</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {subjects.map((s) => (
                      <span key={s} className="text-xs font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-800">{s}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 uppercase tracking-wider font-bold">Budget</div>
                  <div className="text-sm font-semibold text-gray-900 mt-1">TTD ${budget[0]} – ${budget[1]}{budget[1] >= 1000 ? '+' : ''}/hr</div>
                </div>
                {days.length > 0 && (
                  <div>
                    <div className="text-xs text-gray-400 uppercase tracking-wider font-bold">Availability</div>
                    <div className="text-sm font-semibold text-gray-900 mt-1">{days.join(', ')}</div>
                  </div>
                )}
              </div>

              <button
                onClick={() => setStep(4)}
                className="mt-8 w-full py-4 rounded-full bg-itutor-green text-white font-bold text-base hover:bg-emerald-700 transition"
              >
                Find my tutors
              </button>
              <p className="text-center text-xs text-gray-400 mt-4">
                By continuing you agree to our Terms and Privacy Policy.
              </p>
            </motion.div>
          )}

        </AnimatePresence>
      </main>
    </div>
  );
}
