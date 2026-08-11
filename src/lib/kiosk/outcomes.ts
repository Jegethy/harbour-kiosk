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
  /**
   * Fob is not in the database. Visitors no longer register themselves, so the
   * kiosk shows a red "see reception" screen rather than a form.
   */
  | { outcome: "UNKNOWN_FOB"; fob_id: string }
  /** Empty or unusable code. Stay idle; the visitor just taps again. */
  | { outcome: "INVALID" }
  /** Network or database failure. Distinct from INVALID: this needs a retry. */
  | { outcome: "ERROR"; message: string };

export type ScanOutcomeKind = ScanOutcome["outcome"];

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

