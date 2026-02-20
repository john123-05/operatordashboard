import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminFromRequest } from '@/lib/server-auth';
import { supabaseService } from '@/lib/supabase-service';

const schema = z.object({
  park_id: z.string().uuid(),
  path_prefix: z.string().min(1),
  is_active: z.boolean().default(true),
});
const deleteSchema = z.object({ id: z.string().uuid() });

export async function POST(req: NextRequest) {
  const auth = await requireAdminFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { park_id, path_prefix, is_active } = parsed.data;
  const { data: existingPrefix, error: existingPrefixError } = await supabaseService
    .from('park_path_prefixes')
    .select('id')
    .eq('path_prefix', path_prefix)
    .maybeSingle();

  if (existingPrefixError) return NextResponse.json({ error: existingPrefixError.message }, { status: 400 });

  if (existingPrefix) {
    const { error: updateError } = await supabaseService
      .from('park_path_prefixes')
      .update({ park_id, is_active })
      .eq('id', existingPrefix.id);

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
    return NextResponse.json({ ok: true, data: { id: existingPrefix.id } });
  }

  const { data, error } = await supabaseService
    .from('park_path_prefixes')
    .insert({ id: crypto.randomUUID(), park_id, path_prefix, is_active })
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
    .from('park_path_prefixes')
    .delete()
    .eq('id', id);

  if (error) {
    if (error.code === '23503') {
      return NextResponse.json(
        { error: 'Prefix kann nicht gelöscht werden, solange abhängige Datensätze bestehen.' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, data: { id } });
}
