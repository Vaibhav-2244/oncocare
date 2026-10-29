import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const querySchema = z.object({
  kind: z.enum(['insurance', 'booking', 'medicine']),
  entityId: z.string().min(1).max(100),
}).strict();

export async function GET(request: Request) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid offer request.' }, { status: 400 });
  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await admin.from('payment_offers')
    .select('offer_type, amount_in_paise, duration_days, included_usage')
    .eq('kind', parsed.data.kind)
    .eq('entity_id', parsed.data.entityId)
    .eq('active', true)
    .or(`valid_from.is.null,valid_from.lte.${now}`)
    .or(`valid_until.is.null,valid_until.gt.${now}`)
    .order('amount_in_paise');
  if (error) return NextResponse.json({ error: 'Unable to load current approved pricing.' }, { status: 503 });
  return NextResponse.json({ offers: data ?? [] });
}
