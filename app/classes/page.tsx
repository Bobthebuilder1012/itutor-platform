'use client';

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { ClassesShell } from "@/components/classes/ClassesShell";
import { ClassCard, type ClassCardData } from "@/components/classes/ClassCard";
import { supabase } from "@/lib/supabase/client";

const SUBJECTS = ["All", "Mathematics", "English", "Biology", "Chemistry", "Physics", "Accounts", "History", "Geography"];
const SORTS = ["Most Popular", "Newest", "Rating"];

const ACCENTS: Record<string, string> = {
  Mathematics: "#32CC6F",
  English: "#6E8BFF",
  Biology: "#FF8A65",
  Chemistry: "#C77DFF",
  Physics: "#FFC857",
  Accounts: "#4ECDC4",
  History: "#FF6B6B",
  Geography: "#45B7D1",
};

export default function ClassesPage() {
  const [subject, setSubject] = useState("All");
  const [sort, setSort] = useState(SORTS[0]);
  const [sortOpen, setSortOpen] = useState(false);
  const [classes, setClasses] = useState<ClassCardData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchClasses();
  }, [sort]);

  async function fetchClasses() {
    setLoading(true);
    try {
      let query = supabase
        .from('groups')
        .select(`
          id, name, description, subject, status, visibility,
          price_monthly, price_per_session,
          rating_average, rating_count,
          tutor:profiles!groups_tutor_id_fkey(id, full_name, display_name, avatar_url, tutor_verification_status)
        `)
        .eq('status', 'active')
        .eq('visibility', 'public')
        .is('archived_at', null);

      if (sort === 'Newest') query = query.order('created_at', { ascending: false });
      else if (sort === 'Rating') query = query.order('rating_average', { ascending: false });
      else query = query.order('rating_count', { ascending: false });

      const { data, error } = await query;
      if (error) throw error;

      setClasses((data ?? []).map((g: any): ClassCardData => {
        const tutor = Array.isArray(g.tutor) ? g.tutor[0] : g.tutor;
        return {
          id: g.id,
          name: g.name,
          subject: g.subject || 'General',
          description: g.description || '',
          tutorName: tutor?.display_name || tutor?.full_name || 'Tutor',
          tutorAvatar: tutor?.avatar_url ?? undefined,
          verified: tutor?.tutor_verification_status === 'verified',
          rating: Number(g.rating_average ?? 0),
          ratingCount: g.rating_count ?? 0,
          priceTTD: Number(g.price_monthly ?? g.price_per_session ?? 0),
          accent: ACCENTS[g.subject] ?? '#32CC6F',
        };
      }));
    } catch (err) {
      console.error('Failed to load classes:', err);
    } finally {
      setLoading(false);
    }
  }

  const filtered = classes.filter((c) => subject === "All" || c.subject === subject);

  return (
    <ClassesShell>
      <header className="mb-8">
        <h1 className="text-4xl font-bold tracking-tight">Classes</h1>
        <p className="mt-2 text-[#A0A0A0]">Live group lessons taught by verified Caribbean tutors</p>
      </header>

      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {SUBJECTS.map((s) => {
            const active = s === subject;
            return (
              <button
                key={s}
                onClick={() => setSubject(s)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-[#32CC6F] text-black"
                    : "border border-[#1F1F1F] bg-[#111111] text-[#A0A0A0] hover:text-white"
                }`}
              >
                {s}
              </button>
            );
          })}
        </div>
        <div className="relative">
          <button
            onClick={() => setSortOpen((o) => !o)}
            className="inline-flex items-center gap-2 rounded-full border border-[#1F1F1F] bg-[#111111] px-4 py-2 text-sm font-medium text-white"
          >
            Sort: {sort} <ChevronDown className="size-4" />
          </button>
          {sortOpen && (
            <div className="absolute right-0 mt-2 w-48 overflow-hidden rounded-xl border border-[#1F1F1F] bg-[#111111] shadow-xl z-10">
              {SORTS.map((s) => (
                <button
                  key={s}
                  onClick={() => { setSort(s); setSortOpen(false); }}
                  className={`block w-full px-4 py-2.5 text-left text-sm hover:bg-white/5 ${sort === s ? "text-[#32CC6F]" : "text-white"}`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="h-64 rounded-2xl border border-[#1F1F1F] bg-[#111111] animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="grid place-items-center rounded-2xl border border-dashed border-[#1F1F1F] bg-[#111111] py-20 text-center">
          <div className="mb-4 size-20 rounded-2xl bg-[#1F1F1F]" />
          <div className="text-lg font-semibold">No classes found</div>
          <button onClick={() => setSubject("All")} className="mt-3 text-sm text-[#32CC6F] hover:underline">
            Clear filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <ClassCard key={c.id} c={c} />
          ))}
        </div>
      )}
    </ClassesShell>
  );
}
