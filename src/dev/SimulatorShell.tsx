"use client";

import { useState } from "react";

/**
 * DEV ONLY — see src/dev/config.ts.
 *
 * Collapsible panel, styled to be unmistakably not part of the product. It
 * starts collapsed so the kiosk still looks like the kiosk while you are
 * reviewing it.
 */
export function SimulatorShell({
  title,
  children,
  position = "fixed",
}: {
  title: string;
  children: React.ReactNode;
  position?: "fixed" | "inline";
}) {
  const [open, setOpen] = useState(false);

  const wrapper =
    position === "fixed" ? "fixed bottom-3 right-3 z-50 max-w-[min(22rem,90vw)]" : "w-full";

  return (
    <div className={wrapper}>
      {open ? (
        <div className="rounded-lg border-2 border-dashed border-fuchsia-500 bg-neutral-900/95 p-3 text-white shadow-xl">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-fuchsia-300">
              Dev · {title}
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded px-2 py-0.5 font-mono text-xs font-bold text-white/60 hover:text-white"
            >
              Hide
            </button>
          </div>
          {children}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg border-2 border-dashed border-fuchsia-500 bg-neutral-900/90 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-fuchsia-300 shadow-lg"
        >
          Dev · simulate fob
        </button>
      )}
    </div>
  );
}

export function SimulatorButton({
  onClick,
  disabled,
  children,
  tone = "default",
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  tone?: "default" | "muted";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full rounded border px-3 py-2 text-left font-mono text-xs font-bold disabled:opacity-40 ${
        tone === "default"
          ? "border-fuchsia-400/60 bg-fuchsia-500/15 text-fuchsia-100 hover:bg-fuchsia-500/30"
          : "border-white/20 bg-white/5 text-white/70 hover:bg-white/15"
      }`}
    >
      {children}
    </button>
  );
}
