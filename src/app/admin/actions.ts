"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export interface ActionState {
  error?: string;
  notice?: string;
}

/** Where to send someone after signing in, without allowing an open redirect. */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/admin") && !next.startsWith("//") ? next : "/admin";
}

export async function signInAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Please enter your email address and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Deliberately identical for a wrong password and an unknown address, so
    // this form cannot be used to discover which staff emails exist.
    return { error: "Those details were not recognised. Please try again." };
  }

  redirect(safeNext(formData.get("next")));
}

export interface CreateVisitorResult {
  error?: string;
  createdName?: string;
}

function clean(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value === "" ? null : value;
}

/**
 * Create a visitor from the admin panel.
 *
 * Deliberately does NOT open a visit_log. Registering someone at the desk is
 * not the same as them being in the building, and a roster that counts
 * paperwork rather than people is worse than useless in an evacuation. They
 * become present when they tap in at the kiosk.
 */
export async function createVisitorAction(
  formData: FormData,
): Promise<CreateVisitorResult> {
  await requireStaff();

  const fullName = clean(formData, "full_name");
  const visitingWho = clean(formData, "visiting_who");
  const companyOrRelation = clean(formData, "company_or_relation");
  const fobId = clean(formData, "fob_id");

  // Plates are read back to people and matched by eye; normalise the casing and
  // stray spacing so "ab12 cde" and "AB12CDE" do not look like two vehicles.
  const carRegistration = clean(formData, "car_registration")
    ?.toUpperCase()
    .replace(/\s+/g, " ");

  if (!fullName) return { error: "Full name is required." };
  if (!visitingWho) return { error: "Please record who they are visiting." };
  if (fullName.length > 120 || visitingWho.length > 120) {
    return { error: "That name is too long." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("visitors").insert({
    full_name: fullName,
    visiting_who: visitingWho,
    company_or_relation: companyOrRelation,
    car_registration: carRegistration ?? null,
    fob_id: fobId,
  });

  if (error) {
    // 23505 on this table can only be the fob_id unique index. Naming the
    // current holder turns a dead end into an obvious next action.
    if (error.code === "23505" && fobId) {
      const { data: holder } = await supabase
        .from("visitors")
        .select("full_name")
        .eq("fob_id", fobId)
        .maybeSingle();

      return {
        error: holder
          ? `That keyfob is already assigned to ${holder.full_name}. Unlink it from them first.`
          : "That keyfob is already assigned to someone else.",
      };
    }

    console.error("[admin] could not create visitor", error);
    return { error: "Could not save this visitor. Please try again." };
  }

  revalidatePath("/admin/visitors");
  revalidatePath("/admin");

  return { createdName: fullName };
}

export interface FobAssignResult {
  error?: string;
  assignedTo?: string;
}

/** Name whoever currently holds a fob, so a clash has an obvious next step. */
async function fobHolder(
  supabase: Awaited<ReturnType<typeof createClient>>,
  fobId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("visitors")
    .select("full_name")
    .eq("fob_id", fobId)
    .maybeSingle();
  return data?.full_name ?? null;
}

/**
 * Attach a keyfob to an existing visitor.
 *
 * Only ever adds to someone who has none: replacing a fob silently would leave
 * the old one apparently valid but orphaned. Staff unlink first, which closes
 * the previous assignment in the audit trail.
 */
export async function assignFobAction(formData: FormData): Promise<FobAssignResult> {
  await requireStaff();

  const visitorId = clean(formData, "visitor_id");
  const fobId = clean(formData, "fob_id");

  if (!visitorId) return { error: "No visitor selected." };
  if (!fobId) return { error: "Tap a keyfob on the reader, or type its number." };
  if (fobId.length > 64) return { error: "That keyfob number is too long." };

  const supabase = await createClient();

  const { data: visitor } = await supabase
    .from("visitors")
    .select("id, full_name, fob_id")
    .eq("id", visitorId)
    .maybeSingle();

  if (!visitor) return { error: "That visitor no longer exists." };
  if (visitor.fob_id) {
    return { error: `${visitor.full_name} already has a keyfob. Unlink it first.` };
  }

  // `.is("fob_id", null)` makes this a no-op if someone assigned a fob between
  // the read above and this write.
  const { data: updated, error } = await supabase
    .from("visitors")
    .update({ fob_id: fobId })
    .eq("id", visitorId)
    .is("fob_id", null)
    .select("id");

  if (error) {
    if (error.code === "23505") {
      const holder = await fobHolder(supabase, fobId);
      return {
        error: holder
          ? `That keyfob is already assigned to ${holder}. Unlink it from them first.`
          : "That keyfob is already assigned to someone else.",
      };
    }
    console.error("[admin] could not assign fob", error);
    return { error: "Could not assign that keyfob. Please try again." };
  }

  if (!updated || updated.length === 0) {
    return { error: "That visitor was given a keyfob a moment ago. Refresh and try again." };
  }

  revalidatePath("/admin/visitors");
  revalidatePath("/admin");

  return { assignedTo: visitor.full_name };
}

export interface DeleteVisitorResult {
  error?: string;
  deletedName?: string;
}

/**
 * Permanently remove a visitor profile.
 *
 * Refused while a keyfob is still attached — otherwise the physical token is
 * left unaccounted for, with no record of who has it. The database enforces
 * the same rule, so it holds for the Supabase dashboard too.
 *
 * The fob history in fob_assignments survives this: visitor_id goes null and
 * the name snapshot remains.
 */
export async function deleteVisitorAction(formData: FormData): Promise<DeleteVisitorResult> {
  await requireStaff();

  const visitorId = clean(formData, "visitor_id");
  const confirmation = String(formData.get("confirmation") ?? "");

  if (!visitorId) return { error: "No visitor selected." };

  // Re-checked here, not just in the dialog: a server action is reachable by
  // anyone who can post to it, whatever the form did or did not require.
  if (confirmation !== "CONFIRM") {
    return { error: 'Type CONFIRM exactly, in capitals, to delete this record.' };
  }

  const supabase = await createClient();

  const { data: visitor } = await supabase
    .from("visitors")
    .select("id, full_name, fob_id")
    .eq("id", visitorId)
    .maybeSingle();

  if (!visitor) return { error: "That visitor no longer exists." };
  if (visitor.fob_id) {
    return { error: "Unlink the keyfob before deleting this visitor." };
  }

  const { error } = await supabase
    .from("visitors")
    .delete()
    .eq("id", visitorId)
    .is("fob_id", null);

  if (error) {
    console.error("[admin] could not delete visitor", error);
    return { error: "Could not delete this visitor. Please try again." };
  }

  revalidatePath("/admin/visitors");
  revalidatePath("/admin");

  return { deletedName: visitor.full_name };
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}

/**
 * Clear a visitor's fob so the physical token can be handed to someone else.
 *
 * The RPC signs them out first. Without that, unlinking someone who is still
 * in the building would strand them on the fire roster with no fob left to
 * tap out — the roster would claim they are here indefinitely.
 */
export async function unlinkFobAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireStaff();

  const visitorId = String(formData.get("visitor_id") ?? "");
  if (!visitorId) {
    return { error: "No visitor selected." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("unlink_fob", {
    p_visitor_id: visitorId,
    p_force_sign_out: true,
  });

  if (error) {
    console.error("[admin] unlink_fob failed", error);
    return { error: "Could not unlink that keyfob. Please try again." };
  }

  const outcome = data as { outcome?: string; signed_out?: boolean } | null;

  if (outcome?.outcome !== "UNLINKED") {
    return { error: "That visitor no longer exists." };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/visitors");

  return {
    notice: outcome.signed_out
      ? "Keyfob unlinked. They were signed in, so they have also been signed out."
      : "Keyfob unlinked and ready to reassign.",
  };
}
