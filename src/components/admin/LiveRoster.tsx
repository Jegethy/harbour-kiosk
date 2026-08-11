"use client";

import { useCallback, useEffect, useState } from "react";
import { formatClockTime, useClock } from "@/hooks/useClock";
import { createClient } from "@/lib/supabase/client";
import type { LiveRosterRow } from "@/lib/types/database";

type ConnectionState = "connecting" | "live" | "offline";

/** Backstop refresh while realtime is healthy. */
const HEARTBEAT_MS = 60_000;
/** Faster poll once realtime has dropped, so the roster cannot go far stale. */
const FALLBACK_POLL_MS = 15_000;

/**
 * The fire evacuation list.
 *
 * Realtime is the primary update path, but it is not trusted on its own: a
 * dropped websocket on a care-home wifi is ordinary, and a roster that has
 * quietly stopped updating is worse than no roster at all. So there is always
 * a polling backstop, the poll tightens when the socket drops, and the
 * connection state is shown on screen rather than hidden. Staff can see
 * whether they are looking at live data.
 */
export function LiveRoster({
  initial,
  loadError,
}: {
  initial: LiveRosterRow[];
  loadError: string | null;
}) {
  const [supabase] = useState(() => createClient());
  const [rows, setRows] = useState(initial);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(loadError);
  const now = useClock();

  const refresh = useCallback(async () => {
    const { data, error: queryError } = await supabase
      .from("live_roster")
      .select("*")
      .order("check_in_time", { ascending: true });

    if (queryError) {
      setError("Could not refresh the roster.");
      return;
    }

    setRows(data ?? []);
    setRefreshedAt(Date.now());
    setError(null);
  }, [supabase]);

  useEffect(() => {
    const channel = supabase
      .channel("admin-live-roster")
      .on("postgres_changes", { event: "*", schema: "public", table: "visit_logs" }, () => {
        // The payload carries a visit_logs row; the roster needs it joined to
        // the visitor, so re-read the view rather than patching state locally.
        void refresh();
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setConnection("live");
          void refresh();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setConnection("offline");
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, refresh]);

  useEffect(() => {
    const interval = connection === "live" ? HEARTBEAT_MS : FALLBACK_POLL_MS;
    const id = window.setInterval(() => void refresh(), interval);
    return () => window.clearInterval(id);
  }, [refresh, connection]);

  return (
    <section>
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-primary sm:text-3xl">
            Live roster — in the building
          </h1>
          <p className="mt-1 text-sm text-neutral-dark/70">
            Everyone currently signed in. Use this as the fire evacuation list.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <ConnectionPill state={connection} refreshedAt={refreshedAt} />
          <span className="rounded-lg bg-brand-primary px-4 py-2 text-xl font-bold text-brand-cream tabular-nums">
            {rows.length}
          </span>
        </div>
      </header>

      {error ? (
        <p
          role="alert"
          className="mb-4 rounded-lg border-2 border-brand-accent bg-brand-accent/10 px-4 py-3 text-sm font-semibold text-brand-primary"
        >
          {error}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className="rounded-xl border-2 border-dashed border-neutral-dark/20 bg-white px-6 py-12 text-center text-lg font-medium text-neutral-dark/60">
          Nobody is signed in at the moment.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-dark/10 bg-white shadow-sm">
          <table className="w-full min-w-[36rem] border-collapse text-left">
            <thead>
              <tr className="border-b-2 border-neutral-dark/10 bg-neutral-light">
                <Th>Name</Th>
                <Th>Visiting</Th>
                <Th>Signed in</Th>
                <Th>Here for</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.log_id} className="border-b border-neutral-dark/10 last:border-0">
                  <td className="px-4 py-3">
                    <span className="block text-lg font-bold text-neutral-dark">
                      {row.full_name}
                    </span>
                    {row.company_or_relation ? (
                      <span className="block text-sm text-neutral-dark/60">
                        {row.company_or_relation}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-lg text-neutral-dark">
                    {row.visiting_who ?? <span className="text-neutral-dark/40">—</span>}
                  </td>
                  <td className="px-4 py-3 text-lg tabular-nums text-neutral-dark">
                    {formatClockTime(new Date(row.check_in_time))}
                  </td>
                  <td className="px-4 py-3 text-lg tabular-nums text-neutral-dark/70">
                    {now ? formatDuration(row.check_in_time, now) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-sm font-bold uppercase tracking-wide text-neutral-dark/70">
      {children}
    </th>
  );
}

function ConnectionPill({
  state,
  refreshedAt,
}: {
  state: ConnectionState;
  refreshedAt: number | null;
}) {
  const label =
    state === "live"
      ? "Live"
      : state === "connecting"
        ? "Connecting…"
        : "Reconnecting — polling";

  const tone =
    state === "live"
      ? "bg-status-ok/10 text-status-ok border-status-ok/30"
      : state === "connecting"
        ? "bg-neutral-dark/5 text-neutral-dark/60 border-neutral-dark/20"
        : "bg-brand-accent/10 text-brand-accent border-brand-accent/40";

  return (
    <span
      title={refreshedAt ? `Last updated ${formatClockTime(new Date(refreshedAt))}` : undefined}
      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-wide ${tone}`}
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 rounded-full ${
          state === "live" ? "bg-status-ok" : state === "offline" ? "bg-brand-accent" : "bg-neutral-dark/40"
        }`}
      />
      {label}
    </span>
  );
}

function formatDuration(from: string, now: Date): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(from).getTime()) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}
