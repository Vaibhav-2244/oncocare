import 'server-only';

import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export async function authenticatePaymentRequest(request: Request) {
  const authorization = request.headers.get('authorization');
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { unavailable: true as const };
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  return { admin, user: data.user, unavailable: false as const };
}

export async function isPlatformPaymentAdmin(userId: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('user_roles')
    .select('roles!inner(name)')
    .eq('user_id', userId)
    .in('roles.name', ['admin', 'super_admin']);
  if (error) throw new Error('Unable to verify payment administration permissions.');
  return Boolean(data?.length);
}
