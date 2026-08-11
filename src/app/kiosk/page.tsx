import Link from "next/link";

/**
 * Placeholder. The idle screen (logo, clock, "tap your fob" prompt) is the
 * next step; the capture layer it will sit on is finished and testable at
 * /kiosk/diagnostics.
 */
export default function KioskPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 bg-harbour-900 p-8 text-center text-white">
      <h1 className="text-4xl font-bold">Harbour Care Centre</h1>
      <p className="max-w-md text-lg text-white/70">
        Kiosk idle screen not built yet. The fob capture layer is complete.
      </p>
      <Link
        href="/kiosk/diagnostics"
        className="rounded-xl bg-white px-8 py-4 text-xl font-bold text-harbour-900"
      >
        Open scanner diagnostics
      </Link>
    </div>
  );
}
