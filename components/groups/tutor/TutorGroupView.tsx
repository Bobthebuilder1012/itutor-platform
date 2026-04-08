'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Cropper from 'react-easy-crop';
import type {
  GroupWithTutor,
  GroupMember,
  GroupSessionWithOccurrences,
} from '@/lib/types/groups';
import { supabase } from '@/lib/supabase/client';
import { getDefaultThumbnail, deterministicDefault, isDefaultThumbnail } from '@/lib/defaultThumbnails';
import { getCroppedImg, type Area } from '@/lib/utils/imageCrop';
import SessionRow from './SessionRow';
import MemberList from './MemberList';
import CreateSessionModal from './CreateSessionModal';
import WhatsAppSetupTab from './WhatsAppSetupTab';
import GroupStreamPage from '../stream/GroupStreamPage';
import TutorFeedbackTab from './TutorFeedbackTab';

type Tab = 'stream' | 'sessions' | 'feedback' | 'whatsapp';
type ManageSection = 'profile' | 'members' | 'access' | 'danger';

interface TutorGroupViewProps {
  group: GroupWithTutor;
  currentUserId: string;
  onGroupUpdated: () => void;
}

function getInitials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

export default function TutorGroupView({ group, currentUserId, onGroupUpdated }: TutorGroupViewProps) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('stream');
  const [sessions, setSessions] = useState<GroupSessionWithOccurrences[]>([]);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [membersLoading, setMembersLoading] = useState(true);
  const [showCreateSession, setShowCreateSession] = useState(false);
  const [analytics, setAnalytics] = useState<{
    total_sessions: number;
    average_attendance_rate: number;
    student_retention_rate: number;
    student_analytics: Array<{
      student_id: string;
      student_name: string;
      attended: number;
      missed: number;
      late: number;
      joined_at: string | null;
    }>;
  } | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [manageSection, setManageSection] = useState<ManageSection>('profile');
  const [manageSaving, setManageSaving] = useState(false);
  const [manageError, setManageError] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [draggingImage, setDraggingImage] = useState(false);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [manageForm, setManageForm] = useState({
    name: group.name ?? '',
    topic: (group as any).topic ?? '',
    subject: group.subject ?? '',
    form_level: ((group as any).form_level ?? 'FORM_4') as string,
    description: group.description ?? '',
    goals: ((group as any).goals ?? '') as string,
    cover_image: ((group as any).cover_image ?? '') as string,
    pricing_mode: ((group as any).pricing_mode ?? 'FREE') as 'FREE' | 'PER_SESSION' | 'PER_COURSE',
    price_per_session: (group as any).price_per_session ?? '',
    price_per_course: (group as any).price_per_course ?? '',
  });

  const [capEnabled, setCapEnabled] = useState(false);
  const [capValue, setCapValue] = useState(25);
  const [waitlistEnabled, setWaitlistEnabled] = useState(true);
  const [autoNotify, setAutoNotify] = useState(true);
  const [visibility, setVisibility] = useState<'public' | 'unlisted' | 'private'>('public');
  const [requireApproval, setRequireApproval] = useState(true);
  const [allowStudentInvites, setAllowStudentInvites] = useState(false);
  const [rules, setRules] = useState([
    { text: 'Camera must be on during live sessions', enabled: true },
    { text: 'No recording or screenshots without permission', enabled: true },
    { text: 'Be respectful in discussions and chat', enabled: true },
  ]);

  const PERM_OPTIONS = [
    { id: 'sessions', label: 'Manage sessions' },
    { id: 'members', label: 'Manage members' },
    { id: 'stream', label: 'Post to stream' },
    { id: 'chat', label: 'Access lesson chat' },
    { id: 'settings', label: 'Edit class settings' },
  ] as const;
  type CoTutorRole = 'co-tutor' | 'assistant';
  interface CoTutor { id: string; name: string; email: string; role: CoTutorRole; permissions: string[]; }
  const [coTutors, setCoTutors] = useState<CoTutor[]>([]);
  const [showAddCoTutor, setShowAddCoTutor] = useState(false);
  const [coEmail, setCoEmail] = useState('');
  const [coRole, setCoRole] = useState<CoTutorRole>('co-tutor');
  const [coPerms, setCoPerms] = useState<string[]>(PERM_OPTIONS.map((p) => p.id));
  const [coSearching, setCoSearching] = useState(false);
  const [coSearchResult, setCoSearchResult] = useState<{ id: string; name: string; email: string } | null>(null);
  const [coError, setCoError] = useState('');

  const searchCoTutor = async () => {
    if (!coEmail.trim()) return;
    setCoSearching(true);
    setCoError('');
    setCoSearchResult(null);
    try {
      const res = await fetch(`/api/profile/search?email=${encodeURIComponent(coEmail.trim())}`);
      if (!res.ok) { setCoError('User not found. They must have an account on iTutor.'); return; }
      const data = await res.json();
      if (data.profile) {
        if (data.profile.id === currentUserId) { setCoError('You cannot add yourself.'); return; }
        if (coTutors.some((c) => c.id === data.profile.id)) { setCoError('This user is already a co-tutor.'); return; }
        setCoSearchResult({ id: data.profile.id, name: data.profile.full_name ?? data.profile.email, email: data.profile.email });
      } else {
        setCoError('User not found. They must have an account on iTutor.');
      }
    } catch {
      setCoError('Failed to search. Please try again.');
    } finally {
      setCoSearching(false);
    }
  };

  const addCoTutor = () => {
    if (!coSearchResult) return;
    setCoTutors((prev) => [...prev, { id: coSearchResult.id, name: coSearchResult.name, email: coSearchResult.email, role: coRole, permissions: coPerms }]);
    setShowAddCoTutor(false);
    setCoEmail('');
    setCoRole('co-tutor');
    setCoPerms(PERM_OPTIONS.map((p) => p.id));
    setCoSearchResult(null);
    setCoError('');
  };

  const removeCoTutor = (id: string) => {
    setCoTutors((prev) => prev.filter((c) => c.id !== id));
  };

  const fetchSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const res = await fetch(`/api/groups/${group.id}/sessions`);
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions ?? []);
      }
    } finally {
      setSessionsLoading(false);
    }
  }, [group.id]);

  const fetchMembers = useCallback(async () => {
    setMembersLoading(true);
    try {
      const res = await fetch(`/api/groups/${group.id}/members`);
      if (res.ok) {
        const data = await res.json();
        setMembers(data.members ?? []);
      }
    } finally {
      setMembersLoading(false);
    }
  }, [group.id]);

  useEffect(() => {
    fetchSessions();
    fetchMembers();
    (async () => {
      const res = await fetch(`/api/groups/${group.id}/analytics`);
      if (res.ok) {
        const data = await res.json();
        setAnalytics(data?.data ?? null);
      }
    })();
    // Track tutor visit (resets auto-archive inactivity timer)
    fetch(`/api/groups/${group.id}/visit`, { method: 'POST' }).catch(() => {});
  }, [fetchSessions, fetchMembers, group.id]);

  useEffect(() => {
    setManageForm({
      name: group.name ?? '',
      topic: (group as any).topic ?? '',
      subject: group.subject ?? '',
      form_level: ((group as any).form_level ?? 'FORM_4') as string,
      description: group.description ?? '',
      goals: ((group as any).goals ?? '') as string,
      cover_image: ((group as any).cover_image ?? '') as string,
      pricing_mode: ((group as any).pricing_mode ?? 'FREE') as 'FREE' | 'PER_SESSION' | 'PER_COURSE',
      price_per_session: (group as any).price_per_session ?? '',
      price_per_course: (group as any).price_per_course ?? '',
    });
    setManageError('');
  }, [group]);

  const handleArchive = async () => {
    if (!confirm(`Archive "${group.name}"? Members will no longer see it.`)) return;
    setArchiving(true);
    await fetch(`/api/groups/${group.id}/archive`, { method: 'POST' });
    setArchiving(false);
    onGroupUpdated();
  };

  const handleManageSave = async () => {
    if (!manageForm.name.trim()) {
      setManageError('Class name is required.');
      return;
    }
    setManageSaving(true);
    setManageError('');
    try {
      const body = {
        name: manageForm.name.trim(),
        topic: manageForm.topic.trim() || null,
        subject: manageForm.subject.trim() || null,
        form_level: manageForm.form_level || null,
        description: manageForm.description.trim() || null,
        goals: manageForm.goals.trim() || null,
        cover_image: manageForm.cover_image.trim() || null,
        pricing_mode: manageForm.pricing_mode,
        price_per_session:
          manageForm.pricing_mode === 'PER_SESSION' && manageForm.price_per_session !== ''
            ? Number(manageForm.price_per_session)
            : null,
        price_per_course:
          manageForm.pricing_mode === 'PER_COURSE' && manageForm.price_per_course !== ''
            ? Number(manageForm.price_per_course)
            : null,
      };
      const res = await fetch(`/api/groups/${group.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || 'Failed to update class settings');
      setManageOpen(false);
      onGroupUpdated();
    } catch (err: any) {
      setManageError(err?.message || 'Failed to update class settings');
    } finally {
      setManageSaving(false);
    }
  };

  const handleDelete = async () => {
    const ok = confirm(
      `Delete "${group.name}" permanently?\n\nThis will remove sessions, messages, members, and related records. This cannot be undone.`
    );
    if (!ok) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/groups/${group.id}`, { method: 'DELETE' });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || 'Failed to delete class');
      router.push('/groups');
    } catch (err: any) {
      alert(err?.message || 'Failed to delete class');
      setDeleting(false);
    }
  };

  const coverImage = (group as any).cover_image ?? null;
  const hasCustomImage = coverImage && !isDefaultThumbnail(coverImage);
  const thumbnail = getDefaultThumbnail(coverImage) ?? deterministicDefault(group.id);
  const tutorName = group.tutor?.full_name ?? 'Tutor';
  const subjects: string[] =
    (group as any).subject_list?.length > 0
      ? (group as any).subject_list
      : group.subject
      ? [group.subject]
      : [];
  const effectivePrice =
    (group as any).pricePerSession ?? (group as any).price_per_session ??
    (group as any).pricePerCourse ?? (group as any).price_per_course ?? null;
  const isPaid = effectivePrice && Number(effectivePrice) > 0;
  const nextSessionDisplay = group.next_occurrence
    ? new Date(group.next_occurrence.scheduled_start_at).toLocaleString(undefined, { month: 'short', day: 'numeric' })
    : null;
  const estimatedEarnings = Number((group as any).estimated_earnings ?? 0);
  const approvedMembers = members.filter((m) => m.status === 'approved');
  const starCount = Math.round(Number(group.tutor?.rating_average ?? 0));
  const stars = '★'.repeat(Math.min(starCount, 5)) + '☆'.repeat(Math.max(5 - starCount, 0));
  const reviewCount = group.tutor?.rating_count ?? 0;

  const upcomingOccs = useMemo(() => {
    const now = Date.now();
    const all: Array<{ date: Date; title: string; end: Date }> = [];
    for (const s of sessions) {
      for (const o of s.occurrences ?? []) {
        const d = new Date(o.scheduled_start_at);
        if (d.getTime() > now && o.status !== 'cancelled') {
          all.push({ date: d, title: s.title, end: new Date(o.scheduled_end_at) });
        }
      }
    }
    return all.sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, 3);
  }, [sessions]);

  const TABS: { id: Tab; label: string }[] = [
    { id: 'stream', label: 'Stream' },
    { id: 'sessions', label: 'Sessions' },
    { id: 'feedback', label: 'Feedback' },
    { id: 'whatsapp', label: 'WhatsApp' },
  ];

  const copyInviteLink = () => {
    void navigator.clipboard.writeText(window.location.href);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const uploadCoverImage = useCallback(async (file: Blob) => {
    if (!file.type.startsWith('image/')) {
      throw new Error('Please upload an image file');
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new Error('Image must be 10MB or smaller');
    }

    setUploadingImage(true);
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      setUploadingImage(false);
      throw new Error('Please sign in again before uploading');
    }

    const safeExt =
      file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const fileName = `cover-${Date.now()}.${safeExt}`;
    const path = `${userData.user.id}/groups/${fileName}`;

    const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, {
      contentType: file.type,
      upsert: true,
    });

    if (uploadError) {
      setUploadingImage(false);
      throw new Error(uploadError.message || 'Failed to upload image');
    }

    const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(path);
    setManageForm((prev) => ({ ...prev, cover_image: `${publicUrlData.publicUrl}?t=${Date.now()}` }));
    setUploadingImage(false);
  }, []);

  const onCropComplete = useCallback((_croppedArea: Area, nextCroppedAreaPixels: Area) => {
    setCroppedAreaPixels(nextCroppedAreaPixels);
  }, []);

  const handleCoverSelection = useCallback(async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setManageError('Please upload an image file');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setManageError('Image must be 10MB or smaller');
      return;
    }
    setManageError('');
    const reader = new FileReader();
    reader.onload = () => {
      setCropImageSrc(reader.result as string);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
    };
    reader.onerror = () => setManageError('Failed to read image');
    reader.readAsDataURL(file);
  }, []);

  const handleApplyCrop = useCallback(async () => {
    if (!cropImageSrc || !croppedAreaPixels) return;
    setManageError('');
    try {
      const croppedBlob = await getCroppedImg(cropImageSrc, croppedAreaPixels);
      await uploadCoverImage(croppedBlob);
      setCropImageSrc(null);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
    } catch (err: any) {
      setManageError(err?.message || 'Failed to upload image');
    }
  }, [cropImageSrc, croppedAreaPixels, uploadCoverImage]);

  const inputCls = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500';

  return (
    <div className="h-full overflow-y-auto bg-[#f4f6fa]">

      {/* ── HERO BANNER ── */}
      <div className="relative">
        <div className="h-[200px] flex items-center justify-center relative overflow-hidden">
          {hasCustomImage ? (
            <img src={coverImage} alt={group.name} className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0" style={{ background: thumbnail.gradient }} />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/25" />
          <div className="w-[72px] h-[72px] rounded-[18px] bg-white/30 backdrop-blur-[10px] flex items-center justify-center z-[1] shadow-[0_4px_20px_rgba(0,0,0,0.1)]">
            {hasCustomImage ? (
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
              </svg>
            ) : (
              <div className="[&_svg]:w-9 [&_svg]:h-9"><thumbnail.Icon /></div>
            )}
          </div>
        </div>

        {/* Floating hero card */}
        <div className="max-w-[1100px] mx-auto px-7 -mt-[60px] relative z-[2]">
          <div className="bg-white rounded-[14px] p-6 shadow-[0_4px_14px_rgba(0,0,0,0.06)] border border-gray-200">
            <div className="flex justify-between items-start gap-5 flex-wrap">
              <div className="flex-1 min-w-[260px]">
                <h1 className="text-2xl font-extrabold tracking-tight mb-1.5">{group.name}</h1>
                {subjects.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap mb-3">
                    {subjects.map((s) => (
                      <span key={s} className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-700">{s}</span>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2.5 mb-1">
                  {group.tutor?.avatar_url ? (
                    <img src={group.tutor.avatar_url} alt={tutorName} className="w-7 h-7 rounded-full object-cover" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[11px] font-bold">{getInitials(tutorName)}</div>
                  )}
                  <span className="text-sm font-medium text-slate-500">{tutorName}</span>
                </div>
                <div className="flex items-center gap-1.5 text-[13px] text-slate-500">
                  <span className="text-amber-400 tracking-wider">{stars}</span>
                  {reviewCount > 0 ? `${Number(group.tutor?.rating_average).toFixed(1)} (${reviewCount} reviews)` : 'No reviews yet'}
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0 flex-wrap">
                <button
                  onClick={() => setManageOpen((p) => !p)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[10px] text-[13px] font-semibold bg-emerald-500 text-white border border-emerald-500 shadow-[0_2px_8px_rgba(16,185,129,0.25)] hover:bg-emerald-600 transition-all"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                  {manageOpen ? 'Close' : 'Manage Class'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-gray-200 rounded-[10px] overflow-hidden mt-5">
              <div className="bg-white py-3.5 px-4 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-0.5">Members</p>
                <p className="text-[17px] font-extrabold">{group.member_count}</p>
              </div>
              <div className="bg-white py-3.5 px-4 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-0.5">Next Session</p>
                <p className={`text-[17px] font-extrabold ${nextSessionDisplay ? 'text-indigo-600' : 'text-red-500'}`}>
                  {nextSessionDisplay ?? 'Not scheduled'}
                </p>
              </div>
              <div className="bg-white py-3.5 px-4 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-0.5">Price</p>
                <p className="text-[17px] font-extrabold text-emerald-600">{isPaid ? `$${Number(effectivePrice)}` : 'Free'}</p>
              </div>
              <div className="bg-white py-3.5 px-4 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-0.5">Earnings</p>
                <p className="text-[17px] font-extrabold text-emerald-600">${estimatedEarnings.toFixed(2)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── MANAGE PANEL (conditional) ── */}
      {manageOpen && (
        <div className="max-w-[820px] mx-auto px-6 mt-5 pb-14">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <button onClick={() => setManageOpen(false)} className="w-9 h-9 rounded-[10px] border border-[#e4e8ee] bg-white flex items-center justify-center hover:border-emerald-500 hover:text-emerald-600 transition-colors flex-shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <h1 className="text-[22px] font-extrabold tracking-tight">Manage Class</h1>
            <span className="text-[13px] text-[#6b7280] ml-auto">{group.name}</span>
          </div>

          {/* Tabs */}
          <div className="flex gap-0 border-b-2 border-[#e4e8ee] mb-6">
            {([
              { id: 'profile' as ManageSection, label: 'Profile' },
              { id: 'members' as ManageSection, label: 'Members' },
              { id: 'access' as ManageSection, label: 'Access & Rules' },
              { id: 'danger' as ManageSection, label: 'Danger Zone' },
            ]).map((t) => (
              <button
                key={t.id}
                onClick={() => setManageSection(t.id)}
                className={`py-[11px] px-4 text-[13px] font-semibold border-b-2 -mb-[2px] transition-colors ${
                  manageSection === t.id
                    ? 'text-emerald-600 border-emerald-500'
                    : 'text-[#6b7280] border-transparent hover:text-[#111827]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* ─── PROFILE TAB ─── */}
          {manageSection === 'profile' && (
            <>
              {/* Basic Info */}
              <div className="bg-white border border-[#e4e8ee] rounded-[14px] p-[22px] mb-[18px] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <div className="text-[11px] font-bold uppercase tracking-[.08em] text-[#6b7280] mb-[18px] flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                  Basic Info
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-[14px]">
                  <div className="flex flex-col gap-1"><label className="text-[12.5px] font-semibold">Class title</label><input type="text" value={manageForm.name} onChange={(e) => setManageForm((p) => ({ ...p, name: e.target.value }))} className={inputCls} /></div>
                  <div className="flex flex-col gap-1"><label className="text-[12.5px] font-semibold">About class</label><input type="text" value={manageForm.topic} onChange={(e) => setManageForm((p) => ({ ...p, topic: e.target.value }))} placeholder="A short tagline..." className={inputCls} /></div>
                  <div className="flex flex-col gap-1"><label className="text-[12.5px] font-semibold">Subjects</label><input type="text" value={manageForm.subject} onChange={(e) => setManageForm((p) => ({ ...p, subject: e.target.value }))} placeholder="e.g. CSEC Math, CSEC Biology" className={inputCls} /></div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[12.5px] font-semibold">Form level</label>
                    <select value={manageForm.form_level} onChange={(e) => setManageForm((p) => ({ ...p, form_level: e.target.value }))} className={inputCls}>
                      <option value="FORM_1">Form 1</option><option value="FORM_2">Form 2</option><option value="FORM_3">Form 3</option>
                      <option value="FORM_4">Form 4</option><option value="FORM_5">Form 5</option><option value="CAPE">CAPE</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Thumbnail */}
              <div className="bg-white border border-[#e4e8ee] rounded-[14px] p-[22px] mb-[18px] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <div className="text-[11px] font-bold uppercase tracking-[.08em] text-[#6b7280] mb-[18px] flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                  Class Thumbnail
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[12.5px] font-semibold">Thumbnail image</label>
                  <span className="text-[11px] text-[#6b7280]">Shown on marketplace cards. Drag and drop or click to upload.</span>
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDraggingImage(true); }}
                    onDragLeave={(e) => { e.preventDefault(); setDraggingImage(false); }}
                    onDrop={(e) => { e.preventDefault(); setDraggingImage(false); void handleCoverSelection(e.dataTransfer.files?.[0] ?? null); }}
                    onClick={() => !manageForm.cover_image && coverInputRef.current?.click()}
                    className={`mt-2 rounded-[14px] border-2 border-dashed relative transition-colors cursor-pointer ${
                      manageForm.cover_image && !isDefaultThumbnail(manageForm.cover_image)
                        ? 'border-emerald-500 border-solid p-0'
                        : draggingImage ? 'border-emerald-500 bg-emerald-50 p-7' : 'border-[#e4e8ee] bg-[#f5f7fa] p-7'
                    }`}
                  >
                    {manageForm.cover_image && !isDefaultThumbnail(manageForm.cover_image) ? (
                      <>
                        <img src={manageForm.cover_image} alt="Preview" className="w-full h-40 object-cover rounded-xl block" />
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setManageForm((p) => ({ ...p, cover_image: '' })); }}
                          className="absolute top-2 right-2 w-[26px] h-[26px] rounded-full bg-black/55 border-none cursor-pointer flex items-center justify-center text-white text-[13px] hover:bg-red-500 transition-colors z-[2]"
                        >&times;</button>
                      </>
                    ) : (
                      <div className="text-center">
                        <div className="w-11 h-11 rounded-[11px] bg-white flex items-center justify-center mx-auto mb-2 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth={2}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                        </div>
                        <div className="text-[12.5px] font-semibold mb-0.5">Drag & drop image here</div>
                        <div className="text-[11px] text-[#6b7280]">PNG, JPG up to 2MB</div>
                        <div className="text-[10px] text-[#6b7280] my-1.5">or</div>
                        <button type="button" onClick={(e) => { e.stopPropagation(); coverInputRef.current?.click(); }} className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-[10px] bg-emerald-600 text-white text-[11.5px] font-semibold border-none cursor-pointer hover:bg-emerald-700 transition-colors">Browse Files</button>
                      </div>
                    )}
                  </div>
                  <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { void handleCoverSelection(e.target.files?.[0] ?? null); e.currentTarget.value = ''; }} />
                </div>
              </div>

              {/* Description */}
              <div className="bg-white border border-[#e4e8ee] rounded-[14px] p-[22px] mb-[18px] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <div className="text-[11px] font-bold uppercase tracking-[.08em] text-[#6b7280] mb-[18px] flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                  Description
                </div>
                <div className="grid grid-cols-1 gap-[14px]">
                  <div className="flex flex-col gap-1"><label className="text-[12.5px] font-semibold">Course overview</label><textarea value={manageForm.description} onChange={(e) => setManageForm((p) => ({ ...p, description: e.target.value }))} placeholder="Tell students what they'll learn..." className={`${inputCls} min-h-[80px] resize-y leading-relaxed`} /></div>
                  <div className="flex flex-col gap-1"><label className="text-[12.5px] font-semibold">Learning objectives</label><textarea value={manageForm.goals} onChange={(e) => setManageForm((p) => ({ ...p, goals: e.target.value }))} placeholder="Key skills students will gain..." className={`${inputCls} min-h-[80px] resize-y leading-relaxed`} /></div>
                </div>
              </div>

              {/* Pricing */}
              <div className="bg-white border border-[#e4e8ee] rounded-[14px] p-[22px] mb-[18px] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <div className="text-[11px] font-bold uppercase tracking-[.08em] text-[#6b7280] mb-[18px] flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" /></svg>
                  Monetization
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-[14px]">
                  <div className="flex flex-col gap-1">
                    <label className="text-[12.5px] font-semibold">Pricing mode</label>
                    <select value={manageForm.pricing_mode} onChange={(e) => setManageForm((p) => ({ ...p, pricing_mode: e.target.value as any }))} className={inputCls}>
                      <option value="FREE">Free</option><option value="PER_SESSION">Per session</option><option value="PER_COURSE">Per month</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1"><label className="text-[12.5px] font-semibold">Price per session</label><input type="number" min={0} value={manageForm.price_per_session} onChange={(e) => setManageForm((p) => ({ ...p, price_per_session: e.target.value }))} disabled={manageForm.pricing_mode !== 'PER_SESSION'} className={`${inputCls} disabled:bg-gray-100`} /></div>
                  <div className="flex flex-col gap-1"><label className="text-[12.5px] font-semibold">Price per month</label><input type="number" min={0} value={manageForm.price_per_course} onChange={(e) => setManageForm((p) => ({ ...p, price_per_course: e.target.value }))} disabled={manageForm.pricing_mode !== 'PER_COURSE'} className={`${inputCls} disabled:bg-gray-100`} /></div>
                </div>
              </div>
            </>
          )}

          {/* ─── MEMBERS TAB ─── */}
          {manageSection === 'members' && (
            <>
              {/* Class Size */}
              <div className="bg-white border border-[#e4e8ee] rounded-[14px] p-[22px] mb-[18px] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <div className="text-[11px] font-bold uppercase tracking-[.08em] text-[#6b7280] mb-[18px] flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>
                  Class Size
                </div>
                <div className="flex items-center justify-between pb-3">
                  <div className="flex-1 mr-4">
                    <div className="text-[13px] font-semibold">Set a maximum class size</div>
                    <div className="text-[11px] text-[#6b7280] mt-px">Unlimited students can join by default. Enable this to set a preferred maximum. When reached, new students are added to a waitlist.</div>
                  </div>
                  <div onClick={() => setCapEnabled((p) => !p)} className={`w-[42px] h-6 rounded-xl cursor-pointer relative transition-colors flex-shrink-0 ${capEnabled ? 'bg-emerald-600' : 'bg-[#d1d5db]'}`}>
                    <div className={`absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white shadow-sm transition-all ${capEnabled ? 'left-[21px]' : 'left-[3px]'}`} />
                  </div>
                </div>
                {capEnabled ? (
                  <div className="mt-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-[12.5px] font-semibold">Preferred maximum students</label>
                      <span className="text-[11px] text-[#6b7280]">When this number is reached, new students join the waitlist. You can still manually approve waitlisted students to go over this limit.</span>
                      <div className="flex items-center gap-3.5 mt-2">
                        <input type="range" min={5} max={200} step={5} value={capValue} onChange={(e) => setCapValue(Number(e.target.value))} className="flex-1 accent-emerald-600" />
                        <div className="min-w-[50px] py-1.5 px-2.5 border border-[#e4e8ee] rounded-[10px] text-center text-sm font-bold text-emerald-700 bg-emerald-50">{capValue}</div>
                      </div>
                      <div className="mt-2">
                        <div className="h-2 bg-[#f5f7fa] rounded overflow-hidden"><div className="h-full bg-emerald-500 rounded transition-all" style={{ width: `${Math.round(((approvedMembers.length) / capValue) * 100)}%` }} /></div>
                        <div className="flex justify-between mt-1 text-[10px] text-[#6b7280]">
                          <span><strong>{approvedMembers.length}</strong> / {capValue} enrolled</span>
                          <span>{Math.max(capValue - approvedMembers.length, 0)} spots until waitlist</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 p-2.5 bg-indigo-50 rounded-[10px] mt-3 text-[11px] text-indigo-600 leading-relaxed">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="flex-shrink-0 mt-px"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                      <span>This is a soft limit. You can always approve waitlisted students manually, even if it goes over your preferred maximum.</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-[10px] mt-2.5 text-[12px] text-emerald-700">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="flex-shrink-0"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                    <span>No limit set. Unlimited students can join this class.</span>
                  </div>
                )}
              </div>

              {/* Current Members Table */}
              <div className="bg-white border border-[#e4e8ee] rounded-[14px] p-[22px] mb-[18px] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <div className="text-[11px] font-bold uppercase tracking-[.08em] text-[#6b7280] mb-[18px] flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2" /><circle cx="9" cy="7" r="4" /></svg>
                  Students
                </div>
                {approvedMembers.filter((m) => m.profile?.role !== 'tutor').length === 0 ? (
                  <p className="text-center py-5 text-[13px] text-[#6b7280] bg-[#f5f7fa] rounded-[10px]">No students yet</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse mt-3">
                      <thead>
                        <tr>
                          <th className="text-left p-2 text-[10px] font-semibold uppercase tracking-[.06em] text-[#6b7280] border-b-2 border-[#e4e8ee]">Student</th>
                          <th className="text-left p-2 text-[10px] font-semibold uppercase tracking-[.06em] text-[#6b7280] border-b-2 border-[#e4e8ee]">Joined</th>
                          <th className="text-left p-2 text-[10px] font-semibold uppercase tracking-[.06em] text-[#6b7280] border-b-2 border-[#e4e8ee]"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {approvedMembers.filter((m) => m.profile?.role !== 'tutor').map((m) => {
                          const name = m.profile?.full_name ?? 'Member';
                          return (
                            <tr key={m.id} className="hover:bg-[rgba(0,0,0,0.01)]">
                              <td className="p-2.5 border-b border-[#f1f5f9] text-[13px]">
                                <div className="flex items-center gap-2.5">
                                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0" style={{ background: '#6366f1' }}>{getInitials(name)}</div>
                                  <span className="font-semibold">{name}</span>
                                </div>
                              </td>
                              <td className="p-2.5 border-b border-[#f1f5f9] text-[13px]">{new Date(m.joined_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</td>
                              <td className="p-2.5 border-b border-[#f1f5f9]">
                                <button
                                  onClick={async () => { if (!confirm(`Remove ${name} from this class?`)) return; await fetch(`/api/groups/${group.id}/members/${m.user_id}`, { method: 'DELETE' }); fetchMembers(); }}
                                  className="px-2.5 py-1 rounded-md text-[11px] font-medium border border-[#e4e8ee] bg-white text-[#6b7280] hover:border-red-400 hover:text-red-500 transition-colors"
                                >Remove</button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Waitlist */}
              <div className="bg-white border border-[#e4e8ee] rounded-[14px] p-[22px] mb-[18px] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <div className="text-[11px] font-bold uppercase tracking-[.08em] text-[#6b7280] mb-[18px] flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                  Waitlist
                </div>
                <div className="flex items-center justify-between pb-3 border-b border-[#f1f5f9]">
                  <div className="flex-1 mr-4"><div className="text-[13px] font-semibold">Enable waitlist</div><div className="text-[11px] text-[#6b7280] mt-px">When the class reaches maximum size, new students are placed in a queue.</div></div>
                  <div onClick={() => setWaitlistEnabled((p) => !p)} className={`w-[42px] h-6 rounded-xl cursor-pointer relative transition-colors flex-shrink-0 ${waitlistEnabled ? 'bg-emerald-600' : 'bg-[#d1d5db]'}`}><div className={`absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white shadow-sm transition-all ${waitlistEnabled ? 'left-[21px]' : 'left-[3px]'}`} /></div>
                </div>
                <div className="flex items-center justify-between py-3 border-b border-[#f1f5f9]">
                  <div className="flex-1 mr-4"><div className="text-[13px] font-semibold">Auto-notify next in line</div><div className="text-[11px] text-[#6b7280] mt-px">When a spot opens, the first waitlisted student is automatically notified and has 48 hours to accept.</div></div>
                  <div onClick={() => setAutoNotify((p) => !p)} className={`w-[42px] h-6 rounded-xl cursor-pointer relative transition-colors flex-shrink-0 ${autoNotify ? 'bg-emerald-600' : 'bg-[#d1d5db]'}`}><div className={`absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white shadow-sm transition-all ${autoNotify ? 'left-[21px]' : 'left-[3px]'}`} /></div>
                </div>
                <div className="flex items-center gap-2 p-3 bg-indigo-50 rounded-[10px] mt-2 text-[11px] text-indigo-600 leading-relaxed">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="flex-shrink-0"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                  <span>Once you approve a waitlisted student, they are automatically added to the class.</span>
                </div>
                <div className="text-center p-5 text-[#6b7280] text-[13px] bg-[#f5f7fa] rounded-[10px] mt-3.5">No students on waitlist</div>
              </div>

              {/* Co-Tutors */}
              <div className="bg-white border border-[#e4e8ee] rounded-[14px] p-[22px] mb-[18px] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <div className="text-[11px] font-bold uppercase tracking-[.08em] text-[#6b7280] mb-[18px] flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" /></svg>
                  Co-Tutors & Assistants
                </div>
                {/* Owner */}
                <div className="flex items-center gap-3 p-3 border border-[#e4e8ee] rounded-[10px] mb-2">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0 bg-emerald-600">{getInitials(tutorName)}</div>
                  <div className="flex-1"><div className="text-[13px] font-semibold">{tutorName}</div><div className="text-[11px] text-[#6b7280]">Owner</div></div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#f5f7fa] text-[#6b7280]">Full access</span>
                </div>
                {/* Auto co-tutors: approved members with tutor role */}
                {approvedMembers.filter((m) => m.profile?.role === 'tutor' && m.user_id !== group.tutor_id).map((m) => {
                  const coName = m.profile?.full_name ?? 'Tutor';
                  return (
                    <div key={m.id} className="flex items-center gap-3 p-3 border border-[#e4e8ee] rounded-[10px] mb-2">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0 bg-indigo-500">{getInitials(coName)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-semibold truncate">{coName}</div>
                        <div className="text-[11px] text-[#6b7280]">Co-Tutor</div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-600 flex-shrink-0">Full access</span>
                      <button
                        onClick={async () => { if (!confirm(`Remove ${coName} from this class?`)) return; await fetch(`/api/groups/${group.id}/members/${m.user_id}`, { method: 'DELETE' }); fetchMembers(); }}
                        className="px-2.5 py-1 rounded-md text-[11px] font-medium border border-[#e4e8ee] bg-white text-[#6b7280] hover:border-red-400 hover:text-red-500 transition-colors flex-shrink-0"
                      >Remove</button>
                    </div>
                  );
                })}
                {/* Manually added co-tutors */}
                {coTutors.map((ct) => (
                  <div key={ct.id} className="flex items-center gap-3 p-3 border border-[#e4e8ee] rounded-[10px] mb-2">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0" style={{ background: ct.role === 'co-tutor' ? '#6366f1' : '#f59e0b' }}>{getInitials(ct.name)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold truncate">{ct.name}</div>
                      <div className="text-[11px] text-[#6b7280] capitalize">{ct.role === 'co-tutor' ? 'Co-Tutor' : 'Assistant'}</div>
                    </div>
                    <div className="flex gap-1 flex-wrap flex-shrink-0">
                      {ct.permissions.length === PERM_OPTIONS.length ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#f5f7fa] text-[#6b7280]">Full access</span>
                      ) : (
                        ct.permissions.slice(0, 2).map((p) => (
                          <span key={p} className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#f5f7fa] text-[#6b7280]">{PERM_OPTIONS.find((o) => o.id === p)?.label ?? p}</span>
                        ))
                      )}
                      {ct.permissions.length < PERM_OPTIONS.length && ct.permissions.length > 2 && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#f5f7fa] text-[#6b7280]">+{ct.permissions.length - 2}</span>
                      )}
                    </div>
                    <button onClick={() => removeCoTutor(ct.id)} className="w-6 h-6 rounded-md flex items-center justify-center text-[#6b7280] hover:bg-red-50 hover:text-red-500 transition-colors flex-shrink-0">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => { setShowAddCoTutor(true); setCoEmail(''); setCoSearchResult(null); setCoError(''); setCoRole('co-tutor'); setCoPerms(PERM_OPTIONS.map((p) => p.id)); }}
                  className="w-full py-2.5 border-[1.5px] border-dashed border-[#e4e8ee] rounded-[10px] bg-transparent text-[12px] font-medium text-[#6b7280] cursor-pointer flex items-center justify-center gap-1.5 hover:border-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  Add co-tutor or assistant
                </button>
              </div>

              {/* Add Co-Tutor Modal */}
              {showAddCoTutor && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-[3px]" onClick={() => setShowAddCoTutor(false)}>
                  <div className="bg-white rounded-[14px] w-[480px] max-w-[92vw] shadow-[0_4px_14px_rgba(0,0,0,0.06)] overflow-hidden" onClick={(e) => e.stopPropagation()}>
                    {/* Header */}
                    <div className="px-5 py-4 border-b border-[#e4e8ee] flex items-center justify-between">
                      <h3 className="text-[16px] font-bold">Add Co-Tutor or Assistant</h3>
                      <button onClick={() => setShowAddCoTutor(false)} className="w-[30px] h-[30px] rounded-lg flex items-center justify-center text-[#6b7280] hover:bg-[#f5f7fa] hover:text-[#111827] transition-colors text-[18px]">&times;</button>
                    </div>

                    <div className="px-5 py-5 space-y-5">
                      {/* Search */}
                      <div>
                        <label className="text-[12.5px] font-semibold block mb-1">Find by email</label>
                        <div className="flex gap-2">
                          <input
                            type="email"
                            placeholder="tutor@example.com"
                            value={coEmail}
                            onChange={(e) => { setCoEmail(e.target.value); setCoSearchResult(null); setCoError(''); }}
                            onKeyDown={(e) => e.key === 'Enter' && searchCoTutor()}
                            className="flex-1 rounded-[10px] border border-[#e4e8ee] px-3 py-2.5 text-[13px] outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                          />
                          <button
                            onClick={searchCoTutor}
                            disabled={coSearching || !coEmail.trim()}
                            className="px-4 py-2.5 rounded-[10px] bg-emerald-600 text-white text-[12px] font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50 flex-shrink-0"
                          >
                            {coSearching ? 'Searching…' : 'Search'}
                          </button>
                        </div>
                        {coError && <p className="text-[11px] text-red-500 mt-1.5">{coError}</p>}
                      </div>

                      {/* Search result */}
                      {coSearchResult && (
                        <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-[10px]">
                          <div className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0 bg-emerald-600">{getInitials(coSearchResult.name)}</div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-semibold truncate">{coSearchResult.name}</div>
                            <div className="text-[11px] text-emerald-700 truncate">{coSearchResult.email}</div>
                          </div>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#047857" strokeWidth={2.5} className="flex-shrink-0"><polyline points="20 6 9 17 4 12" /></svg>
                        </div>
                      )}

                      {/* Role */}
                      {coSearchResult && (
                        <div>
                          <label className="text-[12.5px] font-semibold block mb-2">Role</label>
                          <div className="flex gap-2">
                            {([['co-tutor', 'Co-Tutor', 'Can manage the class alongside you'], ['assistant', 'Assistant', 'Limited access, helps with day-to-day tasks']] as const).map(([val, label, desc]) => (
                              <div
                                key={val}
                                onClick={() => {
                                  setCoRole(val);
                                  setCoPerms(val === 'co-tutor' ? PERM_OPTIONS.map((p) => p.id) : ['stream', 'chat']);
                                }}
                                className={`flex-1 p-3 rounded-[10px] border-2 cursor-pointer transition-all ${
                                  coRole === val ? 'border-emerald-500 bg-emerald-50' : 'border-[#e4e8ee] hover:border-gray-300'
                                }`}
                              >
                                <div className="text-[13px] font-semibold">{label}</div>
                                <div className="text-[11px] text-[#6b7280] mt-0.5">{desc}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Permissions */}
                      {coSearchResult && (
                        <div>
                          <label className="text-[12.5px] font-semibold block mb-2">Permissions</label>
                          <div className="space-y-1">
                            {PERM_OPTIONS.map((p) => {
                              const checked = coPerms.includes(p.id);
                              return (
                                <div
                                  key={p.id}
                                  onClick={() => setCoPerms((prev) => checked ? prev.filter((x) => x !== p.id) : [...prev, p.id])}
                                  className="flex items-center gap-2.5 py-2 px-2 rounded-lg cursor-pointer hover:bg-[#f5f7fa] transition-colors"
                                >
                                  <div className={`w-[18px] h-[18px] rounded flex items-center justify-center flex-shrink-0 border-2 transition-colors ${
                                    checked ? 'border-emerald-500 bg-emerald-50' : 'border-[#e4e8ee]'
                                  }`}>
                                    {checked && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0d9668" strokeWidth={2.5}><polyline points="20 6 9 17 4 12" /></svg>}
                                  </div>
                                  <span className="text-[13px]">{p.label}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Footer */}
                    {coSearchResult && (
                      <div className="px-5 py-4 border-t border-[#e4e8ee] flex justify-end gap-2">
                        <button onClick={() => setShowAddCoTutor(false)} className="py-2.5 px-5 border border-[#e4e8ee] rounded-[10px] text-[13px] font-semibold text-[#111827] hover:bg-gray-50 transition-colors">Cancel</button>
                        <button
                          onClick={addCoTutor}
                          disabled={coPerms.length === 0}
                          className="py-2.5 px-6 bg-emerald-600 text-white rounded-[10px] text-[13px] font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" /></svg>
                          Add {coRole === 'co-tutor' ? 'Co-Tutor' : 'Assistant'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ─── ACCESS & RULES TAB ─── */}
          {manageSection === 'access' && (
            <>
              {/* Visibility */}
              <div className="bg-white border border-[#e4e8ee] rounded-[14px] p-[22px] mb-[18px] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <div className="text-[11px] font-bold uppercase tracking-[.08em] text-[#6b7280] mb-[18px] flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
                  Class Visibility
                </div>
                <div className="flex flex-col gap-1 mb-4">
                  <label className="text-[12.5px] font-semibold">Who can find this class?</label>
                  <select value={visibility} onChange={(e) => setVisibility(e.target.value as any)} className={inputCls}>
                    <option value="public">Public — visible in marketplace, anyone can request to join</option>
                    <option value="unlisted">Unlisted — only people with the direct link can see it</option>
                    <option value="private">Private — invite only, hidden from marketplace and search</option>
                  </select>
                </div>
                <div className="flex items-center justify-between py-3 border-b border-[#f1f5f9]">
                  <div className="flex-1 mr-4"><div className="text-[13px] font-semibold">Require approval to join</div><div className="text-[11px] text-[#6b7280] mt-px">You must manually approve each student before they can access class content.</div></div>
                  <div onClick={() => setRequireApproval((p) => !p)} className={`w-[42px] h-6 rounded-xl cursor-pointer relative transition-colors flex-shrink-0 ${requireApproval ? 'bg-emerald-600' : 'bg-[#d1d5db]'}`}><div className={`absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white shadow-sm transition-all ${requireApproval ? 'left-[21px]' : 'left-[3px]'}`} /></div>
                </div>
                <div className="flex items-center justify-between py-3">
                  <div className="flex-1 mr-4"><div className="text-[13px] font-semibold">Allow students to invite others</div><div className="text-[11px] text-[#6b7280] mt-px">Approved students can share an invite link with friends.</div></div>
                  <div onClick={() => setAllowStudentInvites((p) => !p)} className={`w-[42px] h-6 rounded-xl cursor-pointer relative transition-colors flex-shrink-0 ${allowStudentInvites ? 'bg-emerald-600' : 'bg-[#d1d5db]'}`}><div className={`absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white shadow-sm transition-all ${allowStudentInvites ? 'left-[21px]' : 'left-[3px]'}`} /></div>
                </div>
              </div>

              {/* Class Rules */}
              <div className="bg-white border border-[#e4e8ee] rounded-[14px] p-[22px] mb-[18px] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <div className="text-[11px] font-bold uppercase tracking-[.08em] text-[#6b7280] mb-[18px] flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                  Class Rules
                </div>
                <div className="flex flex-col gap-1 mb-2.5">
                  <label className="text-[12.5px] font-semibold">Rules students must acknowledge</label>
                  <span className="text-[11px] text-[#6b7280]">Students will see these before joining and must agree to them.</span>
                </div>
                <div className="mt-2.5">
                  {rules.map((r, i) => (
                    <div key={i} className="flex items-center gap-2.5 py-2 border-b border-[#f1f5f9] last:border-b-0">
                      <div
                        onClick={() => setRules((prev) => prev.map((rule, idx) => idx === i ? { ...rule, enabled: !rule.enabled } : rule))}
                        className={`w-[18px] h-[18px] rounded flex items-center justify-center flex-shrink-0 cursor-pointer transition-colors border-2 ${
                          r.enabled ? 'border-emerald-500 bg-emerald-50' : 'border-[#e4e8ee]'
                        }`}
                      >
                        {r.enabled && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0d9668" strokeWidth={2.5}><polyline points="20 6 9 17 4 12" /></svg>}
                      </div>
                      <input
                        type="text"
                        value={r.text}
                        onChange={(e) => setRules((prev) => prev.map((rule, idx) => idx === i ? { ...rule, text: e.target.value } : rule))}
                        placeholder="Type a new rule..."
                        className="flex-1 border-none outline-none text-[13px] bg-transparent"
                      />
                    </div>
                  ))}
                  <button
                    onClick={() => setRules((prev) => [...prev, { text: '', enabled: false }])}
                    className="flex items-center gap-1 text-[12px] font-medium text-emerald-600 cursor-pointer mt-2 hover:underline"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    Add another rule
                  </button>
                </div>
              </div>
            </>
          )}


          {/* ─── DANGER ZONE TAB ─── */}
          {manageSection === 'danger' && (
            <div className="bg-white border border-red-200 rounded-[14px] p-[22px] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="text-[11px] font-bold uppercase tracking-[.08em] text-red-500 mb-[18px] flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                Danger Zone
              </div>
              <div className="flex items-center justify-between py-2.5 border-b border-red-50">
                <div><strong className="text-[13px] block mb-px">Archive this class</strong><span className="text-[11px] text-[#6b7280]">Hide from marketplace. Members lose access. Data is preserved and you can restore later.</span></div>
                <button onClick={handleArchive} disabled={archiving || deleting} className="px-4 py-2 rounded-[10px] text-[12px] font-semibold border border-red-500 text-red-500 bg-transparent hover:bg-red-500 hover:text-white transition-all disabled:opacity-40 flex-shrink-0">{archiving ? 'Archiving…' : 'Archive Class'}</button>
              </div>
              <div className="flex items-center justify-between py-2.5 border-b border-red-50">
                <div><strong className="text-[13px] block mb-px">Transfer ownership</strong><span className="text-[11px] text-[#6b7280]">Hand this class to another tutor. You'll become a co-tutor.</span></div>
                <button className="px-4 py-2 rounded-[10px] text-[12px] font-semibold border border-red-500 text-red-500 bg-transparent hover:bg-red-500 hover:text-white transition-all flex-shrink-0">Transfer</button>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <div><strong className="text-[13px] block mb-px">Delete this class permanently</strong><span className="text-[11px] text-[#6b7280]">Remove all sessions, messages, members, and data. This cannot be undone.</span></div>
                <button onClick={handleDelete} disabled={deleting || archiving} className="px-4 py-2 rounded-[10px] text-[12px] font-semibold border border-red-500 text-red-500 bg-transparent hover:bg-red-500 hover:text-white transition-all disabled:opacity-40 flex-shrink-0">{deleting ? 'Deleting…' : 'Delete Class'}</button>
              </div>
            </div>
          )}

          {/* Footer */}
          {manageSection !== 'danger' && (
            <>
              {manageError && <p className="mt-3 text-xs text-red-500">{manageError}</p>}
              <div className="flex justify-between items-center mt-2 pt-5">
                <div className="text-[12px] text-[#6b7280] flex items-center gap-[5px]">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                  Unsaved changes
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setManageOpen(false)} className="py-2.5 px-5 border border-[#e4e8ee] rounded-[10px] bg-white text-[13px] font-semibold cursor-pointer text-[#111827] hover:bg-gray-50 transition-colors">Cancel</button>
                  <button type="button" onClick={() => void handleManageSave()} disabled={manageSaving} className="py-2.5 px-6 bg-emerald-600 text-white border-none rounded-[10px] text-[13px] font-semibold cursor-pointer flex items-center gap-1.5 shadow-[0_2px_8px_rgba(13,150,104,0.2)] hover:bg-emerald-700 hover:-translate-y-px transition-all disabled:opacity-50">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12" /></svg>
                    {manageSaving ? 'Saving…' : 'Save Settings'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── MAIN LAYOUT ── */}
      <div className="max-w-[1100px] mx-auto px-7 my-7 grid grid-cols-1 md:grid-cols-[1fr_300px] gap-6">

        {/* LEFT: Tabs + Content */}
        <div className="min-w-0">
          <div className="flex gap-0 border-b-2 border-gray-200 mb-6">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`py-2.5 px-[18px] text-[13.5px] font-semibold border-b-2 -mb-[2px] transition-colors ${
                  tab === t.id
                    ? 'text-emerald-600 border-emerald-500'
                    : 'text-slate-500 border-transparent hover:text-gray-900'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'stream' && (
            <GroupStreamPage
              groupId={group.id}
              currentUserId={currentUserId}
              isTutor={true}
              authorName={group.tutor?.full_name ?? undefined}
              authorAvatarUrl={group.tutor?.avatar_url ?? undefined}
            />
          )}


          {tab === 'sessions' && (
            <div>
              <div className="flex justify-end mb-[18px]">
                <button
                  onClick={() => setShowCreateSession(true)}
                  className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white px-[18px] py-[9px] rounded-[10px] text-[13px] font-semibold transition-all shadow-[0_2px_8px_rgba(16,185,129,0.25)] hover:-translate-y-px"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  Add Session
                </button>
              </div>
              {sessionsLoading ? (
                <div className="py-8 flex justify-center"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600" /></div>
              ) : sessions.length === 0 ? (
                <div className="text-center py-14">
                  <div className="w-20 h-20 rounded-[20px] bg-[#f4f6fa] flex items-center justify-center mx-auto mb-4">
                    <svg className="w-9 h-9 text-[#64748b] opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                  </div>
                  <h3 className="text-base font-bold mb-1.5">No sessions scheduled</h3>
                  <p className="text-[13px] text-[#64748b] max-w-[300px] mx-auto">Schedule your first session to get started.</p>
                </div>
              ) : (
                <div>{sessions.map((s) => <SessionRow key={s.id} session={s} groupId={group.id} onRefresh={fetchSessions} />)}</div>
              )}
            </div>
          )}


          {tab === 'feedback' && (
            <TutorFeedbackTab groupId={group.id} memberCount={approvedMembers.filter((m) => m.profile?.role !== 'tutor' && m.user_id !== group.tutor_id).length} />
          )}

          {tab === 'whatsapp' && (
            <WhatsAppSetupTab
              groupId={group.id}
              whatsappLink={(group as any).whatsapp_link ?? ''}
              memberCount={approvedMembers.length}
              onSave={async (link) => {
                const res = await fetch(`/api/groups/${group.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ whatsapp_link: link || null }),
                });
                if (!res.ok) throw new Error('Failed to save');
                onGroupUpdated();
              }}
            />
          )}
        </div>

        {/* RIGHT: Sidebar */}
        <div className="flex flex-col gap-[18px]">

          {/* Analytics */}
          <div className="bg-white rounded-[14px] border border-gray-200 p-[18px] shadow-sm">
            <p className="text-[12px] font-bold uppercase tracking-wider text-slate-500 mb-3.5">Analytics</p>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="relative overflow-hidden py-3.5 px-2.5 bg-gray-50 rounded-[10px] text-center before:absolute before:top-0 before:left-0 before:right-0 before:h-[3px] before:bg-emerald-500 before:rounded-t-[10px]">
                <p className="text-[22px] font-extrabold leading-tight">{analytics?.total_sessions ?? 0}</p>
                <p className="text-[10.5px] text-slate-500 font-medium mt-0.5">Total Sessions</p>
              </div>
              <div className="relative overflow-hidden py-3.5 px-2.5 bg-gray-50 rounded-[10px] text-center before:absolute before:top-0 before:left-0 before:right-0 before:h-[3px] before:bg-indigo-500 before:rounded-t-[10px]">
                <p className="text-[22px] font-extrabold leading-tight">{analytics?.average_attendance_rate ?? 0}%</p>
                <p className="text-[10.5px] text-slate-500 font-medium mt-0.5">Avg Attendance</p>
              </div>
              <div className="relative overflow-hidden py-3.5 px-2.5 bg-gray-50 rounded-[10px] text-center before:absolute before:top-0 before:left-0 before:right-0 before:h-[3px] before:bg-orange-500 before:rounded-t-[10px]">
                <p className="text-[22px] font-extrabold leading-tight">{analytics?.student_retention_rate ?? 0}%</p>
                <p className="text-[10.5px] text-slate-500 font-medium mt-0.5">Retention</p>
              </div>
              <div className="relative overflow-hidden py-3.5 px-2.5 bg-gray-50 rounded-[10px] text-center before:absolute before:top-0 before:left-0 before:right-0 before:h-[3px] before:bg-amber-400 before:rounded-t-[10px]">
                <p className="text-[22px] font-extrabold leading-tight">${estimatedEarnings.toFixed(0)}</p>
                <p className="text-[10.5px] text-slate-500 font-medium mt-0.5">Total Earnings</p>
              </div>
            </div>
          </div>

          {/* Upcoming Sessions */}
          <div className="bg-white rounded-[14px] border border-gray-200 p-[18px] shadow-sm">
            <p className="text-[12px] font-bold uppercase tracking-wider text-slate-500 mb-3.5">Upcoming Sessions</p>
            {upcomingOccs.length === 0 ? (
              <p className="text-[13px] text-slate-500 text-center py-3.5">No sessions scheduled yet</p>
            ) : (
              <div className="space-y-0 divide-y divide-gray-200">
                {upcomingOccs.map((o, i) => (
                  <div key={i} className="flex gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div className="w-11 h-11 rounded-[10px] bg-indigo-50 flex flex-col items-center justify-center flex-shrink-0">
                      <span className="text-[15px] font-extrabold text-indigo-600 leading-none">{o.date.getDate()}</span>
                      <span className="text-[9px] font-semibold uppercase text-indigo-600">{o.date.toLocaleString(undefined, { month: 'short' })}</span>
                    </div>
                    <div>
                      <p className="text-[13px] font-semibold">
                        {o.date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} – {o.end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                      </p>
                      <p className="text-[12px] text-slate-500 mt-px">{o.title}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => setShowCreateSession(true)}
              className="w-full mt-2.5 py-2.5 bg-gray-50 border border-dashed border-gray-200 rounded-[10px] text-[13px] font-medium text-slate-500 hover:border-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 transition-colors flex items-center justify-center gap-1.5"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              Schedule a Session
            </button>
          </div>

          {/* Members */}
          <div className="bg-white rounded-[14px] border border-gray-200 p-[18px] shadow-sm">
            <div className="flex items-center justify-between mb-3.5">
              <p className="text-[12px] font-bold uppercase tracking-wider text-slate-500">Members</p>
              <span className="bg-[#d1fae5] text-[#047857] px-2 py-0.5 rounded-[10px] text-[11px] font-bold">{approvedMembers.length + 1}</span>
            </div>
            {membersLoading ? (
              <div className="py-6 flex justify-center"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-emerald-600" /></div>
            ) : (
              <MemberList
                groupId={group.id}
                members={members}
                currentUserId={currentUserId}
                tutorId={group.tutor_id}
                tutorName={tutorName}
                tutorAvatarUrl={group.tutor?.avatar_url ?? null}
                isTutor={true}
                onRefresh={fetchMembers}
              />
            )}
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-[14px] border border-gray-200 p-[18px] shadow-sm">
            <p className="text-[12px] font-bold uppercase tracking-wider text-slate-500 mb-3.5">Quick Actions</p>
            <div className="flex flex-col gap-1.5">
              {[
                { label: 'Edit Class Details', action: () => setManageOpen(true), icon: <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />, icon2: <path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /> },
                { label: 'Schedule Session', action: () => setShowCreateSession(true), icon: <><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></> },
                { label: 'Invite Members', action: copyInviteLink, icon: <><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" /></> },
              ].map((qa) => (
                <button
                  key={qa.label}
                  onClick={qa.action}
                  className="flex items-center gap-2.5 py-2.5 px-3 rounded-[10px] text-[13px] font-medium text-gray-700 hover:bg-gray-50 transition-colors text-left w-full"
                >
                  <svg className="w-[18px] h-[18px] text-slate-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>{qa.icon}{qa.icon2}</svg>
                  {qa.label}
                </button>
              ))}
            </div>
          </div>

        </div>
      </div>

      {showCreateSession && (
        <CreateSessionModal
          groupId={group.id}
          onCreated={() => { setShowCreateSession(false); fetchSessions(); }}
          onClose={() => setShowCreateSession(false)}
        />
      )}

      {cropImageSrc && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h3 className="text-base font-semibold text-gray-900">Reposition lesson thumbnail</h3>
              <button
                type="button"
                onClick={() => {
                  setCropImageSrc(null);
                  setCrop({ x: 0, y: 0 });
                  setZoom(1);
                  setCroppedAreaPixels(null);
                }}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Close
              </button>
            </div>
            <div className="space-y-4 p-5">
              <div className="relative w-full overflow-hidden rounded-xl bg-gray-100" style={{ aspectRatio: '16 / 9' }}>
                <Cropper
                  image={cropImageSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={16 / 9}
                  showGrid={false}
                  onCropChange={setCrop}
                  onCropComplete={onCropComplete}
                  onZoomChange={setZoom}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Zoom</label>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.1}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-full accent-emerald-600"
                />
              </div>
              <p className="text-xs text-gray-500">Drag the image to move it inside the frame.</p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setCropImageSrc(null);
                    setCrop({ x: 0, y: 0 });
                    setZoom(1);
                    setCroppedAreaPixels(null);
                  }}
                  className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleApplyCrop()}
                  disabled={uploadingImage}
                  className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {uploadingImage ? 'Uploading...' : 'Apply image'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
