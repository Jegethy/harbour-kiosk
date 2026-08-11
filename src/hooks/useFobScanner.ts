"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ScanBuffer,
  type ScanConfig,
  type ScanEvent,
} from "@/lib/kiosk/scanner";

export type AcceptedScan = Extract<ScanEvent, { kind: "accepted" }>;

export interface UseFobScannerOptions {
  /** Fired once per validated fob tap. */
  onScan: (code: string, detail: AcceptedScan) => void;
  /**
   * Disarm while a modal owns the screen — the registration form, or a result
   * screen mid-countdown. Disarming also releases focus and clears the buffer.
   */
  enabled?: boolean;
  config?: Partial<ScanConfig>;
  /** Every buffer event including rejections. Used by the diagnostics page. */
  onEvent?: (event: ScanEvent) => void;
  /** Safety-net interval for the focus watchdog. */
  refocusIntervalMs?: number;
  /** How often the buffer is polled for quiet-flush and stale bursts. */
  pollIntervalMs?: number;
}

export interface FobScannerHandle {
  /** Spread onto an <input>. See FobCaptureInput for the styled version. */
  inputProps: React.InputHTMLAttributes<HTMLInputElement> & {
    ref: React.RefObject<HTMLInputElement | null>;
  };
  /** Whether the capture input currently holds focus. */
  hasFocus: boolean;
  refocus: () => void;
  reset: () => void;
}

/**
 * Captures fob taps on the kiosk.
 *
 * Two capture paths, because either alone drops scans on real hardware:
 *
 *   - A window-level keydown listener in the capture phase. This is the
 *     primary path and works regardless of what holds focus, so a scan
 *     survives the gap between a re-render blurring the input and the
 *     watchdog restoring it.
 *   - The hidden input's `input` event. Android sometimes routes a hardware
 *     keyboard through the IME, delivering keydown with keyCode 229 and no
 *     usable `key`; there, the characters only surface on `input`.
 *
 * They cannot double-count: the keydown path calls preventDefault, so any
 * keystroke it handles never reaches the input at all. The buffer's dedupe
 * window catches anything that slips through regardless.
 *
 * The input itself is kept focused and carries inputMode="none", which is what
 * holds focus without summoning Android's on-screen keyboard — a plain hidden
 * input still raises it on some ROMs, and a keyboard covering the idle screen
 * is what makes a kiosk look broken.
 */
export function useFobScanner({
  onScan,
  enabled = true,
  config,
  onEvent,
  refocusIntervalMs = 1000,
  pollIntervalMs = 40,
}: UseFobScannerOptions): FobScannerHandle {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const bufferRef = useRef<ScanBuffer | null>(null);
  if (bufferRef.current === null) {
    bufferRef.current = new ScanBuffer(config);
  }

  const onScanRef = useRef(onScan);
  const onEventRef = useRef(onEvent);
  const enabledRef = useRef(enabled);
  const [hasFocus, setHasFocus] = useState(false);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const dispatch = useCallback((event: ScanEvent | null) => {
    if (!event) return;
    onEventRef.current?.(event);
    if (event.kind === "accepted") {
      onScanRef.current(event.code, event);
    }
  }, []);

  const refocus = useCallback(() => {
    const el = inputRef.current;
    if (!el || !enabledRef.current) return;
    if (document.activeElement === el) return;
    el.focus({ preventScroll: true });
  }, []);

  const reset = useCallback(() => {
    bufferRef.current?.reset();
  }, []);

  // --- Primary capture path -------------------------------------------------
  useEffect(() => {
    if (!enabled) return;
    const buffer = bufferRef.current;
    if (!buffer) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      // IME-routed keystroke: the character is not on this event. Let it
      // through so the `input` handler below can pick it up.
      if (event.key === "Unidentified" || event.keyCode === 229) return;

      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        dispatch(buffer.pushTerminator(performance.now()));
        return;
      }

      if (event.key.length !== 1) return;

      // Swallow the keystroke unconditionally. Nothing else on a kiosk screen
      // should ever receive typed characters, and letting a burst leak into a
      // focused field is worse than dropping a stray key.
      event.preventDefault();
      dispatch(buffer.pushChar(event.key, performance.now()));
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [enabled, dispatch]);

  // --- Quiet-flush / stale-burst poll --------------------------------------
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => {
      const buffer = bufferRef.current;
      if (buffer) dispatch(buffer.poll(performance.now()));
    }, pollIntervalMs);
    return () => window.clearInterval(id);
  }, [enabled, dispatch, pollIntervalMs]);

  // --- Focus watchdog -------------------------------------------------------
  useEffect(() => {
    if (!enabled) return;

    refocus();

    const onVisibility = () => {
      // Screen wake. Android restores WebView focus asynchronously, so one
      // immediate attempt is not enough.
      if (document.visibilityState === "visible") {
        refocus();
        window.setTimeout(refocus, 150);
      }
    };
    const onPointerUp = () => refocus();
    const onWindowFocus = () => refocus();

    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("pointerup", onPointerUp);
    window.addEventListener("focus", onWindowFocus);
    const id = window.setInterval(refocus, refocusIntervalMs);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("focus", onWindowFocus);
      window.clearInterval(id);
    };
  }, [enabled, refocus, refocusIntervalMs]);

  // --- Release on disarm ----------------------------------------------------
  useEffect(() => {
    if (enabled) return;
    bufferRef.current?.reset();
    // blur() fires handleBlur, which clears hasFocus. enabledRef is already
    // false by now (its sync effect is declared above this one), so the blur
    // handler will not fight back with a refocus.
    if (inputRef.current && document.activeElement === inputRef.current) {
      inputRef.current.blur();
    }
  }, [enabled]);

  const handleInput = useCallback(
    (event: React.FormEvent<HTMLInputElement>) => {
      const el = event.currentTarget;
      const value = el.value;
      el.value = "";

      // Only non-empty on the IME path; the keydown handler prevents the
      // default that would otherwise put characters here.
      if (!enabledRef.current || value === "") return;

      const buffer = bufferRef.current;
      if (!buffer) return;

      const now = performance.now();
      for (const ch of value) {
        dispatch(buffer.pushChar(ch, now));
      }
    },
    [dispatch],
  );

  const handleBlur = useCallback(() => {
    setHasFocus(false);
    if (!enabledRef.current) return;
    // Two attempts: the animation frame covers a re-render stealing focus,
    // the timeout covers Android handing focus back after the frame.
    requestAnimationFrame(refocus);
    window.setTimeout(refocus, 50);
  }, [refocus]);

  const handleFocus = useCallback(() => setHasFocus(true), []);

  return {
    inputProps: {
      ref: inputRef,
      type: "text",
      inputMode: "none",
      autoComplete: "off",
      autoCorrect: "off",
      autoCapitalize: "off",
      spellCheck: false,
      tabIndex: -1,
      "aria-label": "Fob reader input",
      onInput: handleInput,
      onFocus: handleFocus,
      onBlur: handleBlur,
    },
    hasFocus,
    refocus,
    reset,
  };
}
