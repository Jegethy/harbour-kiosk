import type { Metadata } from "next";
import { VisitorTable } from "@/components/admin/VisitorTable";
import { requireStaff } from "@/lib/auth";
import { describeQueryError } from "@/lib/supabase/errors";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Visitors — Harbour Care Centre",
};

export const dynamic = "force-dynamic";

export default async function VisitorsPage() {
  await requireStaff();

  const supabase = await createClient();

  // visitors_admin carries the two derived facts this page needs — whether they
  // are in the building, and how much visit history a deletion would take with
  // it — so this is one read rather than a join stitched together in JS.
  const { data, error } = await supabase
    .from("visitors_admin")
    .select("*")
    .order("full_name", { ascending: true });

  if (error) {
    console.error("[admin] could not load visitors", error);
  }

  const message = describeQueryError(error, "Could not load the visitor list. Please refresh.");

  return (
    <>
      {message ? (
        <p
          role="alert"
          className="mb-4 rounded-lg border-2 border-brand-accent bg-brand-accent/10 px-4 py-3 text-sm font-semibold text-brand-primary"
        >
          {message}
        </p>
      ) : null}

      <VisitorTable visitors={data ?? []} />
    </>
  );
}
