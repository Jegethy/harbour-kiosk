"use client";

import { useCallback, useEffect, useState } from "react";
import { SIMULATOR_ENABLED } from "@/dev/config";
import { SimulatorButton, SimulatorShell } from "@/dev/SimulatorShell";
import { randomFobId, typeFobBurst, type BurstReport } from "@/dev/typeFobBurst";
import { createClient } from "@/lib/supabase/client";

interface AssignedFob {
  id: string;
  full_name: string;
  fob_id: string | null;
}

/**
 * DEV ONLY — see src/dev/config.ts.
 *
 * Only rendered for someone holding a staff session, so a visitor in the lobby
 * never sees it even while the flag is on.
 *
 * Events are dispatched at `window`, not at the hidden capture input. The
 * kiosk's listener is a window capture-phase listener, so this reaches it
 * regardless of what currently holds focus — which matters, because clicking a
 * button in this panel moves focus away from the capture field.
 */
export function KioskFobSimulator() {
  const [isStaff, setIsStaff] = useState(false);
  const [fobs, setFobs] = useState<AssignedFob[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<BurstReport | null>(null);

  useEffect(() => {
    if (!SIMULATOR_ENABLED) return;
    let cancelled = false;
    const supabase = createClient();

    void supabase.auth.getUser().then(({ data }) => {
      if (cancelled || !data.user) return;
      setIsStaff(true);

      void supabase
        .from("visitors")
        .select("id, full_name, fob_id")
        .not("fob_id", "is", null)
        .order("full_name")
        .limit(8)
        .then(({ data: rows }) => {
          if (!cancelled) setFobs(rows ?? []);
        });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const fire = useCallback(async (code: string) => {
    setBusy(true);
    setReport(await typeFobBurst(window, code));
    setBusy(false);
  }, []);

  if (!SIMULATOR_ENABLED || !isStaff) return null;

  return (
    <SimulatorShell title="fob reader">
      <div className="flex flex-col gap-1.5">
        <p className="mb-1 font-mono text-[10px] leading-snug text-white/50">
          Replays a tap as real key events at reader speed. Same path as the hardware.
        </p>

        {fobs === null ? (
          <p className="font-mono text-xs text-white/50">Loading assigned fobs…</p>
        ) : fobs.length === 0 ? (
          <p className="font-mono text-xs text-white/50">
            No fobs assigned yet. Add a visitor with a fob in the admin panel first.
          </p>
        ) : (
          fobs.map((fob) => (
            <SimulatorButton key={fob.id} disabled={busy} onClick={() => fire(fob.fob_id!)}>
              Tap {fob.full_name}
              <span className="block font-normal text-fuchsia-200/60">{fob.fob_id}</span>
            </SimulatorButton>
          ))
        )}

        <SimulatorButton tone="muted" disabled={busy} onClick={() => fire(randomFobId())}>
          Tap an unknown fob
          <span className="block font-normal text-white/40">expects the red screen</span>
        </SimulatorButton>

        {report ? (
          <p className="mt-1 font-mono text-[10px] text-white/50">
            sent {report.code} · {report.keyCount} keys · {report.durationMs}ms
          </p>
        ) : null}
      </div>
    </SimulatorShell>
  );
}
