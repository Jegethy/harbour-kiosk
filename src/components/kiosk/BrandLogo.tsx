"use client";

import Image from "next/image";
import { useState } from "react";

/**
 * The centre logo, with a typographic fallback.
 *
 * A broken image icon on a lobby kiosk looks like a fault, so if /logo.png is
 * missing or fails to decode we render the wordmark in type instead. The
 * fallback is on brand and legible; nobody walking up can tell it is a
 * fallback.
 */
export function BrandLogo({ className = "" }: { className?: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className={`text-center ${className}`}>
        <p className="font-serif text-5xl font-bold tracking-tight text-brand-cream sm:text-6xl">
          Harbour
        </p>
        <p className="mt-1 text-xl font-semibold uppercase tracking-[0.2em] text-brand-cream sm:text-2xl">
          Care Centre
        </p>
        <p className="text-base uppercase tracking-[0.3em] text-cream-dim sm:text-lg">
          Portishead
        </p>
      </div>
    );
  }

  return (
    <Image
      src="/logo.png"
      alt="Harbour Care Centre, Portishead"
      width={320}
      height={320}
      priority
      onError={() => setFailed(true)}
      className={`h-auto w-auto object-contain ${className}`}
    />
  );
}
