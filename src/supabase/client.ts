import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

function getSessionStorageOrNull(): Storage | null {
  try {
    // Access can throw in some privacy modes.
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          // Use sessionStorage instead of localStorage (avoids "local" persistence and
          // is more reliable across OAuth redirects than in-memory storage).
          storage: getSessionStorageOrNull() ?? undefined,
          // We'll handle the OAuth callback ourselves (hash-routing edge cases).
          detectSessionInUrl: false,
          flowType: 'pkce',
        },
      })
    : null;

export function isSupabaseConfigured(): boolean {
  return !!supabase;
}
