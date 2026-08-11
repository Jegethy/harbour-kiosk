"use client";

import { useActionState, useState } from "react";
import { unlinkFobAction, type ActionState } from "@/app/admin/actions";

/**
 * Two-step confirmation for freeing a keyfob.
 *
 * Deliberately not window.confirm: the consequence depends on whether the
 * visitor is currently in the building, and the confirm step says so in
 * words. Unlinking someone who is signed in also signs them out, which
 * removes them from the fire roster — that is the right behaviour, but it
 * should never be a surprise.
 */
export function UnlinkFobButton({
  visitorId,
  fullName,
  currentlyIn,
}: {
  visitorId: string;
  fullName: string;
  currentlyIn: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    unlinkFobAction,
    {},
  );
  const [confirming, setConfirming] = useState(false);

  if (state.notice) {
    return <span className="text-sm font-semibold text-status-ok">{state.notice}</span>;
  }

  if (!confirming) {
    return (
      <div className="flex flex-col items-start gap-1">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-lg border-2 border-brand-primary px-3 py-1.5 text-sm font-bold text-brand-primary transition-colors hover:bg-brand-primary hover:text-brand-cream"
        >
          Unlink fob
        </button>
        {state.error ? (
          <span role="alert" className="text-xs font-semibold text-brand-accent">
            {state.error}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col items-start gap-2">
      <input type="hidden" name="visitor_id" value={visitorId} />

      <p className="max-w-xs text-xs font-medium text-neutral-dark/80">
        Free this keyfob from <strong>{fullName}</strong> so it can be given to someone else?
        {currentlyIn ? (
          <>
            {" "}
            <strong className="text-brand-accent">
              They are currently signed in, so they will also be signed out and removed from
              the roster.
            </strong>
          </>
        ) : null}
      </p>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand-accent px-3 py-1.5 text-sm font-bold text-brand-cream disabled:opacity-60"
        >
          {pending ? "Unlinking…" : "Yes, unlink"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={pending}
          className="rounded-lg border-2 border-neutral-dark/30 px-3 py-1.5 text-sm font-bold text-neutral-dark disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
