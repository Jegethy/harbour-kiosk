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
