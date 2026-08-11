/**
 * Hand-maintained mirror of supabase/migrations/0001_init.sql.
 *
 * Once the schema is pushed you can regenerate this file instead of editing it:
 *   npx supabase gen types typescript --project-id <ref> > src/lib/types/database.ts
 */

export type VisitStatus = "IN" | "OUT";

export type Json = string | number | boolean | null | { [k: string]: Json } | Json[];

export type VisitorRow = {
  id: string;
  /** NULL once the fob has been unlinked and handed to someone else. */
  fob_id: string | null;
  full_name: string;
  company_or_relation: string | null;
  visiting_who: string | null;
  /** Vehicle registration plate, if they drove. */
  car_registration: string | null;
  created_at: string;
};

export type VisitLogRow = {
  id: string;
  visitor_id: string;
  check_in_time: string;
  check_out_time: string | null;
  status: VisitStatus;
};

/** The fire evacuation list: everyone currently signed IN. */
export type LiveRosterRow = {
  log_id: string;
  visitor_id: string;
  full_name: string;
  company_or_relation: string | null;
  visiting_who: string | null;
  check_in_time: string;
};

export type Database = {
  public: {
    Tables: {
      visitors: {
        Row: VisitorRow;
        Insert: Omit<VisitorRow, "id" | "created_at"> &
          Partial<Pick<VisitorRow, "id" | "created_at">>;
        Update: Partial<VisitorRow>;
        Relationships: [];
      };
      visit_logs: {
        Row: VisitLogRow;
        Insert: Omit<VisitLogRow, "id" | "check_in_time" | "check_out_time" | "status"> &
          Partial<Pick<VisitLogRow, "id" | "check_in_time" | "check_out_time" | "status">>;
        Update: Partial<VisitLogRow>;
        Relationships: [];
      };
    };
    Views: {
      live_roster: {
        Row: LiveRosterRow;
        Relationships: [];
      };
    };
    Functions: {
      handle_fob_scan: {
        Args: { p_fob_id: string };
        Returns: Json;
      };
      unlink_fob: {
        Args: { p_visitor_id: string; p_force_sign_out?: boolean };
        Returns: Json;
      };
    };
    Enums: {
      visit_status: VisitStatus;
    };
    CompositeTypes: Record<never, never>;
  };
};
