import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

/**
 * Device pairing for the lobby tablet.
 *
 * The kiosk is publicly reachable, so /api/kiosk/scan cannot stay open: it is
 * a write endpoint that alters the fire roster, and it answers a valid fob
 * with a visitor's name and the resident they are visiting. Anyone with the
 * URL could tamper with it or mine it for personal data.
 *
 * A shared header would have to ship in the JS bundle to be usable from the
 * browser, which is no secret at all. Instead the tablet is paired once at
 * /kiosk/setup, and the server hands back an httpOnly cookie the browser sends
 * automatically. The secret never reaches client JavaScript.
 *
 * The cookie is a signed, self-describing token rather than a database row —
 * no table, no lookup on the hot path. KIOSK_SETUP_TOKEN doubles as the HMAC
 * key, which gives revocation for free: change it and every paired device is
 * invalidated at once.
 */

export const DEVICE_COOKIE = "harbour_kiosk_device";

/** A year. The tablet should pair once and be left alone. */
export const DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function setupToken(): string {
  const value = process.env.KIOSK_SETUP_TOKEN?.trim();
  if (!value) {
    throw new Error(
      "KIOSK_SETUP_TOKEN is not set. The kiosk cannot be paired, so kiosk endpoints are refusing requests.",
    );
  }
  return value;
}

export function isPairingConfigured(): boolean {
  return Boolean(process.env.KIOSK_SETUP_TOKEN?.trim());
}

/**
 * Whether pairing is enforced.
 *
 * Fails closed: in production the answer is always yes, so a deployment that
 * forgets KIOSK_SETUP_TOKEN returns errors rather than quietly serving an open
 * endpoint to the internet. In development an unset token leaves the kiosk
 * open, so a fresh clone runs without setup.
 */
export function isPairingRequired(): boolean {
  return isPairingConfigured() || process.env.NODE_ENV === "production";
}

function sign(payload: string): string {
  return createHmac("sha256", setupToken()).update(payload).digest("base64url");
}

/** Constant-time compare that tolerates length mismatch. */
function equals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function mintDeviceToken(): string {
  const deviceId = randomUUID();
  const expiresAt = Date.now() + DEVICE_COOKIE_MAX_AGE * 1000;
  const payload = `${deviceId}.${expiresAt}`;
  return `v1.${payload}.${sign(payload)}`;
}

export function verifyDeviceToken(token: string | undefined | null): boolean {
  if (!token) return false;

  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return false;

  const [, deviceId, expiresAt, signature] = parts;

  if (!equals(signature, sign(`${deviceId}.${expiresAt}`))) return false;

  const expiry = Number(expiresAt);
  return Number.isFinite(expiry) && expiry > Date.now();
}

/** Does the token typed at /kiosk/setup match the configured one? */
export function matchesSetupToken(candidate: string): boolean {
  return equals(candidate, setupToken());
}
