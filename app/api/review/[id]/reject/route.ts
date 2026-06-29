import { NextResponse } from "next/server";
import { requireSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = requireSupabaseAdmin();
  const { error } = await supabase
    .from("review_items")
    .update({
      status: "rejected",
      approved_at: new Date().toISOString(),
      approval_notes: "Rejected from dashboard."
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.redirect(new URL("/review", request.url), { status: 303 });
}

