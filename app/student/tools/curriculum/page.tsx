'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronRight, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

type Unit = { name: string; topics: string[] };
type Subject = { name: string; emoji: string; color: string; level: string; units: Unit[] };

const CSEC_SUBJECTS: Subject[] = [
  {
    name: 'Mathematics', emoji: '📐', color: 'coral', level: 'CSEC',
    units: [
      { name: 'Number Theory', topics: ['Sets', 'Consumer arithmetic', 'Number bases', 'Indices & surds'] },
      { name: 'Algebra', topics: ['Algebraic expressions', 'Linear equations', 'Quadratic equations', 'Inequalities'] },
      { name: 'Functions & Relations', topics: ['Functions', 'Graphs', 'Inverse functions', 'Transformations'] },
      { name: 'Geometry', topics: ['Lines & angles', 'Triangles', 'Circle theorems', 'Vectors'] },
      { name: 'Trigonometry', topics: ['Trig ratios', 'Sine & cosine rules', 'Bearings'] },
      { name: 'Statistics & Probability', topics: ['Data collection', 'Averages', 'Probability', 'Histograms'] },
    ],
  },
  {
    name: 'English A', emoji: '📝', color: 'sky', level: 'CSEC',
    units: [
      { name: 'Reading Comprehension', topics: ['Main idea & details', 'Inference', 'Tone & purpose', 'Vocabulary in context'] },
      { name: 'Writing', topics: ['Expository writing', 'Narrative writing', 'Argumentative writing', 'Summary writing'] },
      { name: 'Grammar & Usage', topics: ['Parts of speech', 'Sentence structure', 'Punctuation', 'Tense & aspect'] },
      { name: 'Literature', topics: ['Narrative technique', 'Characterisation', 'Theme & symbolism', 'Poetic devices'] },
    ],
  },
  {
    name: 'Physics', emoji: '⚛️', color: 'brand', level: 'CSEC',
    units: [
      { name: 'Mechanics', topics: ['Scalars & vectors', 'Motion', "Newton's laws", 'Work, energy & power'] },
      { name: 'Thermal Physics', topics: ['Temperature', 'Heat transfer', 'Kinetic theory', 'Gas laws'] },
      { name: 'Waves & Optics', topics: ['Wave properties', 'Sound', 'Light', 'Reflection & refraction'] },
      { name: 'Electricity & Magnetism', topics: ['Current & circuits', "Ohm's law", 'Magnetism', 'EM induction'] },
      { name: 'Modern Physics', topics: ['Radioactivity', 'Nuclear reactions', 'The atom'] },
    ],
  },
  {
    name: 'Chemistry', emoji: '🧪', color: 'lavender', level: 'CSEC',
    units: [
      { name: 'Matter & Particles', topics: ['Atomic structure', 'Periodic table', 'Bonding', 'Isotopes'] },
      { name: 'Moles & Equations', topics: ['Mole concept', 'Chemical equations', 'Stoichiometry'] },
      { name: 'Acids, Bases & Salts', topics: ['pH scale', 'Neutralisation', 'Salt preparation', 'Titration'] },
      { name: 'Organic Chemistry', topics: ['Hydrocarbons', 'Functional groups', 'Polymers'] },
      { name: 'Electrochemistry', topics: ['Electrolysis', 'Electrode reactions', 'Corrosion'] },
    ],
  },
  {
    name: 'Biology', emoji: '🧬', color: 'peach', level: 'CSEC',
    units: [
      { name: 'Cell Biology', topics: ['Cell structure', 'Cell division', 'Osmosis & diffusion', 'Enzymes'] },
      { name: 'Life Processes', topics: ['Nutrition', 'Respiration', 'Photosynthesis', 'Transport'] },
      { name: 'Reproduction & Genetics', topics: ['Sexual reproduction', 'Heredity', 'Variation'] },
      { name: 'Ecology', topics: ['Ecosystems', 'Food chains', 'Human impact on the environment'] },
    ],
  },
  {
    name: 'History', emoji: '📜', color: 'brand', level: 'CSEC',
    units: [
      { name: 'Pre-Colonial Caribbean', topics: ['Amerindian peoples', 'Social organisation'] },
      { name: 'European Colonisation', topics: ['Motives', 'Settlement patterns', 'Impact on Amerindians'] },
      { name: 'Slavery & Indentureship', topics: ['Slave trade', 'Plantation society', 'Indian indentureship'] },
      { name: 'Independence & Nation-Building', topics: ['Federation', 'Independence movements', 'CARICOM'] },
    ],
  },
  {
    name: 'Information Technology', emoji: '💻', color: 'sky', level: 'CSEC',
    units: [
      { name: 'Computer Hardware', topics: ['Input/output devices', 'Storage', 'CPU & memory', 'Networks'] },
      { name: 'Software & Programming', topics: ['Operating systems', 'Applications', 'Algorithms', 'Coding'] },
      { name: 'Data & Databases', topics: ['Data representation', 'File management', 'Spreadsheets'] },
      { name: 'Social Implications', topics: ['Cybercrime', 'Data privacy', 'Ethical issues'] },
    ],
  },
  {
    name: 'Social Studies', emoji: '🌍', color: 'coral', level: 'CSEC',
    units: [
      { name: 'Individual & Society', topics: ['Socialisation', 'Culture & norms', 'Social institutions'] },
      { name: 'Caribbean Society', topics: ['Caribbean identity', 'Ethnic groups', 'Migration'] },
      { name: 'Government & Politics', topics: ['Types of government', 'Caribbean constitutions', 'CARICOM'] },
      { name: 'Economic Development', topics: ['Factors of production', 'Economic systems', 'Development'] },
    ],
  },
];

const CAPE_SUBJECTS: Subject[] = [
  {
    name: 'Pure Mathematics', emoji: '∑', color: 'brand', level: 'CAPE',
    units: [
      { name: 'Unit 1 — Algebra & Functions', topics: ['Real numbers', 'Polynomials', 'Exponentials & logs', 'Sequences & series'] },
      { name: 'Unit 1 — Calculus', topics: ['Limits', 'Differentiation', 'Integration', 'Applications'] },
      { name: 'Unit 2 — Complex Numbers', topics: ['Argand diagram', 'Polar form', 'Roots of equations'] },
      { name: 'Unit 2 — Vectors & Matrices', topics: ['Vectors in 3D', 'Matrix operations', 'Linear transformations'] },
      { name: 'Unit 2 — Differential Equations', topics: ['First-order ODEs', 'Second-order ODEs', 'Applications'] },
    ],
  },
  {
    name: 'Physics', emoji: '⚛️', color: 'sky', level: 'CAPE',
    units: [
      { name: 'Unit 1 — Mechanics', topics: ['Kinematics', "Newton's laws", 'Rotational motion', 'Gravitation'] },
      { name: 'Unit 1 — Thermal & Mechanical', topics: ['Thermodynamics', 'Gas laws', 'Kinetic theory', 'Fluid dynamics'] },
      { name: 'Unit 2 — Waves & Oscillations', topics: ['SHM', 'Wave phenomena', 'Interference & diffraction'] },
      { name: 'Unit 2 — Electricity & Magnetism', topics: ['Electrostatics', 'Circuits', 'Capacitance', 'EM induction'] },
      { name: 'Unit 2 — Modern Physics', topics: ['Quantum physics', 'Atomic spectra', 'Radioactivity'] },
    ],
  },
  {
    name: 'Chemistry', emoji: '🧪', color: 'lavender', level: 'CAPE',
    units: [
      { name: 'Unit 1 — Physical Chemistry', topics: ['Atomic structure', 'Bonding', 'Energetics', 'Kinetics', 'Equilibrium'] },
      { name: 'Unit 1 — Inorganic Chemistry', topics: ['Periodic trends', 'Group 1 & 2', 'Transition metals'] },
      { name: 'Unit 2 — Organic Chemistry', topics: ['Hydrocarbons', 'Alcohols & carbonyls', 'Amino acids'] },
      { name: 'Unit 2 — Analytical Methods', topics: ['Spectroscopy', 'Chromatography', 'Electrochemistry'] },
    ],
  },
  {
    name: 'Biology', emoji: '🧬', color: 'peach', level: 'CAPE',
    units: [
      { name: 'Unit 1 — Biochemistry & Cell Biology', topics: ['Biomolecules', 'Cell ultrastructure', 'Enzymes', 'DNA synthesis'] },
      { name: 'Unit 1 — Genetics & Evolution', topics: ['Mendelian genetics', 'Mutations', 'Evolution', 'Natural selection'] },
      { name: 'Unit 2 — Biophysics', topics: ['Photosynthesis', 'Respiration', 'Homeostasis', 'Osmoregulation'] },
      { name: 'Unit 2 — Ecology', topics: ['Population ecology', 'Community ecology', 'Conservation'] },
    ],
  },
  {
    name: 'Economics', emoji: '📊', color: 'coral', level: 'CAPE',
    units: [
      { name: 'Unit 1 — Microeconomics', topics: ['Demand & supply', 'Elasticity', 'Market structures', 'Market failure'] },
      { name: 'Unit 2 — Macroeconomics', topics: ['National income', 'Employment & inflation', 'Money & banking', 'International trade'] },
    ],
  },
  {
    name: 'Communication Studies', emoji: '🗣️', color: 'sky', level: 'CAPE',
    units: [
      { name: 'Unit 1 — Fundamentals', topics: ['Communication process', 'Language & meaning', 'Media', 'Oral & written communication'] },
      { name: 'Unit 2 — Applied Communication', topics: ['Research methods', 'Extended essay', 'Portfolio', 'Analytical writing'] },
    ],
  },
  {
    name: 'Management of Business', emoji: '📋', color: 'brand', level: 'CAPE',
    units: [
      { name: 'Unit 1 — Business Environment', topics: ['Business objectives', 'Forms of business', 'HR management', 'Marketing'] },
      { name: 'Unit 2 — Business Operations', topics: ['Production', 'Finance & accounting', 'Strategy', 'Entrepreneurship'] },
    ],
  },
  {
    name: 'Computer Science', emoji: '💻', color: 'lavender', level: 'CAPE',
    units: [
      { name: 'Unit 1 — Fundamentals', topics: ['Computational thinking', 'Data representation', 'Boolean logic', 'Architecture'] },
      { name: 'Unit 2 — Applications', topics: ['Databases', 'Networking & security', 'OOP', 'Algorithm design'] },
    ],
  },
];

const COLOR_MAP: Record<string, string> = {
  coral: 'from-coral to-peach',
  sky: 'from-sky-400 to-blue-500',
  brand: 'from-brand to-brand-deep',
  lavender: 'from-violet-400 to-purple-500',
  peach: 'from-amber-300 to-orange-400',
};

const BG_MAP: Record<string, string> = {
  coral: 'bg-coral-soft',
  sky: 'bg-sky/30',
  brand: 'bg-brand-soft',
  lavender: 'bg-lavender',
  peach: 'bg-peach',
};

function SubjectCard({ subject }: { subject: Subject }) {
  const [open, setOpen] = useState(false);
  const [expandedUnit, setExpandedUnit] = useState<number | null>(null);

  return (
    <div className={cn('rounded-3xl bg-background border border-border overflow-hidden hover:shadow-card transition-all', open && 'shadow-card')}>
      <button
        onClick={() => { setOpen((o) => !o); setExpandedUnit(null); }}
        className="w-full text-left"
      >
        <div
          className="h-28 flex items-end p-4 relative"
          style={{ background: `linear-gradient(135deg, color-mix(in oklab, var(--${subject.color}) 55%, white), color-mix(in oklab, var(--${subject.color}) 25%, white))` }}
        >
          <div className="text-4xl absolute top-4 right-4 select-none">{subject.emoji}</div>
          <div>
            <div className="text-[10px] uppercase tracking-wider font-bold text-ink/60">{subject.level}</div>
            <div className="font-bold text-lg text-ink leading-tight">{subject.name}</div>
          </div>
        </div>
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="size-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{subject.units.length} units</span>
          </div>
          <div className={cn('text-xs font-semibold px-2.5 py-1 rounded-full', BG_MAP[subject.color], 'text-ink')}>
            {open ? 'Collapse' : 'View syllabus'}
          </div>
        </div>
      </button>

      {open && (
        <div className="border-t border-border divide-y divide-border">
          {subject.units.map((u, i) => (
            <div key={i}>
              <button
                onClick={() => setExpandedUnit(expandedUnit === i ? null : i)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted transition text-left"
              >
                <span className="text-sm font-semibold text-ink">{u.name}</span>
                {expandedUnit === i
                  ? <ChevronDown className="size-4 text-muted-foreground shrink-0" />
                  : <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                }
              </button>
              {expandedUnit === i && (
                <div className="px-4 pb-4 grid grid-cols-2 gap-1.5">
                  {u.topics.map((t) => (
                    <div
                      key={t}
                      className={cn('text-xs px-2.5 py-1.5 rounded-xl font-medium text-ink', BG_MAP[subject.color])}
                    >
                      {t}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SubjectCurriculumPage() {
  const [tab, setTab] = useState<'csec' | 'cape'>('csec');
  const subjects = tab === 'csec' ? CSEC_SUBJECTS : CAPE_SUBJECTS;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Link href="/student/tools" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-ink">
        <ArrowLeft className="size-4" /> Back to Tools
      </Link>

      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-ink">Curriculum</h1>
        <p className="text-sm text-muted-foreground mt-1">CSEC and CAPE subject syllabi — click a subject to explore its units and topics</p>
      </div>

      <div className="inline-flex p-1 rounded-2xl bg-muted">
        <button
          onClick={() => setTab('csec')}
          className={cn('px-6 py-2 rounded-xl text-sm font-semibold transition', tab === 'csec' ? 'bg-background text-ink shadow-sm' : 'text-muted-foreground hover:text-ink')}
        >
          CSEC
        </button>
        <button
          onClick={() => setTab('cape')}
          className={cn('px-6 py-2 rounded-xl text-sm font-semibold transition', tab === 'cape' ? 'bg-background text-ink shadow-sm' : 'text-muted-foreground hover:text-ink')}
        >
          CAPE
        </button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {subjects.map((s) => <SubjectCard key={s.name} subject={s} />)}
      </div>
    </div>
  );
}
