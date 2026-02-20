import { NextRequest, NextResponse } from 'next/server';
import { requireAdminFromRequest } from '@/lib/server-auth';
import { parseFilename } from '@/lib/parser';
import { supabaseService } from '@/lib/supabase-service';

export async function GET(req: NextRequest) {
  const auth = await requireAdminFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const path = req.nextUrl.searchParams.get('path') || '';
  if (!path) return NextResponse.json({ error: 'Missing ?path=' }, { status: 400 });

  const parsed = parseFilename(path);

  let matchedParkId: string | null = null;
  let matchedParkName: string | null = null;
  let matchedCustomerCode: string | null = null;
  let matchedAttractionId: string | null = null;
  let matchedAttractionName: string | null = null;

  if (parsed.prefix) {
    const { data: prefixRow } = await supabaseService
      .from('park_path_prefixes')
      .select('park_id, parks(name)')
      .eq('path_prefix', parsed.prefix)
      .eq('is_active', true)
      .maybeSingle();

    if (prefixRow?.park_id) {
      matchedParkId = prefixRow.park_id;
      matchedParkName = (prefixRow.parks as { name?: string } | null)?.name || null;
    }
  }

  if (matchedParkId) {
    const customerCodeCandidates = [
      parsed.customerCode,
      parsed.legacyCustomerCode,
    ].filter((value, index, arr): value is string => !!value && arr.indexOf(value) === index);

    for (const candidateCode of customerCodeCandidates) {
      const { data: cameraRow } = await supabaseService
        .from('park_cameras')
        .select('attraction_id')
        .eq('park_id', matchedParkId)
        .eq('customer_code', candidateCode)
        .eq('is_active', true)
        .maybeSingle();

      if (!cameraRow?.attraction_id) continue;
      matchedCustomerCode = candidateCode;
      matchedAttractionId = cameraRow.attraction_id;
      break;
    }

    if (matchedAttractionId) {
      const { data: attrRow } = await supabaseService
        .from('attractions')
        .select('name')
        .eq('id', matchedAttractionId)
        .maybeSingle();
      matchedAttractionName = attrRow?.name || null;
    }
  }

  return NextResponse.json({
    ok: true,
    data: {
      ...parsed,
      matchedParkId,
      matchedParkName,
      matchedCustomerCode,
      matchedAttractionId,
      matchedAttractionName,
    },
  });
}
