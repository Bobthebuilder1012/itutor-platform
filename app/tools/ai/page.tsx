'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useProfile } from '@/lib/hooks/useProfile';
import DashboardLayout from '@/components/DashboardLayout';

type QuestionResult = {
  question: string;
  marks_available: number;
  marks_awarded: number;
  student_answer_summary: string;
  marking_notes: string;
};

type MarkingResult = {
  student_name: string;
  student_results: QuestionResult[];
  total_score: number;
  total_available: number;
};

type Student = {
  id: string;
  name: string;
  paperFiles: File[];
  paperFileNames: string[];
  result: MarkingResult | null;
  status: 'pending' | 'marking' | 'done' | 'failed';
};

type GradingSession = {
  id: string;
  createdAt: string;
  sessionName: string;
  totalMarks: number;
  students: Omit<Student, 'paperFiles'>[];
};

const AVATAR_COLORS = [
  { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  { bg: 'bg-blue-100', text: 'text-blue-700' },
  { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  { bg: 'bg-purple-100', text: 'text-purple-700' },
];

const MAX_STUDENTS = 25;
const QUICK_MARKS = [20, 30, 50, 100];

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts[0]?.length >= 2) return parts[0].slice(0, 2).toUpperCase();
  return '?';
}

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function newStudent(): Student {
  return { id: makeId(), name: '', paperFiles: [], paperFileNames: [], result: null, status: 'pending' };
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ', ' + d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function isThisWeek(iso: string) {
  const now = new Date();
  const d = new Date(iso);
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  return d >= startOfWeek;
}

function isThisMonth(iso: string) {
  const now = new Date();
  const d = new Date(iso);
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

function loadSessions(): GradingSession[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem('itutor_ai_sessions') || '[]');
  } catch { return []; }
}

function saveSessions(sessions: GradingSession[]) {
  localStorage.setItem('itutor_ai_sessions', JSON.stringify(sessions));
}

export default function ToolsAiPage() {
  const { profile, loading } = useProfile();
  const router = useRouter();

  const [currentState, setCurrentState] = useState(0);
  const [sessions, setSessions] = useState<GradingSession[]>([]);
  const [sessionName, setSessionName] = useState('');
  const [totalMarks, setTotalMarks] = useState(30);
  const [customMarks, setCustomMarks] = useState('');
  const [selectedQuick, setSelectedQuick] = useState<number | null>(30);
  const [answerKey, setAnswerKey] = useState<File | null>(null);
  const [students, setStudents] = useState<Student[]>([newStudent(), newStudent(), newStudent()]);
  const [gradingIndex, setGradingIndex] = useState(0);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [viewingSession, setViewingSession] = useState<GradingSession | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const abortRef = useRef<AbortController | null>(null);

  const answerKeyRef = useRef<HTMLInputElement>(null);
  const paperRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    if (loading) return;
    if (!profile) { router.push('/login'); return; }
    if (profile.role !== 'tutor') { router.replace('/login'); }
  }, [profile, loading, router]);

  useEffect(() => {
    setSessions(loadSessions());
  }, []);

  const readyStudents = useMemo(
    () => students.filter((s) => s.name.trim() && s.paperFiles.length > 0),
    [students],
  );
  const uploadedCount = useMemo(() => students.filter((s) => s.paperFiles.length > 0).length, [students]);
  const canGrade = !!answerKey && readyStudents.length > 0;

  const updateStudent = useCallback((id: string, patch: Partial<Student>) => {
    setStudents((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, []);

  const removeStudent = useCallback((id: string) => {
    setStudents((prev) => {
      const next = prev.filter((s) => s.id !== id);
      return next.length === 0 ? [newStudent()] : next;
    });
  }, []);

  const addStudent = useCallback(() => {
    setStudents((prev) => (prev.length < MAX_STUDENTS ? [...prev, newStudent()] : prev));
  }, []);

  const handleQuickMark = (n: number) => {
    setSelectedQuick(n);
    setCustomMarks('');
    setTotalMarks(n);
  };

  const handleCustomMarks = (v: string) => {
    setCustomMarks(v);
    const n = parseInt(v, 10);
    if (n > 0) { setSelectedQuick(null); setTotalMarks(n); }
  };

  const resetSetupState = () => {
    setSessionName('');
    setTotalMarks(30);
    setCustomMarks('');
    setSelectedQuick(30);
    setAnswerKey(null);
    setStudents([newStudent(), newStudent(), newStudent()]);
    setGradingIndex(0);
    setExpandedRow(null);
    setViewingSession(null);
  };

  const startGrading = async () => {
    if (!canGrade || !answerKey) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setCurrentState(2);
    setGradingIndex(0);

    const snapshot = readyStudents.map((s) => ({ ...s }));
    const targets = snapshot.map((s) => s.id);

    setStudents((prev) =>
      prev.map((s) =>
        targets.includes(s.id) ? { ...s, status: 'pending' as const, result: null } : s,
      ),
    );

    let finalStudents: Student[] = [];

    const batchSize = 5;
    for (let i = 0; i < targets.length; i += batchSize) {
      if (controller.signal.aborted) break;
      const batch = targets.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (sid) => {
          setStudents((prev) => prev.map((s) => (s.id === sid ? { ...s, status: 'marking' } : s)));
          try {
            const stu = snapshot.find((s) => s.id === sid)!;
            const fd = new FormData();
            fd.append('answer_key', answerKey);
            fd.append('student_paper', stu.paperFiles[0]);
            fd.append('student_name', stu.name);
            fd.append('total_marks', String(totalMarks));
            const res = await fetch('/api/ai/mark-paper', {
              method: 'POST',
              body: fd,
              signal: controller.signal,
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            setStudents((prev) => {
              const updated = prev.map((s) => (s.id === sid ? { ...s, status: 'done' as const, result: data } : s));
              finalStudents = updated;
              return updated;
            });
          } catch (err: unknown) {
            if (err instanceof Error && err.name === 'AbortError') return;
            setStudents((prev) => {
              const updated = prev.map((s) => (s.id === sid ? { ...s, status: 'failed' as const } : s));
              finalStudents = updated;
              return updated;
            });
          }
          setGradingIndex((p) => p + 1);
        }),
      );
    }

    if (!controller.signal.aborted) {
      const session: GradingSession = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        sessionName: sessionName || 'Untitled session',
        totalMarks,
        students: finalStudents
          .filter((s) => targets.includes(s.id))
          .map(({ paperFiles, ...rest }) => rest),
      };
      const existing = loadSessions();
      existing.unshift(session);
      saveSessions(existing);
      setSessions(existing);
      setViewingSession(session);
      setCurrentState(3);
    }
  };

  const handleCancel = () => {
    const confirmed = window.confirm('Are you sure? Results for students already graded will be lost.');
    if (confirmed) {
      abortRef.current?.abort();
      resetSetupState();
      setCurrentState(1);
    }
  };

  const exportCSV = (studs: Omit<Student, 'paperFiles'>[], marks: number) => {
    const rows = [['Student Name', 'Score', 'Total', 'Percentage', 'Pass/Fail']];
    studs
      .filter((s) => s.status === 'done' && s.result)
      .forEach((s) => {
        const r = s.result!;
        const pct = marks > 0 ? Math.round((r.total_score / marks) * 100) : 0;
        rows.push([s.name, String(r.total_score), String(marks), `${pct}%`, pct >= 50 ? 'Pass' : 'Fail']);
      });
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'grading_results.csv';
    a.click();
  };

  /* ── derived stats helpers ── */
  function computeStats(studs: Omit<Student, 'paperFiles'>[], marks: number) {
    const graded = studs.filter((s) => s.status === 'done' && s.result);
    const avg = graded.length ? graded.reduce((a, s) => a + s.result!.total_score, 0) / graded.length : 0;
    const avgPct = marks > 0 ? Math.round((avg / marks) * 100) : 0;
    const passCount = graded.filter((s) => marks > 0 && (s.result!.total_score / marks) * 100 >= 50).length;
    const passRate = graded.length ? Math.round((passCount / graded.length) * 100) : 0;
    const failStuds = graded.filter((s) => marks > 0 && (s.result!.total_score / marks) * 100 < 50);
    return { graded, avg, avgPct, passCount, passRate, failStuds };
  }

  const activeStuds = viewingSession ? viewingSession.students : students.map(({ paperFiles, ...rest }) => rest);
  const activeMarks = viewingSession ? viewingSession.totalMarks : totalMarks;
  const stats = computeStats(activeStuds, activeMarks);

  const hardestQuestions = useMemo(() => {
    const qMap: Record<string, { total: number; awarded: number; count: number }> = {};
    stats.graded.forEach((s) =>
      s.result!.student_results.forEach((q) => {
        if (!qMap[q.question]) qMap[q.question] = { total: q.marks_available, awarded: 0, count: 0 };
        qMap[q.question].awarded += q.marks_awarded;
        qMap[q.question].count += 1;
      }),
    );
    return Object.entries(qMap)
      .map(([q, v]) => ({ question: q, avg: v.count > 0 ? v.awarded / v.count : 0, total: v.total }))
      .sort((a, b) => a.avg / (a.total || 1) - b.avg / (b.total || 1))
      .slice(0, 3);
  }, [stats.graded]);

  /* ── history filters ── */
  const filteredSessions = useMemo(() => {
    let list = [...sessions];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((s) => s.sessionName.toLowerCase().includes(q));
    }
    if (dateFilter === 'week') list = list.filter((s) => isThisWeek(s.createdAt));
    if (dateFilter === 'month') list = list.filter((s) => isThisMonth(s.createdAt));
    if (sortBy === 'oldest') list.reverse();
    if (sortBy === 'highest') list.sort((a, b) => {
      const avgA = computeStats(a.students, a.totalMarks).avgPct;
      const avgB = computeStats(b.students, b.totalMarks).avgPct;
      return avgB - avgA;
    });
    if (sortBy === 'lowest') list.sort((a, b) => {
      const avgA = computeStats(a.students, a.totalMarks).avgPct;
      const avgB = computeStats(b.students, b.totalMarks).avgPct;
      return avgA - avgB;
    });
    return list;
  }, [sessions, searchQuery, dateFilter, sortBy]);

  /* ── history aggregate stats ── */
  const historyStats = useMemo(() => {
    const totalSessions = sessions.length;
    const totalPapers = sessions.reduce((a, s) => a + s.students.length, 0);
    const sessionAvgs = sessions.map((s) => computeStats(s.students, s.totalMarks).avgPct);
    const avgScore = sessionAvgs.length ? Math.round(sessionAvgs.reduce((a, b) => a + b, 0) / sessionAvgs.length) : 0;
    const sessionPassRates = sessions.map((s) => computeStats(s.students, s.totalMarks).passRate);
    const avgPassRate = sessionPassRates.length ? Math.round(sessionPassRates.reduce((a, b) => a + b, 0) / sessionPassRates.length) : 0;
    return { totalSessions, totalPapers, avgScore, avgPassRate };
  }, [sessions]);

  if (loading || !profile) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-itutor-green" />
      </div>
    );
  }
  if (profile.role !== 'student' && profile.role !== 'tutor') return null;

  const displayName = profile.username || profile.display_name || profile.full_name || 'User';

  /* ═══════════════════ STATE 2 — GRADING ═══════════════════ */
  if (currentState === 2) {
    const total = readyStudents.length;
    const done = gradingIndex;
    const currentName = students.find((s) => s.status === 'marking')?.name || '';
    const remaining = total - done;
    const estSeconds = remaining * 8;
    const estText = estSeconds <= 10 ? 'Almost done...' : `Est. time remaining: ~${estSeconds} seconds`;

    return (
      <DashboardLayout role={profile.role as 'student' | 'tutor'} userName={displayName}>
        <div className="flex items-center justify-center min-h-[70vh]">
          <div className="w-full max-w-lg text-center">
            <div className="mx-auto mb-6 w-16 h-16 border-[3px] border-gray-200 border-t-itutor-green rounded-full animate-spin" />
            <h2 className="text-xl font-semibold text-gray-900 mb-1">Grading in progress...</h2>
            <p className="text-sm text-gray-500 mb-1">Do not close this page</p>
            <p className="text-xs text-gray-400 mb-6">{estText}</p>

            <div className="w-full max-w-[400px] mx-auto mb-2 bg-gray-100 rounded-full h-2.5 overflow-hidden">
              <div
                className="h-full bg-itutor-green rounded-full transition-all duration-500"
                style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }}
              />
            </div>
            <p className="text-sm text-gray-600 mb-6">
              {done < total ? `Marking ${currentName}... ${done} of ${total}` : 'Finishing up...'}
            </p>

            <div className="bg-white border border-gray-100 rounded-xl p-4 text-left space-y-2">
              {students
                .filter((s) => readyStudents.some((r) => r.id === s.id))
                .map((s) => (
                  <div key={s.id} className="flex items-center gap-3 py-1.5 px-2 rounded-lg">
                    {s.status === 'marking' && (
                      <div className="w-4 h-4 border-2 border-gray-200 border-t-itutor-green rounded-full animate-spin flex-shrink-0" />
                    )}
                    {s.status === 'done' && <span className="text-itutor-green text-sm flex-shrink-0">✓</span>}
                    {s.status === 'failed' && <span className="text-red-500 text-sm flex-shrink-0">⚠</span>}
                    {s.status === 'pending' && <span className="w-4 h-4 rounded-full bg-gray-100 flex-shrink-0" />}
                    <span className="text-sm text-gray-700">{s.name}</span>
                    {s.status === 'failed' && (
                      <span className="text-xs text-red-400 ml-auto">Manual review required</span>
                    )}
                  </div>
                ))}
            </div>

            <button
              onClick={handleCancel}
              className="mt-6 px-4 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel grading
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  /* ═══════════════════ STATE 3 — RESULTS ═══════════════════ */
  if (currentState === 3) {
    const s3 = viewingSession;
    const s3Studs = s3 ? s3.students : students.map(({ paperFiles, ...rest }) => rest);
    const s3Marks = s3 ? s3.totalMarks : totalMarks;
    const s3Stats = computeStats(s3Studs, s3Marks);

    return (
      <DashboardLayout role={profile.role as 'student' | 'tutor'} userName={displayName}>
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Results</h1>
              <p className="text-sm text-gray-500">
                {s3Stats.graded.length} student{s3Stats.graded.length !== 1 ? 's' : ''} graded · Out of {s3Marks}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => exportCSV(s3Studs, s3Marks)}
                className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Export CSV
              </button>
              <button
                onClick={() => { resetSetupState(); setCurrentState(0); }}
                className="px-4 py-2 text-sm font-medium rounded-lg text-white bg-itutor-green hover:opacity-90 transition-opacity"
              >
                + New session
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-gray-100 rounded-xl p-5">
              <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Class average</p>
              <p className="text-lg font-semibold text-itutor-green">
                {s3Stats.avg.toFixed(1)} / {s3Marks} ({s3Stats.avgPct}%)
              </p>
            </div>
            <div className="bg-white border border-gray-100 rounded-xl p-5">
              <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Pass rate</p>
              <p className={`text-lg font-semibold ${s3Stats.passRate >= 70 ? 'text-itutor-green' : s3Stats.passRate >= 50 ? 'text-amber-500' : 'text-red-500'}`}>
                {s3Stats.passRate}%
              </p>
            </div>
            <div className="bg-white border border-gray-100 rounded-xl p-5">
              <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Needs support (&lt;50%)</p>
              <p className={`text-lg font-semibold ${s3Stats.failStuds.length > 0 ? 'text-red-500' : 'text-itutor-green'}`}>
                {s3Stats.failStuds.length} student{s3Stats.failStuds.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
            <div className="grid grid-cols-[1fr_180px_100px_90px] gap-3 px-5 py-3 border-b border-gray-100 text-xs text-gray-500 font-medium">
              <span>Student</span>
              <span>Answer sheet</span>
              <span>Score</span>
              <span>Result</span>
            </div>
            {s3Stats.graded.map((s, idx) => {
              const r = s.result!;
              const pct = s3Marks > 0 ? (r.total_score / s3Marks) * 100 : 0;
              const pass = pct >= 50;
              const expanded = expandedRow === s.id;
              const color = AVATAR_COLORS[idx % AVATAR_COLORS.length];
              return (
                <div key={s.id}>
                  <div
                    onClick={() => setExpandedRow(expanded ? null : s.id)}
                    className="grid grid-cols-[1fr_180px_100px_90px] gap-3 px-5 py-3 items-center border-b border-gray-50 hover:bg-gray-50/60 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full ${color.bg} ${color.text} flex items-center justify-center text-xs font-semibold flex-shrink-0`}>
                        {getInitials(s.name)}
                      </div>
                      <span className="text-sm font-medium text-gray-900 truncate">{s.name}</span>
                    </div>
                    <span className="text-xs text-gray-400 truncate">{s.paperFileNames[0] || '—'}</span>
                    <span className={`text-sm font-semibold ${pass ? 'text-itutor-green' : 'text-red-500'}`}>
                      {r.total_score} / {s3Marks}
                    </span>
                    <span className={`inline-flex items-center justify-center text-xs font-medium px-2.5 py-0.5 rounded-full ${pass ? 'bg-emerald-50 text-itutor-green' : 'bg-red-50 text-red-600'}`}>
                      {pass ? 'Pass' : 'Fail'}
                    </span>
                  </div>
                  {expanded && (
                    <div className="px-5 py-4 bg-gray-50/40 border-b border-gray-100">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-gray-500">
                            <th className="text-left py-1.5 font-medium">Question</th>
                            <th className="text-center py-1.5 font-medium">Available</th>
                            <th className="text-center py-1.5 font-medium">Awarded</th>
                            <th className="text-left py-1.5 font-medium">Student Answer</th>
                            <th className="text-left py-1.5 font-medium">Notes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {r.student_results.map((q, qi) => (
                            <tr key={qi} className="border-t border-gray-100">
                              <td className="py-2 font-medium text-gray-800">{q.question}</td>
                              <td className="py-2 text-center text-gray-500">{q.marks_available}</td>
                              <td className="py-2 text-center font-medium text-gray-800">{q.marks_awarded}</td>
                              <td className="py-2 text-gray-600 max-w-[200px] truncate">{q.student_answer_summary}</td>
                              <td className="py-2 text-gray-500 max-w-[200px] truncate">{q.marking_notes}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
            {s3Studs
              .filter((s) => s.status === 'failed')
              .map((s, idx) => {
                const color = AVATAR_COLORS[(s3Stats.graded.length + idx) % AVATAR_COLORS.length];
                return (
                  <div key={s.id} className="grid grid-cols-[1fr_180px_100px_90px] gap-3 px-5 py-3 items-center border-b border-gray-50">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full ${color.bg} ${color.text} flex items-center justify-center text-xs font-semibold flex-shrink-0`}>
                        {getInitials(s.name)}
                      </div>
                      <span className="text-sm font-medium text-gray-900 truncate">{s.name}</span>
                    </div>
                    <span className="text-xs text-gray-400 truncate">{s.paperFileNames[0] || '—'}</span>
                    <span className="text-sm text-red-400">—</span>
                    <span className="inline-flex items-center justify-center text-xs font-medium px-2.5 py-0.5 rounded-full bg-red-50 text-red-600">Error</span>
                  </div>
                );
              })}
          </div>

          <div className="bg-white border border-gray-100 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">Class insights</h3>
            {hardestQuestions.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1.5">Hardest questions</p>
                <div className="space-y-1">
                  {hardestQuestions.map((q) => (
                    <div key={q.question} className="flex items-center gap-2 text-sm">
                      <span className="text-red-500 text-xs">▼</span>
                      <span className="font-medium text-gray-700">{q.question}</span>
                      <span className="text-gray-400">— avg {q.avg.toFixed(1)} / {q.total}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {s3Stats.failStuds.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1.5">Students needing support</p>
                <div className="flex flex-wrap gap-1.5">
                  {s3Stats.failStuds.map((s) => (
                    <span key={s.id} className="text-xs bg-red-50 text-red-600 rounded-full px-2.5 py-0.5">{s.name}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  /* ═══════════════════ STATE 1 — SETUP ═══════════════════ */
  if (currentState === 1) {
    return (
      <DashboardLayout role={profile.role as 'student' | 'tutor'} userName={displayName}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <button onClick={() => { resetSetupState(); setCurrentState(0); }} className="font-medium text-gray-900 hover:text-itutor-green transition-colors">iTutor AI</button>
            <span>›</span>
            <span>New grading session</span>
          </div>
          <button
            onClick={() => { resetSetupState(); setCurrentState(0); }}
            className="flex items-center gap-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors"
          >
            ← Back to sessions
          </button>
        </div>

        <div className="flex gap-6 items-start">
          <div className="flex-1 min-w-0 space-y-5">
            {/* Session name */}
            <input
              type="text"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              placeholder="Session name e.g. Spanish — Chapter 3 Quiz"
              className="w-full border border-gray-200 rounded-xl px-5 py-3.5 text-base font-medium text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition"
            />

            {/* Card 1 — Marks */}
            <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-50 flex items-center gap-2">
                <span className="text-itutor-green">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 7h6m-6 4h6m-3 4h3M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z" strokeWidth="1.8" strokeLinecap="round" /></svg>
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Marks available</h2>
                  <p className="text-xs text-gray-400">How many marks is this test out of?</p>
                </div>
              </div>
              <div className="p-5 space-y-4">
                <div className="inline-flex items-baseline gap-1.5 bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-2.5">
                  <span className="text-2xl text-emerald-300">—</span>
                  <span className="text-[13px] text-gray-300 mx-0.5">/</span>
                  <span className="text-3xl font-medium text-itutor-green">{totalMarks}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {QUICK_MARKS.map((n) => (
                    <button
                      key={n}
                      onClick={() => handleQuickMark(n)}
                      className={`px-4 py-1.5 text-sm rounded-full border transition-colors ${selectedQuick === n ? 'bg-itutor-green text-white border-itutor-green' : 'border-gray-200 text-gray-600 hover:border-itutor-green hover:text-itutor-green'}`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Custom:</span>
                  <input
                    type="number"
                    min={1}
                    value={customMarks}
                    onChange={(e) => handleCustomMarks(e.target.value)}
                    placeholder="Enter total"
                    className="w-28 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition"
                  />
                </div>
              </div>
            </div>

            {/* Card 2 — Answer key */}
            <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-red-500">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" strokeWidth="1.8" strokeLinecap="round" /></svg>
                  </span>
                  <h2 className="text-sm font-semibold text-gray-900">Answer key</h2>
                </div>
                {answerKey ? (
                  <span className="text-xs font-medium text-itutor-green bg-emerald-50 rounded-full px-2.5 py-0.5">✓ Uploaded</span>
                ) : (
                  <span className="text-xs font-medium text-red-600 bg-red-50 rounded-full px-2.5 py-0.5">Required</span>
                )}
              </div>
              <div className="p-5">
                <input ref={answerKeyRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setAnswerKey(f); }} />
                {!answerKey ? (
                  <>
                    <div className="bg-red-50 border border-red-100 rounded-lg p-3 mb-4 text-xs text-red-700">
                      An answer key is required to grade. Upload your completed version of the test so the AI knows the correct answers. Grading cannot begin without it.
                    </div>
                    <div
                      onClick={() => answerKeyRef.current?.click()}
                      className="border-[1.5px] border-dashed border-red-300 rounded-xl py-7 px-5 text-center bg-red-50/40 cursor-pointer hover:bg-red-50 transition-colors"
                    >
                      <div className="text-2xl text-red-500 mb-1">↑</div>
                      <div className="text-sm font-medium text-red-900">Click to upload your answer key</div>
                      <div className="text-xs text-gray-500 mt-1">JPG, PNG or PDF · Your completed version of the test with correct answers marked</div>
                    </div>
                    <p className="text-xs text-gray-400 mt-3 px-1">📷 For best results, take photos in good lighting on a flat surface. Clearer images = more accurate marking.</p>
                  </>
                ) : (
                  <div className="flex items-center gap-3.5 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                    <div className="w-12 h-14 bg-white border border-emerald-200 rounded-md flex items-center justify-center text-xl flex-shrink-0">📄</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-emerald-800 truncate">{answerKey.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">Uploaded · Answer key active · Full accuracy enabled</p>
                    </div>
                    <button
                      onClick={() => { setAnswerKey(null); if (answerKeyRef.current) answerKeyRef.current.value = ''; }}
                      className="text-xs text-gray-500 border border-emerald-200 rounded-md px-3 py-1 hover:text-red-500 hover:border-red-200 transition-colors flex-shrink-0"
                    >
                      × Remove
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Card 3 — Students */}
            <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-blue-500">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </span>
                  <h2 className="text-sm font-semibold text-gray-900">Students</h2>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span className="bg-blue-50 text-blue-600 rounded-full px-2.5 py-0.5 font-medium">{students.length} / {MAX_STUDENTS}</span>
                  <span>{MAX_STUDENTS} students max per session</span>
                </div>
              </div>
              <div className="p-5 space-y-2">
                <p className="text-xs text-gray-400 px-1 mb-1">📷 Clearer photos = more accurate marking</p>
                <div className="grid gap-2.5 items-center text-[11px] text-gray-400 font-medium px-1" style={{ gridTemplateColumns: '44px 1fr 200px 100px 32px' }}>
                  <span />
                  <span>Student name</span>
                  <span>Answer sheet</span>
                  <span className="text-center">Score</span>
                  <span />
                </div>

                {students.map((s, idx) => {
                  const color = AVATAR_COLORS[idx % AVATAR_COLORS.length];
                  const hasPaper = s.paperFiles.length > 0;
                  return (
                    <div
                      key={s.id}
                      className={`grid gap-2.5 items-center rounded-lg p-2.5 border transition-colors ${hasPaper ? 'bg-gray-50 border-gray-200 border-l-[3px] border-l-itutor-green' : s.name ? 'bg-gray-50 border-gray-200' : 'bg-white border-dashed border-gray-200'}`}
                      style={{ gridTemplateColumns: '44px 1fr 200px 100px 32px' }}
                    >
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold ${s.name ? `${color.bg} ${color.text}` : 'bg-gray-100 text-gray-400'}`}>
                        {s.name ? getInitials(s.name) : '?'}
                      </div>
                      <input
                        type="text"
                        placeholder="Student name"
                        value={s.name}
                        onChange={(e) => updateStudent(s.id, { name: e.target.value })}
                        className="border border-gray-200 rounded-lg px-3 py-2 text-[13px] w-full focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition"
                      />
                      <div>
                        <input
                          ref={(el) => { paperRefs.current[s.id] = el; }}
                          type="file"
                          accept="image/*,application/pdf"
                          multiple
                          className="hidden"
                          onChange={(e) => {
                            const files = e.target.files;
                            if (files && files.length > 0) {
                              updateStudent(s.id, {
                                paperFiles: Array.from(files),
                                paperFileNames: Array.from(files).map((f) => f.name),
                              });
                            }
                          }}
                        />
                        <button
                          onClick={() => paperRefs.current[s.id]?.click()}
                          className={`w-full text-left rounded-lg border px-3 py-2 text-xs transition-colors ${hasPaper ? 'bg-emerald-50 border-emerald-200 text-itutor-green' : 'border-gray-200 text-gray-400 hover:border-gray-300'}`}
                        >
                          {hasPaper ? `✓ ${s.paperFileNames[0]}` : '📎 Upload answer sheet'}
                        </button>
                      </div>
                      <div className="flex items-baseline justify-center gap-0.5">
                        <span className="text-lg font-medium text-gray-300">—</span>
                        <span className="text-sm text-gray-200 mx-px">/</span>
                        <span className="text-sm text-gray-400">{totalMarks}</span>
                      </div>
                      <button
                        onClick={() => removeStudent(s.id)}
                        className="w-[30px] h-[30px] rounded-full border border-gray-200 bg-white text-gray-300 flex items-center justify-center hover:text-red-500 hover:border-red-200 transition-colors text-sm"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}

                {students.length < MAX_STUDENTS ? (
                  <button onClick={addStudent} className="w-full border border-dashed border-gray-200 rounded-lg py-2.5 text-sm text-gray-400 hover:text-itutor-green hover:border-itutor-green transition-colors">+ Add student</button>
                ) : (
                  <p className="text-center text-xs text-gray-400 py-2">Session is full ({MAX_STUDENTS}/{MAX_STUDENTS})</p>
                )}
                <p className="text-xs text-gray-400 px-1">💡 You can attach multiple images per student for multi-page tests</p>
              </div>
            </div>
          </div>

          {/* Right panel — Session summary */}
          <div className="w-[380px] flex-shrink-0 bg-white border border-gray-100 rounded-xl flex flex-col sticky top-24 self-start">
            <div className="px-5 py-3.5 border-b border-gray-50 flex items-center gap-2">
              <span className="text-itutor-green">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" strokeWidth="1.8" strokeLinecap="round" /></svg>
              </span>
              <h2 className="text-sm font-semibold text-gray-900">Session summary</h2>
            </div>
            <div className="p-5 space-y-3 flex-1">
              <div className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-lg px-3.5 py-3">
                <span className="text-xs text-gray-500">Marks available</span>
                <span className="text-sm font-medium text-itutor-green">— / {totalMarks}</span>
              </div>
              <div className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-lg px-3.5 py-3">
                <span className="text-xs text-gray-500">Answer key</span>
                {answerKey ? <span className="text-sm font-medium text-itutor-green">✓ Uploaded</span> : <span className="text-sm font-medium text-red-500">Not uploaded</span>}
              </div>
              <div className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-lg px-3.5 py-3">
                <span className="text-xs text-gray-500">Students added</span>
                <span className="text-sm font-medium text-gray-900">{students.filter((s) => s.name.trim()).length} of {MAX_STUDENTS}</span>
              </div>
              <div className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-lg px-3.5 py-3">
                <span className="text-xs text-gray-500">Papers uploaded</span>
                <span className={`text-sm font-medium ${uploadedCount > 0 && uploadedCount === students.filter((s) => s.name.trim()).length ? 'text-itutor-green' : 'text-gray-900'}`}>
                  {uploadedCount} / {students.filter((s) => s.name.trim()).length} ready
                </span>
              </div>
              <div className="bg-gray-50 rounded-lg p-3.5 mt-2">
                <p className="text-xs text-gray-500 mb-2">Once graded, you&apos;ll see:</p>
                <div className="space-y-1.5 text-xs text-gray-600">
                  <div className="flex items-center gap-1.5"><span className="text-itutor-green">✓</span> Score per student</div>
                  <div className="flex items-center gap-1.5"><span className="text-itutor-green">✓</span> Question-by-question breakdown</div>
                  <div className="flex items-center gap-1.5"><span className="text-itutor-green">✓</span> Class average and insights</div>
                </div>
              </div>
            </div>
            <div className="px-5 py-5 border-t border-gray-50">
              <button
                disabled={!canGrade}
                onClick={startGrading}
                className={`w-full py-[15px] text-base font-medium rounded-xl transition-all ${canGrade ? 'text-white border-0 cursor-pointer' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
                style={canGrade ? { background: 'linear-gradient(135deg, #199356, #157a48)', boxShadow: '0 2px 14px rgba(25,147,86,0.3)' } : undefined}
              >
                ✦ Grade Exams
              </button>
              <p className="text-[11px] text-gray-400 text-center mt-2">
                {canGrade ? `${readyStudents.length} student${readyStudents.length !== 1 ? 's' : ''} will be graded · Est. under 60 seconds` : 'Upload an answer key to enable grading'}
              </p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  /* ═══════════════════ STATE 0 — HISTORY ═══════════════════ */
  return (
    <DashboardLayout role={profile.role as 'student' | 'tutor'} userName={displayName}>
      <div className="space-y-6">
        {/* Topbar */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">iTutor AI</h1>
            <p className="text-sm text-gray-500">AI-powered test paper marking</p>
          </div>
          <button
            onClick={() => { resetSetupState(); setCurrentState(1); }}
            className="px-4 py-2.5 text-sm font-medium rounded-lg text-white bg-itutor-green hover:opacity-90 transition-opacity"
          >
            + New grading session
          </button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'TOTAL SESSIONS', value: String(historyStats.totalSessions) },
            { label: 'PAPERS GRADED', value: String(historyStats.totalPapers) },
            { label: 'AVG CLASS SCORE', value: `${historyStats.avgScore}%` },
            { label: 'AVG PASS RATE', value: `${historyStats.avgPassRate}%` },
          ].map((m) => (
            <div key={m.label} className="bg-gray-50 border border-gray-100 rounded-xl p-4">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">{m.label}</p>
              <p className="text-xl font-semibold text-itutor-green">{m.value}</p>
            </div>
          ))}
        </div>

        {/* Search & filter */}
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search sessions..."
            className="flex-1 min-w-[200px] border border-gray-200 rounded-lg px-3.5 py-2 text-sm focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition"
          />
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 focus:ring-2 focus:ring-itutor-green focus:outline-none"
          >
            <option value="all">All sessions</option>
            <option value="week">This week</option>
            <option value="month">This month</option>
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 focus:ring-2 focus:ring-itutor-green focus:outline-none"
          >
            <option value="newest">Sort: Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="highest">Highest avg</option>
            <option value="lowest">Lowest avg</option>
          </select>
        </div>

        {/* Session cards */}
        {filteredSessions.length === 0 ? (
          <div className="border-2 border-dashed border-gray-200 rounded-xl py-16 text-center">
            <div className="text-4xl text-gray-300 mb-3">📋</div>
            <p className="text-sm font-medium text-gray-500 mb-1">No grading sessions yet</p>
            <p className="text-xs text-gray-400">Click &apos;+ New grading session&apos; to get started</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredSessions.map((sess) => {
              const sStats = computeStats(sess.students, sess.totalMarks);
              const isExpanded = expandedSessionId === sess.id;
              return (
                <div key={sess.id} className="bg-white border border-gray-200 rounded-[10px] overflow-hidden">
                  <div
                    onClick={() => setExpandedSessionId(isExpanded ? null : sess.id)}
                    className="cursor-pointer"
                    style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '16px', alignItems: 'center', padding: '14px 18px' }}
                  >
                    <div className="w-10 h-10 rounded-[9px] bg-emerald-50 border border-emerald-200 flex items-center justify-center text-lg flex-shrink-0">📄</div>
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-gray-900 mb-0.5 truncate">{sess.sessionName}</div>
                      <div className="text-xs text-gray-500 flex items-center gap-2 flex-wrap">
                        <span>{formatDate(sess.createdAt)}</span>
                        <span className="w-[3px] h-[3px] rounded-full bg-gray-300 inline-block" />
                        <span>{sess.students.length} student{sess.students.length !== 1 ? 's' : ''}</span>
                        <span className="w-[3px] h-[3px] rounded-full bg-gray-300 inline-block" />
                        <span>Out of {sess.totalMarks}</span>
                        <span className="bg-emerald-50 text-green-700 border border-emerald-200 rounded-full px-2 py-px text-[11px]">Completed</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3.5 flex-shrink-0">
                      <div className="text-right">
                        <div className="text-xl font-medium text-itutor-green">{sStats.avg.toFixed(1)}</div>
                        <div className="text-[11px] text-gray-500">avg / {sess.totalMarks}</div>
                      </div>
                      <div className="text-right">
                        <div className={`text-sm font-medium ${sStats.passRate >= 70 ? 'text-itutor-green' : sStats.passRate >= 50 ? 'text-amber-500' : 'text-red-500'}`}>{sStats.passRate}%</div>
                        <div className="text-[11px] text-gray-500">pass rate</div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setViewingSession(sess);
                          setExpandedRow(null);
                          setCurrentState(3);
                        }}
                        className="border border-gray-200 rounded-[7px] px-3.5 py-[7px] text-xs text-gray-700 bg-white hover:bg-gray-50 transition-colors whitespace-nowrap"
                      >
                        View results →
                      </button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="border-t border-gray-100 px-5 py-3">
                      <div className="grid grid-cols-3 gap-2 text-xs font-medium text-gray-500 mb-2">
                        <span>Student</span>
                        <span className="text-center">Score</span>
                        <span className="text-right">Percentage</span>
                      </div>
                      {sess.students
                        .filter((s) => s.status === 'done' && s.result)
                        .sort((a, b) => (b.result?.total_score || 0) - (a.result?.total_score || 0))
                        .map((s) => {
                          const pct = sess.totalMarks > 0 ? Math.round((s.result!.total_score / sess.totalMarks) * 100) : 0;
                          return (
                            <div key={s.id} className={`grid grid-cols-3 gap-2 py-1.5 text-sm rounded px-1 ${pct < 50 ? 'bg-red-50/60' : ''}`}>
                              <span className="text-gray-700 truncate">{s.name}</span>
                              <span className="text-center text-gray-600">{s.result!.total_score} / {sess.totalMarks}</span>
                              <span className={`text-right font-medium ${pct >= 50 ? 'text-itutor-green' : 'text-red-500'}`}>{pct}%</span>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
