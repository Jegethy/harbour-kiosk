import "server-only";

import { NextResponse } from "next/server";

/**
 * Optional shared secret for the kiosk endpoints. When KIOSK_DEVICE_TOKEN is
 * set, the tablet must send it as x-kiosk-token.
 *
 * Without it these endpoints are open to anyone who can reach the app: they
 * could enumerate valid fob IDs (an unknown fob answers differently from a
 * known one) and sign people in and out at will, which corrupts the fire
 * roster. Left unenforced when unset so local development needs no setup.
 *
 * Returns a 401 response to return early with, or null to continue.
 */
export function deviceTokenRejection(request: Request): NextResponse | null {
  const expected = process.env.KIOSK_DEVICE_TOKEN;
  if (!expected) return null;

  if (request.headers.get("x-kiosk-token") !== expected) {
    return NextResponse.json(
      { outcome: "ERROR", message: "Unauthorised device." },
      { status: 401 },
    );
  }
  return null;
}

/** Trim a submitted string, or null if it is absent/blank/over-long. */
export function cleanField(value: unknown, maxLength = 120): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "" || trimmed.length > maxLength) return null;
  return trimmed;
}
