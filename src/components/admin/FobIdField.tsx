"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ScanBuffer, type ScanEvent } from "@/lib/kiosk/scanner";

/**
 * Fob ID entry that accepts a tap on the desk reader.
 *
 * The reader is a keyboard, so when this field has focus its digits simply
 * type themselves in — no interception needed for the value. What this adds is
 * the two things plain typing gets wrong:
 *
 *   The trailing Enter would submit the half-filled form. It is swallowed.
 *
 *   There is no feedback that the reader worked. The same ScanBuffer the kiosk
 *   uses watches the keystroke timing, and a genuine burst is confirmed on
 *   screen and normalised into the field, replacing whatever was there.
 *
 * Typing by hand still works: a human is far slower than the burst ceiling, so
 * the buffer ignores it and the field behaves like an ordinary input.
 */
export function FobIdField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const bufferRef = useRef<ScanBuffer | null>(null);
  if (bufferRef.current === null) bufferRef.current = new ScanBuffer();

  const [focused, setFocused] = useState(false);
  /** The last code the reader produced; the badge shows while it is unedited. */
  const [scannedCode, setScannedCode] = useState<string | null>(null);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const consume = useCallback((event: ScanEvent | null) => {
    if (event?.kind !== "accepted") return;
    onChangeRef.current(event.code);
    setScannedCode(event.code);
  }, []);

  // Covers readers configured without an Enter suffix.
  useEffect(() => {
    const id = window.setInterval(() => {
      const buffer = bufferRef.current;
      if (buffer) consume(buffer.poll(performance.now()));
    }, 40);
    return () => window.clearInterval(id);
  }, [consume]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const buffer = bufferRef.current;
    if (!buffer) return;

    if (event.key === "Enter") {
      // The reader's terminator. Never let it submit the form.
      event.preventDefault();
      consume(buffer.pushTerminator(performance.now()));
      return;
    }

    if (event.key.length === 1) {
      consume(buffer.pushChar(event.key, performance.now()));
    }
  };

  const confirmed = scannedCode !== null && scannedCode === value;

  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-baseline justify-between gap-2">
        <label htmlFor="fob_id" className="text-sm font-semibold text-neutral-dark">
          Keyfob ID
        </label>
        <span className="text-xs font-medium text-neutral-dark/50">Optional</span>
      </span>

      <div className="relative">
        <input
          id="fob_id"
          name="fob_id"
          type="text"
          value={value}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          maxLength={64}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Tap a fob on the reader…"
          className={`w-full rounded-lg border-2 bg-white px-4 py-3 font-mono text-lg text-neutral-dark outline-none disabled:opacity-60 ${
            confirmed
              ? "border-status-ok"
              : focused
                ? "border-brand-primary"
                : "border-neutral-dark/20"
          }`}
        />

        {value ? (
          <button
            type="button"
            onClick={() => {
              onChange("");
              setScannedCode(null);
              bufferRef.current?.reset();
            }}
            disabled={disabled}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-sm font-bold text-neutral-dark/50 hover:text-brand-accent"
          >
            Clear
          </button>
        ) : null}
      </div>

      <p className="min-h-5 text-xs font-medium">
        {confirmed ? (
          <span className="text-status-ok">✓ Read from the fob reader.</span>
        ) : focused ? (
          <span className="text-brand-primary">Ready — tap a fob on the reader now.</span>
        ) : (
          <span className="text-neutral-dark/50">
            Click this field, then tap the fob. Leave blank to assign one later.
          </span>
        )}
      </p>
    </div>
  );
}
