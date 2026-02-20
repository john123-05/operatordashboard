import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = !!(url && anon);

export const supabaseBrowser: SupabaseClient = isSupabaseConfigured
  ? createClient(url!, anon!)
  : (new Proxy({} as SupabaseClient, {
      get(_, prop) {
        if (prop === 'auth') {
          return new Proxy(
            {},
            {
              get() {
                return async () => ({
                  data: { session: null, user: null },
                  error: new Error(
                    'Supabase is not configured. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.'
                  ),
                });
              },
            }
          );
        }
        return () => ({
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: new Error('Supabase is not configured.') }) }) }),
          eq: () => ({ maybeSingle: async () => ({ data: null, error: new Error('Supabase is not configured.') }) }),
        });
      },
    }));
