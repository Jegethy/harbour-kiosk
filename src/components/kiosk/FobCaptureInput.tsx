"use client";

import type { FobScannerHandle } from "@/hooks/useFobScanner";

/**
 * The always-focused capture field.
 *
 * Visually hidden but NOT display:none or visibility:hidden — either of those
 * makes the element unfocusable, which would defeat the whole mechanism. A
 * 1px transparent box is focusable; pointer-events-none keeps stray taps from
 * landing on it.
 */
export function FobCaptureInput({ inputProps }: { inputProps: FobScannerHandle["inputProps"] }) {
  return (
    <input
      {...inputProps}
      className="pointer-events-none fixed left-0 top-0 m-0 h-px w-px border-0 bg-transparent p-0 opacity-0 outline-none"
    />
  );
}
