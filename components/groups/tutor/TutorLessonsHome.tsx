'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { GroupWithTutor } from '@/lib/types/groups';
import { supabase } from '@/lib/supabase/client';
import CreateGroupModal from './CreateGroupModal';
import AddSessionModal from './AddSessionModal';
import AddRecurringSessionModal from './AddRecurringSessionModal';

interface TutorLessonsHomeProps {
  currentUserId: string;
}

type Tab = 'my' | 'archived';

const BANNER_GRADIENTS = [
  'linear-gradient(135deg,#7c3aed,#a855f7)',
  'linear-gradient(135deg,#0d9488,#06b6d4)',
  'linear-gradient(135deg,#db2777,#f472b6)',
  'linear-gradient(135deg,#1d4ed8,#60a5fa)',
  'linear-gradient(135deg,#ea580c,#fb923c)',
  'linear-gradient(135deg,#059669,#34d399)',
  'linear-gradient(135deg,#9333ea,#ec4899)',
];

function getBannerGradient(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return BANNER_GRADIENTS[hash % BANNER_GRADIENTS.length]!;
}

function formatEarnings(val: number | undefined | null): string {
  return `$${Number(val ?? 0).toFixed(2)}`;
}

function formatNextSession(occ: GroupWithTutor['next_occurrence']): string {
  if (!occ) return 'Not set';
  return new Date(occ.scheduled_start_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function nextSessionColor(occ: GroupWithTutor['next_occurrence']): string {
  return occ ? '#7c3aed' : '#ef4444';
}

// ─── Skeleton card ────────────────────────────────────────────────────────────

function LessonCardSkeleton() {
  return (
    <div style={{
      background: '#fff', borderRadius: 14,
      boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
      border: '1px solid #f0f2f5',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Banner skeleton */}
      <div style={{ height: 110, background: 'linear-gradient(90deg,#f0f0f0 25%,#e0e0e0 50%,#f0f0f0 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite' }} />
      {/* Body skeleton */}
      <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ height: 16, width: '65%', borderRadius: 6, background: 'linear-gradient(90deg,#f0f0f0 25%,#e0e0e0 50%,#f0f0f0 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite' }} />
        <div style={{ height: 12, width: '40%', borderRadius: 6, background: 'linear-gradient(90deg,#f0f0f0 25%,#e0e0e0 50%,#f0f0f0 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite' }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ height: 48, borderRadius: 8, background: 'linear-gradient(90deg,#f0f0f0 25%,#e0e0e0 50%,#f0f0f0 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite' }} />
          ))}
        </div>
        <div style={{ height: 38, borderRadius: 8, background: 'linear-gradient(90deg,#f0f0f0 25%,#e0e0e0 50%,#f0f0f0 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite' }} />
        <div style={{ height: 36, borderRadius: 8, background: 'linear-gradient(90deg,#f0f0f0 25%,#e0e0e0 50%,#f0f0f0 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite' }} />
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TutorLessonsHome({ currentUserId }: TutorLessonsHomeProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('my');
  const [myGroups, setMyGroups] = useState<GroupWithTutor[]>([]);
  const [archivedGroups, setArchivedGroups] = useState<GroupWithTutor[]>([]);
  const [loading, setLoading] = useState(true);
  const [archivedLoading, setArchivedLoading] = useState(false);

  const [showCreateGroup, setShowCreateGroup] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<GroupWithTutor | null>(null);
  const [deleteInput, setDeleteInput] = useState('');
  const [deleting, setDeleting] = useState(false);

  const [uploadingBannerFor, setUploadingBannerFor] = useState<string | null>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const bannerTargetId = useRef<string | null>(null);

  const [restoringId, setRestoringId] = useState<string | null>(null);

  const [addSessionFor, setAddSessionFor] = useState<string | null>(null);
  const [addRecurringFor, setAddRecurringFor] = useState<string | null>(null);

  const fetchMyGroups = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/groups');
      if (res.ok) {
        const all = ((await res.json()).groups ?? []) as GroupWithTutor[];
        setMyGroups(all.filter((g) => g.tutor_id === currentUserId));
      }
    } finally {
      setLoading(false);
    }
  }, [currentUserId]);

  const fetchArchivedGroups = useCallback(async () => {
    setArchivedLoading(true);
    try {
      const res = await fetch('/api/groups?archived=true');
      if (res.ok) setArchivedGroups(((await res.json()).groups ?? []) as GroupWithTutor[]);
    } finally {
      setArchivedLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMyGroups();
    fetchArchivedGroups();
  }, [fetchMyGroups, fetchArchivedGroups]);

  const handleRestore = async (group: GroupWithTutor) => {
    setRestoringId(group.id);
    try {
      const res = await fetch(`/api/groups/${group.id}/restore`, { method: 'POST' });
      if (res.ok) await Promise.all([fetchMyGroups(), fetchArchivedGroups()]);
    } finally {
      setRestoringId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/groups/${deleteTarget.id}`, { method: 'DELETE' });
      if (res.ok) {
        setDeleteTarget(null);
        setDeleteInput('');
        await fetchMyGroups();
      }
    } finally {
      setDeleting(false);
    }
  };

  const handleBannerClick = (groupId: string) => {
    bannerTargetId.current = groupId;
    bannerInputRef.current?.click();
  };

  const handleBannerFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const gid = bannerTargetId.current;
    e.target.value = '';
    if (!file || !gid) return;
    if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) {
      alert('Please select a PNG, JPG, or WEBP image under 10MB.');
      return;
    }
    setUploadingBannerFor(gid);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const path = `${userData.user.id}/groups/banner-${gid}-${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from('avatars').upload(path, file, { contentType: file.type, upsert: true });
      if (uploadErr) throw uploadErr;
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      const bannerUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      await fetch(`/api/groups/${gid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cover_image: bannerUrl }),
      });
      await fetchMyGroups();
    } finally {
      setUploadingBannerFor(null);
      bannerTargetId.current = null;
    }
  };

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-[#f6f8fb]">
      {/* Shimmer keyframe */}
      <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: '#111827', letterSpacing: '-0.5px', margin: 0 }}>Lesson Marketplace</h1>
            <p style={{ fontSize: 15, color: '#64748b', marginTop: 4 }}>Create, manage, and discover lesson sessions</p>
          </div>
          <button
            onClick={() => setShowCreateGroup(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#199356', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer', boxShadow: '0 2px 8px rgba(25,147,86,0.3)' }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Create a Class
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1.5px solid #e5e7eb', marginBottom: 24 }}>
          {([
            { key: 'my', label: 'My Lessons', count: myGroups.length },
            { key: 'archived', label: 'Archived', count: archivedGroups.length },
          ] as const).map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  borderBottom: isActive ? '2.5px solid #199356' : '2.5px solid transparent',
                  padding: '10px 18px', marginBottom: -1.5,
                  fontSize: 14, fontWeight: isActive ? 700 : 500,
                  color: isActive ? '#199356' : '#6b7280',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span style={{ background: isActive ? '#e8f5ee' : '#f3f4f6', color: isActive ? '#199356' : '#6b7280', borderRadius: 20, padding: '1px 8px', fontSize: 12, fontWeight: 700 }}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* My Lessons Tab */}
        {activeTab === 'my' && (
          loading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
              {[0, 1, 2].map((i) => <LessonCardSkeleton key={i} />)}
            </div>
          ) : myGroups.length === 0 ? (
            <div style={{ border: '1.5px dashed #d1d5db', borderRadius: 12, padding: 48, textAlign: 'center', color: '#6b7280', fontSize: 14 }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth={1.5} style={{ margin: '0 auto 12px', display: 'block' }}>
                <path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
              </svg>
              <p style={{ fontWeight: 600, color: '#374151', marginBottom: 4 }}>No lessons yet</p>
              <p style={{ fontSize: 13 }}>Click <strong>Create a Class</strong> to get started</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
              {myGroups.map((g) => (
                <LessonCard
                  key={g.id}
                  group={g}
                  onManage={() => router.push(`/lessons/${g.id}`)}
                  onBannerUpload={() => handleBannerClick(g.id)}
                  uploadingBanner={uploadingBannerFor === g.id}
                />
              ))}
            </div>
          )
        )}

        {/* Archived Tab */}
        {activeTab === 'archived' && (
          archivedLoading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
              {[0, 1, 2].map((i) => <LessonCardSkeleton key={i} />)}
            </div>
          ) : archivedGroups.length === 0 ? (
            <div style={{ border: '1.5px dashed #d1d5db', borderRadius: 12, padding: 28, textAlign: 'center', color: '#6b7280', fontSize: 14 }}>
              No archived lessons.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
              {archivedGroups.map((g) => (
                <LessonCard
                  key={g.id}
                  group={g}
                  archived
                  onRestore={() => handleRestore(g)}
                  onBannerUpload={() => handleBannerClick(g.id)}
                  uploadingBanner={uploadingBannerFor === g.id}
                  restoring={restoringId === g.id}
                />
              ))}
            </div>
          )
        )}
      </div>

      {/* Hidden banner file input */}
      <input ref={bannerInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleBannerFile} />

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div
          onClick={() => { setDeleteTarget(null); setDeleteInput(''); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(13,13,13,0.5)', backdropFilter: 'blur(4px)', zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 460, boxShadow: '0 24px 60px rgba(0,0,0,0.2)' }}
          >
            <div style={{ padding: '28px 28px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 20 }}>
                <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth={2}><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                </div>
                <div>
                  <h3 style={{ fontSize: 18, fontWeight: 800, color: '#111827', marginBottom: 6 }}>Delete this lesson?</h3>
                  <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.5 }}>
                    This will permanently delete <strong style={{ color: '#111827' }}>{deleteTarget.name}</strong>, all its sessions, enrolled students, and earnings history. This cannot be undone.
                  </p>
                </div>
              </div>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Type the lesson name to confirm:</label>
              <input
                type="text"
                value={deleteInput}
                onChange={(e) => setDeleteInput(e.target.value)}
                placeholder={deleteTarget.name}
                autoFocus
                style={{ width: '100%', padding: '11px 14px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none' }}
                onFocus={(e) => (e.target.style.borderColor = '#199356')}
                onBlur={(e) => (e.target.style.borderColor = '#e5e7eb')}
              />
            </div>
            <div style={{ padding: '16px 28px', borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={() => { setDeleteTarget(null); setDeleteInput(''); }}
                style={{ background: 'none', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '9px 18px', fontSize: 14, fontWeight: 600, color: '#374151', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteInput !== deleteTarget.name || deleting}
                style={{
                  background: deleteInput === deleteTarget.name ? '#dc2626' : '#fca5a5',
                  border: 'none', borderRadius: 10, padding: '9px 18px', fontSize: 14, fontWeight: 600, color: '#fff',
                  cursor: deleteInput === deleteTarget.name ? 'pointer' : 'not-allowed',
                  opacity: deleteInput === deleteTarget.name ? 1 : 0.6,
                }}
              >
                {deleting ? 'Deleting…' : 'Delete lesson'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {showCreateGroup && (
        <CreateGroupModal
          onCreated={(id) => { setShowCreateGroup(false); void fetchMyGroups(); router.push(`/lessons/${id}`); }}
          onClose={() => setShowCreateGroup(false)}
        />
      )}
      {addSessionFor && (
        <AddSessionModal
          groupId={addSessionFor}
          onCreated={() => { setAddSessionFor(null); void fetchMyGroups(); }}
          onClose={() => setAddSessionFor(null)}
        />
      )}
      {addRecurringFor && (
        <AddRecurringSessionModal
          groupId={addRecurringFor}
          onCreated={() => { setAddRecurringFor(null); void fetchMyGroups(); }}
          onClose={() => setAddRecurringFor(null)}
        />
      )}
    </div>
  );
}

// ─── Lesson Card ─────────────────────────────────────────────────────────────

interface LessonCardProps {
  group: GroupWithTutor;
  archived?: boolean;
  onManage?: () => void;
  onRestore?: () => void;
  onBannerUpload: () => void;
  uploadingBanner?: boolean;
  restoring?: boolean;
}

function LessonCard({ group, archived, onManage, onRestore, onBannerUpload, uploadingBanner, restoring }: LessonCardProps) {
  const [bannerHovered, setBannerHovered] = useState(false);
  const g = group as any;

  const hasCoverImage = !!g.cover_image;
  const bannerStyle: React.CSSProperties = hasCoverImage
    ? { background: `url(${g.cover_image}) center/cover no-repeat` }
    : { background: getBannerGradient(group.id) };

  const memberCount = group.member_count ?? 0;
  const sessionCount = g.sessionCount ?? g.session_count ?? 0;
  const earnings = g.estimated_earnings ?? g.estimatedEarnings ?? 0;
  const nextOcc = group.next_occurrence;

  const subjectDisplay = group.subject || '—';
  const formLevel = (g.form_level ?? g.formLevel ?? '').replace('_', ' ');
  const subjectLine = formLevel ? `${subjectDisplay} · ${formLevel}` : subjectDisplay;

  return (
    <div
      onClick={!archived ? onManage : undefined}
      style={{
        background: '#fff', borderRadius: 14,
        boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        border: '1px solid #f0f2f5',
        display: 'flex', flexDirection: 'column',
        opacity: archived ? 0.85 : 1,
        transition: 'box-shadow 0.15s, transform 0.15s',
        position: 'relative',
        cursor: archived ? 'default' : 'pointer',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.boxShadow = '0 6px 24px rgba(0,0,0,0.1)';
        if (!archived) el.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.boxShadow = '0 2px 12px rgba(0,0,0,0.06)';
        el.style.transform = 'none';
      }}
    >
      {/* Banner */}
      <div
        onMouseEnter={() => setBannerHovered(true)}
        onMouseLeave={() => setBannerHovered(false)}
        onClick={(e) => { e.stopPropagation(); onBannerUpload(); }}
        style={{
          height: 110, borderRadius: '14px 14px 0 0',
          position: 'relative', cursor: 'pointer', overflow: 'hidden', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          ...bannerStyle,
        }}
      >
        {!hasCoverImage && (
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth={1.5} style={{ pointerEvents: 'none' }}>
            <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
          </svg>
        )}

        {archived && (
          <span style={{ position: 'absolute', top: 10, right: 12, background: '#FF6B00', color: '#fff', borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 700 }}>
            Archived
          </span>
        )}

        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
          opacity: bannerHovered || uploadingBanner ? 1 : 0,
          transition: 'opacity 0.2s',
        }}>
          {uploadingBanner ? (
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
          ) : (
            <>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" /></svg>
              <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>Upload banner</span>
              <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: 10 }}>PNG, JPG, WEBP · max 10MB</span>
            </>
          )}
        </div>
      </div>

      {/* Card body */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '14px 16px 16px' }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#111827', lineHeight: 1.3, margin: '0 0 3px' }}>
          {group.name}
        </h3>
        <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>{subjectLine}</p>

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
          {[
            { label: 'Members', value: memberCount, color: '#111827' },
            { label: 'Sessions', value: sessionCount, color: '#111827' },
            { label: 'Next', value: formatNextSession(nextOcc), color: nextSessionColor(nextOcc) },
          ].map((stat) => (
            <div key={stat.label} style={{ background: '#f9fafb', borderRadius: 8, padding: '8px 6px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>{stat.label}</div>
              <div style={{ fontWeight: 700, fontSize: 14, color: stat.color }}>{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Earnings (active only) */}
        {!archived && (
          <div style={{ background: '#e8f5ee', borderRadius: 8, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#199356', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Earnings</span>
            <span style={{ fontWeight: 800, color: '#137a48', fontSize: 15 }}>{formatEarnings(earnings)}</span>
          </div>
        )}

        {/* Action */}
        <div style={{ marginTop: 'auto' }}>
          {archived && (
            <button
              onClick={(e) => { e.stopPropagation(); onRestore?.(); }}
              disabled={restoring}
              style={{ width: '100%', background: 'none', border: '1px solid #e5e7eb', borderRadius: 8, padding: 9, fontSize: 13, fontWeight: 600, color: '#6b7280', cursor: restoring ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 105.5-8.4" /></svg>
              {restoring ? 'Restoring…' : 'Restore lesson'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
