import { NextResponse } from "next/server";
import { getServerClient, getServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const AI_USE_LIMIT = 2;

export async function GET() {
  const supabase = await getServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = getServiceClient();
  const { data: profile } = await service
    .from("profiles")
    .select("ai_uses_count")
    .eq("id", user.id)
    .single();

  const uses = profile?.ai_uses_count ?? 0;
  return NextResponse.json({ uses, limit: AI_USE_LIMIT, remaining: Math.max(0, AI_USE_LIMIT - uses) });
}
