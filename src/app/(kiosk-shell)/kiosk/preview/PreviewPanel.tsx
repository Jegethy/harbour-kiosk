"use client";

import { NoticeScreen } from "@/components/kiosk/NoticeScreen";
import { OfflineScreen } from "@/components/kiosk/OfflineScreen";
import { ResultScreen } from "@/components/kiosk/ResultScreen";

/**
 * Design walkthrough: every kiosk screen stacked, one viewport each, scrollable.
 *
 * Reaching these states for real needs a registered fob, an unknown fob and a
 * broken database connection, in that order. This page shows them with
 * stand-in data so the layout can be reviewed on the actual tablet.
 *
 * It renders no real visitor data and reads nothing from the database, but it
 * is unauthenticated — delete this route before go-live if you would rather
 * not have it reachable in the lobby.
 */
export function PreviewPanel() {
  const at = new Date().toISOString();

  return (
    <div className="h-full overflow-y-auto">
      <Frame label="Signed IN — 4s auto-reset">
        <ResultScreen
          result={{ kind: "IN", fullName: "JANE SMITH", visitingWho: "MARY JONES", at }}
          resetMs={4000}
        />
      </Frame>

      <Frame label="Signed OUT — 4s auto-reset">
        <ResultScreen
          result={{ kind: "OUT", fullName: "JANE SMITH", visitingWho: null, at }}
          resetMs={4000}
        />
      </Frame>

      <Frame label="Unrecognised fob — 4s auto-reset">
        <NoticeScreen
          tone="alert"
          title="Unrecognised keyfob"
          detail="Please see reception to register."
          resetMs={4000}
        />
      </Frame>

      <Frame label="Error — database unreachable">
        <NoticeScreen
          tone="error"
          title="Sorry — we could not record that"
          detail="No connection to the check-in service. Please try again. If it happens again, please see reception."
          resetMs={7000}
        />
      </Frame>

      <Frame label="Waiting on the database">
        <NoticeScreen tone="busy" title="One moment…" />
      </Frame>

      <Frame label="Offline — network or database unreachable">
        <OfflineScreen />
      </Frame>
    </div>
  );
}

function Frame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="relative h-dvh border-b-4 border-neutral-dark">
      <span className="absolute left-2 top-2 z-10 rounded bg-neutral-dark/80 px-2 py-1 text-xs font-bold uppercase tracking-wide text-white">
        {label}
      </span>
      {children}
    </section>
  );
}
