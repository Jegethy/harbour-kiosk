import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Is the kiosk actually able to record a visit right now?
 *
 * Deliberately checks Supabase rather than just answering 200. From a
 * visitor's point of view there is no difference between "the tablet lost
 * wifi" and "the database is unreachable" — either way their tap cannot be
 * recorded, and they need to be sent to reception rather than left tapping a
 * screen that looks fine.
 *
 * No device-token guard: this reveals only whether the service is up.
 */
export async function GET() {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("visit_logs").select("id", { head: true }).limit(1);

    if (error) {
      console.error("[kiosk/health] database unreachable", error);
      return NextResponse.json({ ok: false }, { status: 503, headers: NO_STORE });
    }

    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (thrown) {
    console.error("[kiosk/health] check failed", thrown);
    return NextResponse.json({ ok: false }, { status: 503, headers: NO_STORE });
  }
}

const NO_STORE = { "Cache-Control": "no-store" };
