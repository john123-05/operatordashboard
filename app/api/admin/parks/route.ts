import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminFromRequest } from '@/lib/server-auth';
import { supabaseService } from '@/lib/supabase-service';

const schema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  is_active: z.boolean().default(true),
});

export async function POST(req: NextRequest) {
  const auth = await requireAdminFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { name, slug, is_active } = parsed.data;
  const { data, error } = await supabaseService
    .from('parks')
    .upsert({ name, slug, is_active }, { onConflict: 'slug' })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await supabaseService
    .from('park_path_prefixes')
    .upsert({ park_id: data.id, path_prefix: slug, is_active: true }, { onConflict: 'path_prefix' });

  return NextResponse.json({ ok: true, data });
}
