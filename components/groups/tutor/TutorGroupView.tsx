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
import GroupMessageBoard from '../messages/GroupMessageBoard';
import AnnouncementBoard from '../announcements/AnnouncementBoard';

import GroupStreamPage from '../stream/GroupStreamPage';

type Tab = 'stream' | 'announcements' | 'sessions' | 'messages';
type ManageSection = 'profile' | 'pricing' | 'sessions';

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
    session_length_minutes: (group as any).session_length_minutes ?? '',
    session_frequency: ((group as any).session_frequency ?? 'weekly') as string,
    availability_window: ((group as any).availability_window ?? '') as string,
    whatsapp_link: ((group as any).whatsapp_link ?? '') as string,
  });

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
  }, [fetchSessions, fetchMembers]);

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
      session_length_minutes: (group as any).session_length_minutes ?? '',
      session_frequency: ((group as any).session_frequency ?? 'weekly') as string,
      availability_window: ((group as any).availability_window ?? '') as string,
      whatsapp_link: ((group as any).whatsapp_link ?? '') as string,
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
      setManageError('Group name is required.');
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
        session_length_minutes:
          manageForm.session_length_minutes === '' ? null : Number(manageForm.session_length_minutes),
        session_frequency: manageForm.session_frequency || null,
        availability_window: manageForm.availability_window.trim() || null,
        whatsapp_link: manageForm.whatsapp_link.trim() || null,
      };
      const res = await fetch(`/api/groups/${group.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || 'Failed to update group settings');
      setManageOpen(false);
      onGroupUpdated();
    } catch (err: any) {
      setManageError(err?.message || 'Failed to update group settings');
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
      if (!res.ok) throw new Error(payload?.error || 'Failed to delete group');
      router.push('/groups');
    } catch (err: any) {
      alert(err?.message || 'Failed to delete group');
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
    { id: 'announcements', label: 'Announcements' },
    { id: 'sessions', label: 'Sessions' },
    { id: 'messages', label: 'Group Chat' },
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
                  {manageOpen ? 'Close' : 'Manage Group'}
                </button>
                <button
                  onClick={handleArchive}
                  disabled={archiving || deleting}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[10px] text-[13px] font-semibold border border-gray-200 bg-white text-gray-700 hover:border-emerald-500 hover:text-emerald-600 transition-all disabled:opacity-40"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="9" y1="3" x2="9" y2="21" /></svg>
                  {archiving ? 'Archiving…' : 'Archive'}
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting || archiving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[10px] text-[13px] font-semibold border border-red-500 text-red-500 bg-transparent hover:bg-red-500 hover:text-white transition-all disabled:opacity-40"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" /></svg>
                  {deleting ? 'Deleting…' : 'Delete'}
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
        <div className="max-w-[1100px] mx-auto px-7 mt-5">
          <div className="bg-white rounded-[14px] border border-gray-200 p-5 shadow-sm">
            <div className="mb-4 border-b border-gray-100">
              <div className="flex items-center gap-4">
                {(['profile', 'pricing', 'sessions'] as ManageSection[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setManageSection(s)}
                    className={`pb-2 text-sm font-medium border-b-2 capitalize ${
                      manageSection === s
                        ? 'border-emerald-500 text-emerald-700'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {s === 'sessions' ? 'Session Defaults' : s}
                  </button>
                ))}
              </div>
            </div>

            {manageSection === 'profile' && (
              <div className="space-y-4">
                <div className="rounded-lg border border-gray-100 bg-gray-50/70 p-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Basic info</p>
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div><label className="block text-xs font-medium text-gray-600 mb-1">Group title</label><input type="text" value={manageForm.name} onChange={(e) => setManageForm((p) => ({ ...p, name: e.target.value }))} className={inputCls} /></div>
                    <div><label className="block text-xs font-medium text-gray-600 mb-1">About group</label><input type="text" value={manageForm.topic} onChange={(e) => setManageForm((p) => ({ ...p, topic: e.target.value }))} className={inputCls} /></div>
                    <div><label className="block text-xs font-medium text-gray-600 mb-1">Subjects</label><input type="text" value={manageForm.subject} onChange={(e) => setManageForm((p) => ({ ...p, subject: e.target.value }))} placeholder="e.g. CSEC Math, CSEC Biology" className={inputCls} /></div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Form level</label>
                      <select value={manageForm.form_level} onChange={(e) => setManageForm((p) => ({ ...p, form_level: e.target.value }))} className={inputCls}>
                        <option value="FORM_1">Form 1</option><option value="FORM_2">Form 2</option><option value="FORM_3">Form 3</option>
                        <option value="FORM_4">Form 4</option><option value="FORM_5">Form 5</option><option value="CAPE">CAPE</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div className="rounded-lg border border-gray-100 bg-gray-50/70 p-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Description</p>
                  <div className="mt-3 space-y-3">
                    <div><label className="block text-xs font-medium text-gray-600 mb-1">Course overview</label><textarea value={manageForm.description} onChange={(e) => setManageForm((p) => ({ ...p, description: e.target.value }))} rows={3} className={`${inputCls} resize-none`} /></div>
                    <div><label className="block text-xs font-medium text-gray-600 mb-1">Learning objectives</label><textarea value={manageForm.goals} onChange={(e) => setManageForm((p) => ({ ...p, goals: e.target.value }))} rows={3} className={`${inputCls} resize-none`} /></div>
                  </div>
                </div>
                <div className="rounded-lg border border-gray-100 bg-gray-50/70 p-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Branding</p>
                  <div className="mt-3">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Group thumbnail</label>
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDraggingImage(true);
                      }}
                      onDragLeave={(e) => {
                        e.preventDefault();
                        setDraggingImage(false);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDraggingImage(false);
                        const file = e.dataTransfer.files?.[0] ?? null;
                        void handleCoverSelection(file);
                      }}
                      className={`rounded-xl border-2 border-dashed p-4 transition-colors ${
                        draggingImage ? 'border-emerald-500 bg-emerald-50' : 'border-gray-300 bg-white'
                      }`}
                    >
                      {manageForm.cover_image ? (
                        <img
                          src={manageForm.cover_image}
                          alt="Group thumbnail preview"
                          className="h-40 w-full rounded-lg border border-gray-200 object-cover"
                        />
                      ) : (
                        <div className="flex h-40 w-full items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-500">
                          Drag and drop thumbnail image here
                        </div>
                      )}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => coverInputRef.current?.click()}
                          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                        >
                          Choose file
                        </button>
                        {manageForm.cover_image && (
                          <button
                            type="button"
                            onClick={() => setManageForm((p) => ({ ...p, cover_image: '' }))}
                            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                          >
                            Remove
                          </button>
                        )}
                        <span className="text-xs text-gray-500">
                          {uploadingImage
                            ? 'Uploading...'
                            : 'Recommended: 1920 x 1080 px. PNG, JPG, WEBP up to 10MB. Drag inside crop to reposition.'}
                        </span>
                      </div>
                      <input
                        ref={coverInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0] ?? null;
                          void handleCoverSelection(file);
                          e.currentTarget.value = '';
                        }}
                      />
                    </div>
                  </div>
                </div>
                <div className="rounded-lg border border-green-100 bg-green-50/50 p-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Community</p>
                  <div className="mt-3">
                    <label className="block text-xs font-medium text-gray-600 mb-1">WhatsApp group invite link</label>
                    <input
                      type="url"
                      value={manageForm.whatsapp_link}
                      onChange={(e) => setManageForm((p) => ({ ...p, whatsapp_link: e.target.value }))}
                      placeholder="https://chat.whatsapp.com/..."
                      className={inputCls}
                    />
                    <p className="mt-1.5 text-[11px] text-gray-400">
                      Paste your WhatsApp group invite link. Only approved members will see a "Join WhatsApp group" button — the link is never exposed in the page source.
                      Tip: enable <strong>Approve new members</strong> in WhatsApp for an extra layer of control.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {manageSection === 'pricing' && (
              <div className="rounded-lg border border-gray-100 bg-gray-50/70 p-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Monetization</p>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Pricing mode</label>
                    <select value={manageForm.pricing_mode} onChange={(e) => setManageForm((p) => ({ ...p, pricing_mode: e.target.value as any }))} className={inputCls}>
                      <option value="FREE">Free</option><option value="PER_SESSION">Per session</option><option value="PER_COURSE">Per month</option>
                    </select>
                  </div>
                  <div><label className="block text-xs font-medium text-gray-600 mb-1">Price per session</label><input type="number" min={0} value={manageForm.price_per_session} onChange={(e) => setManageForm((p) => ({ ...p, price_per_session: e.target.value }))} disabled={manageForm.pricing_mode !== 'PER_SESSION'} className={`${inputCls} disabled:bg-gray-100`} /></div>
                  <div><label className="block text-xs font-medium text-gray-600 mb-1">Price per month</label><input type="number" min={0} value={manageForm.price_per_course} onChange={(e) => setManageForm((p) => ({ ...p, price_per_course: e.target.value }))} disabled={manageForm.pricing_mode !== 'PER_COURSE'} className={`${inputCls} disabled:bg-gray-100`} /></div>
                </div>
              </div>
            )}

            {manageSection === 'sessions' && (
              <div className="rounded-lg border border-gray-100 bg-gray-50/70 p-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Session defaults</p>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div><label className="block text-xs font-medium text-gray-600 mb-1">Session length (mins)</label><input type="number" min={15} value={manageForm.session_length_minutes} onChange={(e) => setManageForm((p) => ({ ...p, session_length_minutes: e.target.value }))} className={inputCls} /></div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Session frequency</label>
                    <select value={manageForm.session_frequency} onChange={(e) => setManageForm((p) => ({ ...p, session_frequency: e.target.value }))} className={inputCls}>
                      <option value="weekly">Weekly</option><option value="biweekly">Biweekly</option><option value="monthly">Monthly</option>
                    </select>
                  </div>
                  <div><label className="block text-xs font-medium text-gray-600 mb-1">Availability window</label><input type="text" value={manageForm.availability_window} onChange={(e) => setManageForm((p) => ({ ...p, availability_window: e.target.value }))} placeholder="e.g. Fridays 6:00 PM - 7:00 PM" className={inputCls} /></div>
                </div>
              </div>
            )}

            {manageError && <p className="mt-3 text-xs text-red-500">{manageError}</p>}
            <div className="mt-4 flex gap-2 justify-end">
              <button type="button" onClick={() => setManageOpen(false)} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
              <button type="button" onClick={() => void handleManageSave()} disabled={manageSaving} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">{manageSaving ? 'Saving…' : 'Save Settings'}</button>
            </div>
          </div>
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

          {tab === 'announcements' && (
            <AnnouncementBoard groupId={group.id} isTutor={true} />
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

          {tab === 'messages' && <GroupMessageBoard groupId={group.id} isTutor={true} currentUserId={currentUserId} />}
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
              <span className="text-[11px] font-semibold bg-gray-100 px-2 py-0.5 rounded-xl">{approvedMembers.length}</span>
            </div>
            {membersLoading ? (
              <div className="py-6 flex justify-center"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-emerald-600" /></div>
            ) : (
              <MemberList groupId={group.id} members={members} onRefresh={fetchMembers} />
            )}
            <div
              onClick={copyInviteLink}
              className="flex items-center gap-2 mt-3 py-2.5 px-3 bg-gray-50 rounded-[10px] cursor-pointer hover:bg-emerald-50 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth={2}><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" /></svg>
              <span className="flex-1 text-[12px] text-slate-500 truncate">{typeof window !== 'undefined' ? window.location.href : `itutor.com/groups/${group.id}`}</span>
              <span className="text-[11px] font-semibold text-emerald-600 whitespace-nowrap">{linkCopied ? 'Copied!' : 'Copy link'}</span>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-[14px] border border-gray-200 p-[18px] shadow-sm">
            <p className="text-[12px] font-bold uppercase tracking-wider text-slate-500 mb-3.5">Quick Actions</p>
            <div className="flex flex-col gap-1.5">
              {[
                { label: 'Edit Group Details', action: () => setManageOpen(true), icon: <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />, icon2: <path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /> },
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
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-2.5 py-2.5 px-3 rounded-[10px] text-[13px] font-medium text-red-500 hover:bg-gray-50 transition-colors text-left w-full disabled:opacity-40"
              >
                <svg className="w-[18px] h-[18px] text-red-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></svg>
                Delete Group
              </button>
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
              <h3 className="text-base font-semibold text-gray-900">Reposition group thumbnail</h3>
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
