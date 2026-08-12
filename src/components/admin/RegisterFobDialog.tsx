"use client";

import { useRef, useState, useTransition } from "react";
import { assignFobAction } from "@/app/admin/actions";
import { FobIdField } from "@/components/admin/FobIdField";

/**
 * Attach a keyfob to a visitor who currently has none.
 *
 * The field accepts a tap on the desk reader or a typed number — the reader is
 * a keyboard, so both paths land in the same input, and FobIdField swallows the
 * trailing Enter that would otherwise submit the form mid-scan.
 */
export function RegisterFobDialog({
  visitorId,
  fullName,
}: {
  visitorId: string;
  fullName: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const [fobId, setFobId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function open() {
    setFobId("");
    setError(null);
    setNotice(null);
    dialogRef.current?.showModal();
  }

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await assignFobAction(formData);

      if (result.error) {
        setError(result.error);
        return;
      }

      setError(null);
      setNotice("Keyfob registered.");
      setFobId("");
      dialogRef.current?.close();
    });
  }

  if (notice) {
    return <span className="text-sm font-semibold text-status-ok">{notice}</span>;
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="rounded-lg border-2 border-brand-primary px-3 py-1.5 text-sm font-bold text-brand-primary transition-colors hover:bg-brand-primary hover:text-brand-cream"
      >
        Register fob
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setError(null)}
        className="m-auto w-[min(30rem,92vw)] rounded-2xl bg-neutral-light p-0 text-neutral-dark backdrop:bg-black/50"
      >
        <form
          action={submit}
          onKeyDown={(event) => {
            if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
              event.preventDefault();
            }
          }}
          className="flex flex-col gap-4 p-6"
        >
          <input type="hidden" name="visitor_id" value={visitorId} />

          <header>
            <h2 className="text-xl font-bold text-brand-primary">Register a keyfob</h2>
            <p className="mt-1 text-sm text-neutral-dark/70">
              Assigning to <strong>{fullName}</strong>. They can sign in at the kiosk as soon
              as this is saved.
            </p>
          </header>

          <FobIdField
            value={fobId}
            onChange={setFobId}
            disabled={pending}
            optional={false}
            autoFocus
            idleHint="Tap the fob on the reader, or type its number."
          />

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
              disabled={pending || fobId.trim() === ""}
              className="rounded-lg bg-brand-primary px-6 py-2.5 font-bold text-brand-cream disabled:opacity-50"
            >
              {pending ? "Saving…" : "Register fob"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
