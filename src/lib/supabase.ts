import { createClient } from '@supabase/supabase-js';
import type { DatabaseTypes } from './database.types';

function validateSupabaseUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith('supabase.co') && !parsed.hostname.includes('localhost') && !parsed.hostname.includes('127.0.0.1')) {
      console.warn('[PromiseLedger] VITE_SUPABASE_URL does not look like a standard Supabase URL:', url);
    }
    return url;
  } catch {
    console.error('[PromiseLedger] VITE_SUPABASE_URL is not a valid URL:', url);
    return null;
  }
}

const rawUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const url = validateSupabaseUrl(rawUrl);
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

export const isSupabaseConfigured = Boolean(url && publishableKey);
export const supabase = isSupabaseConfigured
  ? createClient<DatabaseTypes>(url!, publishableKey!)
  : null;
