import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminFromRequest } from '@/lib/server-auth';
import { supabaseService } from '@/lib/supabase-service';

const schema = z.object({
  park_id: z.string().uuid(),
  path_prefix: z.string().min(1),
  is_active: z.boolean().default(true),
});

export async function POST(req: NextRequest) {
  const auth = await requireAdminFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { data, error } = await supabaseService
    .from('park_path_prefixes')
    .upsert(parsed.data, { onConflict: 'path_prefix' })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, data });
}
