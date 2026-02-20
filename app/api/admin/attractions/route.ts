import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminFromRequest } from '@/lib/server-auth';
import { supabaseService } from '@/lib/supabase-service';

const schema = z.object({
  park_id: z.string().uuid(),
  slug: z.string().min(1),
  name: z.string().min(1),
  is_active: z.boolean().default(true),
});
const deleteSchema = z.object({ id: z.string().uuid() });

export async function POST(req: NextRequest) {
  const auth = await requireAdminFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { park_id, slug, name, is_active } = parsed.data;
  const { data: existingAttraction, error: existingAttractionError } = await supabaseService
    .from('attractions')
    .select('id')
    .eq('park_id', park_id)
    .eq('slug', slug)
    .maybeSingle();

  if (existingAttractionError) return NextResponse.json({ error: existingAttractionError.message }, { status: 400 });

  if (existingAttraction) {
    const { error: updateError } = await supabaseService
      .from('attractions')
      .update({ name, is_active })
      .eq('id', existingAttraction.id);

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
    return NextResponse.json({ ok: true, data: { id: existingAttraction.id } });
  }

  const { data, error } = await supabaseService
    .from('attractions')
    .insert({ id: crypto.randomUUID(), park_id, slug, name, is_active })
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
    .from('attractions')
    .delete()
    .eq('id', id);

  if (error) {
    if (error.code === '23503') {
      return NextResponse.json(
        { error: 'Attraktion kann nicht gelöscht werden, solange sie noch verwendet wird (z. B. in Fotos oder Kamera-Mappings).' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, data: { id } });
}
