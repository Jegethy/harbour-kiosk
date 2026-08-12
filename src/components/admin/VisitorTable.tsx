"use client";

import { useMemo, useState } from "react";
import { AddVisitorDialog } from "@/components/admin/AddVisitorDialog";
import { DeleteVisitorDialog } from "@/components/admin/DeleteVisitorDialog";
import { RegisterFobDialog } from "@/components/admin/RegisterFobDialog";
import { UnlinkFobButton } from "@/components/admin/UnlinkFobButton";
import type { VisitorAdminRow } from "@/lib/types/database";

const registeredFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function VisitorTable({ visitors }: { visitors: VisitorAdminRow[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle === "") return visitors;
    return visitors.filter((visitor) =>
      [
        visitor.full_name,
        visitor.visiting_who,
        visitor.company_or_relation,
        visitor.car_registration,
        visitor.fob_id,
      ]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(needle)),
    );
  }, [visitors, query]);

  return (
    <section>
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-primary sm:text-3xl">Visitors</h1>
          <p className="mt-1 text-sm text-neutral-dark/70">
            Everyone ever registered. Unlink a keyfob to hand it to a new visitor.
          </p>
        </div>

        <div className="flex flex-wrap items-start gap-3">
          <label className="flex flex-col gap-1">
            <span className="sr-only">Search visitors</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, resident, car, fob…"
              className="w-64 rounded-lg border-2 border-neutral-dark/20 bg-white px-3 py-2.5 text-neutral-dark outline-none focus:border-brand-primary"
            />
          </label>

          <AddVisitorDialog />
        </div>
      </header>

      {visitors.length === 0 ? (
        <Empty>No visitors have registered yet.</Empty>
      ) : filtered.length === 0 ? (
        <Empty>No visitors match &ldquo;{query}&rdquo;.</Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-dark/10 bg-white shadow-sm">
          <table className="w-full min-w-[52rem] border-collapse text-left">
            <thead>
              <tr className="border-b-2 border-neutral-dark/10 bg-neutral-light">
                <Th>Name</Th>
                <Th>Visiting</Th>
                <Th>Car</Th>
                <Th>Keyfob</Th>
                <Th>Registered</Th>
                <Th>Status</Th>
                <Th>Action</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((visitor) => (
                <tr key={visitor.id} className="border-b border-neutral-dark/10 last:border-0">
                  <td className="px-4 py-3">
                    <span className="block font-bold text-neutral-dark">{visitor.full_name}</span>
                    {visitor.company_or_relation ? (
                      <span className="block text-sm text-neutral-dark/60">
                        {visitor.company_or_relation}
                      </span>
                    ) : null}
                  </td>

                  <td className="px-4 py-3 text-neutral-dark">
                    {visitor.visiting_who ?? <Dash />}
                  </td>

                  <td className="px-4 py-3">
                    {visitor.car_registration ? (
                      <code className="rounded bg-neutral-light px-2 py-1 font-mono text-sm font-bold tracking-wide text-neutral-dark">
                        {visitor.car_registration}
                      </code>
                    ) : (
                      <Dash />
                    )}
                  </td>

                  <td className="px-4 py-3">
                    {visitor.fob_id ? (
                      <code className="rounded bg-neutral-light px-2 py-1 font-mono text-sm text-neutral-dark">
                        {visitor.fob_id}
                      </code>
                    ) : (
                      <span className="text-sm font-semibold uppercase tracking-wide text-neutral-dark/40">
                        Unlinked
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-3 text-sm tabular-nums text-neutral-dark/70">
                    {registeredFormat.format(new Date(visitor.created_at))}
                  </td>

                  <td className="px-4 py-3">
                    {visitor.currently_in ? (
                      <span className="rounded-full bg-status-ok/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-status-ok">
                        In building
                      </span>
                    ) : (
                      <span className="text-xs font-bold uppercase tracking-wide text-neutral-dark/40">
                        Out
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    {visitor.fob_id ? (
                      <UnlinkFobButton
                        visitorId={visitor.id}
                        fullName={visitor.full_name}
                        currentlyIn={visitor.currently_in}
                      />
                    ) : (
                      // Deletion is offered only here, on unlinked records: a
                      // profile with a fob still attached would leave the
                      // physical token unaccounted for.
                      <div className="flex flex-wrap items-start gap-2">
                        <RegisterFobDialog
                          visitorId={visitor.id}
                          fullName={visitor.full_name}
                        />
                        <DeleteVisitorDialog
                          visitorId={visitor.id}
                          fullName={visitor.full_name}
                          visitCount={visitor.visit_count}
                        />
                      </div>
                    )}
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

function Dash() {
  return <span className="text-neutral-dark/40">—</span>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border-2 border-dashed border-neutral-dark/20 bg-white px-6 py-12 text-center text-lg font-medium text-neutral-dark/60">
      {children}
    </p>
  );
}
