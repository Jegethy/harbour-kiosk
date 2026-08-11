"use client";

import { BrandLogo } from "@/components/kiosk/BrandLogo";
import { formatClockDate, formatClockTime, useClock } from "@/hooks/useClock";

/**
 * The screen the tablet shows all day.
 *
 * Laid out as three bands that share the height, so it holds up in both
 * orientations on an 8.7" panel without anything being cut off. The clock uses
 * tabular figures so the digits do not jitter on each tick.
 */
export function IdleScreen() {
  const now = useClock();

  return (
    <div className="flex h-full flex-col items-center justify-between bg-brand-primary px-6 py-6 text-center sm:py-8">
      <BrandLogo className="max-h-[26vh] w-auto" />

      <div aria-live="off">
        <p className="text-7xl font-bold tabular-nums leading-none text-brand-cream sm:text-8xl">
          {now ? formatClockTime(now) : " "}
        </p>
        <p className="mt-3 text-lg font-medium text-cream-dim sm:text-xl">
          {now ? formatClockDate(now) : " "}
        </p>
      </div>

      <div className="flex flex-col items-center gap-5">
        <FobPrompt />
        <h1 className="max-w-2xl text-balance text-3xl font-semibold leading-snug text-brand-cream sm:text-4xl">
          Please tap your keyfob to sign in or out.
        </h1>
      </div>
    </div>
  );
}

/** A quiet pulse at the reader's position, so the prompt has somewhere to point. */
function FobPrompt() {
  return (
    <span className="relative flex h-16 w-16 items-center justify-center">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-accent opacity-60" />
      <span className="relative inline-flex h-14 w-14 items-center justify-center rounded-full bg-brand-accent">
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="h-8 w-8 fill-none stroke-brand-cream stroke-2"
          strokeLinecap="round"
        >
          <path d="M6 8a8 8 0 0 1 0 8M10 5.5a12 12 0 0 1 0 13M14 3a16 16 0 0 1 0 18" />
        </svg>
      </span>
    </span>
  );
}
