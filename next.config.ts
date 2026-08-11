import type { NextConfig } from "next";

/**
 * Baseline security headers.
 *
 * The app is reachable from the public internet through a Cloudflare Tunnel,
 * so these apply to real traffic rather than a LAN. Deliberately stops short
 * of a full Content-Security-Policy: Next's inline bootstrap needs nonces to
 * work under a strict CSP, and a half-configured CSP that silently breaks the
 * kiosk is worse than none. Worth adding separately, with the kiosk tested
 * afterwards.
 */
const securityHeaders = [
  // Nothing here should ever be framed; the admin panel especially.
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // No feature this app uses needs any of these.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
];

const nextConfig: NextConfig = {
  // The tunnel terminates TLS, so a leaked version banner helps nobody.
  poweredByHeader: false,

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
