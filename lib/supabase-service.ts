import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const isSupabaseServiceConfigured = !!(url && serviceRole);

export const supabaseService: SupabaseClient = isSupabaseServiceConfigured
  ? createClient(url!, serviceRole!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
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
                    'Supabase service is not configured. Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
                  ),
                });
              },
            }
          );
        }
        return () => ({
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: new Error('Supabase service is not configured.') }) }) }),
          eq: () => ({ maybeSingle: async () => ({ data: null, error: new Error('Supabase service is not configured.') }) }),
        });
      },
    }));
