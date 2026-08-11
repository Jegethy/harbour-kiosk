"use client";

import Image from "next/image";
import { useState } from "react";

/**
 * The centre logo.
 *
 * The artwork carries its own maroon background, so it must sit on a canvas of
 * exactly --color-brand-primary or a square appears around it. That value is
 * sampled from this file rather than chosen; `npm run check:logo` re-verifies
 * the match and reports the dimensions to use below.
 *
 * If the file is missing or fails to decode we fall back to the wordmark set in
 * type. A broken image icon in a lobby reads as a fault; this does not.
 */
export function BrandLogo({ className = "" }: { className?: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className={`flex flex-col justify-center text-center ${className}`}>
        <p className="font-serif text-6xl font-bold leading-none tracking-tight text-brand-cream">
          Harbour
        </p>
        <p className="mt-3 text-xl font-semibold uppercase tracking-[0.28em] text-brand-cream">
          Care Centre
        </p>
        <p className="mt-1 text-base uppercase tracking-[0.34em] text-cream-dim">Portishead</p>
      </div>
    );
  }

  return (
    <Image
      src="/logo.png"
      alt="Harbour Care Centre, Portishead"
      width={1053}
      height={1024}
      priority
      onError={() => setFailed(true)}
      // Both dimensions auto so the caller's max-width and max-height each act
      // as a ceiling and the browser scales to fit whichever binds first,
      // keeping the aspect ratio either way.
      className={`h-auto w-auto object-contain ${className}`}
    />
  );
}
