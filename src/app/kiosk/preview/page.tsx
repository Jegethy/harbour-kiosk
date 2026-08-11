import type { Metadata } from "next";
import { PreviewPanel } from "@/app/kiosk/preview/PreviewPanel";
import { requireStaff } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Kiosk screen preview — Harbour Care Centre",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** Staff only. Stand-in data, but no reason to expose it publicly. */
export default async function PreviewPage() {
  await requireStaff();
  return <PreviewPanel />;
}
