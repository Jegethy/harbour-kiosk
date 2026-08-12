import type { Metadata } from "next";
import { LiveRoster } from "@/components/admin/LiveRoster";
import { requireStaff } from "@/lib/auth";
import { describeQueryError } from "@/lib/supabase/errors";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Live roster — Harbour Care Centre",
};

// The roster is a safety document; never serve it from a cache.
export const dynamic = "force-dynamic";

export default async function RosterPage() {
  await requireStaff();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("live_roster")
    .select("*")
    .order("check_in_time", { ascending: true });

  if (error) {
    console.error("[admin] could not load live_roster", error);
  }

  // Rendered server-side first so the list is on screen before the websocket
  // connects — an evacuation is the worst moment to be waiting on a socket.
  return (
    <LiveRoster
      initial={data ?? []}
      loadError={describeQueryError(error, "Could not load the roster. Retrying automatically.")}
    />
  );
}
