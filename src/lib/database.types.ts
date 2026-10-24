export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type DatabaseTypes = {
  public: {
    Tables: {
      workspace_states: {
        Row: { user_id: string; state: Json; revision: number; updated_at: string };
        Insert: { user_id: string; state: Json; revision?: number; updated_at?: string };
        Update: { user_id?: string; state?: Json; revision?: number; updated_at?: string };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      save_workspace_state: {
        Args: { p_state: Json; p_expected_revision: number };
        Returns: number;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
