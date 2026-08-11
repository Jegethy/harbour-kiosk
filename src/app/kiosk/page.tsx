import { redirect } from "next/navigation";
import { KioskClient } from "@/app/kiosk/KioskClient";
import { isPairedDevice } from "@/lib/kiosk/guard";

// The pairing cookie has to be read per request.
export const dynamic = "force-dynamic";

/**
 * Device gate.
 *
 * An unpaired tablet is sent to setup rather than shown a kiosk it cannot use.
 * /api/kiosk/scan enforces the same check independently — this redirect is for
 * whoever is holding the tablet, not for security.
 */
export default async function KioskPage() {
  if (!(await isPairedDevice())) {
    redirect("/kiosk/setup");
  }

  return <KioskClient />;
}
