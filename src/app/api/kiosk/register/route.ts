import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cleanField, deviceTokenRejection } from "@/lib/kiosk/guard";
import { isRegisterOutcome, type RegisterOutcome } from "@/lib/kiosk/outcomes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UNAVAILABLE: RegisterOutcome = {
  outcome: "ERROR",
  message: "Registration is temporarily unavailable. Please see reception.",
};

/** Scenario B: create a first-time visitor and sign them in, atomically. */
export async function POST(request: Request) {
  const rejected = deviceTokenRejection(request);
  if (rejected) return rejected;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ outcome: "INVALID" } satisfies RegisterOutcome, { status: 400 });
  }

  const input = body as Record<string, unknown> | null;
  const fobId = cleanField(input?.fob_id, 64);
  const fullName = cleanField(input?.full_name);
  const visitingWho = cleanField(input?.visiting_who);
  const companyOrRelation = cleanField(input?.company_or_relation);

  if (!fobId || !fullName) {
    return NextResponse.json({ outcome: "INVALID" } satisfies RegisterOutcome, { status: 400 });
  }

  let data: unknown;
  try {
    const supabase = createAdminClient();
    const result = await supabase.rpc("register_visitor", {
      p_fob_id: fobId,
      p_full_name: fullName,
      p_visiting_who: visitingWho,
      p_company_or_relation: companyOrRelation,
    });

    if (result.error) {
      console.error("[kiosk/register] register_visitor failed", result.error);
      return NextResponse.json(UNAVAILABLE, { status: 502 });
    }
    data = result.data;
  } catch (thrown) {
    // Missing credentials and network failures throw. Answering in JSON keeps
    // the visitor's typed details on screen with a retry, instead of an
    // opaque 500.
    console.error("[kiosk/register] could not reach Supabase", thrown);
    return NextResponse.json(UNAVAILABLE, { status: 503 });
  }

  if (!isRegisterOutcome(data)) {
    console.error("[kiosk/register] unrecognised RPC payload", data);
    return NextResponse.json(UNAVAILABLE, { status: 502 });
  }

  return NextResponse.json(data, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}
