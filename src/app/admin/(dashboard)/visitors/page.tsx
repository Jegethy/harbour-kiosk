import type { Metadata } from "next";
import { VisitorTable, type VisitorWithStatus } from "@/components/admin/VisitorTable";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Visitors — Harbour Care Centre",
};

export const dynamic = "force-dynamic";

export default async function VisitorsPage() {
  await requireStaff();

  const supabase = await createClient();

  // Two cheap reads rather than a join: "is this person in the building right
  // now" is a set membership test, and the open-sessions query is served
  // straight off the partial index on visit_logs.
  const [visitorsResult, openResult] = await Promise.all([
    supabase.from("visitors").select("*").order("full_name", { ascending: true }),
    supabase.from("visit_logs").select("visitor_id").eq("status", "IN"),
  ]);

  if (visitorsResult.error) {
    console.error("[admin] could not load visitors", visitorsResult.error);
  }
  if (openResult.error) {
    console.error("[admin] could not load open sessions", openResult.error);
  }

  const openIds = new Set((openResult.data ?? []).map((row) => row.visitor_id));

  const visitors: VisitorWithStatus[] = (visitorsResult.data ?? []).map((visitor) => ({
    ...visitor,
    currentlyIn: openIds.has(visitor.id),
  }));

  return (
    <>
      {visitorsResult.error ? (
        <p
          role="alert"
          className="mb-4 rounded-lg border-2 border-brand-accent bg-brand-accent/10 px-4 py-3 text-sm font-semibold text-brand-primary"
        >
          Could not load the visitor list. Please refresh.
        </p>
      ) : null}

      <VisitorTable visitors={visitors} />
    </>
  );
}
