/**
 * The contract between handle_fob_scan(), /api/kiosk/scan, and the kiosk UI.
 * Shared so the route handler and the screen that switches on it cannot drift.
 */

export type ScanOutcome =
  | {
      outcome: "SIGNED_IN";
      visitor_id: string;
      full_name: string;
      visiting_who: string | null;
      at: string;
    }
  | {
      outcome: "SIGNED_OUT";
      visitor_id: string;
      full_name: string;
      at: string;
    }
  /** Fob is not in the database — the kiosk routes to registration. */
  | { outcome: "UNKNOWN_FOB"; fob_id: string }
  /** Empty or unusable code. Stay idle; the visitor just taps again. */
  | { outcome: "INVALID" }
  /** Network or database failure. Distinct from INVALID: this needs a retry. */
  | { outcome: "ERROR"; message: string };

export type ScanOutcomeKind = ScanOutcome["outcome"];

/** The contract for register_visitor() and /api/kiosk/register. */
export type RegisterOutcome =
  | { outcome: "REGISTERED"; visitor_id: string; full_name: string; at: string }
  /** The fob was claimed between the scan and the form submission. */
  | { outcome: "FOB_TAKEN" }
  | { outcome: "INVALID" }
  | { outcome: "ERROR"; message: string };

function outcomeKind(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const kind = (value as { outcome?: unknown }).outcome;
  return typeof kind === "string" ? kind : null;
}

export function isScanOutcome(value: unknown): value is ScanOutcome {
  const kind = outcomeKind(value);
  return (
    kind === "SIGNED_IN" ||
    kind === "SIGNED_OUT" ||
    kind === "UNKNOWN_FOB" ||
    kind === "INVALID" ||
    kind === "ERROR"
  );
}

export function isRegisterOutcome(value: unknown): value is RegisterOutcome {
  const kind = outcomeKind(value);
  return (
    kind === "REGISTERED" || kind === "FOB_TAKEN" || kind === "INVALID" || kind === "ERROR"
  );
}
