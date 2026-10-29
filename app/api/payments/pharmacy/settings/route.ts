import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { authenticatePaymentRequest } from '@/lib/payments/auth';

const settingsSchema = z.object({
  pharmacyId: z.string().uuid(),
  deliveryFeeInPaise: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
}).strict();

async function getMemberships(userId: string, admin: SupabaseClient) {
  return admin.from('pharmacy_members')
    .select('org_id, staff_role')
    .eq('user_id', userId)
    .eq('is_active', true);
}

export async function GET(request: Request) {
  const auth = await authenticatePaymentRequest(request);
  if (!auth) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (auth.unavailable) return NextResponse.json({ error: 'Payment database configuration is missing on the server.' }, { status: 503 });
  const { data: memberships, error: membershipError } = await getMemberships(auth.user.id, auth.admin);
  if (membershipError) return NextResponse.json({ error: 'Unable to verify pharmacy membership.' }, { status: 500 });
  const pharmacyIds = [...new Set((memberships ?? []).map((membership) => membership.org_id))];
  if (!pharmacyIds.length) return NextResponse.json({ error: 'Active pharmacy membership is required.' }, { status: 403 });
  const { data, error } = await auth.admin.from('pharmacy_orgs')
    .select('id, name, verification_status, home_delivery, online_delivery_fee_in_paise')
    .in('id', pharmacyIds);
  if (error) return NextResponse.json({ error: 'Unable to load pharmacy checkout settings.' }, { status: 500 });
  return NextResponse.json({
    pharmacies: (data ?? []).map((pharmacy) => ({
      ...pharmacy,
      canManageFee: memberships?.some((membership) => membership.org_id === pharmacy.id && membership.staff_role === 'pharmacy_admin') ?? false,
    })),
  });
}

export async function PUT(request: Request) {
  const auth = await authenticatePaymentRequest(request);
  if (!auth) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (auth.unavailable) return NextResponse.json({ error: 'Payment database configuration is missing on the server.' }, { status: 503 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { data: memberships, error: membershipError } = await getMemberships(auth.user.id, auth.admin);
  if (membershipError) return NextResponse.json({ error: 'Unable to verify pharmacy membership.' }, { status: 500 });
  const isPharmacyAdmin = memberships?.some((membership) => (
    membership.org_id === parsed.data.pharmacyId && membership.staff_role === 'pharmacy_admin'
  ));
  if (!isPharmacyAdmin) return NextResponse.json({ error: 'Only a pharmacy administrator can change delivery pricing.' }, { status: 403 });

  const { data, error } = await auth.admin.rpc('set_pharmacy_online_delivery_fee', {
    p_actor_user_id: auth.user.id,
    p_pharmacy_id: parsed.data.pharmacyId,
    p_delivery_fee_in_paise: parsed.data.deliveryFeeInPaise,
  });
  if (error) {
    const status = error.code === '42501' ? 403 : error.code === 'P0002' ? 404 : 500;
    return NextResponse.json({ error: status === 500 ? 'Unable to save delivery pricing.' : error.message }, { status });
  }
  return NextResponse.json({ deliveryFeeInPaise: data });
}
