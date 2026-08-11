"use client";

export type NoticeTone =
  /** Waiting on the database. */
  | "busy"
  /** Something broke on our side — network, database, misconfiguration. */
  | "error"
  /** The tap was understood and refused. Nothing is broken. */
  | "alert";

/**
 * Transient full-screen states.
 *
 * "alert" is a full-bleed red, distinct from the maroon used for faults,
 * because an unrecognised fob is not a malfunction — it is a normal answer
 * that needs the visitor to go and talk to somebody. It has to read as a stop
 * sign from across the lobby.
 *
 * Error copy always ends with something the visitor can act on, because the
 * one thing they cannot do is fix the network.
 */
export function NoticeScreen({
  tone,
  title,
  detail,
  resetMs,
}: {
  tone: NoticeTone;
  title: string;
  detail?: string;
  /** Draws a countdown bar, matching the confirmation screens. */
  resetMs?: number;
}) {
  const alert = tone === "alert";

  const shell = alert ? "bg-brand-accent text-brand-cream" : "bg-brand-primary text-brand-cream";
  const badge = alert ? "bg-brand-cream text-brand-accent" : "bg-brand-accent text-brand-cream";
  const muted = alert ? "text-brand-cream/85" : "text-cream-dim";

  return (
    <div
      role={tone === "busy" ? "status" : "alert"}
      aria-live={tone === "busy" ? "polite" : "assertive"}
      className={`relative flex h-full flex-col items-center justify-center gap-6 px-8 text-center ${shell}`}
    >
      {tone === "busy" ? (
        <span
          aria-hidden="true"
          className="h-16 w-16 animate-spin rounded-full border-4 border-cream-dim/30 border-t-brand-cream"
        />
      ) : (
        <span
          className={`flex h-24 w-24 items-center justify-center rounded-full sm:h-28 sm:w-28 ${badge}`}
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="h-14 w-14 fill-none stroke-current stroke-[2.5]"
            strokeLinecap="round"
          >
            <path d="M12 7v7M12 17.5v.5" />
          </svg>
        </span>
      )}

      <p className="text-balance text-4xl font-bold leading-tight sm:text-5xl">{title}</p>

      {detail ? (
        <p className={`max-w-2xl text-balance text-2xl font-semibold sm:text-3xl ${muted}`}>
          {detail}
        </p>
      ) : null}

      {resetMs ? (
        <span
          aria-hidden="true"
          className={`absolute bottom-0 left-0 h-2 w-full origin-left ${
            alert ? "bg-brand-cream/40" : "bg-brand-cream/25"
          }`}
          style={{ animation: `kiosk-countdown ${resetMs}ms linear forwards` }}
        />
      ) : null}
    </div>
  );
}
