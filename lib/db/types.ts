import 'server-only';

/**
 * Database row and Supabase schema types for the Phase 2 storage foundation.
 *
 * Keep these types separate from the browser-facing domain models.  The
 * service layer is the only code that should use the privileged database
 * client with these records.
 */

export type TaskPriority = 'low' | 'medium' | 'high';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
export type ParcelStatus =
  | 'processing'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'failed';
export type ExecutionStatus = 'pending' | 'success' | 'error';

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];

export type JsonObject = { [key: string]: JsonValue };

export interface Task {
  id: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskInsert {
  id?: string;
  title: string;
  description?: string | null;
  priority?: TaskPriority;
  status?: TaskStatus;
  due_date?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type TaskUpdate = Partial<Omit<Task, 'id' | 'created_at' | 'updated_at'>>;

export interface Reminder {
  id: string;
  message: string;
  remind_at: string;
  is_sent: boolean;
  created_at: string;
  updated_at: string;
}

export interface ReminderInsert {
  id?: string;
  message: string;
  remind_at: string;
  is_sent?: boolean;
  created_at?: string;
  updated_at?: string;
}

export type ReminderUpdate = Partial<Omit<Reminder, 'id' | 'created_at' | 'updated_at'>>;

export interface DemoParcel {
  id: string;
  tracking_number: string;
  carrier: string;
  status: ParcelStatus;
  description: string | null;
  estimated_delivery: string | null;
  simulated: boolean;
  created_at: string;
  updated_at: string;
}

export interface DemoParcelInsert {
  id?: string;
  tracking_number: string;
  carrier?: string;
  status?: ParcelStatus;
  description?: string | null;
  estimated_delivery?: string | null;
  simulated?: boolean;
  created_at?: string;
  updated_at?: string;
}

export type DemoParcelUpdate = Partial<
  Omit<DemoParcel, 'id' | 'tracking_number' | 'created_at' | 'updated_at' | 'simulated'>
>;

export interface ExecutionLog {
  id: string;
  session_id: string;
  prompt: string;
  plan_json: JsonObject;
  step_index: number;
  tool_name: string;
  tool_input: JsonObject;
  tool_output: JsonObject | null;
  status: ExecutionStatus;
  error_message: string | null;
  duration_ms: number | null;
  created_at: string;
}

export interface ExecutionLogInsert {
  id?: string;
  session_id: string;
  prompt: string;
  plan_json: JsonObject;
  step_index: number;
  tool_name: string;
  tool_input: JsonObject;
  tool_output?: JsonObject | null;
  status?: ExecutionStatus;
  error_message?: string | null;
  duration_ms?: number | null;
  created_at?: string;
}

export type ExecutionLogUpdate = Partial<
  Omit<ExecutionLog, 'id' | 'created_at'>
>;

// Legacy rows remain typed here only so existing API modules can continue to
// compile while their routes are migrated to the canonical names separately.
export interface LegacyParcel {
  id: string;
  tracking_number: string;
  carrier: string;
  status: ParcelStatus;
  description: string | null;
  estimated_delivery: string | null;
  last_updated: string;
  created_at: string;
}

export interface LegacyExecutionHistory {
  id: string;
  session_id: string;
  prompt: string;
  plan_json: Record<string, unknown>;
  step_index: number;
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_output: Record<string, unknown> | null;
  status: ExecutionStatus;
  error_message: string | null;
  duration_ms: number | null;
  created_at: string;
}

export type Database = {
  public: {
    Tables: {
      tasks: {
        Row: Task & Record<string, unknown>;
        Insert: TaskInsert & Record<string, unknown>;
        Update: TaskUpdate & Record<string, unknown>;
        Relationships: [];
      };
      reminders: {
        Row: Reminder & Record<string, unknown>;
        Insert: ReminderInsert & Record<string, unknown>;
        Update: ReminderUpdate & Record<string, unknown>;
        Relationships: [];
      };
      demo_parcels: {
        Row: DemoParcel & Record<string, unknown>;
        Insert: DemoParcelInsert & Record<string, unknown>;
        Update: DemoParcelUpdate & Record<string, unknown>;
        Relationships: [];
      };
      execution_logs: {
        Row: ExecutionLog & Record<string, unknown>;
        Insert: ExecutionLogInsert & Record<string, unknown>;
        Update: ExecutionLogUpdate & Record<string, unknown>;
        Relationships: [];
      };
      // Compatibility types for the pre-Phase 2 routes.
      parcels: {
        Row: LegacyParcel & Record<string, unknown>;
        Insert: (Omit<LegacyParcel, 'id' | 'created_at' | 'last_updated'> & {
          id?: string;
          created_at?: string;
          last_updated?: string;
        }) & Record<string, unknown>;
        Update: Partial<Omit<LegacyParcel, 'id' | 'created_at'>> & Record<string, unknown>;
        Relationships: [];
      };
      execution_history: {
        Row: LegacyExecutionHistory & Record<string, unknown>;
        Insert: (Omit<LegacyExecutionHistory, 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        }) & Record<string, unknown>;
        Update: Partial<Omit<LegacyExecutionHistory, 'id' | 'created_at'>> & Record<string, unknown>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      task_priority: TaskPriority;
      task_status: TaskStatus;
      parcel_status: ParcelStatus;
      execution_status: ExecutionStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};
