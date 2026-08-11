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

/**
 * Relative Location on purpose.
 *
 * NextResponse.redirect() needs an absolute URL, and behind the tunnel
 * request.url is the internal origin (http://localhost:3000) — sending the
 * tablet there would strand it. A relative Location is valid HTTP and resolves
 * against whatever hostname the browser actually used.
 */
function seeOther(path: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

/**
 * Exchange the setup token for a long-lived device cookie.
 *
 * Answers both a plain HTML form post (redirects) and JSON (returns JSON), so
 * pairing works with no client-side JavaScript at all. That matters: this is
 * the one screen that has to work on an unfamiliar tablet, and a form that
 * silently does nothing when hydration fails leaves staff with no way in and
 * nothing to read.
 */
export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  const isFormPost = contentType.includes("application/x-www-form-urlencoded");

  const fail = (status: number, code: string, message: string) =>
    isFormPost
      ? seeOther(`/kiosk/setup?error=${code}`)
      : NextResponse.json({ ok: false, message }, { status });

  if (!isPairingConfigured()) {
    return fail(503, "unconfigured", "Pairing is not configured on the server.");
  }

  if (rateLimited(clientKey(request))) {
    return fail(429, "rate", "Too many attempts. Please wait 15 minutes and try again.");
  }

  let token: unknown;
  try {
    token = isFormPost
      ? (await request.formData()).get("token")
      : ((await request.json()) as { token?: unknown } | null)?.token;
  } catch {
    return fail(400, "invalid", "Invalid request.");
  }

  if (typeof token !== "string" || token.trim() === "") {
    return fail(400, "missing", "Please enter the setup code.");
  }

  if (!matchesSetupToken(token.trim())) {
    return fail(401, "code", "That setup code was not recognised.");
  }

  const response = isFormPost ? seeOther("/kiosk") : NextResponse.json({ ok: true });

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
