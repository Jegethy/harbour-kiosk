"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * One-time pairing, run by staff on the tablet.
 *
 * The setup code is typed here and exchanged server-side for an httpOnly
 * cookie, so it never lives in client JavaScript or in localStorage where a
 * later script could read it.
 */
export function DevicePairingForm() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (token.trim() === "" || pending) return;

    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/kiosk/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; message?: string }
        | null;

      if (!response.ok || !payload?.ok) {
        setError(payload?.message ?? "Could not set up this tablet.");
        setPending(false);
        return;
      }

      setToken("");
      router.replace("/kiosk");
      router.refresh();
    } catch {
      setError("No connection to the server. Please try again.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex w-full max-w-md flex-col gap-4">
      <label className="flex flex-col gap-2 text-left">
        <span className="text-lg font-semibold text-brand-cream">Setup code</span>
        <input
          type="password"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          autoComplete="off"
          autoFocus
          disabled={pending}
          className="rounded-xl border-2 border-cream-dim/40 bg-brand-deep px-5 py-4 text-xl text-brand-cream outline-none focus:border-brand-cream disabled:opacity-60"
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
        disabled={pending || token.trim() === ""}
        className="rounded-xl bg-brand-cream px-6 py-4 text-xl font-bold text-brand-primary disabled:opacity-50"
      >
        {pending ? "Setting up…" : "Set up this tablet"}
      </button>
    </form>
  );
}
