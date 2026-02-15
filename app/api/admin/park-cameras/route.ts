import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminFromRequest } from '@/lib/server-auth';
import { supabaseService } from '@/lib/supabase-service';

const schema = z.object({
  park_id: z.string().uuid(),
  customer_code: z.string().regex(/^\d{4}$/),
  camera_name: z.string().nullable().optional(),
  attraction_id: z.string().uuid().nullable().optional(),
  is_active: z.boolean().default(true),
});

export async function POST(req: NextRequest) {
  const auth = await requireAdminFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const payload = {
    ...parsed.data,
    camera_name: parsed.data.camera_name ?? null,
    attraction_id: parsed.data.attraction_id ?? null,
  };

  const { data, error } = await supabaseService
    .from('park_cameras')
    .upsert(payload, { onConflict: 'park_id,customer_code' })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, data });
}
