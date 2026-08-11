"use client";

import {
  isRegisterOutcome,
  isScanOutcome,
  type RegisterOutcome,
  type ScanOutcome,
} from "@/lib/kiosk/outcomes";

/** Beyond this a visitor has already assumed the tap failed. */
const SCAN_TIMEOUT_MS = 8000;

export interface RegistrationPayload {
  fob_id: string;
  full_name: string;
  visiting_who: string;
  company_or_relation: string | null;
}

/**
 * Submit a fob tap. Never throws — every failure path resolves to an ERROR
 * outcome, so the kiosk always has something to show rather than a dead screen.
 */
export async function submitScan(fobId: string): Promise<ScanOutcome> {
  return post("/api/kiosk/scan", { fob_id: fobId }, isScanOutcome);
}

/** Create a first-time visitor and sign them in. Never throws. */
export async function submitRegistration(
  payload: RegistrationPayload,
): Promise<RegisterOutcome> {
  return post("/api/kiosk/register", payload, isRegisterOutcome);
}

async function post<T extends { outcome: string }>(
  url: string,
  body: unknown,
  isValid: (value: unknown) => value is T,
): Promise<T | { outcome: "ERROR"; message: string }> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(SCAN_TIMEOUT_MS),
    });

    const payload: unknown = await response.json().catch(() => null);

    if (isValid(payload)) return payload;

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
