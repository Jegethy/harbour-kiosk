import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isScanOutcome, type ScanOutcome } from "@/lib/kiosk/outcomes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Optional shared secret. When KIOSK_DEVICE_TOKEN is set, the tablet must send
 * it as x-kiosk-token.
 *
 * Without it this endpoint is open to anyone who can reach the app: they could
 * enumerate valid fob IDs (UNKNOWN_FOB vs a name in the response) and sign
 * people in and out at will, which corrupts the fire roster. Left unenforced
 * when unset so local development needs no setup.
 */
function deviceTokenRejection(request: Request): NextResponse | null {
  const expected = process.env.KIOSK_DEVICE_TOKEN;
  if (!expected) return null;

  if (request.headers.get("x-kiosk-token") !== expected) {
    return NextResponse.json({ outcome: "ERROR", message: "Unauthorised device." } satisfies ScanOutcome, {
      status: 401,
    });
  }
  return null;
}

export async function POST(request: Request) {
  const rejected = deviceTokenRejection(request);
  if (rejected) return rejected;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ outcome: "INVALID" } satisfies ScanOutcome, { status: 400 });
  }

  const raw = (body as { fob_id?: unknown } | null)?.fob_id;
  const fobId = typeof raw === "string" ? raw.trim() : "";

  if (fobId === "" || fobId.length > 64) {
    return NextResponse.json({ outcome: "INVALID" } satisfies ScanOutcome, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("handle_fob_scan", { p_fob_id: fobId });

  if (error) {
    // Logged server-side in full; the tablet gets a message a visitor can act
    // on, with no database detail.
    console.error("[kiosk/scan] handle_fob_scan failed", error);
    return NextResponse.json(
      {
        outcome: "ERROR",
        message: "Check-in is temporarily unavailable. Please see reception.",
      } satisfies ScanOutcome,
      { status: 502 },
    );
  }

  if (!isScanOutcome(data)) {
    console.error("[kiosk/scan] unrecognised RPC payload", data);
    return NextResponse.json(
      {
        outcome: "ERROR",
        message: "Check-in is temporarily unavailable. Please see reception.",
      } satisfies ScanOutcome,
      { status: 502 },
    );
  }

  return NextResponse.json(data, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}
