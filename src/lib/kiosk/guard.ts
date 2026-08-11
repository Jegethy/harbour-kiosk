import "server-only";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  DEVICE_COOKIE,
  isPairingConfigured,
  isPairingRequired,
  verifyDeviceToken,
} from "@/lib/kiosk/device";
import { createClient } from "@/lib/supabase/server";

/**
 * Is this request coming from a paired kiosk device?
 *
 * Reads the httpOnly cookie set by /api/kiosk/pair. When pairing is not
 * required (development with no token configured) everything is allowed.
 */
export async function isPairedDevice(): Promise<boolean> {
  if (!isPairingRequired()) return true;
  if (!isPairingConfigured()) return false;

  const store = await cookies();
  return verifyDeviceToken(store.get(DEVICE_COOKIE)?.value);
}

async function isStaffSession(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return Boolean(user);
  } catch {
    return false;
  }
}

/**
 * Guard for kiosk API routes. Returns a response to return early with, or null
 * to continue.
 *
 * The two failure modes are reported separately on purpose: an unpaired tablet
 * needs someone to walk over and run setup, whereas a missing server token is
 * a deployment fault. Conflating them sends staff hunting for the wrong thing.
 */
export async function deviceRejection(): Promise<NextResponse | null> {
  if (!isPairingRequired()) return null;

  if (!isPairingConfigured()) {
    console.error(
      "[kiosk] KIOSK_SETUP_TOKEN is not set. Refusing kiosk requests rather than serving an open endpoint.",
    );
    return NextResponse.json(
      {
        outcome: "ERROR",
        message: "Check-in is not configured on the server. Please see reception.",
      },
      { status: 503 },
    );
  }

  if (await isPairedDevice()) return null;

  // A signed-in staff member is a stronger credential than a paired tablet, so
  // accept that too. Without this, the diagnostics harness could not post a
  // test scan from a laptop, which is where support work actually happens.
  if (await isStaffSession()) return null;

  return NextResponse.json(
    {
      outcome: "ERROR",
      message: "This tablet is not set up for check-in. Please see reception.",
    },
    { status: 401 },
  );
}

/** Trim a submitted string, or null if it is absent/blank/over-long. */
export function cleanField(value: unknown, maxLength = 120): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "" || trimmed.length > maxLength) return null;
  return trimmed;
}
