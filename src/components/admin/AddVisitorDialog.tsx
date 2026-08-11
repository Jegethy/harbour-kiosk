"use client";

import { useRef, useState, useTransition } from "react";
import { createVisitorAction } from "@/app/admin/actions";
import { FobIdField } from "@/components/admin/FobIdField";

/**
 * Staff-side visitor registration.
 *
 * Uses the native <dialog> element, which brings focus trapping, Escape to
 * close and inert background content without hand-rolling any of it.
 *
 * Submission is driven through useTransition rather than useActionState so the
 * success path can close the dialog and clear the fields directly in the async
 * callback. Reacting to a returned state in an effect would mean resetting
 * form state from inside an effect, which is the pattern that produces
 * cascading renders.
 */
export function AddVisitorDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fobId, setFobId] = useState("");

  function open() {
    setError(null);
    setNotice(null);
    setFobId("");
    formRef.current?.reset();
    dialogRef.current?.showModal();
  }

  function close() {
    if (pending) return;
    dialogRef.current?.close();
  }

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await createVisitorAction(formData);

      if (result.error) {
        setError(result.error);
        return;
      }

      setError(null);
      setNotice(`${result.createdName} added.`);
      setFobId("");
      formRef.current?.reset();
      dialogRef.current?.close();
    });
  }

  return (
    <>
      <div className="flex flex-col items-end gap-2">
        <button
          type="button"
          onClick={open}
          className="flex items-center gap-2 rounded-lg bg-brand-primary px-5 py-2.5 text-base font-bold text-brand-cream shadow-sm transition-colors hover:bg-brand-deep"
        >
          <span aria-hidden="true" className="text-lg leading-none">
            +
          </span>
          Add new visitor
        </button>

        {notice ? (
          <p
            role="status"
            className="rounded-lg border-2 border-status-ok bg-status-ok/10 px-3 py-1.5 text-sm font-semibold text-status-ok"
          >
            {notice}
          </p>
        ) : null}
      </div>

      <dialog
        ref={dialogRef}
        onClose={() => setError(null)}
        className="m-auto w-[min(34rem,92vw)] rounded-2xl bg-neutral-light p-0 text-neutral-dark backdrop:bg-black/50"
      >
        <form
          ref={formRef}
          action={submit}
          // Stop Enter in any text field from submitting a half-filled form.
          // The fob reader's terminator is handled inside FobIdField.
          onKeyDown={(event) => {
            if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
              event.preventDefault();
            }
          }}
          className="flex flex-col gap-4 p-6"
        >
          <header>
            <h2 className="text-xl font-bold text-brand-primary">Add new visitor</h2>
            <p className="mt-1 text-sm text-neutral-dark/70">
              Creates the profile only. They are marked as present when they tap in at the
              kiosk.
            </p>
          </header>

          <Field name="full_name" label="Full name" required autoFocus disabled={pending} />
          <Field name="visiting_who" label="Who are they visiting?" required disabled={pending} />
          <Field
            name="company_or_relation"
            label="Company or relationship"
            placeholder="e.g. Daughter, or their company"
            disabled={pending}
          />
          <Field
            name="car_registration"
            label="Car registration"
            placeholder="e.g. AB12 CDE"
            disabled={pending}
            className="font-mono uppercase"
          />

          <FobIdField value={fobId} onChange={setFobId} disabled={pending} />

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
              onClick={close}
              disabled={pending}
              className="rounded-lg border-2 border-neutral-dark/30 px-5 py-2.5 font-bold text-neutral-dark disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-brand-primary px-6 py-2.5 font-bold text-brand-cream disabled:opacity-60"
            >
              {pending ? "Saving…" : "Add visitor"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

function Field({
  name,
  label,
  required = false,
  placeholder,
  autoFocus = false,
  disabled = false,
  className = "",
}: {
  name: string;
  label: string;
  required?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-neutral-dark">{label}</span>
        <span className="text-xs font-medium text-neutral-dark/50">
          {required ? "Required" : "Optional"}
        </span>
      </span>
      <input
        name={name}
        type="text"
        required={required}
        placeholder={placeholder}
        autoFocus={autoFocus}
        disabled={disabled}
        maxLength={120}
        autoComplete="off"
        className={`rounded-lg border-2 border-neutral-dark/20 bg-white px-4 py-3 text-lg text-neutral-dark outline-none focus:border-brand-primary disabled:opacity-60 ${className}`}
      />
    </label>
  );
}
