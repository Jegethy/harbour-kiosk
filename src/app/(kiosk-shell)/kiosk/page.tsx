import { redirect } from "next/navigation";

/**
 * The kiosk moved to the site root — the whole hostname is the kiosk.
 *
 * Kept as a redirect because the tablet, and anyone who set this up, may have
 * /kiosk bookmarked. The sub-routes (setup, diagnostics, preview) still live
 * under /kiosk/.
 */
export default function LegacyKioskPage() {
  redirect("/");
}
