"use client";

/**
 * Transient states: waiting on the database, and reporting that it failed.
 *
 * The error copy always ends with something the visitor can do, because the
 * one thing they cannot do is fix the network.
 */
export function NoticeScreen({
  tone,
  title,
  detail,
}: {
  tone: "busy" | "error";
  title: string;
  detail?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex h-full flex-col items-center justify-center gap-6 bg-brand-primary px-8 text-center"
    >
      {tone === "busy" ? (
        <span
          aria-hidden="true"
          className="h-16 w-16 animate-spin rounded-full border-4 border-cream-dim/30 border-t-brand-cream"
        />
      ) : (
        <span className="flex h-24 w-24 items-center justify-center rounded-full bg-brand-accent">
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="h-14 w-14 fill-none stroke-brand-cream stroke-[2.5]"
            strokeLinecap="round"
          >
            <path d="M12 7v7M12 17.5v.5" />
          </svg>
        </span>
      )}

      <p className="text-balance text-4xl font-bold leading-tight text-brand-cream sm:text-5xl">
        {title}
      </p>

      {detail ? (
        <p className="max-w-2xl text-balance text-xl font-medium text-cream-dim sm:text-2xl">
          {detail}
        </p>
      ) : null}
    </div>
  );
}
