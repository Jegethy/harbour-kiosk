import type { PostgrestError } from "@supabase/supabase-js";

/**
 * Undefined table/view/function, in both the Postgres and PostgREST dialects.
 * PostgREST answers from a cached schema, so a freshly deployed app talking to
 * a database that has not had its migrations applied reports PGRST205 rather
 * than the Postgres 42P01.
 */
const MISSING_RELATION = new Set(["42P01", "42883", "PGRST202", "PGRST205"]);

/**
 * Turn a query failure into something a person can act on.
 *
 * Deploying the app before applying its migrations is an ordinary mistake, and
 * "please refresh" sends someone looking in entirely the wrong place for it.
 */
export function describeQueryError(
  error: PostgrestError | null,
  fallback: string,
): string | null {
  if (!error) return null;

  if (MISSING_RELATION.has(error.code)) {
    return "The database is behind the application. Apply the migrations in supabase/migrations/ and reload.";
  }

  return fallback;
}
