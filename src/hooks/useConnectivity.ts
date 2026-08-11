"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

export type Connectivity = "online" | "offline";

/** Heartbeat spacing while things are healthy. */
const HEALTHY_INTERVAL_MS = 20_000;
/** Tighter once we are down, so recovery is picked up quickly. */
const DEGRADED_INTERVAL_MS = 5_000;
/** A check slower than this is indistinguishable from being offline. */
const CHECK_TIMEOUT_MS = 4_000;

function subscribeToBrowserStatus(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/**
 * Whether the kiosk can currently record a visit.
 *
 * Two signals, because neither is sufficient alone:
 *
 *   navigator.onLine flips instantly when wifi drops, but it only reports
 *   whether a network interface exists. A tablet associated with a wifi point
 *   that has lost its uplink reports online forever, which is exactly the
 *   failure a care home actually sees.
 *
 *   A heartbeat against /api/kiosk/health catches that case, and also covers
 *   Supabase being down while the network is fine — from the visitor's side
 *   those are the same thing.
 *
 * Server snapshot is "online" so the offline screen never flashes during
 * hydration on a healthy tablet.
 */
export function useConnectivity(): Connectivity {
  const browserOnline = useSyncExternalStore(
    subscribeToBrowserStatus,
    () => navigator.onLine,
    () => true,
  );

  const [serviceReachable, setServiceReachable] = useState(true);

  // A self-scheduling loop rather than an interval keyed on the current state.
  // Depending on `serviceReachable` would restart the effect — and fire an
  // extra immediate check — on every flip, so a health endpoint that flapped
  // would be hammered rather than politely polled.
  useEffect(() => {
    let cancelled = false;
    let timer = 0;

    const run = async () => {
      let reachable = false;
      try {
        const response = await fetch("/api/kiosk/health", {
          cache: "no-store",
          signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
        });
        reachable = response.ok;
      } catch {
        reachable = false;
      }

      if (cancelled) return;

      setServiceReachable(reachable);
      timer = window.setTimeout(
        () => void run(),
        reachable ? HEALTHY_INTERVAL_MS : DEGRADED_INTERVAL_MS,
      );
    };

    void run();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  return browserOnline && serviceReachable ? "online" : "offline";
}
