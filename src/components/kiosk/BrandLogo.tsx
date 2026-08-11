"use client";

import Image from "next/image";
import { useState } from "react";

/**
 * The centre logo.
 *
 * No wrapper, background or padding — the artwork is expected to be a
 * transparent PNG sitting directly on the canvas. Width is capped by the
 * caller; height follows the file's own aspect ratio, so replacing the artwork
 * needs no code change.
 *
 * The width/height props are only intrinsic-ratio hints for reserving space
 * before load. CSS drives the rendered size.
 *
 * If the file is missing or fails to decode we fall back to the wordmark set
 * in type. A broken image icon in a lobby reads as a fault; this does not.
 */
export function BrandLogo({ className = "" }: { className?: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className={`text-center ${className}`}>
        <p className="font-serif text-6xl font-bold leading-none tracking-tight text-brand-accent">
          Harbour
        </p>
        <p className="mt-2 text-xl font-semibold uppercase tracking-[0.28em] text-brand-gold">
          Care Centre
        </p>
      </div>
    );
  }

  return (
    <Image
      src="/logo.png"
      alt="Harbour Care Centre"
      width={900}
      height={875}
      priority
      onError={() => setFailed(true)}
      // Both dimensions auto so the caller's max-width and max-height each act
      // as a ceiling and the browser scales to fit whichever binds first,
      // keeping the aspect ratio either way.
      className={`h-auto w-auto object-contain ${className}`}
    />
  );
}
