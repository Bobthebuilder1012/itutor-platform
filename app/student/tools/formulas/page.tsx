'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Atom, Calculator, ChevronRight, Search, Sigma } from 'lucide-react';
import { cn } from '@/lib/utils';

type Subject = 'physics' | 'mathematics' | 'addMaths';

type FormulaEntry = { name: string; formula: string; note?: string };
type FormulaSection = { title: string; formulas: FormulaEntry[] };

const PHYSICS_SECTIONS: FormulaSection[] = [
  {
    title: 'Mechanics',
    formulas: [
      { name: 'Speed', formula: 'v = d / t' },
      { name: 'Acceleration', formula: 'a = (v − u) / t' },
      { name: 'Equations of Motion (1)', formula: 'v = u + at' },
      { name: 'Equations of Motion (2)', formula: 's = ut + ½at²' },
      { name: 'Equations of Motion (3)', formula: 'v² = u² + 2as' },
      { name: 'Force (Newton\'s 2nd Law)', formula: 'F = ma' },
      { name: 'Weight', formula: 'W = mg' },
      { name: 'Momentum', formula: 'p = mv' },
      { name: 'Impulse', formula: 'J = FΔt = Δp' },
      { name: 'Conservation of Momentum', formula: 'm₁u₁ + m₂u₂ = m₁v₁ + m₂v₂' },
      { name: 'Work Done', formula: 'W = Fd cos θ' },
      { name: 'Kinetic Energy', formula: 'KE = ½mv²' },
      { name: 'Gravitational PE', formula: 'PE = mgh' },
      { name: 'Power', formula: 'P = W / t = Fv' },
      { name: 'Efficiency', formula: 'η = (useful output / total input) × 100%' },
      { name: 'Pressure', formula: 'P = F / A' },
      { name: 'Density', formula: 'ρ = m / V' },
      { name: 'Pressure in a Fluid', formula: 'P = ρgh' },
      { name: 'Hooke\'s Law', formula: 'F = kx' },
      { name: 'Moment / Torque', formula: 'M = Fd' },
      { name: 'Principle of Moments', formula: 'ΣClockwise = ΣAnticlockwise' },
    ],
  },
  {
    title: 'Thermal Physics',
    formulas: [
      { name: 'Heat Energy', formula: 'Q = mcΔθ', note: 'c = specific heat capacity' },
      { name: 'Latent Heat', formula: 'Q = mL', note: 'L = specific latent heat' },
      { name: 'Celsius to Kelvin', formula: 'T(K) = T(°C) + 273' },
      { name: 'Linear Expansion', formula: 'ΔL = αL₀Δθ' },
      { name: 'Boyle\'s Law', formula: 'P₁V₁ = P₂V₂', note: 'constant T' },
      { name: 'Charles\' Law', formula: 'V₁/T₁ = V₂/T₂', note: 'constant P' },
      { name: 'Pressure Law', formula: 'P₁/T₁ = P₂/T₂', note: 'constant V' },
      { name: 'General Gas Law', formula: 'P₁V₁/T₁ = P₂V₂/T₂' },
    ],
  },
  {
    title: 'Waves & Optics',
    formulas: [
      { name: 'Wave Equation', formula: 'v = fλ' },
      { name: 'Frequency & Period', formula: 'f = 1 / T' },
      { name: 'Snell\'s Law', formula: 'n₁ sin θ₁ = n₂ sin θ₂' },
      { name: 'Refractive Index', formula: 'n = c / v = sin i / sin r' },
      { name: 'Critical Angle', formula: 'sin C = 1 / n' },
      { name: 'Mirror / Lens Equation', formula: '1/f = 1/u + 1/v' },
      { name: 'Magnification', formula: 'M = v / u = image height / object height' },
      { name: 'Power of a Lens', formula: 'P = 1 / f', note: 'f in metres, P in dioptres' },
    ],
  },
  {
    title: 'Electricity & Magnetism',
    formulas: [
      { name: 'Current', formula: 'I = Q / t' },
      { name: 'Ohm\'s Law', formula: 'V = IR' },
      { name: 'Power (Electrical)', formula: 'P = IV = I²R = V²/R' },
      { name: 'Energy (Electrical)', formula: 'E = Pt = IVt' },
      { name: 'Resistors in Series', formula: 'R_T = R₁ + R₂ + R₃ + …' },
      { name: 'Resistors in Parallel', formula: '1/R_T = 1/R₁ + 1/R₂ + …' },
      { name: 'EMF & Internal Resistance', formula: 'ε = I(R + r)' },
      { name: 'Transformer Equation', formula: 'V₁/V₂ = N₁/N₂' },
      { name: 'Transformer Power', formula: 'V₁I₁ = V₂I₂', note: 'ideal transformer' },
      { name: 'Cost of Electricity', formula: 'Cost = kWh × price per kWh' },
    ],
  },
  {
    title: 'Nuclear & Atomic Physics',
    formulas: [
      { name: 'Mass-Energy Equivalence', formula: 'E = mc²' },
      { name: 'Half-life', formula: 'N = N₀ × (½)^(t/t½)' },
      { name: 'Activity', formula: 'A = λN', note: 'λ = decay constant' },
      { name: 'Decay Constant', formula: 'λ = ln2 / t½' },
    ],
  },
];

const MATH_SECTIONS: FormulaSection[] = [
  {
    title: 'Algebra',
    formulas: [
      { name: 'Quadratic Formula', formula: 'x = (−b ± √(b² − 4ac)) / 2a' },
      { name: 'Discriminant', formula: 'D = b² − 4ac' },
      { name: 'Difference of Squares', formula: 'a² − b² = (a + b)(a − b)' },
      { name: 'Perfect Square', formula: '(a ± b)² = a² ± 2ab + b²' },
      { name: 'Laws of Indices (multiply)', formula: 'aᵐ × aⁿ = aᵐ⁺ⁿ' },
      { name: 'Laws of Indices (divide)', formula: 'aᵐ ÷ aⁿ = aᵐ⁻ⁿ' },
      { name: 'Laws of Indices (power)', formula: '(aᵐ)ⁿ = aᵐⁿ' },
      { name: 'Zero Index', formula: 'a⁰ = 1' },
      { name: 'Negative Index', formula: 'a⁻ⁿ = 1/aⁿ' },
      { name: 'Fractional Index', formula: 'a^(1/n) = ⁿ√a' },
    ],
  },
  {
    title: 'Geometry & Mensuration',
    formulas: [
      { name: 'Area of Triangle', formula: 'A = ½bh' },
      { name: 'Area of Circle', formula: 'A = πr²' },
      { name: 'Circumference', formula: 'C = 2πr' },
      { name: 'Area of Trapezium', formula: 'A = ½(a + b)h' },
      { name: 'Volume of Cylinder', formula: 'V = πr²h' },
      { name: 'Volume of Cone', formula: 'V = ⅓πr²h' },
      { name: 'Volume of Sphere', formula: 'V = ⁴⁄₃πr³' },
      { name: 'Surface Area of Sphere', formula: 'SA = 4πr²' },
      { name: 'Arc Length', formula: 'l = (θ/360) × 2πr' },
      { name: 'Sector Area', formula: 'A = (θ/360) × πr²' },
      { name: 'Pythagoras\' Theorem', formula: 'c² = a² + b²' },
    ],
  },
  {
    title: 'Trigonometry',
    formulas: [
      { name: 'Sine', formula: 'sin θ = opposite / hypotenuse' },
      { name: 'Cosine', formula: 'cos θ = adjacent / hypotenuse' },
      { name: 'Tangent', formula: 'tan θ = opposite / adjacent' },
      { name: 'Sine Rule', formula: 'a/sin A = b/sin B = c/sin C' },
      { name: 'Cosine Rule', formula: 'a² = b² + c² − 2bc cos A' },
      { name: 'Area of Triangle (trig)', formula: 'A = ½ab sin C' },
    ],
  },
  {
    title: 'Coordinate Geometry',
    formulas: [
      { name: 'Gradient', formula: 'm = (y₂ − y₁) / (x₂ − x₁)' },
      { name: 'Equation of a Line', formula: 'y − y₁ = m(x − x₁)' },
      { name: 'Slope-Intercept Form', formula: 'y = mx + c' },
      { name: 'Distance Between Points', formula: 'd = √((x₂−x₁)² + (y₂−y₁)²)' },
      { name: 'Midpoint', formula: 'M = ((x₁+x₂)/2, (y₁+y₂)/2)' },
    ],
  },
  {
    title: 'Statistics & Probability',
    formulas: [
      { name: 'Mean', formula: 'x̄ = Σx / n' },
      { name: 'Weighted Mean', formula: 'x̄ = Σfx / Σf' },
      { name: 'Probability', formula: 'P(A) = n(A) / n(S)' },
      { name: 'Complementary Events', formula: 'P(A\') = 1 − P(A)' },
      { name: 'Independent Events', formula: 'P(A ∩ B) = P(A) × P(B)' },
      { name: 'Mutually Exclusive', formula: 'P(A ∪ B) = P(A) + P(B)' },
    ],
  },
  {
    title: 'Sets & Functions',
    formulas: [
      { name: 'Union', formula: 'n(A ∪ B) = n(A) + n(B) − n(A ∩ B)' },
      { name: 'Inverse Function', formula: 'f⁻¹(x): swap x and y, solve for y' },
      { name: 'Composite Function', formula: 'fg(x) = f(g(x))' },
    ],
  },
];

const ADD_MATHS_SECTIONS: FormulaSection[] = [
  {
    title: 'Calculus — Differentiation',
    formulas: [
      { name: 'Power Rule', formula: 'd/dx (xⁿ) = nxⁿ⁻¹' },
      { name: 'Constant Rule', formula: 'd/dx (c) = 0' },
      { name: 'Sum Rule', formula: 'd/dx (f ± g) = f\' ± g\'' },
      { name: 'Product Rule', formula: 'd/dx (fg) = f\'g + fg\'' },
      { name: 'Quotient Rule', formula: 'd/dx (f/g) = (f\'g − fg\') / g²' },
      { name: 'Chain Rule', formula: 'dy/dx = dy/du × du/dx' },
      { name: 'Derivative of sin x', formula: 'd/dx (sin x) = cos x' },
      { name: 'Derivative of cos x', formula: 'd/dx (cos x) = −sin x' },
      { name: 'Derivative of tan x', formula: 'd/dx (tan x) = sec²x' },
      { name: 'Derivative of eˣ', formula: 'd/dx (eˣ) = eˣ' },
      { name: 'Derivative of ln x', formula: 'd/dx (ln x) = 1/x' },
      { name: 'Stationary Points', formula: 'dy/dx = 0, check d²y/dx²', note: '> 0 min, < 0 max' },
    ],
  },
  {
    title: 'Calculus — Integration',
    formulas: [
      { name: 'Power Rule', formula: '∫xⁿ dx = xⁿ⁺¹/(n+1) + C', note: 'n ≠ −1' },
      { name: 'Integral of 1/x', formula: '∫(1/x) dx = ln|x| + C' },
      { name: 'Integral of eˣ', formula: '∫eˣ dx = eˣ + C' },
      { name: 'Integral of sin x', formula: '∫sin x dx = −cos x + C' },
      { name: 'Integral of cos x', formula: '∫cos x dx = sin x + C' },
      { name: 'Definite Integral', formula: '∫ₐᵇ f(x) dx = F(b) − F(a)' },
      { name: 'Area Under a Curve', formula: 'A = ∫ₐᵇ f(x) dx' },
      { name: 'Area Between Curves', formula: 'A = ∫ₐᵇ [f(x) − g(x)] dx' },
    ],
  },
  {
    title: 'Algebra & Functions',
    formulas: [
      { name: 'Remainder Theorem', formula: 'f(a) = remainder when f(x) ÷ (x − a)' },
      { name: 'Factor Theorem', formula: '(x − a) is a factor ⇔ f(a) = 0' },
      { name: 'Partial Fractions (distinct)', formula: 'A/(x − a) + B/(x − b)' },
      { name: 'Partial Fractions (repeated)', formula: 'A/(x − a) + B/(x − a)²' },
      { name: 'Modulus Function', formula: '|x| = x if x ≥ 0, −x if x < 0' },
      { name: 'Logarithm Definition', formula: 'logₐ b = c ⇔ aᶜ = b' },
      { name: 'Log Product Rule', formula: 'log(ab) = log a + log b' },
      { name: 'Log Quotient Rule', formula: 'log(a/b) = log a − log b' },
      { name: 'Log Power Rule', formula: 'log(aⁿ) = n log a' },
      { name: 'Change of Base', formula: 'logₐ b = log b / log a' },
      { name: 'Natural Log', formula: 'ln x = logₑ x' },
    ],
  },
  {
    title: 'Trigonometry (Advanced)',
    formulas: [
      { name: 'Pythagorean Identity', formula: 'sin²θ + cos²θ = 1' },
      { name: 'Tan Identity', formula: 'tan θ = sin θ / cos θ' },
      { name: 'sec²θ Identity', formula: '1 + tan²θ = sec²θ' },
      { name: 'cosec²θ Identity', formula: '1 + cot²θ = cosec²θ' },
      { name: 'Double Angle (sin)', formula: 'sin 2θ = 2 sin θ cos θ' },
      { name: 'Double Angle (cos)', formula: 'cos 2θ = cos²θ − sin²θ' },
      { name: 'Double Angle (cos alt)', formula: 'cos 2θ = 2cos²θ − 1 = 1 − 2sin²θ' },
      { name: 'Double Angle (tan)', formula: 'tan 2θ = 2 tan θ / (1 − tan²θ)' },
      { name: 'Radians Conversion', formula: 'π rad = 180°' },
      { name: 'Arc Length (radians)', formula: 's = rθ' },
      { name: 'Sector Area (radians)', formula: 'A = ½r²θ' },
    ],
  },
  {
    title: 'Coordinate Geometry (Advanced)',
    formulas: [
      { name: 'Equation of a Circle', formula: '(x − a)² + (y − b)² = r²', note: 'centre (a, b)' },
      { name: 'General Circle Form', formula: 'x² + y² + 2gx + 2fy + c = 0', note: 'centre (−g, −f), r = √(g²+f²−c)' },
      { name: 'Perpendicular Lines', formula: 'm₁ × m₂ = −1' },
      { name: 'Tangent to Circle', formula: 'Perpendicular to radius at point of contact' },
    ],
  },
  {
    title: 'Sequences & Series',
    formulas: [
      { name: 'AP: nth term', formula: 'Tₙ = a + (n − 1)d' },
      { name: 'AP: Sum of n terms', formula: 'Sₙ = n/2 [2a + (n − 1)d]' },
      { name: 'GP: nth term', formula: 'Tₙ = arⁿ⁻¹' },
      { name: 'GP: Sum of n terms', formula: 'Sₙ = a(rⁿ − 1)/(r − 1)', note: 'r ≠ 1' },
      { name: 'GP: Sum to Infinity', formula: 'S∞ = a/(1 − r)', note: '|r| < 1' },
      { name: 'Binomial Expansion', formula: '(a + b)ⁿ = Σ ⁿCᵣ aⁿ⁻ʳ bʳ' },
      { name: 'Binomial Coefficient', formula: 'ⁿCᵣ = n! / (r!(n − r)!)' },
    ],
  },
];

const SUBJECTS: { id: Subject; label: string; icon: typeof Atom; tint: string; iconColor: string; desc: string; sections: FormulaSection[] }[] = [
  { id: 'physics', label: 'Physics', icon: Atom, tint: 'bg-coral-soft', iconColor: 'text-coral', desc: 'Mechanics, Waves, Electricity & more', sections: PHYSICS_SECTIONS },
  { id: 'mathematics', label: 'Mathematics', icon: Calculator, tint: 'bg-lavender', iconColor: 'text-ink', desc: 'Algebra, Geometry, Trigonometry & more', sections: MATH_SECTIONS },
  { id: 'addMaths', label: 'Additional Mathematics', icon: Sigma, tint: 'bg-peach', iconColor: 'text-ink', desc: 'Calculus, Logarithms, Series & advanced topics', sections: ADD_MATHS_SECTIONS },
];

export default function FormulaSheetPage() {
  const [activeSubject, setActiveSubject] = useState<Subject | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const subject = SUBJECTS.find((s) => s.id === activeSubject);

  function toggleSection(title: string) {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      next.has(title) ? next.delete(title) : next.add(title);
      return next;
    });
  }

  function expandAll() {
    if (!subject) return;
    setExpandedSections(new Set(subject.sections.map((s) => s.title)));
  }

  const filteredSections = subject?.sections
    .map((section) => {
      if (!searchQuery.trim()) return section;
      const q = searchQuery.toLowerCase();
      const matched = section.formulas.filter(
        (f) => f.name.toLowerCase().includes(q) || f.formula.toLowerCase().includes(q) || f.note?.toLowerCase().includes(q)
      );
      return matched.length > 0 ? { ...section, formulas: matched } : null;
    })
    .filter(Boolean) as FormulaSection[] | undefined;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <Link
            href={activeSubject ? '#' : '/student/tools'}
            onClick={(e) => {
              if (activeSubject) { e.preventDefault(); setActiveSubject(null); setSearchQuery(''); setExpandedSections(new Set()); }
            }}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-ink transition"
          >
            <ArrowLeft className="size-4" /> {activeSubject ? 'All Subjects' : 'Tools'}
          </Link>
        </div>

        {!activeSubject ? (
          <>
            {/* Subject picker */}
            <div className="text-center mb-8">
              <h1 className="text-2xl lg:text-3xl font-bold text-ink">CSEC Formula Sheet</h1>
              <p className="text-sm text-muted-foreground mt-1">Select a subject to view all formulas</p>
            </div>

            <div className="grid gap-4">
              {SUBJECTS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => { setActiveSubject(s.id); expandAll(); setTimeout(() => { setExpandedSections(new Set(SUBJECTS.find((x) => x.id === s.id)!.sections.map((sec) => sec.title))); }, 0); }}
                  className="group text-left rounded-3xl bg-background border border-border p-6 hover:shadow-card hover:-translate-y-0.5 hover:border-brand/30 transition-all flex items-center gap-4"
                >
                  <div className={cn('size-14 rounded-2xl grid place-items-center shrink-0 group-hover:scale-105 transition', s.tint)}>
                    <s.icon className={cn('size-6', s.iconColor)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-ink text-lg">{s.label}</div>
                    <div className="text-sm text-muted-foreground mt-0.5">{s.desc}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {s.sections.length} sections · {s.sections.reduce((sum, sec) => sum + sec.formulas.length, 0)} formulas
                    </div>
                  </div>
                  <ChevronRight className="size-5 text-muted-foreground group-hover:text-ink group-hover:translate-x-0.5 transition" />
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            {/* Subject header */}
            <div className="flex items-center gap-3 mb-6">
              <div className={cn('size-12 rounded-2xl grid place-items-center', subject!.tint)}>
                {(() => { const Icon = subject!.icon; return <Icon className={cn('size-5', subject!.iconColor)} />; })()}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-ink">{subject!.label}</h1>
                <p className="text-sm text-muted-foreground">{subject!.desc}</p>
              </div>
            </div>

            {/* Search */}
            <div className="rounded-2xl border border-border bg-background p-2 flex items-center gap-2 mb-6 shadow-sm">
              <Search className="size-4 text-muted-foreground ml-2" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search formulas…"
                className="flex-1 bg-transparent outline-none text-sm py-1.5 min-w-0"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="text-xs text-muted-foreground hover:text-ink px-2">Clear</button>
              )}
            </div>

            {/* Sections */}
            <div className="space-y-3">
              {filteredSections && filteredSections.length > 0 ? (
                filteredSections.map((section) => {
                  const isOpen = expandedSections.has(section.title);
                  return (
                    <div key={section.title} className="rounded-2xl border border-border bg-background overflow-hidden">
                      <button
                        onClick={() => toggleSection(section.title)}
                        className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition"
                      >
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-ink text-sm">{section.title}</h3>
                          <span className="text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{section.formulas.length}</span>
                        </div>
                        <ChevronRight className={cn('size-4 text-muted-foreground transition-transform', isOpen && 'rotate-90')} />
                      </button>
                      {isOpen && (
                        <div className="border-t border-border divide-y divide-border">
                          {section.formulas.map((f, i) => (
                            <div key={i} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                              <div className="text-sm text-muted-foreground sm:w-48 shrink-0 font-medium">{f.name}</div>
                              <div className="text-sm font-mono font-semibold text-ink flex-1">{f.formula}</div>
                              {f.note && <div className="text-[11px] text-muted-foreground italic">{f.note}</div>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  No formulas found matching &ldquo;{searchQuery}&rdquo;
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
