"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";
import type { Database } from "@/lib/types/database";

/**
 * Browser client, anon key. Used by the admin dashboard for realtime
 * subscriptions and staff-authenticated reads.
 *
 * The kiosk does NOT use this. RLS denies anon everything, and the tablet is
 * physically reachable by the public — kiosk writes go through server routes
 * holding the service-role key instead.
 */
export function createClient() {
  return createBrowserClient<Database>(supabaseUrl(), supabaseAnonKey());
}
