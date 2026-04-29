'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { GroupWithTutor } from '@/lib/types/groups';

interface StudentLessonsClientProps {
  currentUserId: string;
}

type Tab = 'my' | 'discover';
type SortKey = 'latest' | 'popular' | 'price-asc' | 'next-session';

interface ActiveFilters {
  examLevel: string[];
  price: string[];
  formLevel: string[];
  rating: string[];
}

interface PendingAssignment {
  id: string;
  title: string;
  lessonTitle: string;
  dueDate: string | null;
  lessonId: string;
  streamPostId?: string;
}

const EMPTY_FILTERS: ActiveFilters = { examLevel: [], price: [], formLevel: [] , rating: [] };

const SUBJECT_GRADIENT_MAP: Array<{ keywords: string[]; gradient: string }> = [
  { keywords: ['bio'], gradient: 'linear-gradient(135deg,#8b5cf6,#6d28d9)' },
  { keywords: ['phys'], gradient: 'linear-gradient(135deg,#2dd4bf,#0f766e)' },
  { keywords: ['math'], gradient: 'linear-gradient(135deg,#38bdf8,#0369a1)' },
  { keywords: ['english', 'language'], gradient: 'linear-gradient(135deg,#fb7185,#be123c)' },
  { keywords: ['chem'], gradient: 'linear-gradient(135deg,#fbbf24,#b45309)' },
  { keywords: ['sea', 'primary'], gradient: 'linear-gradient(135deg,#4ade80,#15803d)' },
  { keywords: ['history'], gradient: 'linear-gradient(135deg,#f97316,#c2410c)' },
  { keywords: ['geo'], gradient: 'linear-gradient(135deg,#06b6d4,#0e7490)' },
];

function getSubjectGradient(subject: string): string {
  const s = (subject || '').toLowerCase();
  for (const { keywords, gradient } of SUBJECT_GRADIENT_MAP) {
    if (keywords.some((k) => s.includes(k))) return gradient;
  }
  return 'linear-gradient(135deg,#8b5cf6,#6d28d9)';
}

function getInitials(name: string): string {
  return name.split(' ').map((w) => w[0] ?? '').join('').toUpperCase().slice(0, 2);
}

function getAvatarColor(name: string): string {
  const colors = ['#199358', '#7c3aed', '#0369a1', '#be123c', '#b45309', '#15803d'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return colors[hash % colors.length]!;
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isPaid(g: any): boolean {
  const mode = g.pricing_mode ?? g.pricingMode ?? '';
  return mode === 'PER_SESSION' || mode === 'PER_COURSE' || !!g.price_per_session;
}

function priceLabel(g: any): { text: string; paid: boolean } {
  if (!isPaid(g)) return { text: 'Free', paid: false };
  const p = g.price_per_session || g.price_per_course || 0;
  return { text: `$${Number(p).toFixed(0)}`, paid: true };
}

function examLevel(subject: string): string {
  const s = (subject || '').toUpperCase();
  if (s.includes('SEA') || s.includes('PRIMARY')) return 'SEA';
  if (s.includes('CAPE')) return 'CAPE';
  return 'CSEC';
}

function BookIcon({ opacity = 0.8 }: { opacity?: number }) {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={`rgba(255,255,255,${opacity})`} strokeWidth={1.5}>
      <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
    </svg>
  );
}

function StarRating({ rating }: { rating: number }) {
  return (
    <span style={{ color: '#fbbf24', fontSize: 13, letterSpacing: 1 }}>
      {[1, 2, 3, 4, 5].map((i) => (i <= Math.round(rating) ? '★' : '☆')).join('')}
    </span>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function StudentLessonsSkeleton() {
  return (
    <div style={{ padding: '36px 32px' }}>
      <style>{`@keyframes stshim{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
      <div style={{ width: 140, height: 32, borderRadius: 6, background: 'linear-gradient(90deg,#eee 25%,#e0e0e0 50%,#eee 75%)', backgroundSize: '200% 100%', animation: 'stshim 1.4s infinite', marginBottom: 8 }} />
      <div style={{ width: 300, height: 16, borderRadius: 4, background: 'linear-gradient(90deg,#eee 25%,#e0e0e0 50%,#eee 75%)', backgroundSize: '200% 100%', animation: 'stshim 1.4s infinite', marginBottom: 28 }} />
      <div style={{ display: 'flex', gap: 20, marginBottom: 32 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ flex: 1, height: 200, borderRadius: 16, background: 'linear-gradient(90deg,#eee 25%,#e0e0e0 50%,#eee 75%)', backgroundSize: '200% 100%', animation: 'stshim 1.4s infinite' }} />
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function StudentLessonsClient({ currentUserId }: StudentLessonsClientProps) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('my');
  const [allGroups, setAllGroups] = useState<GroupWithTutor[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingAssignment, setPendingAssignment] = useState<PendingAssignment | null>(null);

  // Discover filters
  const [filters, setFilters] = useState<ActiveFilters>(EMPTY_FILTERS);
  const [pendingFilters, setPendingFilters] = useState<ActiveFilters>(EMPTY_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sort, setSort] = useState<SortKey>('latest');
  const filterPanelRef = useRef<HTMLDivElement>(null);

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/groups');
      if (res.ok) {
        const data = await res.json();
        setAllGroups((data.groups ?? []) as GroupWithTutor[]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);

  // Close filter panel on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (filterPanelRef.current && !filterPanelRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Fetch pending assignment for first enrolled lesson
  useEffect(() => {
    const enrolled = allGroups.filter(
      (g) => (g as any).current_user_membership?.status === 'approved' && g.tutor_id !== currentUserId
    );
    if (enrolled.length === 0) return;
    // Try to find a pending assignment from the stream of the first enrolled lesson
    (async () => {
      try {
        const res = await fetch(`/api/groups/${enrolled[0]!.id}/stream?type=assignment`);
        if (res.ok) {
          const data = await res.json();
          const posts = (data.posts ?? data.items ?? []) as any[];
          const pending = posts.find((p: any) => p.post_type === 'assignment' && !p.submitted);
          if (pending) {
            setPendingAssignment({
              id: pending.id,
              title: pending.title ?? pending.content ?? 'Assignment',
              lessonTitle: enrolled[0]!.name,
              dueDate: pending.due_date ?? null,
              lessonId: enrolled[0]!.id,
              streamPostId: pending.id,
            });
          }
        }
      } catch { /* silently ignore */ }
    })();
  }, [allGroups, currentUserId]);

  const enrolledLessons = allGroups.filter(
    (g) => (g as any).current_user_membership?.status === 'approved' && g.tutor_id !== currentUserId
  );

  const discoverLessons = allGroups.filter(
    (g) => !(g as any).current_user_membership && g.tutor_id !== currentUserId
  );

  // Apply filters + sort to discover
  const filteredDiscover = (() => {
    let list = [...discoverLessons];

    if (filters.examLevel.length > 0) {
      list = list.filter((g) => filters.examLevel.includes(examLevel(g.subject ?? '')));
    }
    if (filters.price.length > 0) {
      if (filters.price.includes('Free') && !filters.price.includes('Paid')) list = list.filter((g) => !isPaid(g));
      else if (filters.price.includes('Paid') && !filters.price.includes('Free')) list = list.filter((g) => isPaid(g));
    }
    if (filters.formLevel.length > 0) {
      list = list.filter((g) => {
        const fl = ((g as any).form_level ?? '').replace('_', ' ').toLowerCase();
        return filters.formLevel.some((f) => fl.includes(f.toLowerCase()));
      });
    }
    if (filters.rating.includes('Upcoming Sessions')) {
      list = list.filter((g) => !!g.next_occurrence);
    }

    // Sort
    switch (sort) {
      case 'popular': list.sort((a, b) => (b.member_count ?? 0) - (a.member_count ?? 0)); break;
      case 'price-asc': list.sort((a, b) => {
        const pa = isPaid(a) ? Number((a as any).price_per_session ?? 9999) : 0;
        const pb = isPaid(b) ? Number((b as any).price_per_session ?? 9999) : 0;
        return pa - pb;
      }); break;
      case 'next-session': list.sort((a, b) => {
        const da = a.next_occurrence?.scheduled_start_at ?? '9999';
        const db = b.next_occurrence?.scheduled_start_at ?? '9999';
        return da < db ? -1 : 1;
      }); break;
      default: list.sort((a, b) => ((b as any).created_at ?? '') > ((a as any).created_at ?? '') ? 1 : -1);
    }
    return list;
  })();

  const activeFilterCount = Object.values(filters).flat().length;

  function togglePendingChip(group: keyof ActiveFilters, value: string) {
    setPendingFilters((prev) => {
      const arr = prev[group];
      return { ...prev, [group]: arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value] };
    });
  }

  function applyFilters() {
    setFilters(pendingFilters);
    setFilterOpen(false);
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS);
    setPendingFilters(EMPTY_FILTERS);
    setFilterOpen(false);
  }

  function removeActiveFilter(group: keyof ActiveFilters, value: string) {
    const next = { ...filters, [group]: filters[group].filter((v) => v !== value) };
    setFilters(next);
    setPendingFilters(next);
  }

  if (loading) return <StudentLessonsSkeleton />;

  return (
    <div style={{ fontFamily: "'DM Sans', Arial, sans-serif", background: '#f7f8fa', minHeight: '100%' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Serif+Display&display=swap');
        @keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        .st-card-hover:hover { transform: translateY(-3px); box-shadow: 0 12px 40px rgba(0,0,0,0.12) !important; }
        .enr-card-hover:hover { transform: translateY(-2px); box-shadow: 0 4px 16px rgba(0,0,0,0.08) !important; }
        .join-btn-wrap .join-btn { opacity: 0; transform: translateY(4px); transition: opacity 0.2s, transform 0.2s; }
        .join-btn-wrap:hover .join-btn { opacity: 1; transform: translateY(0); }
      `}</style>

      {/* Page header */}
      <div style={{ padding: '36px 32px 0', animation: 'fadeUp 0.4s ease both' }}>
        <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 36, color: '#111827', margin: 0, lineHeight: 1.1, marginBottom: 4 }}>Lessons</h1>
        <p style={{ fontSize: 15, color: '#6b7280', margin: 0 }}>Browse your enrolled lessons or discover something new</p>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', padding: '20px 32px 0', borderBottom: '1px solid #e5e7eb', gap: 4, animation: 'fadeUp 0.4s 0.05s ease both' }}>
        {([
          { key: 'my', label: 'My Lessons', count: enrolledLessons.length },
          { key: 'discover', label: 'Discover', count: discoverLessons.length },
        ] as const).map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: '10px 20px', border: 'none', background: 'none',
                fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
                color: active ? '#199358' : '#6b7280',
                borderBottom: active ? '2px solid #199358' : '2px solid transparent',
                marginBottom: -1, cursor: 'pointer', transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', gap: 7,
              }}
            >
              {t.label}
              <span style={{
                background: active ? '#e8f5ee' : '#f3f4f6',
                color: active ? '#199358' : '#6b7280',
                padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700,
              }}>
                {t.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── MY LESSONS TAB ── */}
      {tab === 'my' && (
        <div style={{ padding: '28px 32px', animation: 'fadeUp 0.3s ease both' }}>

          {/* Assignment banner */}
          {pendingAssignment && (
            <div
              onClick={() => router.push(`/lessons/${pendingAssignment.lessonId}`)}
              style={{
                background: 'linear-gradient(135deg,#e8f5ee,#f0fdf4)', border: '1px solid #bbf7d0',
                borderRadius: 14, padding: '18px 22px', marginBottom: 28,
                display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer',
              }}
            >
              <div style={{ width: 44, height: 44, borderRadius: 12, background: '#199358', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" /></svg>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#199358', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>Active Assignment</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>{pendingAssignment.title}</div>
                <div style={{ fontSize: 13, color: '#6b7280' }}>
                  {pendingAssignment.lessonTitle}{pendingAssignment.dueDate ? ` · Due ${fmtDate(pendingAssignment.dueDate)}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#199358', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>
                Submit now
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M5 12h14M12 5l7 7-7 7" /></svg>
              </div>
            </div>
          )}

          {enrolledLessons.length === 0 ? (
            // Empty state
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 40px', textAlign: 'center' }}>
              <div style={{ width: 72, height: 72, borderRadius: 20, background: '#e8f5ee', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#199358" strokeWidth={1.5}><path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" /></svg>
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 8 }}>No lessons yet</div>
              <div style={{ fontSize: 14, color: '#6b7280', maxWidth: 300, lineHeight: 1.6, marginBottom: 24 }}>
                Discover lessons from tutors across the Caribbean and join the ones that fit your studies.
              </div>
              <button
                onClick={() => setTab('discover')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 22px', background: '#199358', color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
                Discover Lessons
              </button>
            </div>
          ) : (
            <>
              {/* Section header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>Enrolled Lessons</div>
                  <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
                    {enrolledLessons.length} lesson{enrolledLessons.length !== 1 ? 's' : ''}
                    {pendingAssignment ? ' · 1 active assignment' : ''}
                  </div>
                </div>
              </div>

              {/* Enrolled cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {enrolledLessons.map((g) => {
                  const gAny = g as any;
                  const gradient = gAny.cover_image
                    ? undefined
                    : getSubjectGradient(g.subject ?? '');
                  const tutorName = gAny.tutor_name ?? gAny.tutor?.full_name ?? gAny.tutor?.display_name ?? 'Tutor';
                  const formLevel = (gAny.form_level ?? '').replace('_', ' ');
                  const memberCount = g.member_count ?? 0;
                  const sessionCount = gAny.session_count ?? gAny.sessionCount ?? 0;
                  const nextOcc = g.next_occurrence;
                  const hasAssignment = pendingAssignment?.lessonId === g.id;

                  return (
                    <div
                      key={g.id}
                      className="enr-card-hover"
                      onClick={() => router.push(`/lessons/${g.id}`)}
                      style={{
                        background: 'white', borderRadius: 16, border: '1px solid #e5e7eb',
                        overflow: 'hidden', display: 'flex', cursor: 'pointer',
                        transition: 'transform 0.2s, box-shadow 0.2s',
                        animation: 'fadeUp 0.35s ease both',
                      }}
                    >
                      {/* Banner thumbnail */}
                      <div style={{
                        width: 120, flexShrink: 0,
                        background: gAny.cover_image ? `url(${gAny.cover_image}) center/cover no-repeat` : gradient,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {!gAny.cover_image && (
                          <div style={{ width: 48, height: 48, background: 'rgba(255,255,255,0.18)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
                            <BookIcon opacity={0.85} />
                          </div>
                        )}
                      </div>

                      {/* Body */}
                      <div style={{ padding: '16px 20px', flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#199358', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
                          {g.subject || 'Lesson'}
                        </div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 3 }}>{g.name}</div>
                        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>
                          with {tutorName}{formLevel ? ` · ${formLevel}` : ''}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                          <div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Next</div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: nextOcc ? '#199358' : '#9ca3af' }}>
                              {nextOcc ? fmtDate(nextOcc.scheduled_start_at) : '—'}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Sessions</div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{sessionCount}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Members</div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{memberCount}</div>
                          </div>
                          {hasAssignment && (
                            <div>
                              <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Assignment</div>
                              <span style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: '#f3f4f6', color: '#6b7280' }}>
                                Pending
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div
                        onClick={(e) => e.stopPropagation()}
                        style={{ padding: 16, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8, flexShrink: 0 }}
                      >
                        <button
                          onClick={() => router.push(`/lessons/${g.id}`)}
                          style={{ padding: '8px 16px', background: '#199358', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                        >
                          Open lesson
                        </button>
                        {hasAssignment && (
                          <button
                            onClick={() => router.push(`/lessons/${g.id}`)}
                            style={{ padding: '8px 16px', background: 'white', color: '#374151', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                          >
                            Submit work
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── DISCOVER TAB ── */}
      {tab === 'discover' && (
        <div style={{ padding: '28px 32px', animation: 'fadeUp 0.3s ease both' }}>

          {/* Filter + sort row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, position: 'relative', flexWrap: 'wrap' }} ref={filterPanelRef}>

            {/* Filters button */}
            <button
              onClick={() => { setFilterOpen((o) => !o); setPendingFilters(filters); }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '9px 16px', border: `1.5px solid ${filterOpen || activeFilterCount > 0 ? '#199358' : '#e5e7eb'}`,
                borderRadius: 10, background: 'white', fontSize: 13, fontWeight: 600,
                color: filterOpen || activeFilterCount > 0 ? '#199358' : '#374151',
                cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s', flexShrink: 0,
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
              Filters
              {activeFilterCount > 0 && (
                <span style={{ background: '#199358', color: 'white', width: 18, height: 18, borderRadius: '50%', fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* Sort */}
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              style={{ padding: '9px 12px', border: '1.5px solid #e5e7eb', borderRadius: 10, background: 'white', fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer', fontFamily: 'inherit', outline: 'none', flexShrink: 0 }}
            >
              <option value="latest">Latest</option>
              <option value="popular">Most popular</option>
              <option value="price-asc">Price: Low to High</option>
              <option value="next-session">Next session</option>
            </select>

            {/* Active filter pills */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flex: 1 }}>
              {(Object.entries(filters) as [keyof ActiveFilters, string[]][]).flatMap(([group, vals]) =>
                vals.map((v) => (
                  <span key={`${group}-${v}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: '#e8f5ee', color: '#137a48', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
                    {v}
                    <button
                      onClick={() => removeActiveFilter(group, v)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#137a48', fontSize: 14, lineHeight: 1, padding: 0, opacity: 0.7 }}
                    >
                      ×
                    </button>
                  </span>
                ))
              )}
            </div>

            {/* Clear all */}
            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                style={{ fontSize: 13, fontWeight: 600, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0 }}
              >
                Clear all
              </button>
            )}

            {/* Filter dropdown panel */}
            {filterOpen && (
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute', top: 'calc(100% + 8px)', left: 0,
                  background: 'white', border: '1px solid #e5e7eb', borderRadius: 14,
                  boxShadow: '0 10px 40px rgba(0,0,0,0.12)', padding: '20px 24px',
                  zIndex: 100, minWidth: 520,
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                  {/* Exam Level */}
                  <FilterGroup
                    label="Exam Level"
                    options={['SEA', 'CSEC', 'CAPE']}
                    active={pendingFilters.examLevel}
                    onToggle={(v) => togglePendingChip('examLevel', v)}
                  />
                  {/* Price */}
                  <FilterGroup
                    label="Price"
                    options={['Free', 'Paid']}
                    active={pendingFilters.price}
                    onToggle={(v) => togglePendingChip('price', v)}
                  />
                  {/* Form Level */}
                  <FilterGroup
                    label="Form Level"
                    options={['Form 1', 'Form 2', 'Form 3', 'Form 4', 'Form 5', 'Form 6']}
                    active={pendingFilters.formLevel}
                    onToggle={(v) => togglePendingChip('formLevel', v)}
                  />
                  {/* Rating */}
                  <FilterGroup
                    label="Rating"
                    options={['⭐ Highly Rated', 'Upcoming Sessions']}
                    active={pendingFilters.rating}
                    onToggle={(v) => togglePendingChip('rating', v)}
                  />
                </div>
                {/* Footer */}
                <div style={{ borderTop: '1px solid #f3f4f6', marginTop: 18, paddingTop: 14, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button
                    onClick={() => { setPendingFilters(EMPTY_FILTERS); }}
                    style={{ padding: '8px 16px', border: '1px solid #e5e7eb', borderRadius: 8, background: 'white', fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    Clear
                  </button>
                  <button
                    onClick={applyFilters}
                    style={{ padding: '8px 18px', border: 'none', borderRadius: 8, background: '#199358', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Results count */}
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>
            Showing <strong style={{ color: '#111827' }}>{filteredDiscover.length}</strong> lesson{filteredDiscover.length !== 1 ? 's' : ''}
          </div>

          {/* Card grid */}
          {filteredDiscover.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#6b7280', fontSize: 14 }}>
              No lessons match your filters.{' '}
              <button onClick={clearFilters} style={{ color: '#199358', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }}>Clear filters</button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
              {filteredDiscover.map((g, i) => (
                <DiscoverCard
                  key={g.id}
                  group={g}
                  index={i}
                  onOpen={() => router.push(`/lessons/${g.id}`)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Filter group sub-component ───────────────────────────────────────────────

function FilterGroup({ label, options, active, onToggle }: { label: string; options: string[]; active: string[]; onToggle: (v: string) => void }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {options.map((opt) => {
          const isActive = active.includes(opt);
          return (
            <button
              key={opt}
              onClick={() => onToggle(opt)}
              style={{
                padding: '7px 14px', border: `1.5px solid ${isActive ? '#199358' : '#e5e7eb'}`,
                borderRadius: 999, background: isActive ? '#199358' : 'white',
                fontSize: 13, fontWeight: 600, color: isActive ? 'white' : '#374151',
                cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
              }}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Discover card sub-component ──────────────────────────────────────────────

function DiscoverCard({ group, index, onOpen }: { group: GroupWithTutor; index: number; onOpen: () => void }) {
  const g = group as any;
  const gradient = g.cover_image ? undefined : getSubjectGradient(group.subject ?? '');
  const tutorName = g.tutor_name ?? g.tutor?.full_name ?? g.tutor?.display_name ?? 'Tutor';
  const { text: priceText, paid } = priceLabel(g);
  const formLevelLabel = (g.form_level ?? '').replace('_', ' ') || 'All levels';
  const memberCount = group.member_count ?? 0;
  const sessionCount = g.session_count ?? g.sessionCount ?? 0;
  const nextOcc = group.next_occurrence;
  const rating = g.average_rating ?? g.rating ?? 0;
  const avatarColor = getAvatarColor(tutorName);

  return (
    <div
      className="st-card-hover join-btn-wrap"
      onClick={onOpen}
      style={{
        background: 'white', borderRadius: 16, border: '1px solid #e5e7eb',
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
        transition: 'transform 0.2s, box-shadow 0.2s', cursor: 'pointer',
        animation: `fadeUp 0.4s ${0.05 * (index % 6)}s ease both`,
      }}
    >
      {/* Banner */}
      <div style={{
        height: 148, position: 'relative',
        background: g.cover_image ? `url(${g.cover_image}) center/cover no-repeat` : gradient,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {!g.cover_image && (
          <div style={{ width: 64, height: 64, background: 'rgba(255,255,255,0.18)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(6px)' }}>
            <BookIcon opacity={0.8} />
          </div>
        )}
        {/* Form badge */}
        <span style={{ position: 'absolute', top: 12, left: 12, background: 'rgba(0,0,0,0.35)', color: 'white', padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, backdropFilter: 'blur(4px)' }}>
          {formLevelLabel}
        </span>
        {/* Price badge */}
        <span style={{ position: 'absolute', top: 12, right: 12, background: 'rgba(255,255,255,0.95)', color: paid ? '#FF6B00' : '#199358', padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 800 }}>
          {priceText}
        </span>
      </div>

      {/* Card body */}
      <div style={{ padding: '18px 20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#199358', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 5 }}>
          {group.subject || 'Lesson'}
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 3, lineHeight: 1.3 }}>{group.name}</div>
        <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12 }}>{memberCount} students enrolled</div>

        {/* Tutor row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <div style={{ width: 26, height: 26, borderRadius: '50%', background: avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'white', flexShrink: 0 }}>
            {getInitials(tutorName)}
          </div>
          <span style={{ fontSize: 13, fontWeight: 500, color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tutorName}</span>
          <StarRating rating={rating} />
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderTop: '1px solid #f3f4f6', paddingTop: 12, marginTop: 'auto' }}>
          {[
            { label: 'Members', value: memberCount, color: '#111827' },
            { label: 'Next', value: nextOcc ? fmtDate(nextOcc.scheduled_start_at) : '—', color: '#7c3aed' },
            { label: 'Sessions', value: sessionCount, color: '#111827' },
          ].map((stat) => (
            <div key={stat.label} style={{ textAlign: 'center', borderLeft: stat.label !== 'Members' ? '1px solid #f3f4f6' : 'none' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 3 }}>{stat.label}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: stat.color }}>{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Join button (fades in on hover via CSS class) */}
        <button
          className="join-btn"
          onClick={(e) => { e.stopPropagation(); onOpen(); }}
          style={{ width: '100%', padding: 10, border: 'none', borderRadius: 10, background: '#199358', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', marginTop: 14 }}
        >
          Join lesson →
        </button>
      </div>
    </div>
  );
}
