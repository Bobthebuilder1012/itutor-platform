'use client';

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Plus } from "lucide-react";
import { ClassesShell } from "@/components/classes/ClassesShell";
import { StarRating } from "@/components/classes/StarRating";
import { supabase } from "@/lib/supabase/client";
import { useProfile } from "@/lib/hooks/useProfile";

type MyClass = {
  id: string;
  name: string;
  subject: string;
  students: number;
  rating: number;
  ratingCount: number;
  revenueTTD: number;
  status: "Active" | "Archived";
};

export default function ManageClassesPage() {
  const router = useRouter();
  const { profile, loading: profileLoading } = useProfile();
  const [classes, setClasses] = useState<MyClass[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profileLoading) return;
    if (!profile || profile.role !== 'tutor') { router.push('/login'); return; }
    fetchClasses(profile.id);
  }, [profile, profileLoading, router]);

  async function fetchClasses(tutorId: string) {
    setLoading(true);
    try {
      const { data: groups } = await supabase
        .from('groups')
        .select('id, name, subject, status, archived_at, rating_average, rating_count')
        .eq('tutor_id', tutorId)
        .order('created_at', { ascending: false });

      if (!groups) { setLoading(false); return; }

      const groupIds = groups.map(g => g.id);

      // Fetch active member counts per group
      const { data: members } = await supabase
        .from('group_members')
        .select('group_id')
        .in('group_id', groupIds)
        .in('status', ['approved', 'active']);

      const memberCounts: Record<string, number> = {};
      for (const m of members ?? []) {
        memberCounts[m.group_id] = (memberCounts[m.group_id] ?? 0) + 1;
      }

      // Fetch current month revenue from subscription_payments
      const startOfMonth = new Date();
      startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);
      let payments: any[] | null = null;
      try {
        const { data } = await supabase
          .from('subscription_payments')
          .select('group_id, amount_ttd')
          .in('group_id', groupIds)
          .eq('status', 'SUCCESS')
          .gte('created_at', startOfMonth.toISOString());
        payments = data;
      } catch { /* non-critical */ }

      const revByGroup: Record<string, number> = {};
      for (const p of payments ?? []) {
        revByGroup[p.group_id] = (revByGroup[p.group_id] ?? 0) + Number(p.amount_ttd ?? 0);
      }

      setClasses(groups.map((g): MyClass => ({
        id: g.id,
        name: g.name,
        subject: g.subject || '',
        students: memberCounts[g.id] ?? 0,
        rating: Number(g.rating_average ?? 0),
        ratingCount: g.rating_count ?? 0,
        revenueTTD: revByGroup[g.id] ?? 0,
        status: g.archived_at || g.status === 'archived' ? 'Archived' : 'Active',
      })));
    } finally {
      setLoading(false);
    }
  }

  async function archiveClass(id: string) {
    await supabase.from('groups').update({ status: 'archived', archived_at: new Date().toISOString() }).eq('id', id);
    setClasses(cs => cs.map(c => c.id === id ? { ...c, status: 'Archived' } : c));
  }

  return (
    <ClassesShell>
      <header className="mb-8 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">My Classes</h1>
          <p className="mt-2 text-[#A0A0A0]">Manage your recurring group classes</p>
        </div>
        <button
          onClick={() => router.push('/tutor/classes/new')}
          className="inline-flex items-center gap-2 rounded-full border border-[#32CC6F] px-5 py-2.5 text-sm font-semibold text-[#32CC6F] hover:bg-[#32CC6F]/10"
        >
          <Plus className="size-4" /> Create Class
        </button>
      </header>

      {loading ? (
        <div className="space-y-4">
          {[1,2,3].map(i => <div key={i} className="h-24 rounded-2xl border border-[#1F1F1F] bg-[#111111] animate-pulse" />)}
        </div>
      ) : classes.length === 0 ? (
        <div className="grid place-items-center rounded-2xl border border-dashed border-[#1F1F1F] bg-[#111111] py-20 text-center">
          <div className="text-lg font-semibold">You haven't created any classes yet</div>
          <button
            onClick={() => router.push('/tutor/classes/new')}
            className="mt-4 rounded-full bg-[#32CC6F] px-5 py-2.5 text-sm font-bold text-black hover:brightness-110"
          >
            Create your first class
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {classes.map((c) => (
            <ManageCard
              key={c.id}
              c={c}
              onArchive={() => archiveClass(c.id)}
              onEdit={() => router.push(`/tutor/classes/${c.id}`)}
              onViewStream={() => router.push(`/classes/${c.id}?tab=Stream`)}
            />
          ))}
        </div>
      )}
    </ClassesShell>
  );
}

function ManageCard({ c, onArchive, onEdit, onViewStream }: {
  c: MyClass;
  onArchive: () => void;
  onEdit: () => void;
  onViewStream: () => void;
}) {
  const [open, setOpen] = useState(false);

  const handleMenu = (opt: string) => {
    setOpen(false);
    if (opt === 'Edit') onEdit();
    else if (opt === 'Archive') onArchive();
    else if (opt === 'View Stream') onViewStream();
  };

  return (
    <div className="relative rounded-2xl border border-[#1F1F1F] bg-[#111111] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-bold text-white">{c.name}</h3>
            <span className="rounded-full bg-[#1F1F1F] px-2.5 py-0.5 text-[11px] font-medium text-[#A0A0A0]">{c.subject}</span>
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${c.status === "Active" ? "bg-[#32CC6F]/15 text-[#32CC6F]" : "bg-white/10 text-[#A0A0A0]"}`}>
              {c.status}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-[#A0A0A0]">
            <span><span className="font-semibold text-white">{c.students}</span> students</span>
            <StarRating value={c.rating || 0} count={c.ratingCount} />
            <span>Monthly revenue: <span className="font-semibold text-white">TTD ${c.revenueTTD.toLocaleString()}</span></span>
          </div>
        </div>

        <div className="relative">
          <button
            onClick={() => setOpen((o) => !o)}
            className="grid size-9 place-items-center rounded-full text-[#A0A0A0] hover:bg-white/5 hover:text-white"
          >
            <MoreHorizontal className="size-5" />
          </button>
          {open && (
            <div className="absolute right-0 z-10 mt-1 w-40 overflow-hidden rounded-xl border border-[#1F1F1F] bg-[#111111] shadow-xl">
              {["Edit", "Archive", "View Stream"].map((opt) => (
                <button
                  key={opt}
                  onClick={() => handleMenu(opt)}
                  className="block w-full px-4 py-2.5 text-left text-sm text-white hover:bg-white/5"
                >
                  {opt}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
