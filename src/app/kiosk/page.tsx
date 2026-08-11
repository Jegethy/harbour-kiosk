"use client";

import { useCallback, useEffect, useState } from "react";
import { FobCaptureInput } from "@/components/kiosk/FobCaptureInput";
import { IdleScreen } from "@/components/kiosk/IdleScreen";
import { NoticeScreen } from "@/components/kiosk/NoticeScreen";
import { RegistrationScreen } from "@/components/kiosk/RegistrationScreen";
import { ResultScreen, type KioskResult } from "@/components/kiosk/ResultScreen";
import { useFobScanner } from "@/hooks/useFobScanner";
import { submitScan } from "@/lib/kiosk/api";

const RESULT_RESET_MS = 4000;
/** Longer than a result: an error is worth reading twice. */
const ERROR_RESET_MS = 7000;

type View =
  | { name: "idle" }
  | { name: "working" }
  | { name: "result"; result: KioskResult }
  | { name: "register"; fobId: string }
  | { name: "error"; message: string };

/**
 * The kiosk state machine.
 *
 * The scanner stays armed on the idle, result and error screens, so a second
 * visitor walking up behind the first is not ignored while a confirmation is
 * counting down — their tap simply replaces it. It is disarmed only while a
 * request is in flight (nothing sensible to do with a second scan) and during
 * registration (where a stray tap would throw away typed details).
 */
export default function KioskPage() {
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
        setView({ name: "register", fobId: outcome.fob_id });
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

  const scannerArmed =
    view.name === "idle" || view.name === "result" || view.name === "error";

  const { inputProps } = useFobScanner({ onScan: handleScan, enabled: scannerArmed });

  const returnToIdle = useCallback(() => setView({ name: "idle" }), []);

  const handleRegistered = useCallback(
    (result: KioskResult) => setView({ name: "result", result }),
    [],
  );

  // Timed return to idle. Re-armed on every result and error, and cancelled if
  // another scan moves the screen on first.
  useEffect(() => {
    if (view.name !== "result" && view.name !== "error") return;
    const delay = view.name === "result" ? RESULT_RESET_MS : ERROR_RESET_MS;
    const id = window.setTimeout(() => setView({ name: "idle" }), delay);
    return () => window.clearTimeout(id);
  }, [view]);

  return (
    <>
      <FobCaptureInput inputProps={inputProps} />

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

      {view.name === "register" ? (
        <RegistrationScreen
          fobId={view.fobId}
          onCancel={returnToIdle}
          onRegistered={handleRegistered}
        />
      ) : null}

      {view.name === "error" ? (
        <NoticeScreen
          tone="error"
          title="Sorry — we could not record that"
          detail={`${view.message} If it happens again, please see reception.`}
        />
      ) : null}
    </>
  );
}
