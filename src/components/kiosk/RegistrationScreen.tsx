"use client";

import { useCallback, useState } from "react";
import { OnScreenKeyboard } from "@/components/kiosk/OnScreenKeyboard";
import type { KioskResult } from "@/components/kiosk/ResultScreen";
import { submitRegistration } from "@/lib/kiosk/api";

const MAX_FIELD_LENGTH = 60;

type FieldKey = "fullName" | "visitingWho" | "companyOrRelation";

const FIELDS: Array<{ key: FieldKey; label: string; hint: string; required: boolean }> = [
  { key: "fullName", label: "Your full name", hint: "e.g. JANE SMITH", required: true },
  {
    key: "visitingWho",
    label: "Who are you visiting?",
    hint: "Resident's name",
    required: true,
  },
  {
    key: "companyOrRelation",
    label: "Company or relationship",
    hint: "e.g. DAUGHTER, or your company",
    required: false,
  },
];

/**
 * First-time registration for an unrecognised fob.
 *
 * All three fields stay on screen with one active at a time, rather than a
 * field-per-page wizard: a visitor can see what has been asked and what they
 * have already answered, and correct a typo without navigating backwards.
 *
 * A failed submission keeps everything typed and offers a retry. Making
 * someone re-enter their name on a touchscreen because the network blipped is
 * how a kiosk earns a reputation.
 */
export function RegistrationScreen({
  fobId,
  onCancel,
  onRegistered,
}: {
  fobId: string;
  onCancel: () => void;
  onRegistered: (result: KioskResult) => void;
}) {
  const [values, setValues] = useState<Record<FieldKey, string>>({
    fullName: "",
    visitingWho: "",
    companyOrRelation: "",
  });
  const [activeIndex, setActiveIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeKey = FIELDS[activeIndex].key;

  const edit = useCallback(
    (transform: (current: string) => string) => {
      setValues((previous) => ({
        ...previous,
        [activeKey]: transform(previous[activeKey]).slice(0, MAX_FIELD_LENGTH),
      }));
    },
    [activeKey],
  );

  const handleCharacter = useCallback(
    (character: string) => edit((current) => current + character),
    [edit],
  );

  const handleBackspace = useCallback(() => edit((current) => current.slice(0, -1)), [edit]);

  // No leading or doubled spaces — they are invisible on screen and turn into
  // odd-looking names on the roster.
  const handleSpace = useCallback(
    () => edit((current) => (current === "" || current.endsWith(" ") ? current : current + " ")),
    [edit],
  );

  const handleNextField = useCallback(
    () => setActiveIndex((index) => (index + 1) % FIELDS.length),
    [],
  );

  const canSubmit =
    values.fullName.trim() !== "" && values.visitingWho.trim() !== "" && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    const outcome = await submitRegistration({
      fob_id: fobId,
      full_name: values.fullName.trim(),
      visiting_who: values.visitingWho.trim(),
      company_or_relation: values.companyOrRelation.trim() || null,
    });

    if (outcome.outcome === "REGISTERED") {
      onRegistered({
        kind: "IN",
        fullName: outcome.full_name,
        visitingWho: values.visitingWho.trim() || null,
        at: outcome.at,
      });
      return;
    }

    setSubmitting(false);
    setError(
      outcome.outcome === "FOB_TAKEN"
        ? "That keyfob has just been registered to someone else. Please see reception."
        : outcome.outcome === "ERROR"
          ? outcome.message
          : "Something was missing. Please check your details and try again.",
    );
  }

  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto bg-brand-primary px-3 py-3 sm:gap-3 sm:px-5 sm:py-4">
      <header className="flex shrink-0 items-center justify-between gap-3">
        <div className="text-left">
          <h1 className="text-[clamp(1.25rem,3.4vh,1.75rem)] font-bold leading-tight text-brand-cream">
            Welcome — please sign in
          </h1>
          <p className="text-[clamp(0.8rem,2vh,1rem)] text-cream-dim">
            We have not seen this keyfob before.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="shrink-0 rounded-xl border-2 border-brand-cream px-5 py-3 text-[clamp(0.95rem,2.4vh,1.2rem)] font-bold text-brand-cream active:bg-brand-cream active:text-brand-primary disabled:opacity-40"
        >
          Cancel
        </button>
      </header>

      <div className="flex shrink-0 flex-col gap-1.5 sm:gap-2">
        {FIELDS.map((field, index) => (
          <FieldRow
            key={field.key}
            label={field.label}
            hint={field.hint}
            required={field.required}
            value={values[field.key]}
            active={index === activeIndex}
            onSelect={() => setActiveIndex(index)}
          />
        ))}
      </div>

      {error ? (
        <p
          role="alert"
          className="shrink-0 rounded-xl border-2 border-brand-accent bg-brand-deep px-4 py-2.5 text-[clamp(0.9rem,2.2vh,1.1rem)] font-semibold text-brand-cream"
        >
          {error}
        </p>
      ) : null}

      <div className="shrink-0">
        <OnScreenKeyboard
          onCharacter={handleCharacter}
          onBackspace={handleBackspace}
          onSpace={handleSpace}
          onNextField={handleNextField}
          disabled={submitting}
        />
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="mt-auto h-[clamp(3.25rem,8vh,4.5rem)] shrink-0 rounded-xl bg-brand-accent text-[clamp(1.15rem,3.2vh,1.75rem)] font-bold uppercase tracking-wide text-brand-cream shadow-lg active:scale-[0.99] disabled:bg-brand-deep disabled:text-cream-dim/50 disabled:shadow-none"
      >
        {submitting ? "Signing you in…" : "Sign in"}
      </button>
    </div>
  );
}

function FieldRow({
  label,
  hint,
  required,
  value,
  active,
  onSelect,
}: {
  label: string;
  hint: string;
  required: boolean;
  value: string;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active}
      className={`w-full rounded-xl border-2 px-4 py-2 text-left transition-colors ${
        active
          ? "border-brand-accent bg-brand-deep"
          : "border-cream-dim/30 bg-brand-deep/40"
      }`}
    >
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-[clamp(0.75rem,1.9vh,0.95rem)] font-semibold uppercase tracking-wide text-cream-dim">
          {label}
        </span>
        {required && value.trim() === "" ? (
          <span className="text-[clamp(0.7rem,1.7vh,0.85rem)] font-bold uppercase text-brand-accent">
            Required
          </span>
        ) : null}
      </span>

      <span className="mt-0.5 flex min-h-[1.6em] items-center text-[clamp(1.1rem,3.2vh,1.6rem)] font-bold text-brand-cream">
        {value === "" ? (
          <span className="font-medium text-cream-dim/50">{hint}</span>
        ) : (
          <span className="break-all">{value}</span>
        )}
        {active ? (
          <span
            aria-hidden="true"
            className="ml-0.5 inline-block h-[1.1em] w-[3px] bg-brand-cream"
            style={{ animation: "kiosk-caret 1s steps(1) infinite" }}
          />
        ) : null}
      </span>
    </button>
  );
}
