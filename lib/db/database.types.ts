/**
 * Supabase Database type definition.
 *
 * Generate the full version with:
 *   npx supabase gen types typescript --project-id YOUR_PROJECT_ID > lib/db/database.types.ts
 *
 * This placeholder prevents TypeScript errors before you've run the generator.
 * The Supabase clients (lib/supabase/*.ts) accept this as the type parameter.
 */

export type Database = {
  public: {
    Tables: {
      accounts: {
        Row: {
          id: string;
          name: string;
          herbalife_id: string | null;
          distributor_seniority: "new" | "mid" | "experienced" | "senior";
          onboarding_path: "newbie_full" | "experienced_partial" | "self_serve";
          voice_capture_completed_at: string | null;
          setup_wizard_completed_at: string | null;
          terms_accepted_at: string | null;
          terms_version: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          herbalife_id?: string | null;
          distributor_seniority?: "new" | "mid" | "experienced" | "senior";
          onboarding_path?: "newbie_full" | "experienced_partial" | "self_serve";
          voice_capture_completed_at?: string | null;
          setup_wizard_completed_at?: string | null;
          terms_accepted_at?: string | null;
          terms_version?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          herbalife_id?: string | null;
          distributor_seniority?: "new" | "mid" | "experienced" | "senior";
          onboarding_path?: "newbie_full" | "experienced_partial" | "self_serve";
          voice_capture_completed_at?: string | null;
          setup_wizard_completed_at?: string | null;
          terms_accepted_at?: string | null;
          terms_version?: string | null;
          is_active?: boolean;
          updated_at?: string;
        };
      };
      users: {
        Row: {
          id: string;
          email: string;
          name: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          email?: string;
          name?: string | null;
          avatar_url?: string | null;
          updated_at?: string;
        };
      };
      account_memberships: {
        Row: {
          user_id: string;
          account_id: string;
          role: "owner" | "admin";
          created_at: string;
        };
        Insert: {
          user_id: string;
          account_id: string;
          role?: "owner" | "admin";
          created_at?: string;
        };
        Update: {
          role?: "owner" | "admin";
        };
      };
      invite_tokens: {
        Row: {
          id: string;
          token: string;
          email: string;
          account_id: string;
          role: "owner" | "admin";
          created_by_user_id: string;
          expires_at: string;
          accepted_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          token: string;
          email: string;
          account_id: string;
          role?: "owner" | "admin";
          created_by_user_id: string;
          expires_at: string;
          accepted_at?: string | null;
          created_at?: string;
        };
        Update: {
          accepted_at?: string | null;
        };
      };
      audit_logs: {
        Row: {
          id: string;
          account_id: string | null;
          actor_user_id: string | null;
          action: string;
          resource_type: string | null;
          resource_id: string | null;
          ip_address: string | null;
          user_agent: string | null;
          metadata: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          account_id?: string | null;
          actor_user_id?: string | null;
          action: string;
          resource_type?: string | null;
          resource_id?: string | null;
          ip_address?: string | null;
          user_agent?: string | null;
          metadata?: string | null;
          created_at?: string;
        };
        Update: never; // audit_logs is append-only
      };
    };
    Views: Record<string, never>;
    Functions: {
      auth_account_id: {
        Args: Record<string, never>;
        Returns: string;
      };
      auth_is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      auth_is_member_of: {
        Args: { target_account_id: string };
        Returns: boolean;
      };
    };
    Enums: {
      distributor_seniority: "new" | "mid" | "experienced" | "senior";
      onboarding_path: "newbie_full" | "experienced_partial" | "self_serve";
      member_role: "owner" | "admin";
    };
  };
};
