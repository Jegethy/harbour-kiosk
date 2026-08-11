"use client";

import { BrandLogo } from "@/components/kiosk/BrandLogo";
import { formatClockDate, formatClockTime, useClock } from "@/hooks/useClock";

/**
 * The screen the tablet shows all day.
 *
 * Deep maroon behind a transparent logo, so there is no background to match.
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
    <div className="flex h-full flex-col items-center justify-center bg-brand-primary px-6 py-6 text-center">
      {/*
        One width expression rather than max-width plus max-height: the wrapper
        carries an aspect ratio, and capping both dimensions independently would
        let a short viewport squash it. 29vh is the height cap expressed as
        width, via the artwork's own ratio.
      */}
      <BrandLogo className="w-[min(260px,64vw,29vh)]" />

      <div className="mt-10 flex flex-col items-center gap-1 sm:mt-12">
        <p className="text-7xl font-bold leading-none tabular-nums text-brand-cream sm:text-8xl">
          {now ? formatClockTime(now) : " "}
        </p>
        <p className="min-h-7 text-lg font-medium text-cream-dim sm:text-xl">
          {now ? formatClockDate(now) : ""}
        </p>
      </div>

      {/* Held well clear of the clock so it reads as an instruction, not a caption. */}
      <div className="mt-14 flex flex-col items-center gap-9 sm:mt-20">
        <FobPrompt />
        <h1 className="max-w-2xl text-balance text-3xl font-semibold leading-snug text-brand-cream sm:text-4xl">
          Please tap your keyfob to sign in or out.
        </h1>
      </div>
    </div>
  );
}

/**
 * A quiet pulse at the reader's position, so the prompt has somewhere to point.
 *
 * A cream disc holding a red icon, not a red disc: brand red on brand maroon is
 * 1.7:1 and effectively vanishes. Inverting it makes this the brightest thing
 * on the screen, which is what a call to action should be.
 */
function FobPrompt() {
  return (
    <span className="relative flex h-16 w-16 items-center justify-center">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-cream opacity-30" />
      <span className="relative inline-flex h-14 w-14 items-center justify-center rounded-full bg-brand-cream">
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="h-8 w-8 fill-none stroke-brand-accent stroke-2"
          strokeLinecap="round"
        >
          <path d="M6 8a8 8 0 0 1 0 8M10 5.5a12 12 0 0 1 0 13M14 3a16 16 0 0 1 0 18" />
        </svg>
      </span>
    </span>
  );
}
