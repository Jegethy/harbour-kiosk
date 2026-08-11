import { NextResponse } from "next/server";
import {
  DEVICE_COOKIE,
  DEVICE_COOKIE_MAX_AGE,
  isPairingConfigured,
  matchesSetupToken,
  mintDeviceToken,
} from "@/lib/kiosk/device";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Rate limit, because this endpoint is publicly reachable and guards a shared
 * secret. In-memory is adequate here: this runs as a single Node process on
 * one server, and the goal is only to make guessing impractical rather than to
 * be a distributed limiter.
 */
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const attempts = new Map<string, { count: number; resetAt: number }>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const record = attempts.get(key);

  if (!record || now > record.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + ATTEMPT_WINDOW_MS });
    return false;
  }

  record.count += 1;

  // Opportunistic sweep so the map cannot grow without bound.
  if (attempts.size > 500) {
    for (const [existing, value] of attempts) {
      if (now > value.resetAt) attempts.delete(existing);
    }
  }

  return record.count > MAX_ATTEMPTS;
}

function clientKey(request: Request): string {
  // Behind Cloudflare Tunnel the original address arrives in these headers.
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

/** Exchange the setup token for a long-lived device cookie. */
export async function POST(request: Request) {
  if (!isPairingConfigured()) {
    return NextResponse.json(
      { ok: false, message: "Pairing is not configured on the server." },
      { status: 503 },
    );
  }

  if (rateLimited(clientKey(request))) {
    return NextResponse.json(
      { ok: false, message: "Too many attempts. Please wait 15 minutes and try again." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid request." }, { status: 400 });
  }

  const token = (body as { token?: unknown } | null)?.token;

  if (typeof token !== "string" || !matchesSetupToken(token)) {
    return NextResponse.json(
      { ok: false, message: "That setup code was not recognised." },
      { status: 401 },
    );
  }

  const response = NextResponse.json({ ok: true });

  response.cookies.set(DEVICE_COOKIE, mintDeviceToken(), {
    httpOnly: true,
    // Cloudflare terminates TLS, so the tablet always speaks https in
    // production. Left off in development so pairing works over plain http.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DEVICE_COOKIE_MAX_AGE,
  });

  return response;
}
