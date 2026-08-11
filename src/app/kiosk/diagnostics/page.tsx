"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { FobCaptureInput } from "@/components/kiosk/FobCaptureInput";
import { useFobScanner } from "@/hooks/useFobScanner";
import { DEFAULT_SCAN_CONFIG, type ScanEvent } from "@/lib/kiosk/scanner";
import { submitScan } from "@/lib/kiosk/api";
import type { ScanOutcome } from "@/lib/kiosk/outcomes";

const MAX_ROWS = 25;

interface RawKey {
  id: number;
  key: string;
  code: string;
  keyCode: number;
  gapMs: number;
}

interface LoggedEvent {
  id: number;
  at: string;
  event: ScanEvent;
}

interface LoggedOutcome {
  id: number;
  at: string;
  code: string;
  outcome: ScanOutcome;
}

let counter = 0;
const nextId = () => ++counter;

/** Read a browser-only value without a hydration mismatch or a setState-in-effect. */
const noopSubscribe = () => () => {};

const clockTime = () =>
  new Date().toLocaleTimeString("en-GB", { hour12: false }) +
  "." +
  String(new Date().getMilliseconds()).padStart(3, "0");

/**
 * Scanner diagnostics.
 *
 * Not part of the visitor flow — this is the bench for validating the reader
 * on the actual tablet before any UI is built on top of it. Three layers are
 * shown side by side so a misbehaving read can be localised immediately:
 * what the hardware emitted, what the buffer made of it, and what the database
 * said back.
 */
export default function DiagnosticsPage() {
  const [rawKeys, setRawKeys] = useState<RawKey[]>([]);
  const [events, setEvents] = useState<LoggedEvent[]>([]);
  const [outcomes, setOutcomes] = useState<LoggedOutcome[]>([]);
  const [hitDatabase, setHitDatabase] = useState(false);
  const lastRawAt = useRef(0);

  const userAgent = useSyncExternalStore(
    noopSubscribe,
    () => navigator.userAgent,
    () => "",
  );

  const handleEvent = useCallback((event: ScanEvent) => {
    setEvents((prev) => [{ id: nextId(), at: clockTime(), event }, ...prev].slice(0, MAX_ROWS));
  }, []);

  const handleScan = useCallback(
    async (code: string) => {
      if (!hitDatabase) return;
      const outcome = await submitScan(code);
      setOutcomes((prev) =>
        [{ id: nextId(), at: clockTime(), code, outcome }, ...prev].slice(0, MAX_ROWS),
      );
    },
    [hitDatabase],
  );

  const { inputProps, hasFocus, refocus } = useFobScanner({
    onScan: handleScan,
    onEvent: handleEvent,
  });

  // Passive observer of the raw keystroke stream. Does not preventDefault, so
  // it cannot interfere with capture — it just records what the reader sent.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const now = performance.now();
      const gapMs = lastRawAt.current === 0 ? 0 : Math.round(now - lastRawAt.current);
      lastRawAt.current = now;
      setRawKeys((prev) =>
        [
          {
            id: nextId(),
            key: event.key,
            code: event.code,
            keyCode: event.keyCode,
            gapMs,
          },
          ...prev,
        ].slice(0, MAX_ROWS),
      );
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const clear = () => {
    setRawKeys([]);
    setEvents([]);
    setOutcomes([]);
    lastRawAt.current = 0;
  };

  return (
    <div className="h-full overflow-y-auto bg-neutral-dark p-4 text-sm text-white">
      <FobCaptureInput inputProps={inputProps} />

      <header className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">Scanner diagnostics</h1>
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
            hasFocus ? "bg-status-ok text-white" : "bg-status-bad text-white"
          }`}
        >
          {hasFocus ? "capture focused" : "focus lost"}
        </span>
        <button
          type="button"
          onClick={refocus}
          className="rounded-lg bg-white/15 px-3 py-1 font-semibold"
        >
          Force refocus
        </button>
        <label className="ml-auto flex items-center gap-2 font-semibold">
          <input
            type="checkbox"
            checked={hitDatabase}
            onChange={(e) => setHitDatabase(e.target.checked)}
            className="h-5 w-5"
          />
          Send scans to database
        </label>
        <button
          type="button"
          onClick={clear}
          className="rounded-lg bg-white/15 px-3 py-1 font-semibold"
        >
          Clear
        </button>
      </header>

      <p className="mb-4 rounded-lg bg-white/10 p-3 leading-relaxed">
        Tap a fob at the reader. <strong>Raw keystrokes</strong> shows what the hardware sent —
        the gap column is the reader-vs-human signal, and should read in single or low double
        digits. <strong>Buffer events</strong> shows what the scan logic made of it. Toggle
        &ldquo;send scans to database&rdquo; to exercise the full round trip once Supabase
        credentials are in place.
      </p>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title={`Raw keystrokes (${rawKeys.length})`}>
          {rawKeys.length === 0 ? (
            <Empty>Waiting for input…</Empty>
          ) : (
            <table className="w-full font-mono text-xs">
              <thead className="text-white/50">
                <tr>
                  <th className="text-left">key</th>
                  <th className="text-left">code</th>
                  <th className="text-right">keyCode</th>
                  <th className="text-right">gap</th>
                </tr>
              </thead>
              <tbody>
                {rawKeys.map((row) => (
                  <tr key={row.id} className="border-t border-white/10">
                    <td>{row.key === " " ? "␣" : row.key}</td>
                    <td className="text-white/60">{row.code}</td>
                    <td className="text-right text-white/60">{row.keyCode}</td>
                    <td
                      className={`text-right ${
                        row.gapMs > DEFAULT_SCAN_CONFIG.maxInterKeyMs
                          ? "text-amber-300"
                          : "text-white/60"
                      }`}
                    >
                      {row.gapMs}ms
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title={`Buffer events (${events.length})`}>
          {events.length === 0 ? (
            <Empty>No completed bursts yet…</Empty>
          ) : (
            <ul className="space-y-2 font-mono text-xs">
              {events.map(({ id, at, event }) => (
                <li
                  key={id}
                  className={`rounded-md p-2 ${
                    event.kind === "accepted" ? "bg-status-ok/40" : "bg-status-bad/40"
                  }`}
                >
                  <div className="flex justify-between">
                    <strong className="text-sm">{event.code || "(empty)"}</strong>
                    <span className="text-white/60">{at}</span>
                  </div>
                  <div className="text-white/80">
                    {event.kind === "accepted"
                      ? `accepted via ${event.via} · ${event.keyCount} keys · ${Math.round(
                          event.durationMs,
                        )}ms · mean gap ${event.meanGapMs.toFixed(1)}ms`
                      : `rejected: ${event.reason} · ${event.keyCount} keys · ${Math.round(
                          event.durationMs,
                        )}ms`}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title={`Database outcomes (${outcomes.length})`}>
          {!hitDatabase ? (
            <Empty>Database round trip is off.</Empty>
          ) : outcomes.length === 0 ? (
            <Empty>No scans submitted yet…</Empty>
          ) : (
            <ul className="space-y-2 font-mono text-xs">
              {outcomes.map(({ id, at, code, outcome }) => (
                <li key={id} className="rounded-md bg-white/10 p-2">
                  <div className="flex justify-between">
                    <strong className="text-sm">{code}</strong>
                    <span className="text-white/60">{at}</span>
                  </div>
                  <pre className="mt-1 whitespace-pre-wrap break-all text-white/80">
                    {JSON.stringify(outcome, null, 1)}
                  </pre>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Active configuration" className="mt-4">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-xs sm:grid-cols-3">
          {(
            [
              ["minLength", DEFAULT_SCAN_CONFIG.minLength],
              ["maxLength", DEFAULT_SCAN_CONFIG.maxLength],
              ["maxInterKeyMs", DEFAULT_SCAN_CONFIG.maxInterKeyMs],
              ["maxBurstMs", DEFAULT_SCAN_CONFIG.maxBurstMs],
              ["quietFlushMs", DEFAULT_SCAN_CONFIG.quietFlushMs],
              ["dedupeMs", DEFAULT_SCAN_CONFIG.dedupeMs],
            ] as const
          ).map(([key, value]) => (
            <div key={key} className="flex justify-between border-b border-white/10 py-1">
              <dt className="text-white/60">{key}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 break-all text-xs text-white/50">{userAgent}</p>
      </Panel>
    </div>
  );
}

function Panel({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl bg-black/25 p-3 ${className}`}>
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-white/60">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-white/40">{children}</p>;
}
