"use client";

import { useRef, useState, useTransition } from "react";
import { deleteVisitorAction } from "@/app/admin/actions";

/** Case-sensitive on purpose: the point is to interrupt an automatic click. */
const CONFIRM_WORD = "CONFIRM";

/**
 * Permanent deletion of a visitor profile.
 *
 * The dialog says what actually goes, including how many visit records are
 * attached, because that history is the answer to "who was in the building on
 * the day of the incident" and it will not be recoverable.
 *
 * The keyfob history in fob_assignments is not affected — those rows keep a
 * snapshot of the name and outlive the profile.
 */
export function DeleteVisitorDialog({
  visitorId,
  fullName,
  visitCount,
}: {
  visitorId: string;
  fullName: string;
  visitCount: number;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);

  function open() {
    setTyped("");
    setError(null);
    dialogRef.current?.showModal();
  }

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await deleteVisitorAction(formData);

      if (result.error) {
        setError(result.error);
        return;
      }

      dialogRef.current?.close();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="rounded-lg border-2 border-brand-accent px-3 py-1.5 text-sm font-bold text-brand-accent transition-colors hover:bg-brand-accent hover:text-white"
      >
        Delete visitor
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setError(null)}
        className="m-auto w-[min(32rem,92vw)] rounded-2xl bg-neutral-light p-0 text-neutral-dark backdrop:bg-black/50"
      >
        <form action={submit} className="flex flex-col gap-4 p-6">
          <input type="hidden" name="visitor_id" value={visitorId} />

          <header>
            <h2 className="text-xl font-bold text-brand-accent">Delete this visitor?</h2>
            <p className="mt-2 text-sm leading-relaxed text-neutral-dark/80">
              This permanently removes <strong>{fullName}</strong>
              {visitCount > 0 ? (
                <>
                  {" "}
                  and their{" "}
                  <strong>
                    {visitCount} visit {visitCount === 1 ? "record" : "records"}
                  </strong>
                  , which is the record of when they were in the building
                </>
              ) : null}
              . It cannot be undone.
            </p>
            <p className="mt-2 text-sm text-neutral-dark/60">
              Their keyfob history is kept separately and will not be affected.
            </p>
          </header>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-neutral-dark">
              Type <code className="font-mono font-bold">{CONFIRM_WORD}</code> to continue
            </span>
            <input
              name="confirmation"
              type="text"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              disabled={pending}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className="rounded-lg border-2 border-neutral-dark/20 bg-white px-4 py-3 font-mono text-lg text-neutral-dark outline-none focus:border-brand-accent disabled:opacity-60"
            />
          </label>

          {error ? (
            <p
              role="alert"
              className="rounded-lg border-2 border-brand-accent bg-brand-accent/10 px-4 py-3 text-sm font-semibold text-brand-primary"
            >
              {error}
            </p>
          ) : null}

          <div className="mt-2 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => !pending && dialogRef.current?.close()}
              disabled={pending}
              className="rounded-lg border-2 border-neutral-dark/30 px-5 py-2.5 font-bold text-neutral-dark disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending || typed !== CONFIRM_WORD}
              className="rounded-lg bg-brand-accent px-6 py-2.5 font-bold text-white disabled:bg-neutral-dark/20 disabled:text-neutral-dark/50"
            >
              {pending ? "Deleting…" : "Delete permanently"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
