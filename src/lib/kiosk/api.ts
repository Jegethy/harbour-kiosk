"use client";

import { isScanOutcome, type ScanOutcome } from "@/lib/kiosk/outcomes";

/** Beyond this a visitor has already assumed the tap failed. */
const SCAN_TIMEOUT_MS = 8000;

/**
 * Submit a fob tap. Never throws — every failure path resolves to an ERROR
 * outcome, so the kiosk always has something to show rather than a dead screen.
 */
export async function submitScan(fobId: string): Promise<ScanOutcome> {
  try {
    const response = await fetch("/api/kiosk/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fob_id: fobId }),
      cache: "no-store",
      signal: AbortSignal.timeout(SCAN_TIMEOUT_MS),
    });

    const payload: unknown = await response.json().catch(() => null);

    if (isScanOutcome(payload)) return payload;

    return {
      outcome: "ERROR",
      message: `Unexpected response from check-in service (${response.status}).`,
    };
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    return {
      outcome: "ERROR",
      message: timedOut
        ? "The check-in service did not respond. Please try again."
        : "No connection to the check-in service. Please try again.",
    };
  }
}
