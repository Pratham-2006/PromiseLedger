export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type CommitmentStatus = 'Open' | 'In progress' | 'Completed' | 'Cancelled';
export type CommitmentCategory = 'Delivery' | 'Payment' | 'Follow-up' | 'Service' | 'Purchase' | 'Other';
export type EventType = 'created' | 'deadline_changed' | 'status_changed' | 'progress' | 'completed' | 'reopened' | 'edited' | 'deleted';
export type DateFormat = 'local' | 'iso';
export type Theme = 'light' | 'dark' | 'system';
export type ReminderChannel = 'email' | 'push' | 'both';

export type DatabaseTypes = {
  public: {
    Tables: {
      workspace_states: {
        Row: { user_id: string; state: Json; revision: number; updated_at: string };
        Insert: { user_id: string; state: Json; revision?: number; updated_at?: string };
        Update: { user_id?: string; state?: Json; revision?: number; updated_at?: string };
        Relationships: [];
      };
      customers: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          normalized_name: string;
          contact: string;
          notes: string;
          is_sample: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<DatabaseTypes['public']['Tables']['customers']['Row'], 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<DatabaseTypes['public']['Tables']['customers']['Insert']>;
        Relationships: [];
      };
      commitments: {
        Row: {
          id: string;
          user_id: string;
          customer_id: string;
          title: string;
          customer_name: string;
          category: CommitmentCategory;
          original_due_date: string | null;
          due_date: string | null;
          amount: number | null;
          currency: string;
          notes: string;
          status: CommitmentStatus;
          completion_notes: string;
          is_sample: boolean;
          priority: number;
          tags: string[];
          created_at: string;
          updated_at: string;
          completed_at: string | null;
          deleted_at: string | null;
        };
        Insert: Omit<DatabaseTypes['public']['Tables']['commitments']['Row'], 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<DatabaseTypes['public']['Tables']['commitments']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'commitments_customer_id_fkey';
            columns: ['customer_id'];
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          }
        ];
      };
      commitment_events: {
        Row: {
          id: string;
          user_id: string;
          commitment_id: string;
          customer_name: string;
          type: EventType;
          message: string;
          from: string | null;
          to: string | null;
          note: string | null;
          created_at: string;
        };
        Insert: Omit<DatabaseTypes['public']['Tables']['commitment_events']['Row'], 'id' | 'created_at'> & { id?: string };
        Update: never;
        Relationships: [];
      };
      user_settings: {
        Row: {
          user_id: string;
          currency: string;
          date_format: DateFormat;
          theme: Theme;
          updated_at: string;
        };
        Insert: Omit<DatabaseTypes['public']['Tables']['user_settings']['Row'], 'updated_at'>;
        Update: Partial<DatabaseTypes['public']['Tables']['user_settings']['Insert']>;
        Relationships: [];
      };
      reminders: {
        Row: {
          id: string;
          user_id: string;
          commitment_id: string;
          remind_at: string;
          channel: ReminderChannel;
          message: string;
          sent: boolean;
          sent_at: string | null;
          created_at: string;
        };
        Insert: Omit<DatabaseTypes['public']['Tables']['reminders']['Row'], 'id' | 'created_at'> & { id?: string };
        Update: Partial<DatabaseTypes['public']['Tables']['reminders']['Insert']>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      save_workspace_state: {
        Args: { p_state: Json; p_expected_revision: number };
        Returns: number;
      };
      get_dashboard_stats: {
        Args: { p_user_id?: string };
        Returns: Json;
      };
      soft_delete_commitment: {
        Args: { p_commitment_id: string };
        Returns: void;
      };
      upsert_settings: {
        Args: { p_currency: string; p_date_format: string; p_theme?: string };
        Returns: void;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
