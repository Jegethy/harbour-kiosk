import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isPairingConfigured, isPairingRequired } from "@/lib/kiosk/device";
import { isPairedDevice } from "@/lib/kiosk/guard";

export const metadata: Metadata = {
  title: "Set up this tablet — Harbour Care Centre",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  code: "That setup code was not recognised.",
  missing: "Please enter the setup code.",
  rate: "Too many attempts. Please wait 15 minutes and try again.",
  invalid: "Something went wrong. Please try again.",
  unconfigured: "Pairing is not configured on the server.",
};

/**
 * Device pairing.
 *
 * A plain HTML form posting to /api/kiosk/pair — no client component, no
 * hydration required. This is the one screen that must work on an unfamiliar
 * tablet before anything else does, and a React-controlled form fails silently
 * when the bundle does not load: the field accepts typing but the submit
 * button never enables, with nothing on screen to explain why.
 */
export default async function KioskSetupPage({ searchParams }: PageProps<"/kiosk/setup">) {
  if (await isPairedDevice()) {
    redirect("/");
  }

  const params = await searchParams;
  const errorCode = typeof params.error === "string" ? params.error : null;
  const error = errorCode ? (ERRORS[errorCode] ?? ERRORS.invalid) : null;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-7 bg-brand-primary px-8 text-center">
      <h1 className="text-4xl font-bold text-brand-cream sm:text-5xl">Set up this tablet</h1>

      {isPairingConfigured() ? (
        <>
          <p className="max-w-lg text-balance text-xl text-cream-dim">
            Enter the setup code to authorise this tablet for visitor check-in. You only need
            to do this once.
          </p>

          <form
            method="post"
            action="/api/kiosk/pair"
            className="flex w-full max-w-md flex-col gap-4"
          >
            <label className="flex flex-col gap-2 text-left">
              <span className="text-lg font-semibold text-brand-cream">Setup code</span>
              <input
                type="password"
                name="token"
                autoComplete="off"
                autoFocus
                required
                className="rounded-xl border-2 border-cream-dim/40 bg-brand-deep px-5 py-4 text-xl text-brand-cream outline-none focus:border-brand-cream"
              />
            </label>

            {error ? (
              <p
                role="alert"
                className="rounded-xl border-2 border-brand-accent bg-brand-deep px-4 py-3 text-base font-semibold text-brand-cream"
              >
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              className="rounded-xl bg-brand-cream px-6 py-4 text-xl font-bold text-brand-primary"
            >
              Set up this tablet
            </button>
          </form>
        </>
      ) : (
        <p className="max-w-lg text-balance text-xl text-cream-dim">
          Check-in is not configured on the server.{" "}
          {isPairingRequired() ? "KIOSK_SETUP_TOKEN is missing from the environment." : ""}{" "}
          Please contact your administrator.
        </p>
      )}
    </div>
  );
}
