import type { Metadata } from "next";
import { DiagnosticsPanel } from "@/app/kiosk/diagnostics/DiagnosticsPanel";
import { requireStaff } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Scanner diagnostics — Harbour Care Centre",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Staff only.
 *
 * This page can post scans to the database, so on a publicly reachable
 * deployment it is a point-and-click tool for tampering with the fire roster.
 * requireStaff() rather than the device cookie: it is a support tool, used
 * from a laptop as often as from the tablet.
 */
export default async function DiagnosticsPage() {
  await requireStaff();
  return <DiagnosticsPanel />;
}
