import "server-only";

import { createClient } from "@supabase/supabase-js";
import { serviceRoleKey, supabaseUrl } from "@/lib/env";
import type { Database } from "@/lib/types/database";

/**
 * Service-role client. Bypasses RLS entirely.
 *
 * This exists so the lobby tablet can record check-ins without holding any
 * database credentials of its own. Confine its use to route handlers under
 * /api/kiosk, which expose exactly the operations a kiosk needs and nothing
 * else. The `server-only` import above turns any client-side import into a
 * build error rather than a leaked key.
 */
export function createAdminClient() {
  return createClient<Database>(supabaseUrl(), serviceRoleKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
