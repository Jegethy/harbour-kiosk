import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DevicePairingForm } from "@/components/kiosk/DevicePairingForm";
import { isPairingConfigured, isPairingRequired } from "@/lib/kiosk/device";
import { isPairedDevice } from "@/lib/kiosk/guard";

export const metadata: Metadata = {
  title: "Set up this tablet — Harbour Care Centre",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function KioskSetupPage() {
  if (await isPairedDevice()) {
    redirect("/kiosk");
  }

  const configured = isPairingConfigured();

  return (
    <div className="flex h-full flex-col items-center justify-center gap-7 bg-brand-primary px-8 text-center">
      <h1 className="text-4xl font-bold text-brand-cream sm:text-5xl">Set up this tablet</h1>

      {configured ? (
        <>
          <p className="max-w-lg text-balance text-xl text-cream-dim">
            Enter the setup code to authorise this tablet for visitor check-in. You only need
            to do this once.
          </p>
          <DevicePairingForm />
        </>
      ) : (
        <p className="max-w-lg text-balance text-xl text-cream-dim">
          Check-in is not configured on the server.{" "}
          {isPairingRequired()
            ? "KIOSK_SETUP_TOKEN is missing from the environment."
            : ""}{" "}
          Please contact your administrator.
        </p>
      )}
    </div>
  );
}
