"use client";

import { formatClockTime, useClock } from "@/hooks/useClock";

/**
 * Shown whenever the kiosk cannot reach the check-in service.
 *
 * There is no offline queue by design — a tap recorded locally and synced
 * later could contradict the fire roster, and a roster that is confidently
 * wrong is worse than one that is honestly unavailable. So this screen's job
 * is to stop people believing they have signed in, and to send them to a human
 * instead. It recovers on its own; nobody has to touch the tablet.
 */
export function OfflineScreen() {
  const now = useClock();

  return (
    <div
      role="alert"
      className="flex h-full flex-col items-center justify-center gap-7 bg-brand-primary px-8 text-center"
    >
      <span className="flex h-28 w-28 items-center justify-center rounded-full bg-brand-accent">
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="h-16 w-16 fill-none stroke-brand-cream stroke-2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 3l18 18M8.5 16.4a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 3.1-2.1M19 12.9a10 10 0 0 0-6.9-2.9M2 9.3a15 15 0 0 1 4-2.6M22 9.3a15 15 0 0 0-9.6-3.2M12 20h.01" />
        </svg>
      </span>

      <h1 className="text-balance text-5xl font-bold leading-tight text-brand-cream sm:text-6xl">
        System offline
      </h1>

      <p className="max-w-2xl text-balance text-3xl font-semibold leading-snug text-brand-cream sm:text-4xl">
        Please see reception to sign in.
      </p>

      <p className="flex items-center gap-3 text-lg text-cream-dim sm:text-xl">
        <span
          aria-hidden="true"
          className="h-4 w-4 animate-pulse rounded-full bg-cream-dim"
        />
        Trying to reconnect{now ? ` — ${formatClockTime(now)}` : ""}
      </p>
    </div>
  );
}
