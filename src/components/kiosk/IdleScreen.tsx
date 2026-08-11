"use client";

import { BrandLogo } from "@/components/kiosk/BrandLogo";
import { formatClockDate, formatClockTime, useClock } from "@/hooks/useClock";

/**
 * The screen the tablet shows all day.
 *
 * Three blocks — identity, time, and the thing we want you to do — separated by
 * explicit margins rather than one uniform gap. A single gap gives every
 * relationship the same weight; here the call to action needs to read as its
 * own thing rather than as a fourth line of the clock.
 *
 * The whole stack stays optically centred. The logo is capped by height as
 * well as width so a short viewport shrinks it rather than pushing the prompt
 * off the bottom, and the date line reserves its height so nothing shifts on
 * the first tick after hydration.
 */
export function IdleScreen() {
  const now = useClock();

  return (
    <div className="flex h-full flex-col items-center justify-center bg-kiosk-canvas px-6 py-6 text-center">
      <BrandLogo className="max-h-[30vh] max-w-[min(340px,72vw)]" />

      <div className="mt-8 flex flex-col items-center gap-1 sm:mt-10">
        <p className="text-7xl font-bold leading-none tabular-nums text-kiosk-ink sm:text-8xl">
          {now ? formatClockTime(now) : " "}
        </p>
        <p className="min-h-7 text-lg font-medium text-kiosk-muted sm:text-xl">
          {now ? formatClockDate(now) : ""}
        </p>
      </div>

      {/* Held well clear of the clock so it reads as an instruction, not a caption. */}
      <div className="mt-12 flex flex-col items-center gap-9 sm:mt-16">
        <FobPrompt />
        <h1 className="max-w-2xl text-balance text-3xl font-semibold leading-snug text-kiosk-ink sm:text-4xl">
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
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-accent opacity-40" />
      <span className="relative inline-flex h-14 w-14 items-center justify-center rounded-full bg-brand-accent">
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="h-8 w-8 fill-none stroke-white stroke-2"
          strokeLinecap="round"
        >
          <path d="M6 8a8 8 0 0 1 0 8M10 5.5a12 12 0 0 1 0 13M14 3a16 16 0 0 1 0 18" />
        </svg>
      </span>
    </span>
  );
}
