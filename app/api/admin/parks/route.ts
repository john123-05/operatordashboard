import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminFromRequest } from '@/lib/server-auth';
import { supabaseService } from '@/lib/supabase-service';

const schema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  is_active: z.boolean().default(true),
});
const deleteSchema = z.object({ id: z.string().uuid() });

export async function POST(req: NextRequest) {
  const auth = await requireAdminFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { name, slug, is_active } = parsed.data;

  const { data: existingPark, error: existingParkError } = await supabaseService
    .from('parks')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();

  if (existingParkError) return NextResponse.json({ error: existingParkError.message }, { status: 400 });

  let parkId: string;

  if (existingPark) {
    const { error: updateError } = await supabaseService
      .from('parks')
      .update({ name, is_active })
      .eq('id', existingPark.id);

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
    parkId = existingPark.id;
  } else {
    const { data: insertedPark, error: insertError } = await supabaseService
      .from('parks')
      .insert({ id: crypto.randomUUID(), name, slug, is_active })
      .select('id')
      .single();

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 400 });
    parkId = insertedPark.id;
  }

  const { data: existingPrefix, error: existingPrefixError } = await supabaseService
    .from('park_path_prefixes')
    .select('id')
    .eq('path_prefix', slug)
    .maybeSingle();

  if (existingPrefixError) return NextResponse.json({ error: existingPrefixError.message }, { status: 400 });

  if (existingPrefix) {
    const { error: updatePrefixError } = await supabaseService
      .from('park_path_prefixes')
      .update({ park_id: parkId, is_active: true })
      .eq('id', existingPrefix.id);

    if (updatePrefixError) return NextResponse.json({ error: updatePrefixError.message }, { status: 400 });
  } else {
    const { error: insertPrefixError } = await supabaseService
      .from('park_path_prefixes')
      .insert({ id: crypto.randomUUID(), park_id: parkId, path_prefix: slug, is_active: true });

    if (insertPrefixError) return NextResponse.json({ error: insertPrefixError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, data: { id: parkId } });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdminFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const parsed = deleteSchema.safeParse({ id: req.nextUrl.searchParams.get('id') });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = parsed.data;
  const { error } = await supabaseService
    .from('parks')
    .delete()
    .eq('id', id);

  if (error) {
    if (error.code === '23503') {
      return NextResponse.json(
        { error: 'Park kann nicht gelöscht werden, solange abhängige Datensätze existieren (z. B. Fotos, Attraktionen, Kameras).' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, data: { id } });
}
