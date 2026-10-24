import { createClient } from '@supabase/supabase-js';
import type { DatabaseTypes } from './database.types';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

export const isSupabaseConfigured = Boolean(url && publishableKey);
export const supabase = isSupabaseConfigured ? createClient<DatabaseTypes>(url!, publishableKey!) : null;
