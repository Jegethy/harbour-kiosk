"use client";

import { useCallback, useEffect, useState } from "react";
import { FobCaptureInput } from "@/components/kiosk/FobCaptureInput";
import { IdleScreen } from "@/components/kiosk/IdleScreen";
import { NoticeScreen } from "@/components/kiosk/NoticeScreen";
import { OfflineScreen } from "@/components/kiosk/OfflineScreen";
import { ResultScreen, type KioskResult } from "@/components/kiosk/ResultScreen";
// DEV ONLY — remove with src/dev/. See DEPLOYMENT.md.
import { KioskFobSimulator } from "@/dev/KioskFobSimulator";
import { useConnectivity } from "@/hooks/useConnectivity";
import { useFobScanner } from "@/hooks/useFobScanner";
import { submitScan } from "@/lib/kiosk/api";

const RESULT_RESET_MS = 4000;
/** Longer than a result: an error is worth reading twice. */
const ERROR_RESET_MS = 7000;

type View =
  | { name: "idle" }
  | { name: "working" }
  | { name: "result"; result: KioskResult }
  | { name: "unrecognised" }
  | { name: "error"; message: string };

/**
 * Connectivity gate. Rendered by page.tsx once the device is known to be paired.
 *
 * Unmounting the whole flow while offline is the recovery mechanism: every
 * in-progress screen goes with it, so restoring the connection brings back a
 * clean idle screen on its own. Nobody has to touch the tablet, and there is
 * no reset path to get wrong.
 *
 * It also stops the scanner dead, which is the point — a tap that cannot be
 * recorded should not be quietly swallowed.
 */
export function KioskClient() {
  const connectivity = useConnectivity();

  if (connectivity === "offline") return <OfflineScreen />;

  return <KioskFlow />;
}

/**
 * The kiosk state machine.
 *
 * Sign in and sign out only. Visitors are registered by staff in the admin
 * panel, so an unrecognised fob is a dead end here rather than the start of a
 * form — the kiosk says so in red and returns to idle.
 *
 * The scanner stays armed on every screen except "working", so a second
 * visitor walking up behind the first is not ignored while a confirmation is
 * counting down, and someone who tapped the wrong fob can immediately tap the
 * right one without waiting out the countdown.
 */
function KioskFlow() {
  const [view, setView] = useState<View>({ name: "idle" });

  const handleScan = useCallback(async (code: string) => {
    setView({ name: "working" });
    const outcome = await submitScan(code);

    switch (outcome.outcome) {
      case "SIGNED_IN":
        setView({
          name: "result",
          result: {
            kind: "IN",
            fullName: outcome.full_name,
            visitingWho: outcome.visiting_who,
            at: outcome.at,
          },
        });
        break;

      case "SIGNED_OUT":
        setView({
          name: "result",
          result: {
            kind: "OUT",
            fullName: outcome.full_name,
            visitingWho: null,
            at: outcome.at,
          },
        });
        break;

      case "UNKNOWN_FOB":
        setView({ name: "unrecognised" });
        break;

      case "INVALID":
        // Nothing usable was read. Stay idle so the visitor can simply tap again.
        setView({ name: "idle" });
        break;

      case "ERROR":
        setView({ name: "error", message: outcome.message });
        break;
    }
  }, []);

  const { inputProps } = useFobScanner({
    onScan: handleScan,
    enabled: view.name !== "working",
  });

  // Timed return to idle. Re-armed on every terminal screen, and cancelled if
  // another scan moves things on first.
  useEffect(() => {
    if (view.name === "idle" || view.name === "working") return;
    const delay = view.name === "error" ? ERROR_RESET_MS : RESULT_RESET_MS;
    const id = window.setTimeout(() => setView({ name: "idle" }), delay);
    return () => window.clearTimeout(id);
  }, [view]);

  return (
    <>
      <FobCaptureInput inputProps={inputProps} />
      {/* DEV ONLY — remove with src/dev/. See DEPLOYMENT.md. */}
      <KioskFobSimulator />

      {view.name === "idle" ? <IdleScreen /> : null}

      {view.name === "working" ? <NoticeScreen tone="busy" title="One moment…" /> : null}

      {view.name === "result" ? (
        // Keyed so the countdown bar restarts for each new visitor.
        <ResultScreen
          key={`${view.result.at}-${view.result.fullName}`}
          result={view.result}
          resetMs={RESULT_RESET_MS}
        />
      ) : null}

      {view.name === "unrecognised" ? (
        <NoticeScreen
          tone="alert"
          title="Unrecognised keyfob"
          detail="Please see reception to register."
          resetMs={RESULT_RESET_MS}
        />
      ) : null}

      {view.name === "error" ? (
        <NoticeScreen
          tone="error"
          title="Sorry — we could not record that"
          detail={`${view.message} If it happens again, please see reception.`}
          resetMs={ERROR_RESET_MS}
        />
      ) : null}
    </>
  );
}
