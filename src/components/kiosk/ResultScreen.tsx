"use client";

import { formatTimestamp } from "@/hooks/useClock";

export interface KioskResult {
  kind: "IN" | "OUT";
  fullName: string;
  visitingWho: string | null;
  /** ISO timestamp recorded by the database, not the tablet's clock. */
  at: string;
}

/**
 * Sign-in and sign-out confirmation.
 *
 * The two states invert the palette rather than differing by hue alone —
 * cream-on-maroon versus maroon-on-cream. Which one you are looking at is
 * legible from across the lobby, before any word has been read, and it does
 * not depend on colour vision. The icon and the badge text carry the same
 * distinction again for anyone who needs it.
 */
export function ResultScreen({
  result,
  resetMs,
}: {
  result: KioskResult;
  resetMs: number;
}) {
  const signedIn = result.kind === "IN";
  const time = formatTimestamp(result.at);

  const shell = signedIn
    ? "bg-brand-cream text-brand-primary"
    : "bg-brand-primary text-brand-cream";
  const badge = signedIn
    ? "bg-brand-primary text-brand-cream"
    : "bg-brand-cream text-brand-primary";
  const muted = signedIn ? "text-brand-deep/75" : "text-cream-dim";
  const bar = signedIn ? "bg-brand-primary/25" : "bg-brand-cream/30";

  return (
    <div
      role="status"
      aria-live="assertive"
      className={`relative flex h-full flex-col items-center justify-center gap-6 px-8 text-center ${shell}`}
    >
      <span
        className={`flex h-24 w-24 items-center justify-center rounded-full ${badge} sm:h-28 sm:w-28`}
      >
        {signedIn ? <CheckIcon /> : <LeaveIcon />}
      </span>

      <p
        className={`rounded-full px-7 py-2.5 text-2xl font-bold uppercase tracking-wide sm:text-3xl ${badge}`}
      >
        {signedIn ? "Signed in" : "Signed out — goodbye"}
      </p>

      <p className="text-balance text-5xl font-bold leading-tight sm:text-6xl">
        {signedIn ? `Welcome, ${result.fullName}` : result.fullName}
      </p>

      {signedIn && result.visitingWho ? (
        <p className={`text-2xl font-medium sm:text-3xl ${muted}`}>
          Visiting <span className="font-bold">{result.visitingWho}</span>
        </p>
      ) : null}

      {time ? (
        <p className={`text-xl sm:text-2xl ${muted}`}>
          {signedIn ? "Signed in at" : "Signed out at"} {time}
        </p>
      ) : null}

      {/* Shows the visitor that the screen is about to move on by itself. */}
      <span
        aria-hidden="true"
        className={`absolute bottom-0 left-0 h-2 w-full origin-left ${bar}`}
        style={{ animation: `kiosk-countdown ${resetMs}ms linear forwards` }}
      />
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-14 w-14 fill-none stroke-current stroke-[2.5]"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m4 12.5 5.5 5.5L20 6.5" />
    </svg>
  );
}

function LeaveIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-14 w-14 fill-none stroke-current stroke-[2.5]"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Door on the left, arrow leaving to the right. The mirrored version of
          this path is the "sign in" glyph — easy to reach for by mistake, and
          it points the wrong way on a goodbye screen. */}
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
    </svg>
  );
}
