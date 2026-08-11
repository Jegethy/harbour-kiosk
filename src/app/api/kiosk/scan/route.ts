import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cleanField, deviceRejection } from "@/lib/kiosk/guard";
import { isScanOutcome, type ScanOutcome } from "@/lib/kiosk/outcomes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UNAVAILABLE: ScanOutcome = {
  outcome: "ERROR",
  message: "Check-in is temporarily unavailable. Please see reception.",
};

export async function POST(request: Request) {
  // Publicly reachable write endpoint: this is the boundary that stops anyone
  // with the URL altering the fire roster, or mining it for visitor names.
  const rejected = await deviceRejection();
  if (rejected) return rejected;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ outcome: "INVALID" } satisfies ScanOutcome, { status: 400 });
  }

  const fobId = cleanField((body as { fob_id?: unknown } | null)?.fob_id, 64);

  if (!fobId) {
    return NextResponse.json({ outcome: "INVALID" } satisfies ScanOutcome, { status: 400 });
  }

  let data: unknown;
  try {
    const supabase = createAdminClient();
    const result = await supabase.rpc("handle_fob_scan", { p_fob_id: fobId });

    if (result.error) {
      // Logged server-side in full; the tablet gets a message a visitor can
      // act on, with no database detail.
      console.error("[kiosk/scan] handle_fob_scan failed", result.error);
      return NextResponse.json(UNAVAILABLE, { status: 502 });
    }
    data = result.data;
  } catch (thrown) {
    // Missing credentials and network failures throw rather than returning an
    // error. Without this the route answers 500 with an empty body, and the
    // kiosk cannot tell a fault from a malformed reply.
    console.error("[kiosk/scan] could not reach Supabase", thrown);
    return NextResponse.json(UNAVAILABLE, { status: 503 });
  }

  if (!isScanOutcome(data)) {
    console.error("[kiosk/scan] unrecognised RPC payload", data);
    return NextResponse.json(UNAVAILABLE, { status: 502 });
  }

  return NextResponse.json(data, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}
