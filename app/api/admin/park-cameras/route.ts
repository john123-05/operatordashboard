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
const deleteSchema = z.object({ id: z.string().uuid() });

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

  const { data: existingCamera, error: existingCameraError } = await supabaseService
    .from('park_cameras')
    .select('id')
    .eq('park_id', payload.park_id)
    .eq('customer_code', payload.customer_code)
    .maybeSingle();

  if (existingCameraError) return NextResponse.json({ error: existingCameraError.message }, { status: 400 });

  if (existingCamera) {
    const { error: updateError } = await supabaseService
      .from('park_cameras')
      .update({
        camera_name: payload.camera_name,
        attraction_id: payload.attraction_id,
        is_active: payload.is_active,
      })
      .eq('id', existingCamera.id);

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
    return NextResponse.json({ ok: true, data: { id: existingCamera.id } });
  }

  const { data, error } = await supabaseService
    .from('park_cameras')
    .insert({ id: crypto.randomUUID(), ...payload })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, data });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdminFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const parsed = deleteSchema.safeParse({ id: req.nextUrl.searchParams.get('id') });
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { id } = parsed.data;
  const { error } = await supabaseService
    .from('park_cameras')
    .delete()
    .eq('id', id);

  if (error) {
    if (error.code === '23503') {
      return NextResponse.json(
        { error: 'Kamera kann nicht gelöscht werden, solange sie noch in abhängigen Datensätzen referenziert ist.' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, data: { id } });
}
