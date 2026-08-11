"use client";

import { useCallback, useState } from "react";
import { SIMULATOR_ENABLED } from "@/dev/config";
import { SimulatorButton, SimulatorShell } from "@/dev/SimulatorShell";
import { randomFobId, typeFobBurst, type BurstReport } from "@/dev/typeFobBurst";

/**
 * DEV ONLY — see src/dev/config.ts.
 *
 * Sits beside the Keyfob ID field in the Add Visitor dialog and fills it as a
 * desk reader would.
 *
 * Events go to the field itself rather than to window: FobIdField listens via
 * React's onKeyDown on that input, so the burst has to originate there to
 * reach it. The field is focused first, both because a real tap would require
 * focus and because clicking this button takes it away.
 *
 * Targeting by element id keeps the simulator entirely additive — no
 * production component needs a ref, a prop, or any knowledge that this exists.
 */
export function AdminFobSimulator({ disabled }: { disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<BurstReport | null>(null);

  const fire = useCallback(async () => {
    const field = document.getElementById("fob_id");
    if (!(field instanceof HTMLInputElement)) return;

    field.focus();
    setBusy(true);
    setReport(await typeFobBurst(field, randomFobId()));
    setBusy(false);
  }, []);

  if (!SIMULATOR_ENABLED) return null;

  return (
    <SimulatorShell title="desk reader" position="inline">
      <div className="flex flex-col gap-1.5">
        <SimulatorButton onClick={() => void fire()} disabled={busy || disabled}>
          Tap a blank fob
          <span className="block font-normal text-fuchsia-200/60">
            fills the field above with a new ID
          </span>
        </SimulatorButton>

        {report ? (
          <p className="font-mono text-[10px] text-white/50">
            sent {report.code} · {report.keyCount} keys · {report.durationMs}ms
          </p>
        ) : null}
      </div>
    </SimulatorShell>
  );
}
