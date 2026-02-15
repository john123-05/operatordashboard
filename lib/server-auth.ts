import { NextRequest } from 'next/server';
import { supabaseService } from '@/lib/supabase-service';

export async function requireAdminFromRequest(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return { ok: false as const, status: 401, message: 'Missing bearer token' };
  }

  const { data: userData, error: userError } = await supabaseService.auth.getUser(token);
  if (userError || !userData.user) {
    return { ok: false as const, status: 401, message: 'Invalid auth token' };
  }

  const { data: adminRow, error: adminError } = await supabaseService
    .from('admin_users')
    .select('user_id')
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (adminError) {
    return { ok: false as const, status: 500, message: adminError.message };
  }

  if (!adminRow) {
    return { ok: false as const, status: 403, message: 'Not an admin user' };
  }

  return { ok: true as const, userId: userData.user.id };
}
